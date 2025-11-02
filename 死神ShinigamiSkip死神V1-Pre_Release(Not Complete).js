// ==UserScript==
// @name 死神ShinigamiSkip死神 (AnimeWorld/AnimeUnity)
// @namespace https://github.com/Suplic0z/-ShinigamiSkip-/tree/main
// @version 17.0
// @description Skip intro + outro + auto next per AnimeWorld e AnimeUnity - Versione Migliorata e Aggiornata
// @author Suplic0z & Community (miglioramenti by Grok)
// @match *://animeworld.ac/*
// @match *://www.animeworld.ac/*
// @match *://animeunity.so/*
// @match *://www.animeunity.so/*
// @grant GM_setValue
// @grant GM_getValue
// @grant GM_addStyle
// @run-at document-start
// ==/UserScript==

(function () {
  'use strict';

  // === CONFIG / STATE ===
  const CONFIG = {
    get AUTO_SKIP_INTRO() { return GM_getValue('AUTO_SKIP_INTRO', true); },
    get AUTO_SKIP_OUTRO() { return GM_getValue('AUTO_SKIP_OUTRO', true); },
    get AUTO_NEXT_EPISODE() { return GM_getValue('AUTO_NEXT_EPISODE', true); },
    get AUTO_PLAY() { return GM_getValue('AUTO_PLAY', true); },
    get AUTO_FULLSCREEN() { return GM_getValue('AUTO_FULLSCREEN', true); },
    get INTRO_DURATION_FALLBACK() { return GM_getValue('INTRO_DURATION', 85); },
    get OUTRO_DURATION_FALLBACK() { return GM_getValue('OUTRO_DURATION', 90); },
    SMART_MARGIN: 2.0, // Aumentato per tolleranza
    NEXT_GUARD_SECS: 5, // Aumentato per sicurezza
    DEBUG: false
  };

  const siteType = /animeworld\./i.test(location.hostname) ? 'animeworld' : 'animeunity';
  let player = null;
  let playerObserver = null;
  let progressTimer = null;
  let skippedIntroThisEp = false;
  let skippedOutroThisEp = false;
  let learnedThisClick = false;

  // === STILE / UI (Migliorata con più stili e animazioni) ===
  GM_addStyle(`
    #shinigami-skip-ui {
      position: fixed; top: 20px; right: 20px; z-index: 2147483647 !important;
      background: rgba(20,20,30,.95); color: #fff; padding: 14px;
      border-radius: 12px; min-width: 280px; font-family: system-ui,Segoe UI,Arial;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); border: 1px solid rgba(33,150,243,.6);
      backdrop-filter: blur(6px);
    }
    #ss-header { text-align: center; font-weight: 800; margin-bottom: 8px; cursor: pointer; user-select: none; }
    #ss-controls { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
    .ss-btn {
      padding: 10px 14px; border: 0; border-radius: 10px; cursor: pointer; font-weight: 700;
      transition: transform .15s ease, box-shadow .2s ease; min-width: 120px; flex: 1;
    }
    .ss-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.25); }
    #ss-skip-intro { background: linear-gradient(135deg,#2196F3,#0d47a1); color:#fff; }
    #ss-skip-outro { background: linear-gradient(135deg,#FF9800,#E65100); color:#fff; }
    #ss-next { background: linear-gradient(135deg,#9C27B0,#6a0080); color:#fff; }
    #ss-status { font-size: 12px; opacity:.9; text-align:center; padding:6px; border-radius:8px; background: rgba(255,255,255,.06); }
    #ss-settings { margin-top:10px; background: rgba(255,255,255,.05); padding:10px; border-radius:10px; display: none; }
    .ss-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:6px 0; }
    .ss-row label { font-size: 13px; color: #a8c7ff; }
    .ss-note { font-size: 11px; color:#bbb; margin-top:6px; text-align:center; }
    .ss-badge { font-weight:700; color:#4CAF50 }
    .ss-toast {
      position: fixed; top: 72px; right: 20px; z-index:2147483647 !important;
      background: #2196F3; color:#fff; padding: 10px 14px; border-radius:10px; font-weight:700;
      box-shadow: 0 8px 18px rgba(0,0,0,.25); animation: ssSlideIn .25s ease-out;
    }
    @keyframes ssSlideIn { from{ transform: translateX(60px); opacity:0; } to{ transform: translateX(0); opacity:1; } }
  `);

  function $(sel, root = document) { return root.querySelector(sel); }
  function $all(sel, root = document) { return [...root.querySelectorAll(sel)]; }

  function toast(msg, color) {
    const old = $('.ss-toast'); if (old) old.remove();
    const n = document.createElement('div');
    n.className = 'ss-toast'; n.textContent = msg;
    if (color) n.style.background = color;
    document.body.appendChild(n);
    setTimeout(() => n.remove(), 2500);
  }

  function ui() {
    if ($('#shinigami-skip-ui')) return;
    const box = document.createElement('div');
    box.id = 'shinigami-skip-ui';
    box.innerHTML = `
      <div id="ss-header">§ShinigamiSkip§ v17.0</div>
      <div id="ss-controls">
        <button id="ss-skip-intro" class="ss-btn">SKIP INTRO</button>
        <button id="ss-skip-outro" class="ss-btn">SKIP OUTRO</button>
        <button id="ss-next" class="ss-btn">PROSSIMO EP</button>
      </div>
      <div id="ss-status">Player: ricerca in corso…</div>
      <div id="ss-settings">
        <div class="ss-row">
          <label>Auto Skip Intro</label>
          <input type="checkbox" id="ss-auto-skip-intro" ${CONFIG.AUTO_SKIP_INTRO ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Skip Outro</label>
          <input type="checkbox" id="ss-auto-skip-outro" ${CONFIG.AUTO_SKIP_OUTRO ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Prossimo Ep</label>
          <input type="checkbox" id="ss-auto-next" ${CONFIG.AUTO_NEXT_EPISODE ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Play</label>
          <input type="checkbox" id="ss-auto-play" ${CONFIG.AUTO_PLAY ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Fullscreen</label>
          <input type="checkbox" id="ss-auto-fullscreen" ${CONFIG.AUTO_FULLSCREEN ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Fallback Intro (s)</label>
          <input type="number" id="ss-fallback-intro" min="5" max="300" value="${CONFIG.INTRO_DURATION_FALLBACK}" style="width:80px; padding:6px; border-radius:8px; border:1px solid #333; background:#1f1f1f; color:#fff;">
        </div>
        <div class="ss-row">
          <label>Fallback Outro (s)</label>
          <input type="number" id="ss-outro-sec" min="10" max="300" value="${CONFIG.OUTRO_DURATION_FALLBACK}" style="width:80px; padding:6px; border-radius:8px; border:1px solid #333; background:#1f1f1f; color:#fff;">
        </div>
        <div class="ss-note">Click su “SKIP INTRO/OUTRO” per imparare la serie. Migliorato per intro ritardate.</div>
      </div>
    `;
    document.body.appendChild(box);

    $('#ss-header').addEventListener('click', () => {
      const settings = $('#ss-settings');
      settings.style.display = settings.style.display === 'none' ? 'block' : 'none';
    });
    $('#ss-skip-intro').addEventListener('click', () => { learnedThisClick = true; skipIntro(true); });
    $('#ss-skip-outro').addEventListener('click', () => { learnedThisClick = true; skipOutro(true); });
    $('#ss-next').addEventListener('click', () => goNextEpisode() && toast('Prossimo episodio…', '#9C27B0'));

    $('#ss-auto-skip-intro').addEventListener('change', e => GM_setValue('AUTO_SKIP_INTRO', e.target.checked));
    $('#ss-auto-skip-outro').addEventListener('change', e => GM_setValue('AUTO_SKIP_OUTRO', e.target.checked));
    $('#ss-auto-next').addEventListener('change', e => GM_setValue('AUTO_NEXT_EPISODE', e.target.checked));
    $('#ss-auto-play').addEventListener('change', e => GM_setValue('AUTO_PLAY', e.target.checked));
    $('#ss-auto-fullscreen').addEventListener('change', e => GM_setValue('AUTO_FULLSCREEN', e.target.checked));
    $('#ss-fallback-intro').addEventListener('change', e => {
      const v = Math.max(5, parseInt(e.target.value) || CONFIG.INTRO_DURATION_FALLBACK);
      GM_setValue('INTRO_DURATION', v);
    });
    $('#ss-outro-sec').addEventListener('change', e => {
      const v = Math.max(10, parseInt(e.target.value) || CONFIG.OUTRO_DURATION_FALLBACK);
      GM_setValue('OUTRO_DURATION', v);
    });

    document.addEventListener('keydown', (ev) => {
      if (!player || ev.target.tagName === 'INPUT') return;
      if (ev.key.toLowerCase() === 's') { learnedThisClick = true; skipIntro(true); }
      if (ev.key.toLowerCase() === 'o') { learnedThisClick = true; skipOutro(true); }
      if (ev.key.toLowerCase() === 'n') { goNextEpisode(); }
    });
  }

  function setStatus(msg, ok) {
    const s = $('#ss-status'); if (!s) return;
    s.textContent = msg;
    s.style.color = ok ? '#4CAF50' : '#FFB74D';
  }

  // === PLAYER DISCOVERY (Migliorata con più robustezza) ===
  function findPlayerInDoc(root) {
    const selectors = [
      'video.jw-video[src^="blob:"]',
      '#video-player',
      'video[src]',
      'video'
    ];
    for (const sel of selectors) {
      const v = root.querySelector(sel);
      if (v) return v;
    }
    return null;
  }

  function findPlayer() {
    let v = findPlayerInDoc(document);
    if (v) return v;
    for (const f of $all('iframe')) {
      try {
        if (!f.contentDocument) continue;
        const inner = findPlayerInDoc(f.contentDocument);
        if (inner) return inner;
      } catch { }
    }
    return null;
  }

  function attachPlayer(p) {
    if (!p || p === player) return;
    if (player) {
      player.removeEventListener('timeupdate', onTimeUpdate);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('loadedmetadata', onLoaded);
      player.removeEventListener('canplay', onCanPlay);
    }
    player = p;
    resetEpisodeState();
    player.addEventListener('timeupdate', onTimeUpdate);
    player.addEventListener('ended', onEnded);
    player.addEventListener('loadedmetadata', onLoaded);
    player.addEventListener('canplay', onCanPlay);
    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(safetyLoop, 1000);
    setStatus(`Player attivo (${isFinite(player.duration) ? Math.round(player.duration / 60) + 'min' : '…'})`, true);
  }

  function onCanPlay() {
    if (CONFIG.AUTO_PLAY && player.paused) {
      player.play().catch(() => toast('Auto-play fallito, click play manuale', '#FF5722'));
    }
    if (CONFIG.AUTO_FULLSCREEN) {
      try {
        const container = player.closest('.jw-wrapper, .player-container, div.video') || player.parentElement;
        if (container && !document.fullscreenElement) {
          (container.requestFullscreen || container.webkitRequestFullscreen || container.mozRequestFullScreen || container.msRequestFullscreen).call(container);
        }
      } catch (e) {
        toast('Auto-fullscreen fallito', '#FF5722');
      }
    }
  }

  function observePlayer() {
    if (playerObserver) return;
    playerObserver = new MutationObserver(() => {
      const np = findPlayer();
      if (np && np !== player) attachPlayer(np);
    });
    playerObserver.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
    const t = setInterval(() => {
      const np = findPlayer();
      if (np) {
        attachPlayer(np);
        clearInterval(t);
      }
    }, 500); // Ridotto intervallo per detection più rapida
  }

  // === SMART INTRO / OUTRO / LEARNING (Migliorato per handle intro/outro ritardate) ===
  function seriesKey() {
    const url = new URL(location.href);
    let p = url.pathname.replace(/\/$/, '');
    const epNum = p.match(/(episode[-/])(\d+)/i);
    if (epNum) p = p.replace(epNum[0], epNum[1] + 'X');
    return `${siteType}:${url.origin}${p}`;
  }

  function saveLearned(keySuffix, value) {
    if (!isFinite(value) || value <= 0) return;
    const key = `${seriesKey()}::${keySuffix}`;
    GM_setValue(key, Math.round(value));
    console.log(`[ShinigamiSkip] Appreso per ${seriesKey()}: ${keySuffix} = ${Math.round(value)}s`);
    toast(`Appreso ${keySuffix}: ${Math.round(value)}s`, '#4CAF50');
  }

  function loadLearned(keySuffix, fallback) {
    const key = `${seriesKey()}::${keySuffix}`;
    const v = GM_getValue(key, null);
    return typeof v === 'number' && v > 0 ? v : fallback;
  }

  function getChapters() {
    if (!player || !player.textTracks) return { intro: null, outro: null };
    const introKeywords = /opening|intro|op\b/i;
    const outroKeywords = /ending|outro|ed|preview|next episode/i;
    let intro = null, outro = null;

    for (const track of player.textTracks) {
      if (!/chapters|metadata|thumbnails/i.test(track.kind)) continue;
      const cues = track.cues || [];
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        const text = (c.text || '').trim();
        if (introKeywords.test(text) && !intro) {
          intro = {
            start: c.startTime,
            end: c.endTime || (i + 1 < cues.length ? cues[i + 1].startTime : null)
          };
        } else if (outroKeywords.test(text) && !outro) {
          outro = {
            start: c.startTime,
            end: c.endTime || (i + 1 < cues.length ? cues[i + 1].startTime : player.duration)
          };
        }
        if (intro && outro) break;
      }
      if (intro && outro) break;
    }

    if (intro && intro.end) intro.end -= CONFIG.SMART_MARGIN;
    if (outro && outro.end) outro.end -= CONFIG.SMART_MARGIN;

    return { intro, outro };
  }

  // === HANDLERS ===
  function onLoaded() {
    setStatus(`Player pronto (${isFinite(player.duration) ? Math.round(player.duration / 60) + 'min' : '…'})`, true);
  }

  function onTimeUpdate() {
    if (!player || !isFinite(player.duration) || player.duration <= 0) return;

    const chapters = getChapters();
    const current = player.currentTime;

    // === AUTO SKIP INTRO (Gestisce intro ritardate) ===
    if (CONFIG.AUTO_SKIP_INTRO && !skippedIntroThisEp) {
      let introEnd = chapters.intro ? chapters.intro.end : loadLearned('introEnd', CONFIG.INTRO_DURATION_FALLBACK);
      let introStart = chapters.intro ? chapters.intro.start : 0;
      if (introEnd && current > introStart + 1 && current < introEnd - 0.5) {
        doSkipTo(introEnd, false, 'intro');
      }
    }

    // === AUTO SKIP OUTRO (Gestisce outro variabili) ===
    if (CONFIG.AUTO_SKIP_OUTRO && !skippedOutroThisEp) {
      let outroLength = chapters.outro ? (chapters.outro.end - chapters.outro.start) : loadLearned('outroLength', CONFIG.OUTRO_DURATION_FALLBACK);
      let outroStart = chapters.outro ? chapters.outro.start : (player.duration - outroLength);
      if (outroStart > 0 && current > outroStart + 1 && current < player.duration - 1) {
        doSkipTo(player.duration - 1, false, 'outro');
      }
    }

    // === AUTO NEXT A FINE VIDEO ===
    if (CONFIG.AUTO_NEXT_EPISODE) {
      const left = player.duration - current;
      if (isFinite(left) && left <= CONFIG.NEXT_GUARD_SECS && left > 0) {
        goNextEpisode();
      }
    }
  }

  function onEnded() {
    if (CONFIG.AUTO_NEXT_EPISODE) {
      setTimeout(() => goNextEpisode(), 800);
    }
  }

  function safetyLoop() {
    if (!player) return;
    // Reset se tornato all'inizio (nuovo ep?)
    if ((skippedIntroThisEp || skippedOutroThisEp) && player.currentTime < 5 && player.duration > 60) {
      resetEpisodeState();
    }
  }

  // === ACTIONS ===
  function doSkipTo(t, manual, type) {
    try {
      if (t > player.duration) t = player.duration - 1;
      player.currentTime = t;
      if (type === 'intro') skippedIntroThisEp = true;
      if (type === 'outro') skippedOutroThisEp = true;
      const color = type === 'intro' ? '#2196F3' : '#FF9800';
      toast(`${type.toUpperCase()} saltata${manual ? '' : ' (auto)'}!`, color);

      if (manual && learnedThisClick) {
        if (type === 'intro') {
          const threshold = player.duration * 0.35; // Aumentato a 35%
          if (player.currentTime <= threshold) {
            saveLearned('introEnd', player.currentTime);
          }
        } else if (type === 'outro') {
          const outroLen = player.duration - player.currentTime;
          if (outroLen > 10 && outroLen < player.duration * 0.35) {
            saveLearned('outroLength', outroLen);
          }
        }
        learnedThisClick = false;
      }
    } catch (e) {
      console.error('[ShinigamiSkip] Errore skip:', e);
    }
  }

  function skipIntro(manual = false) {
    if (!player || !isFinite(player.duration)) return;
    const chapters = getChapters();
    const target = chapters.intro ? chapters.intro.end : (player.currentTime + loadLearned('introEnd', CONFIG.INTRO_DURATION_FALLBACK));
    if (target < player.duration) {
      doSkipTo(target, manual, 'intro');
    } else {
      toast('Fine video', '#FF9800');
    }
  }

  function skipOutro(manual = false) {
    if (!player || !isFinite(player.duration)) return;
    const chapters = getChapters();
    let outroLen = chapters.outro ? (chapters.outro.end - chapters.outro.start) : loadLearned('outroLength', CONFIG.OUTRO_DURATION_FALLBACK);
    const target = player.duration - outroLen;
    if (target > 0 && target > player.currentTime) {
      doSkipTo(target, manual, 'outro');
      if (manual && CONFIG.AUTO_NEXT_EPISODE) {
        setTimeout(() => goNextEpisode(), 800);
      }
    } else if (manual) {
      toast('Video troppo corto o già alla fine', '#FF9800');
    }
  }

  // === NEXT EPISODE LOGIC (Migliorata con più selectors) ===
  function clickIfVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.left >= 0) {
      el.click();
      return true;
    }
    return false;
  }

  function findNextButtons() {
    const candidates = [
      'a.next-episode', '.btn-next', '[title*="Prossimo"]', '[title*="Successivo"]',
      '.next-ep', '.btn-next-ep', 'a.next-episode', 'a[rel="next"]', '.next', 'button.next',
      '.episode-next', 'a[href*="next"]', '.next-button', '[aria-label*="next episode"]'
    ];
    const els = [];
    for (const sel of candidates) {
      $all(sel).forEach(el => els.push(el));
    }
    els.push(...findAnchorsByText(['Prossimo', 'Successivo', 'Next', 'Next Episode', 'Next ep', 'Avanti']));
    return [...new Set(els)];
  }

  function findAnchorsByText(textArr) {
    const res = [];
    const anchors = $all('a, button, div[role="button"]');
    for (const a of anchors) {
      const t = (a.textContent || a.title || a.ariaLabel || '').trim().toLowerCase();
      if (!t) continue;
      for (const needle of textArr) {
        if (t.includes(needle.toLowerCase())) {
          res.push(a);
          break;
        }
      }
    }
    return res;
  }

  function urlNextByPattern() {
    let href = location.href;
    const patterns = [
      { regex: /episode-(\d+)/i, replace: (m, num) => `episode-${parseInt(num) + 1}` },
      { regex: /episode\/(\d+)/i, replace: (m, num) => `episode/${parseInt(num) + 1}` },
      { regex: /ep-(\d+)/i, replace: (m, num) => `ep-${parseInt(num) + 1}` },
      { regex: /ep\/(\d+)/i, replace: (m, num) => `ep/${parseInt(num) + 1}` }
    ];
    for (const pat of patterns) {
      const match = href.match(pat.regex);
      if (match) {
        const cur = match[0];
        const next = pat.replace(cur, match[1]);
        return href.replace(cur, next);
      }
    }
    return null;
  }

  function goNextEpisode() {
    const buttons = findNextButtons();
    for (const el of buttons) {
      if (clickIfVisible(el)) return true;
    }

    const currentEp = $all('.episode.active, .ep-item.active, a.active')[0];
    if (currentEp) {
      const parent = currentEp.closest('li, div');
      const nextSibling = parent?.nextElementSibling;
      const nextLink = nextSibling?.querySelector('a, div');
      if (nextLink && clickIfVisible(nextLink)) return true;
    }

    const nextUrl = urlNextByPattern();
    if (nextUrl && nextUrl !== location.href) {
      location.href = nextUrl;
      return true;
    }

    toast('Prossimo episodio non trovato', '#FF5722');
    return false;
  }

  // === RESET STATE ===
  function resetEpisodeState() {
    skippedIntroThisEp = false;
    skippedOutroThisEp = false;
    learnedThisClick = false;
    console.log("[ShinigamiSkip] Stato episodio resettato");
  }

  // === INIT ===
  function init() {
    ui();
    observePlayer();
    const first = findPlayer();
    if (first) {
      attachPlayer(first);
      setStatus('Player rilevato all’avvio', true);
    } else {
      setStatus('Player non trovato, monitoraggio attivo…', false);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 300); // Ridotto per init più rapida
  }
})();
