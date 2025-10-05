// ==UserScript==
// @name         死神ShinigamiSkip死神 (AnimeWorld/AnimeUnity)
// @namespace    https://github.com/Suplic0z/-ShinigamiSkip-/
// @version      14.0
// @description  Auto-skip intro/outro + auto-next + smart detection + fullscreen | AnimeWorld & AnimeUnity
// @author       Suplic0z & Community (Refactored by AI)
// @match        *://animeworld.ac/*
// @match        *://www.animeworld.ac/*
// @match        *://animeunity.so/*
// @match        *://www.animeunity.so/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @run-at       document-start
// ==/UserScript==

(function() {
  'use strict';

  // ==================== CONFIGURATION ====================
  const CONFIG = {
    get autoSkipIntro() { return GM_getValue('AUTO_SKIP_INTRO', true); },
    get autoSkipOutro() { return GM_getValue('AUTO_SKIP_OUTRO', true); },
    get autoNext() { return GM_getValue('AUTO_NEXT_EPISODE', true); },
    get autoPlay() { return GM_getValue('AUTO_PLAY', true); },
    get autoFullscreen() { return GM_getValue('AUTO_FULLSCREEN', false); },
    get introFallback() { return GM_getValue('INTRO_DURATION', 85); },
    get outroDuration() { return GM_getValue('OUTRO_DURATION', 90); },
    SMART_MARGIN: 1.0,
    NEXT_GUARD_SECS: 3,
    DEBUG: false
  };

  const SITE = /animeworld\./i.test(location.hostname) ? 'animeworld' : 'animeunity';

  // ==================== STATE ====================
  const state = {
    player: null,
    observer: null,
    timer: null,
    skippedIntro: false,
    skippedOutro: false,
    learnedIntro: false,
    uiVisible: false
  };

  // ==================== UTILITIES ====================
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

  const toast = (msg, color = '#2196F3') => {
    const existing = $('.ss-toast');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'ss-toast';
    el.textContent = msg;
    el.style.background = color;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2800);
  };

  const log = (...args) => CONFIG.DEBUG && console.log('[ShinigamiSkip]', ...args);

  // ==================== STYLES ====================
  GM_addStyle(`
    #shinigami-skip-ui {
      position: fixed; top: 20px; right: 20px; z-index: 2147483647;
      background: rgba(15,15,25,.96); color: #fff; padding: 16px;
      border-radius: 14px; min-width: 300px; font-family: -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Arial,sans-serif;
      box-shadow: 0 12px 40px rgba(0,0,0,.5); border: 1px solid rgba(33,150,243,.7);
      backdrop-filter: blur(10px); transition: opacity .3s ease;
    }
    #ss-header {
      text-align: center; font-weight: 900; font-size: 15px; margin-bottom: 10px;
      cursor: pointer; user-select: none; color: #64B5F6; letter-spacing: 0.5px;
    }
    #ss-controls { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 12px; }
    .ss-btn {
      padding: 11px 15px; border: 0; border-radius: 11px; cursor: pointer; font-weight: 700;
      transition: all .2s ease; flex: 1; min-width: 110px; font-size: 13px;
    }
    .ss-btn:hover { transform: translateY(-2px); box-shadow: 0 8px 18px rgba(0,0,0,.35); }
    .ss-btn:active { transform: translateY(0); }
    #ss-skip-intro { background: linear-gradient(135deg,#2196F3,#1565C0); color: #fff; }
    #ss-skip-outro { background: linear-gradient(135deg,#FF9800,#E65100); color: #fff; }
    #ss-next { background: linear-gradient(135deg,#9C27B0,#6A1B9A); color: #fff; }
    #ss-status {
      font-size: 12px; opacity: .92; text-align: center; padding: 8px;
      border-radius: 9px; background: rgba(255,255,255,.07); margin-bottom: 8px;
    }
    #ss-settings {
      margin-top: 12px; background: rgba(255,255,255,.04); padding: 12px;
      border-radius: 11px; display: none; border-top: 1px solid rgba(255,255,255,.08);
    }
    .ss-row {
      display: flex; align-items: center; justify-content: space-between;
      gap: 12px; margin: 8px 0;
    }
    .ss-row label { font-size: 13px; color: #B3D9FF; flex: 1; }
    .ss-row input[type="checkbox"] {
      width: 18px; height: 18px; cursor: pointer; accent-color: #2196F3;
    }
    .ss-row input[type="number"] {
      width: 70px; padding: 7px; border-radius: 8px; border: 1px solid #444;
      background: #1a1a1a; color: #fff; font-size: 13px; text-align: center;
    }
    .ss-note {
      font-size: 11px; color: #999; margin-top: 8px; text-align: center;
      line-height: 1.4; border-top: 1px solid rgba(255,255,255,.05); padding-top: 8px;
    }
    .ss-toast {
      position: fixed; top: 80px; right: 20px; z-index: 2147483647;
      background: #2196F3; color: #fff; padding: 12px 16px; border-radius: 11px;
      font-weight: 700; font-size: 13px; box-shadow: 0 10px 25px rgba(0,0,0,.3);
      animation: ssSlideIn .3s cubic-bezier(.68,-.55,.27,1.55);
    }
    @keyframes ssSlideIn {
      from { transform: translateX(80px); opacity: 0; }
      to { transform: translateX(0); opacity: 1; }
    }
    .ss-shortcut { font-size: 10px; opacity: .7; margin-left: 4px; }
  `);

  // ==================== UI ====================
  function createUI() {
    if ($('#shinigami-skip-ui')) return;

    const ui = document.createElement('div');
    ui.id = 'shinigami-skip-ui';
    ui.innerHTML = `
      <div id="ss-header">§ ShinigamiSkip §</div>
      <div id="ss-status">Inizializzazione...</div>
      <div id="ss-controls">
        <button id="ss-skip-intro" class="ss-btn">SKIP INTRO <span class="ss-shortcut">[S]</span></button>
        <button id="ss-skip-outro" class="ss-btn">SKIP OUTRO <span class="ss-shortcut">[O]</span></button>
        <button id="ss-next" class="ss-btn">NEXT EP <span class="ss-shortcut">[N]</span></button>
      </div>
      <div id="ss-settings">
        <div class="ss-row">
          <label>Auto Skip Intro</label>
          <input type="checkbox" id="ss-auto-skip-intro" ${CONFIG.autoSkipIntro ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Skip Outro</label>
          <input type="checkbox" id="ss-auto-skip-outro" ${CONFIG.autoSkipOutro ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Next Episode</label>
          <input type="checkbox" id="ss-auto-next" ${CONFIG.autoNext ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Play</label>
          <input type="checkbox" id="ss-auto-play" ${CONFIG.autoPlay ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Auto Fullscreen</label>
          <input type="checkbox" id="ss-auto-fullscreen" ${CONFIG.autoFullscreen ? 'checked' : ''}/>
        </div>
        <div class="ss-row">
          <label>Intro Fallback (sec)</label>
          <input type="number" id="ss-fallback-intro" min="5" max="300" value="${CONFIG.introFallback}"/>
        </div>
        <div class="ss-row">
          <label>Outro Duration (sec)</label>
          <input type="number" id="ss-outro-sec" min="10" max="300" value="${CONFIG.outroDuration}"/>
        </div>
        <div class="ss-note">
          💡 Clicca "SKIP INTRO" entro il 30% del video per imparare l'intro della serie.<br>
          ⌨️ Shortcuts: [S]=Skip Intro | [O]=Skip Outro | [N]=Next Episode
        </div>
      </div>
    `;
    document.body.appendChild(ui);

    bindUIEvents();
  }

  function bindUIEvents() {
    $('#ss-header').addEventListener('click', toggleSettings);
    $('#ss-skip-intro').addEventListener('click', () => { state.learnedIntro = true; skipIntro(true); });
    $('#ss-skip-outro').addEventListener('click', () => skipOutro(true));
    $('#ss-next').addEventListener('click', () => goNextEpisode(true));

    $('#ss-auto-skip-intro').addEventListener('change', e => GM_setValue('AUTO_SKIP_INTRO', e.target.checked));
    $('#ss-auto-skip-outro').addEventListener('change', e => GM_setValue('AUTO_SKIP_OUTRO', e.target.checked));
    $('#ss-auto-next').addEventListener('change', e => GM_setValue('AUTO_NEXT_EPISODE', e.target.checked));
    $('#ss-auto-play').addEventListener('change', e => GM_setValue('AUTO_PLAY', e.target.checked));
    $('#ss-auto-fullscreen').addEventListener('change', e => GM_setValue('AUTO_FULLSCREEN', e.target.checked));
    $('#ss-fallback-intro').addEventListener('change', e => GM_setValue('INTRO_DURATION', Math.max(5, parseInt(e.target.value) || 85)));
    $('#ss-outro-sec').addEventListener('change', e => GM_setValue('OUTRO_DURATION', Math.max(10, parseInt(e.target.value) || 90)));

    document.addEventListener('keydown', handleKeyboard);
  }

  function toggleSettings() {
    const settings = $('#ss-settings');
    const isVisible = settings.style.display === 'block';
    settings.style.display = isVisible ? 'none' : 'block';
    state.uiVisible = !isVisible;
  }

  function updateStatus(msg, color = '#FFB74D') {
    const status = $('#ss-status');
    if (status) {
      status.textContent = msg;
      status.style.color = color;
    }
  }

  function handleKeyboard(e) {
    if (!state.player || e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
    const key = e.key.toLowerCase();
    if (key === 's') { state.learnedIntro = true; skipIntro(true); }
    else if (key === 'o') skipOutro(true);
    else if (key === 'n') goNextEpisode(true);
  }

  // ==================== PLAYER DETECTION ====================
  function findPlayerInContext(ctx) {
    return ctx.querySelector?.('video.jw-video[src^="blob:"]') ||
           ctx.getElementById?.('video-player') ||
           ctx.querySelector?.('video');
  }

  function findPlayer() {
    let video = findPlayerInContext(document);
    if (video) return video;

    for (const iframe of $$('iframe')) {
      try {
        const doc = iframe.contentDocument || iframe.contentWindow?.document;
        if (doc) {
          video = findPlayerInContext(doc);
          if (video) return video;
        }
      } catch {}
    }
    return null;
  }

  function attachPlayer(p) {
    if (!p || p === state.player) return;

    if (state.player) {
      state.player.removeEventListener('timeupdate', onTimeUpdate);
      state.player.removeEventListener('ended', onEnded);
      state.player.removeEventListener('loadedmetadata', onLoaded);
      state.player.removeEventListener('canplay', onCanPlay);
    }

    state.player = p;
    resetEpisodeState();

    p.addEventListener('timeupdate', onTimeUpdate);
    p.addEventListener('ended', onEnded);
    p.addEventListener('loadedmetadata', onLoaded);
    p.addEventListener('canplay', onCanPlay);

    if (state.timer) clearInterval(state.timer);
    state.timer = setInterval(safetyLoop, 1000);

    updateStatus(`Player attivo (${getDurationText()})`, '#4CAF50');
    log('Player attached:', p);
  }

  function getDurationText() {
    return isFinite(state.player?.duration) ? `${Math.round(state.player.duration)}s` : '…';
  }

  function observePlayer() {
    if (state.observer) return;

    state.observer = new MutationObserver(() => {
      const newPlayer = findPlayer();
      if (newPlayer && newPlayer !== state.player) attachPlayer(newPlayer);
    });

    state.observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['src']
    });

    const pollInterval = setInterval(() => {
      const p = findPlayer();
      if (p) {
        attachPlayer(p);
        clearInterval(pollInterval);
      }
    }, 1000);
  }

  // ==================== SMART INTRO DETECTION ====================
  function getSeriesKey() {
    const url = new URL(location.href);
    let path = url.pathname;
    const epMatch = path.match(/(episode[-/])(\d+)/i);
    if (epMatch) path = path.replace(epMatch[0], epMatch[1]);
    return `${SITE}:${url.origin}${path}`;
  }

  function saveLearnedIntro(sec) {
    if (!sec || !isFinite(sec)) return;
    const key = `${getSeriesKey()}::introEnd`;
    GM_setValue(key, Math.round(sec));
    log('Learned intro end:', sec);
  }

  function loadLearnedIntro() {
    const key = `${getSeriesKey()}::introEnd`;
    return GM_getValue(key, null);
  }

  function getChaptersIntroEnd() {
    if (!state.player?.textTracks) return null;

    const KEYWORDS = /opening|intro|op\b/i;
    for (const track of state.player.textTracks) {
      if (!/chapters|metadata/i.test(track.kind)) continue;

      const cues = track.cues || [];
      for (let i = 0; i < cues.length; i++) {
        const cue = cues[i];
        const text = (cue.text || '').trim();
        if (KEYWORDS.test(text)) {
          const end = cue.endTime || (i + 1 < cues.length ? cues[i + 1].startTime : null);
          if (end) return Math.max(0, end - CONFIG.SMART_MARGIN);
        }
      }
    }
    return null;
  }

  function getIntroTarget() {
    return getChaptersIntroEnd() ?? loadLearnedIntro() ?? CONFIG.introFallback;
  }

  // ==================== PLAYER EVENTS ====================
  function onLoaded() {
    updateStatus(`Player pronto (${getDurationText()})`, '#4CAF50');
  }

  function onCanPlay() {
    if (CONFIG.autoPlay && state.player.paused) {
      state.player.play().catch(() => {});
    }
    if (CONFIG.autoFullscreen) {
      requestFullscreen();
    }
  }

  function onTimeUpdate() {
    const p = state.player;
    if (!p || !isFinite(p.duration)) return;

    // Auto skip intro
    if (CONFIG.autoSkipIntro && !state.skippedIntro) {
      const target = getIntroTarget();
      if (p.currentTime > 3 && p.currentTime < target - 0.5) {
        doSkipTo(target, false);
      }
    }

    // Auto skip outro
    if (CONFIG.autoSkipOutro && !state.skippedOutro) {
      const timeLeft = p.duration - p.currentTime;
      if (timeLeft > 0 && timeLeft <= CONFIG.outroDuration) {
        p.currentTime = p.duration - 1;
        state.skippedOutro = true;
        toast('Outro saltata (auto)', '#FF9800');
        if (CONFIG.autoNext) setTimeout(() => goNextEpisode(), 600);
      }
    }

    // Auto next near end
    if (CONFIG.autoNext) {
      const timeLeft = p.duration - p.currentTime;
      if (isFinite(timeLeft) && timeLeft <= CONFIG.NEXT_GUARD_SECS && timeLeft > 0) {
        goNextEpisode();
      }
    }
  }

  function onEnded() {
    if (CONFIG.autoNext) {
      setTimeout(() => goNextEpisode(), 800);
    }
  }

  function safetyLoop() {
    const p = state.player;
    if (!p) return;

    if (p.currentTime < 1 && p.duration > 30) {
      if (state.skippedIntro) state.skippedIntro = false;
      if (state.skippedOutro) state.skippedOutro = false;
    }
  }

  // ==================== SKIP ACTIONS ====================
  function doSkipTo(targetTime, manual) {
    try {
      state.player.currentTime = targetTime;
      state.skippedIntro = true;

      toast(manual ? 'Intro saltata!' : 'Intro auto-saltata', manual ? '#4CAF50' : '#2196F3');

      if (manual || state.learnedIntro) {
        const p = state.player;
        if (isFinite(p.duration) && p.duration > 0) {
          const threshold = p.duration * 0.30;
          const now = Math.max(0, targetTime, p.currentTime);
          if (now <= threshold) {
            saveLearnedIntro(now);
          }
        }
        state.learnedIntro = false;
      }
    } catch (err) {
      log('Error in doSkipTo:', err);
    }
  }

  function skipIntro(manual = false) {
    if (!state.player) return;

    const target = state.player.currentTime + CONFIG.introFallback;
    if (target < state.player.duration) {
      doSkipTo(target, manual);
    } else {
      toast('Fine video raggiunta', '#FF9800');
    }
  }

  function skipOutro(manual = false) {
    const p = state.player;
    if (!p || !isFinite(p.duration)) return;

    const target = p.duration - CONFIG.outroDuration;
    if (target > 0) {
      p.currentTime = target;
      state.skippedOutro = true;
      if (manual) {
        toast('Outro saltata!', '#FF9800');
        if (CONFIG.autoNext) setTimeout(() => goNextEpisode(), 600);
      }
    } else {
      if (manual) toast('Video troppo corto', '#FF9800');
    }
  }

  // ==================== NEXT EPISODE ====================
  function clickIfVisible(el) {
    if (!el) return false;
    const rect = el.getBoundingClientRect();
    if (rect.width > 0 && rect.height > 0) {
      el.click();
      return true;
    }
    return false;
  }

  function findNextButtons() {
    const selectors = [
      'a.next-episode', '.btn-next', '[title*="Prossimo"]', '[title*="Successivo"]',
      '.next-ep', '.btn-next-ep', 'a[rel="next"]', '.next', 'button.next'
    ];

    const elements = new Set();
    selectors.forEach(sel => $$(sel).forEach(el => elements.add(el)));

    const textPatterns = ['prossimo', 'successivo', 'next', 'next episode', 'next ep'];
    $$('a, button').forEach(el => {
      const text = (el.textContent || '').trim().toLowerCase();
      if (textPatterns.some(pattern => text.includes(pattern))) {
        elements.add(el);
      }
    });

    return [...elements];
  }

  function findNextUrlByPattern() {
    const match1 = location.href.match(/episode-(\d+)/i);
    if (match1) {
      const cur = parseInt(match1[1], 10);
      if (Number.isFinite(cur)) {
        return location.href.replace(`episode-${cur}`, `episode-${cur + 1}`);
      }
    }

    const match2 = location.pathname.match(/episode\/(\d+)/i);
    if (match2) {
      const cur = parseInt(match2[1], 10);
      if (Number.isFinite(cur)) {
        return location.href.replace(`episode/${cur}`, `episode/${cur + 1}`);
      }
    }

    return null;
  }

  function goNextEpisode(manual = false) {
    // Try clicking next buttons
    for (const btn of findNextButtons()) {
      if (clickIfVisible(btn)) {
        if (manual) toast('Prossimo episodio…', '#9C27B0');
        return true;
      }
    }

    // Try episode list
    const currentEp = $('.episodes a.active');
    if (currentEp) {
      const li = currentEp.closest('li');
      const nextLi = li?.nextElementSibling;
      const nextLink = nextLi?.querySelector('a');
      if (nextLink) {
        nextLink.click();
        if (manual) toast('Prossimo episodio…', '#9C27B0');
        return true;
      }
    }

    // Try URL pattern
    const nextUrl = findNextUrlByPattern();
    if (nextUrl) {
      location.href = nextUrl;
      return true;
    }

    if (manual) toast('Prossimo episodio non trovato', '#FF5722');
    return false;
  }

  // ==================== FULLSCREEN ====================
  function requestFullscreen() {
    const container = state.player.closest('.video-container, .player-wrapper') || state.player.parentElement;
    if (!container) return;

    const fs = container.requestFullscreen ||
               container.webkitRequestFullscreen ||
               container.mozRequestFullScreen ||
               container.msRequestFullscreen;

    if (fs) fs.call(container).catch(() => {});
  }

  // ==================== INITIALIZATION ====================
  function resetEpisodeState() {
    state.skippedIntro = false;
    state.skippedOutro = false;
    state.learnedIntro = false;
  }

  function init() {
    createUI();
    observePlayer();

    const firstPlayer = findPlayer();
    if (firstPlayer) {
      attachPlayer(firstPlayer);
      updateStatus('Player rilevato', '#4CAF50');
    } else {
      updateStatus('Ricerca player in corso…', '#FFB74D');
    }

    log('Initialized on', SITE);
  }

  // ==================== ERROR HANDLING ====================
  window.addEventListener('error', (e) => {
    log('Global error:', e.error);
    toast('Errore nello script', '#F44336');
  });

  // ==================== START ====================
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init, { once: true });
  } else {
    setTimeout(init, 300);
  }

})();
