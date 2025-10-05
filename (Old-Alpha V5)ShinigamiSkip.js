// ==UserScript==
// @name         ShinigamiSkip Pro Ultra (AW+AU Smart Full)
// @namespace    https://github.com/Suplic0z/ShinigamiSkip
// @version      5.0
// @description  Skip intro intelligente + auto prossimo episodio per AnimeWorld e AnimeUnity
// @author       Suplic0z & Community (+refactor)
// @match        *://animeworld.ac/*
// @match        *://www.animeworld.ac/*
// @match        *://animeunity.so/*
// @match        *://www.animeunity.so/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function () {
  'use strict';

  /** ==========================
   *  CONFIG / STATE
   *  ========================== */
  const CONFIG = {
    AUTO_SKIP_INTRO: GM_getValue('AUTO_SKIP_INTRO', true),
    AUTO_NEXT_EPISODE: GM_getValue('AUTO_NEXT_EPISODE', true),
    INTRO_DURATION_FALLBACK: GM_getValue('INTRO_DURATION', 85),
    SMART_MARGIN: 1.0,
    NEXT_GUARD_SECS: 3,
    DEBUG: false
  };

  const siteType = /animeworld\./i.test(location.hostname) ? 'animeworld' : 'animeunity';

  let player = null;
  let playerObserver = null;
  let progressTimer = null;
  let skippedIntroThisEp = false;
  let learnedThisClick = false;

  /** ==========================
   *  STYLE / UI
   *  ========================== */
  GM_addStyle(`
    #shinigami-skip-ui {
      position: fixed; top: 20px; right: 20px; z-index: 100000;
      background: rgba(20,20,30,.95); color: #fff; padding: 14px;
      border-radius: 12px; min-width: 260px; font-family: system-ui,Segoe UI,Arial;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); border: 1px solid rgba(33,150,243,.6);
      backdrop-filter: blur(6px);
    }
    #ss-controls { display:flex; gap:8px; flex-wrap:wrap; margin-bottom:10px; }
    .ss-btn {
      padding: 10px 14px; border: 0; border-radius: 10px; cursor: pointer; font-weight: 700;
      transition: transform .15s ease, box-shadow .2s ease; min-width: 120px;
    }
    .ss-btn:hover { transform: translateY(-1px); box-shadow: 0 6px 14px rgba(0,0,0,.25); }
    #ss-skip { background: linear-gradient(135deg,#2196F3,#0d47a1); color:#fff; }
    #ss-next { background: linear-gradient(135deg,#9C27B0,#6a0080); color:#fff; }
    #ss-status { font-size: 12px; opacity:.9; text-align:center; padding:6px; border-radius:8px; background: rgba(255,255,255,.06); }
    #ss-settings { margin-top:10px; background: rgba(255,255,255,.05); padding:10px; border-radius:10px; }
    .ss-row { display:flex; align-items:center; justify-content:space-between; gap:10px; margin:6px 0; }
    .ss-row label { font-size: 13px; color: #a8c7ff; }
    .ss-note { font-size: 11px; color:#bbb; margin-top:6px; text-align:center; }
    .ss-badge { font-weight:700; color:#4CAF50 }
    .ss-toast {
      position: fixed; top: 72px; right: 20px; z-index:100001;
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
      <div style="text-align:center; font-weight:800; margin-bottom:8px;">
        ⚡ ShinigamiSkip <span class="ss-badge">Pro</span> – ${siteType.toUpperCase()}
      </div>
      <div id="ss-controls">
        <button id="ss-skip" class="ss-btn">SKIP INTRO</button>
        <button id="ss-next" class="ss-btn">PROSSIMO EP</button>
      </div>
      <div id="ss-status">Player: ricerca in corso…</div>
      <div id="ss-settings">
        <div class="ss-row">
          <label>Auto Skip Intro</label>
          <input type="checkbox" id="ss-auto-skip" ${CONFIG.AUTO_SKIP_INTRO ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Prossimo Ep</label>
          <input type="checkbox" id="ss-auto-next" ${CONFIG.AUTO_NEXT_EPISODE ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Fallback Intro (s)</label>
          <input type="number" id="ss-fallback" min="0" max="300" value="${CONFIG.INTRO_DURATION_FALLBACK}" style="width:80px; padding:6px; border-radius:8px; border:1px solid #333; background:#1f1f1f; color:#fff;">
        </div>
        <div class="ss-note">Impara automaticamente l'endpoint intro per serie (click su “SKIP INTRO” entro il 30% del video).</div>
      </div>
    `;
    document.body.appendChild(box);

    $('#ss-skip').addEventListener('click', () => { learnedThisClick = true; skipIntro(true); });
    $('#ss-next').addEventListener('click', () => goNextEpisode() && toast('Prossimo episodio…', '#9C27B0'));

    $('#ss-auto-skip').addEventListener('change', e => {
      CONFIG.AUTO_SKIP_INTRO = e.target.checked;
      GM_setValue('AUTO_SKIP_INTRO', CONFIG.AUTO_SKIP_INTRO);
    });
    $('#ss-auto-next').addEventListener('change', e => {
      CONFIG.AUTO_NEXT_EPISODE = e.target.checked;
      GM_setValue('AUTO_NEXT_EPISODE', CONFIG.AUTO_NEXT_EPISODE);
    });
    $('#ss-fallback').addEventListener('change', e => {
      const v = parseInt(e.target.value) || CONFIG.INTRO_DURATION_FALLBACK;
      CONFIG.INTRO_DURATION_FALLBACK = v;
      GM_setValue('INTRO_DURATION', v);
    });

    // shortcut tastiera
    document.addEventListener('keydown', (ev) => {
      if (!player) return;
      if (ev.key.toLowerCase() === 's') { learnedThisClick = true; skipIntro(true); }
      if (ev.key.toLowerCase() === 'n') { goNextEpisode(); }
    });
  }

  function setStatus(msg, ok) {
    const s = $('#ss-status'); if (!s) return;
    s.textContent = msg;
    s.style.color = ok ? '#4CAF50' : '#FFB74D';
  }

  /** ==========================
   *  PLAYER DISCOVERY
   *  ========================== */
  function findPlayerInDoc(root) {
    const jwBlob = root.querySelector?.('video.jw-video[src^="blob:"]');
    if (jwBlob) return jwBlob;
    const idVideo = root.getElementById?.('video-player');
    if (idVideo) return idVideo;
    const anyVideo = root.querySelector?.('video');
    if (anyVideo) return anyVideo;
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
      player.removeEventListener('timeupdate', onTime);
      player.removeEventListener('ended', onEnded);
      player.removeEventListener('loadedmetadata', onLoaded);
    }
    player = p;
    skippedIntroThisEp = false;
    learnedThisClick = false;

    player.addEventListener('timeupdate', onTime);
    player.addEventListener('ended', onEnded);
    player.addEventListener('loadedmetadata', onLoaded);

    if (progressTimer) clearInterval(progressTimer);
    progressTimer = setInterval(safetyLoop, 1000);

    setStatus(`Player attivo (${isFinite(player.duration) ? Math.round(player.duration) : '…'}s)`, true);
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
    }, 1000);
  }

  /** ==========================
   *  SMART INTRO / LEARNING
   *  ========================== */
  function seriesKey() {
    const url = new URL(location.href);
    let p = url.pathname;
    const epNum = p.match(/(episode[-/])(\d+)/i);
    if (epNum) p = p.replace(epNum[0], epNum[1]);
    return `${siteType}:${url.origin}${p}`;
  }

  function saveLearnedIntro(sec) {
    if (!sec || !isFinite(sec)) return;
    const key = `${seriesKey()}::introEnd`;
    GM_setValue(key, Math.round(sec));
  }

  function loadLearnedIntro() {
    const key = `${seriesKey()}::introEnd`;
    const v = GM_getValue(key, null);
    return typeof v === 'number' ? v : null;
  }

  function getChaptersIntroEnd() {
    if (!player || !player.textTracks) return null;
    const KEYWORDS = /opening|intro|op\b/i;
    for (const track of player.textTracks) {
      if (!/chapters|metadata/i.test(track.kind)) continue;
      const cues = track.cues || [];
      for (let i = 0; i < cues.length; i++) {
        const c = cues[i];
        const text = (c.text || '').trim();
        if (KEYWORDS.test(text)) {
          const end = c.endTime || (i + 1 < cues.length ? cues[i + 1].startTime : null);
          if (end) return Math.max(0, end - CONFIG.SMART_MARGIN);
        }
      }
    }
    return null;
  }

  function getAutoIntroTarget() {
    return getChaptersIntroEnd() ?? loadLearnedIntro() ?? CONFIG.INTRO_DURATION_FALLBACK;
  }

  /** ==========================
   *  HANDLERS
   *  ========================== */
  function onLoaded() {
    setStatus(`Player pronto (${isFinite(player.duration) ? Math.round(player.duration) : '…'}s)`, true);
  }

  function onTime() {
    if (!player || !isFinite(player.duration)) return;

    if (CONFIG.AUTO_SKIP_INTRO && !skippedIntroThisEp) {
      const target = getAutoIntroTarget();
      if (player.currentTime > 3 && player.currentTime < target) {
        if (player.currentTime < target - 0.25) {
          doSkipTo(target, false);
        }
      }
    }

    if (CONFIG.AUTO_NEXT_EPISODE) {
      const left = player.duration - player.currentTime;
      if (isFinite(left) && left <= CONFIG.NEXT_GUARD_SECS) {
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
    if (skippedIntroThisEp && player.currentTime < 1 && player.duration > 30) {
      skippedIntroThisEp = false;
    }
  }

  /** ==========================
   *  ACTIONS
   *  ========================== */
  function doSkipTo(t, manual) {
    try {
      player.currentTime = t;
      skippedIntroThisEp = true;
      if (manual) toast('Intro saltata!', '#4CAF50'); else toast('Intro auto saltata', '#2196F3');

      if (manual || learnedThisClick) {
        if (isFinite(player.duration) && player.duration > 0) {
          const threshold = player.duration * 0.30;
          const now = Math.max(0, t, player.currentTime);
          if (now <= threshold) {
            saveLearnedIntro(now);
          }
        }
        learnedThisClick = false;
      }
    } catch (e) { }
  }

  function skipIntro(manual = false) {
    if (!player) return;
    const target = getAutoIntroTarget();
    if (player.currentTime < target) doSkipTo(target, manual);
  }

  function clickIfVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    const visible = rect.width > 0 && rect.height > 0;
    if (visible) { el.click(); return true; }
    return false;
  }

  function findNextButtons() {
    const candidates = [
      'a.next-episode', '.btn-next', '[title*="Prossimo"]', '[title*="Successivo"]',
      '.next-ep', '.btn-next-ep', 'a.next-episode',
      'a[rel="next"]', '.next', 'button.next'
    ];
    const els = [];
    for (const sel of candidates) els.push(...$all(sel));
    els.push(...findAnchorsByText(['Prossimo', 'Successivo', 'Next', 'Next Episode', 'Next ep']));
    return [...new Set(els)];
  }

  function findAnchorsByText(textArr) {
    const res = [];
    const anchors = $all('a, button');
    for (const a of anchors) {
      const t = (a.textContent || '').trim().toLowerCase();
      if (!t) continue;
      for (const needle of textArr) {
        if (t.includes(needle.toLowerCase())) { res.push(a); break; }
      }
    }
    return res;
  }

  function urlNextByPattern() {
    const m1 = location.href.match(/episode-(\d+)/i);
    if (m1) {
      const cur = parseInt(m1[1], 10);
      if (Number.isFinite(cur)) {
        return location.href.replace(`episode-${cur}`, `episode-${cur + 1}`);
      }
    }
    const m2 = location.pathname.match(/episode\/(\d+)/i);
    if (m2) {
      const cur = parseInt(m2[1], 10);
      if (Number.isFinite(cur)) {
        return location.href.replace(`episode/${cur}`, `episode/${cur + 1}`);
      }
    }
    return null;
  }

  function goNextEpisode() {
    for (const el of findNextButtons()) {
      if (clickIfVisible(el)) return true;
    }
    const currentEp = $('.episodes a.active');
    if (currentEp) {
      const li = currentEp.closest('li');
      const nextLi = li && li.nextElementSibling;
      const nextA = nextLi && nextLi.querySelector('a');
      if (nextA) { nextA.click(); return true; }
    }
    const nextUrl = urlNextByPattern();
    if (nextUrl) { location.href = nextUrl; return true; }

    toast('Prossimo episodio non trovato', '#FF5722');
    return false;
  }

  /** ==========================
   *  INIT
   *  ========================== */
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
    setTimeout(init, 500);
  }
})();
