// ==UserScript==
// @name         ShinigamiSkip
// @namespace    https://github.com/Suplic0z/-ShinigamiSkip-
// @version      2.0.0
// @description  Salta automaticamente intro e outro degli anime su siti di streaming
// @author       Suplic0z
// @match        https://www.animeworld.ac/*
// @match        https://animeworld.ac/*
// @match        https://www.animeworld.so/*
// @match        https://animeworld.so/*
// @match        https://www.animeunity.so/*
// @match        https://animeunity.so/*
// @match        https://www.animeunity.to/*
// @match        https://animeunity.to/*
// @match        https://www.animesaturn.co/*
// @match        https://animesaturn.co/*
// @icon         https://www.google.com/s2/favicons?sz=64&domain=animeworld.ac
// @grant        GM_addStyle
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @grant        GM_xmlhttpRequest
// @connect      api.aniskip.com
// @connect      api.myanimelist.net
// @connect      api.jikan.moe
// @connect      anilist.co
// @connect      raw.githubusercontent.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-start
// @updateURL    https://github.com/Suplic0z/-ShinigamiSkip-/raw/main/ShinigamiSkip.user.js
// @downloadURL  https://github.com/Suplic0z/-ShinigamiSkip-/raw/main/ShinigamiSkip.user.js
// ==/UserScript==

(function() {
    'use strict';

    /* ===== PARTE 1 - Config & Theme (Linee 1-150) ===== */

    // Gestione temi per siti diversi
    const themeManager = {
        themes: {
            default: {
                primary: '#FF1744',
                secondary: '#D50000',
                background: 'rgba(18, 18, 18, 0.95)',
                text: '#FFFFFF',
                accent: '#FF5252',
                border: 'rgba(255, 255, 255, 0.12)',
                shadow: '0 10px 30px rgba(0, 0, 0, 0.7)',
                buttonBg: 'rgba(255, 255, 255, 0.08)',
                buttonHover: 'rgba(255, 255, 255, 0.16)',
                active: '#69F0AE',
                warning: '#FFAB40'
            },
            animeworld: {
                primary: '#FF1744',
                secondary: '#D50000',
                background: 'rgba(10, 10, 10, 0.95)',
                text: '#FFFFFF',
                accent: '#FF5252',
                border: 'rgba(255, 255, 255, 0.1)',
                shadow: '0 15px 35px rgba(0, 0, 0, 0.8)',
                buttonBg: 'rgba(255, 255, 255, 0.06)',
                buttonHover: 'rgba(255, 255, 255, 0.18)',
                active: '#69F0AE',
                warning: '#FFAB40'
            },
            animeunity: {
                primary: '#2196F3',
                secondary: '#1976D2',
                background: 'rgba(13, 27, 42, 0.96)',
                text: '#E3F2FD',
                accent: '#64B5F6',
                border: 'rgba(100, 181, 246, 0.35)',
                shadow: '0 15px 40px rgba(10, 25, 41, 0.95)',
                buttonBg: 'rgba(25, 118, 210, 0.4)',
                buttonHover: 'rgba(25, 118, 210, 0.8)',
                active: '#A5D6A7',
                warning: '#FFCC80'
            },
            animesaturn: {
                primary: '#FF9800',
                secondary: '#F57C00',
                background: 'rgba(26, 26, 26, 0.96)',
                text: '#FFF3E0',
                accent: '#FFB74D',
                border: 'rgba(255, 183, 77, 0.3)',
                shadow: '0 15px 40px rgba(0, 0, 0, 0.9)',
                buttonBg: 'rgba(255, 152, 0, 0.3)',
                buttonHover: 'rgba(255, 152, 0, 0.7)',
                active: '#C5E1A5',
                warning: '#FFAB40'
            }
        },
        currentTheme: 'default',
        getTheme: function() {
            const site = siteDetector.detect();
            if (this.themes[site]) {
                this.currentTheme = site;
                return this.themes[site];
            }
            this.currentTheme = 'default';
            return this.themes.default;
        },
        applyTheme: function() {
            const theme = this.getTheme();
            const root = document.documentElement;
            root.style.setProperty('--shinigami-primary', theme.primary);
            root.style.setProperty('--shinigami-secondary', theme.secondary);
            root.style.setProperty('--shinigami-background', theme.background);
            root.style.setProperty('--shinigami-text', theme.text);
            root.style.setProperty('--shinigami-accent', theme.accent);
            root.style.setProperty('--shinigami-border', theme.border);
            root.style.setProperty('--shinigami-shadow', theme.shadow);
            root.style.setProperty('--shinigami-button-bg', theme.buttonBg);
            root.style.setProperty('--shinigami-button-hover', theme.buttonHover);
            root.style.setProperty('--shinigami-active', theme.active);
            root.style.setProperty('--shinigami-warning', theme.warning);
        }
    };

    // Config
    const config = {
        introFallback: 30, // seconds
        outroDuration: 30, // seconds
        autoSkipIntro: true,
        autoSkipOutro: true,
        autoNextEpisode: true,
        autoPlay: true,
        autoFullScreen: true,
        useAPI: true,
        showOverlay: true,
        showStats: true,
        showTimer: true,
        debugMode: false,
        apiEndpoint: 'https://api.aniskip.com/v2/skip-times',

        load: function() {
            try {
                const savedConfig = GM_getValue('shinigamiConfig', null);
                if (savedConfig) {
                    Object.assign(this, savedConfig);
                }
            } catch (e) {
                console.error('[ShinigamiSkip] Errore caricamento config:', e);
            }
        },
        save: function() {
            try {
                const configToSave = Object.assign({}, this);
                delete configToSave.load;
                delete configToSave.save;
                GM_setValue('shinigamiConfig', configToSave);
            } catch (e) {
                console.error('[ShinigamiSkip] Errore salvataggio config:', e);
            }
        }
    };
    config.load();

    /* ===== PARTE 2 - State & Utilities (Linee 151-350) ===== */

    // State management
    const state = {
        player: null,
        playerContainer: null,
        currentEpisode: null,
        currentSeries: null,
        introEnd: null,
        outroStart: null,
        skipIntroTriggered: false,
        skipOutroTriggered: false,
        nextEpisodeUrl: null,
        stats: {
            introsSkipped: 0,
            outrosSkipped: 0,
            episodesWatched: 0,
            totalTimeSaved: 0
        },
        overlay: {
            intro: null,
            outro: null
        },
        ui: {
            container: null,
            controls: null,
            settings: null
        },
        isFullscreen: false,
        isDragging: false,
        dragOffset: { x: 0, y: 0 },
        uiPosition: { x: 20, y: 20 },
        lastApiCheck: null,
        apiCache: {},
        pollTimer: null,
        observer: null,
        initialized: false
    };

    // Utility functions
    const utils = {
        log: function(message, level = 'info') {
            if (!config.debugMode && level === 'debug') return;

            const prefix = '[ShinigamiSkip]';
            switch (level) {
                case 'error':
                    console.error(prefix, message);
                    break;
                case 'warn':
                    console.warn(prefix, message);
                    break;
                case 'debug':
                    console.debug(prefix, message);
                    break;
                default:
                    console.log(prefix, message);
            }
        },
        toast: function(message, duration = 3000) {
            // Rimuovi toast esistenti
            const existingToast = document.querySelector('.shinigami-toast');
            if (existingToast) {
                existingToast.remove();
            }

            const toast = document.createElement('div');
            toast.className = 'shinigami-toast';
            toast.textContent = message;

            GM_addStyle(`
                .shinigami-toast {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: rgba(0, 0, 0, 0.9);
                    color: #fff;
                    padding: 12px 16px;
                    border-radius: 8px;
                    z-index: 999999;
                    font-size: 14px;
                    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
                    animation: shinigami-toast-in 0.2s ease-out;
                }
                @keyframes shinigami-toast-in {
                    from { opacity: 0; transform: translateY(10px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `);

            document.body.appendChild(toast);

            setTimeout(() => {
                toast.style.transition = 'opacity 0.2s ease-out, transform 0.2s ease-out';
                toast.style.opacity = '0';
                toast.style.transform = 'translateY(10px)';
                setTimeout(() => toast.remove(), 200);
            }, duration);
        },
        saveStats: function() {
            GM_setValue('shinigamiStats', state.stats);
        },
        loadStats: function() {
            const saved = GM_getValue('shinigamiStats', null);
            if (saved) {
                Object.assign(state.stats, saved);
            }
        },
        formatTime: function(seconds) {
            if (!seconds || isNaN(seconds)) return '0s';

            const minutes = Math.floor(seconds / 60);
            const remainingSeconds = Math.floor(seconds % 60);

            if (minutes === 0) return `${remainingSeconds}s`;
            return `${minutes}m ${remainingSeconds}s`;
        },
        debounce: function(func, wait) {
            let timeout;
            return function(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },
        throttle: function(func, limit) {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },
        createElement: function(tag, className, innerHTML) {
            const element = document.createElement(tag);
            if (className) element.className = className;
            if (innerHTML) element.innerHTML = innerHTML;
            return element;
        },
        addEventListeners: function(element, events) {
            Object.entries(events).forEach(([event, handler]) => {
                element.addEventListener(event, handler);
            });
        }
    };

    utils.loadStats();

    /* ===== PARTE 3 - Site Detection & Player Discovery (Linee 351-550) ===== */

    const siteDetector = {
        detect: function() {
            const host = window.location.hostname;

            if (host.includes('animeworld')) return 'animeworld';
            if (host.includes('animeunity')) return 'animeunity';
            if (host.includes('animesaturn')) return 'animesaturn';

            return 'unknown';
        },
        getPlayerSelector: function() {
            const site = this.detect();

            switch (site) {
                case 'animeworld':
                    return 'video, .jwplayer, #player, .aw-player video';
                case 'animeunity':
                    return 'video, .plyr__video-wrapper video, #player video';
                case 'animesaturn':
                    return 'video, .video-js, #player video';
                default:
                    return 'video';
            }
        }
    };

    const playerDiscovery = {
        findPlayer: function() {
            const selector = siteDetector.getPlayerSelector();
            const elements = document.querySelectorAll(selector);

            for (const el of elements) {
                if (el.tagName.toLowerCase() === 'video') {
                    return el;
                }
                const video = el.querySelector('video');
                if (video) return video;
            }

            return null;
        },
        initPlayer: function() {
            state.player = this.findPlayer();

            if (!state.player) {
                utils.log('Nessun player trovato, riprovo...', 'debug');
                return false;
            }

            state.playerContainer = state.player.closest('.video-container, .player, .jwplayer, .plyr, body') || document.body;
            utils.log('Player trovato e inizializzato', 'debug');

            return true;
        }
    };

    /* ===== PARTE 4 - API Integration & Timestamp Management (Linee 551-850) ===== */

    const dataManager = {
        getSeriesKey: function() {
            if (!state.currentSeries) return null;
            const site = siteDetector.detect();
            return `${site}:${state.currentSeries.toLowerCase().trim()}`;
        },
        saveTimestamp: function(introEnd, outroStart) {
            try {
                const seriesKey = this.getSeriesKey();
                if (!seriesKey) return;

                const timestamps = GM_getValue('shinigamiTimestamps', {});
                if (!timestamps[seriesKey]) {
                    timestamps[seriesKey] = {};
                }

                timestamps[seriesKey][state.currentEpisode] = {
                    introEnd,
                    outroStart
                };

                GM_setValue('shinigamiTimestamps', timestamps);
            } catch (e) {
                utils.log(`Errore salvataggio timestamp: ${e.message}`, 'error');
            }
        },
        loadTimestamp: function() {
            try {
                const seriesKey = this.getSeriesKey();
                if (!seriesKey) return false;

                const timestamps = GM_getValue('shinigamiTimestamps', {});
                if (timestamps[seriesKey] && timestamps[seriesKey][state.currentEpisode]) {
                    const data = timestamps[seriesKey][state.currentEpisode];
                    state.introEnd = data.introEnd;
                    state.outroStart = data.outroStart;
                    return true;
                }
            } catch (e) {
                utils.log(`Errore caricamento timestamp: ${e.message}`, 'error');
            }

            return false;
        },
        fetchAPITimestamps: function() {
            if (!state.currentSeries || !state.currentEpisode) return;

            const seriesKey = this.getSeriesKey();
            if (!seriesKey) return;

            // Controlla cache
            if (state.apiCache[seriesKey] && state.apiCache[seriesKey][state.currentEpisode]) {
                const cached = state.apiCache[seriesKey][state.currentEpisode];
                state.introEnd = cached.introEnd;
                state.outroStart = cached.outroStart;
                utils.log('Timestamp caricati dalla cache', 'debug');
                return;
            }

            // Prepara URL API
            const apiUrl = `${config.apiEndpoint}/${encodeURIComponent(state.currentSeries)}/${state.currentEpisode}?types[]=op&types[]=ed`;

            utils.log(`Richiesta API: ${apiUrl}`, 'debug');

            GM_xmlhttpRequest({
                method: 'GET',
                url: apiUrl,
                onload: function(response) {
                    try {
                        if (response.status !== 200) {
                            utils.log(`Errore API (${response.status}): ${response.statusText}`, 'warn');
                            return;
                        }

                        const data = JSON.parse(response.responseText);

                        if (!data || !Array.isArray(data.results) || data.results.length === 0) {
                            utils.log('Nessun risultato API per questo episodio', 'debug');
                            return;
                        }

                        const duration = state.player ? state.player.duration : null;
                        if (!duration || isNaN(duration) || duration < 60) {
                            utils.log('Durata episodio non valida o troppo corta', 'warn');
                            return;
                        }

                        let introEnd = null;
                        let outroStart = null;

                        data.results.forEach(result => {
                            if (result.skip_type === 'op') {
                                introEnd = result.interval.end_time;
                            } else if (result.skip_type === 'ed') {
                                outroStart = result.interval.start_time;
                            }
                        });

                        if (introEnd !== null && introEnd > 0 && introEnd < duration * 0.8) {
                            state.introEnd = introEnd;
                        } else {
                            utils.log('Timestamp intro non valido, uso fallback', 'debug');
                            state.introEnd = config.introFallback;
                        }

                        if (outroStart !== null && outroStart > duration * 0.5 && outroStart < duration) {
                            state.outroStart = outroStart;
                        } else {
                            utils.log('Timestamp outro non valido, uso fallback', 'debug');
                            state.outroStart = duration - config.outroDuration;
                        }

                        if (!state.apiCache[seriesKey]) {
                            state.apiCache[seriesKey] = {};
                        }

                        state.apiCache[seriesKey][state.currentEpisode] = {
                            introEnd: state.introEnd,
                            outroStart: state.outroStart
                        };

                        utils.log('Timestamp API processati e salvati', 'debug');
                    } catch (e) {
                        utils.log(`Errore parsing risposta API: ${e.message}`, 'error');
                    }
                },
                onerror: function(error) {
                    utils.log(`Errore richiesta API: ${error}`, 'error');
                }
            });
        }
    };

    const apiIntegration = {
        extractAnimeInfo: function() {
            if (!state.player) return;

            let seriesInfo = null;

            switch (siteDetector.detect()) {
                case 'animeworld':
                    seriesInfo = this.extractAnimeWorldInfo();
                    break;
                case 'animeunity':
                    seriesInfo = this.extractAnimeUnityInfo();
                    break;
                case 'animesaturn':
                    seriesInfo = this.extractAnimeSaturnInfo();
                    break;
                default:
                    utils.log('Sito non riconosciuto per estrazione info anime', 'warn');
                    return;
            }

            if (seriesInfo) {
                state.currentSeries = seriesInfo.series;
                state.currentEpisode = seriesInfo.episode;
                utils.log(`Serie rilevata: ${state.currentSeries} - Episodio: ${state.currentEpisode}`, 'info');

                const loaded = dataManager.loadTimestamp();

                if (!loaded && config.useAPI) {
                    dataManager.fetchAPITimestamps();
                }
            }
        },
        extractAnimeWorldInfo: function() {
            try {
                const titleElement = document.querySelector('h1.title, h1.anime-title, .anime-title h1');
                const title = titleElement ? titleElement.textContent.trim() : '';

                const episodeMatch = window.location.pathname.match(/\/ep\/(\d+)/);
                const episode = episodeMatch ? parseInt(episodeMatch[1]) : null;

                if (title && episode) {
                    return {
                        series: title,
                        episode: episode
                    };
                }

                return null;
            } catch (e) {
                utils.log(`Errore estrazione info AnimeWorld: ${e.message}`, 'error');
                return null;
            }
        },
        extractAnimeUnityInfo: function() {
            try {
                const titleElement = document.querySelector('h1.anime-title, .anime-title h1, .title-anime');
                const title = titleElement ? titleElement.textContent.trim() : '';

                const episodeMatch = window.location.pathname.match(/\/episodio-(\d+)/);
                const episode = episodeMatch ? parseInt(episodeMatch[1]) : null;

                if (title && episode) {
                    return {
                        series: title,
                        episode: episode
                    };
                }

                return null;
            } catch (e) {
                utils.log(`Errore estrazione info AnimeUnity: ${e.message}`, 'error');
                return null;
            }
        },
        extractAnimeSaturnInfo: function() {
            try {
                const titleElement = document.querySelector('.title h1, .anime-title h1, h1.title');
                const title = titleElement ? titleElement.textContent.trim() : '';

                const episodeMatch = window.location.pathname.match(/\/episodio-(\d+)/);
                const episode = episodeMatch ? parseInt(episodeMatch[1]) : null;

                if (title && episode) {
                    return {
                        series: title,
                        episode: episode
                    };
                }

                return null;
            } catch (e) {
                utils.log(`Errore estrazione info AnimeSaturn: ${e.message}`, 'error');
                return null;
            }
        }
    };

    /* ===== PARTE 5 - Player Controls & Skip Logic (Linee 851-1250) ===== */

    const playerControls = {
        ensurePlaying: function() {
            if (state.player && state.player.paused) {
                state.player.play().catch(() => {});
            }
        },
        enterFullscreen: function() {
            if (!state.playerContainer) return;

            const element = state.playerContainer;

            if (element.requestFullscreen) {
                element.requestFullscreen();
            } else if (element.webkitRequestFullscreen) {
                element.webkitRequestFullscreen();
            } else if (element.mozRequestFullScreen) {
                element.mozRequestFullScreen();
            } else if (element.msRequestFullscreen) {
                element.msRequestFullscreen();
            }

            state.isFullscreen = true;
            utils.log('Entrato in modalità fullscreen', 'debug');
        },
        exitFullscreen: function() {
            if (document.fullscreenElement || document.webkitFullscreenElement || document.mozFullScreenElement || document.msFullscreenElement) {
                if (document.exitFullscreen) {
                    document.exitFullscreen();
                } else if (document.webkitExitFullscreen) {
                    document.webkitExitFullscreen();
                } else if (document.mozCancelFullScreen) {
                    document.mozCancelFullScreen();
                } else if (document.msExitFullscreen) {
                    document.msExitFullscreen();
                }
            }

            state.isFullscreen = false;
            utils.log('Uscito dalla modalità fullscreen', 'debug');
        },
        toggleFullscreen: function() {
            if (state.isFullscreen) {
                this.exitFullscreen();
            } else {
                this.enterFullscreen();
            }
        },
        skipIntro: function() {
            if (!state.player || state.introEnd === null) return;

            const currentTime = state.player.currentTime;
            const duration = state.player.duration;

            if (!duration || isNaN(duration) || duration < 60) {
                utils.log('Durata episodio non valida per skip intro', 'warn');
                return;
            }

            if (currentTime < state.introEnd) {
                const timeSaved = state.introEnd - currentTime;
                state.player.currentTime = state.introEnd;
                state.skipIntroTriggered = true;

                state.stats.introsSkipped++;
                state.stats.totalTimeSaved += Math.max(0, timeSaved);
                utils.saveStats();

                uiCreation.updateStats();
                uiCreation.showSkipMessage('Intro saltata');

                utils.log(`Intro saltata, risparmiati ${timeSaved.toFixed(1)}s`, 'info');
            }
        },
        skipOutro: function() {
            if (!state.player || state.outroStart === null) return;

            const currentTime = state.player.currentTime;
            const duration = state.player.duration;

            if (!duration || isNaN(duration) || duration < 60) {
                utils.log('Durata episodio non valida per skip outro', 'warn');
                return;
            }

            if (currentTime >= state.outroStart && currentTime < duration) {
                const timeSaved = duration - currentTime;
                state.player.currentTime = duration - 0.1;
                state.skipOutroTriggered = true;

                state.stats.outrosSkipped++;
                state.stats.totalTimeSaved += Math.max(0, timeSaved);
                utils.saveStats();

                uiCreation.updateStats();
                uiCreation.showSkipMessage('Outro saltata');

                utils.log(`Outro saltata, risparmiati ${timeSaved.toFixed(1)}s`, 'info');

                if (config.autoNextEpisode && state.nextEpisodeUrl) {
                    setTimeout(() => navigation.goToNextEpisode(), 500);
                }
            }
        },
        autoPlayAndFullscreen: function() {
            if (!state.player) return;

            if (config.autoPlay) {
                state.player.play().catch(() => {});
            }

            if (config.autoFullScreen) {
                this.enterFullscreen();
            }
        }
    };

    const skipActions = {
        checkIntro: function() {
            if (!state.player || !config.autoSkipIntro || state.skipIntroTriggered) return;

            const currentTime = state.player.currentTime;
            const duration = state.player.duration;

            if (!duration || isNaN(duration) || duration < 60) return;

            if (state.introEnd === null) {
                state.introEnd = config.introFallback;
            }

            if (currentTime >= 0 && currentTime < state.introEnd) {
                playerControls.skipIntro();
            }
        },
        checkOutro: function() {
            if (!state.player || !config.autoSkipOutro || state.skipOutroTriggered) return;

            const currentTime = state.player.currentTime;
            const duration = state.player.duration;

            if (!duration || isNaN(duration) || duration < 60) return;

            if (state.outroStart === null) {
                state.outroStart = duration - config.outroDuration;
            }

            if (currentTime >= state.outroStart && currentTime < duration) {
                playerControls.skipOutro();
            }
        },
        poll: function() {
            if (!state.player || state.player.readyState < 2) return;

            this.checkIntro();
            this.checkOutro();
        },
        startPolling: function() {
            if (state.pollTimer) clearInterval(state.pollTimer);

            state.pollTimer = setInterval(() => this.poll(), 500);
            utils.log('Polling skip attivo', 'debug');
        },
        stopPolling: function() {
            if (state.pollTimer) {
                clearInterval(state.pollTimer);
                state.pollTimer = null;
            }
        }
    };

    /* ===== PARTE 6 - UI Creation (Pannello, Stats, Settings) ===== */

    const uiCreation = {
        createPanel: function() {
            if (state.ui.container) {
                state.ui.container.remove();
                state.ui.container = null;
            }

            const theme = themeManager.getTheme();
            themeManager.applyTheme();

            GM_addStyle(`
                #shinigami-panel {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--shinigami-background);
                    color: var(--shinigami-text);
                    border-radius: 12px;
                    padding: 12px;
                    z-index: 999999;
                    min-width: 260px;
                    max-width: 340px;
                    box-shadow: var(--shinigami-shadow);
                    border: 1px solid var(--shinigami-border);
                    backdrop-filter: blur(10px);
                    font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    user-select: none;
                }

                #shinigami-panel.dragging {
                    opacity: 0.9;
                    cursor: move;
                }

                .shinigami-header {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    margin-bottom: 4px;
                }

                .shinigami-title {
                    font-size: 14px;
                    font-weight: 600;
                    letter-spacing: 0.03em;
                    display: flex;
                    align-items: center;
                    gap: 6px;
                }

                .shinigami-title span {
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    width: 18px;
                    height: 18px;
                    border-radius: 999px;
                    background: var(--shinigami-primary);
                    color: #fff;
                    font-size: 11px;
                    font-weight: 700;
                    box-shadow: 0 0 10px rgba(255, 23, 68, 0.7);
                }

                .shinigami-badge {
                    font-size: 10px;
                    padding: 2px 6px;
                    border-radius: 999px;
                    border: 1px solid var(--shinigami-border);
                    text-transform: uppercase;
                    letter-spacing: 0.08em;
                    color: var(--shinigami-accent);
                }

                .shinigami-body {
                    display: flex;
                    flex-direction: column;
                    gap: 6px;
                }

                .shinigami-controls {
                    display: flex;
                    gap: 6px;
                    flex-wrap: wrap;
                }

                .shinigami-btn {
                    flex: 1;
                    border-radius: 999px;
                    border: 1px solid var(--shinigami-border);
                    background: var(--shinigami-button-bg);
                    color: var(--shinigami-text);
                    font-size: 11px;
                    padding: 6px 10px;
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                    transition: all 0.15s ease-out;
                    white-space: nowrap;
                }

                .shinigami-btn span.icon {
                    font-size: 13px;
                }

                .shinigami-btn:hover {
                    background: var(--shinigami-button-hover);
                    transform: translateY(-1px);
                    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.4);
                }

                .shinigami-btn.primary {
                    background: linear-gradient(135deg, var(--shinigami-primary), var(--shinigami-secondary));
                    border-color: transparent;
                }

                .shinigami-btn.primary:hover {
                    box-shadow: 0 8px 20px rgba(255, 23, 68, 0.6);
                }

                .shinigami-btn.warning {
                    border-color: var(--shinigami-warning);
                    color: var(--shinigami-warning);
                }

                .shinigami-btn-small {
                    font-size: 10px;
                    padding: 4px 8px;
                }

                .shinigami-section-title {
                    font-size: 11px;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    color: rgba(255, 255, 255, 0.7);
                }

                .shinigami-stats {
                    display: flex;
                    justify-content: space-between;
                    gap: 6px;
                    font-size: 11px;
                }

                .shinigami-stat {
                    flex: 1;
                    padding: 6px 8px;
                    border-radius: 8px;
                    background: rgba(255, 255, 255, 0.02);
                    border: 1px dashed var(--shinigami-border);
                }

                .shinigami-stat-label {
                    font-size: 10px;
                    opacity: 0.7;
                    margin-bottom: 2px;
                }

                .shinigami-stat-value {
                    font-size: 12px;
                    font-weight: 600;
                }

                .shinigami-toggles {
                    display: flex;
                    flex-wrap: wrap;
                    gap: 4px;
                }

                .shinigami-toggle {
                    font-size: 10px;
                    padding: 3px 7px;
                    border-radius: 999px;
                    border: 1px solid var(--shinigami-border);
                    background: rgba(255, 255, 255, 0.02);
                    cursor: pointer;
                    display: inline-flex;
                    align-items: center;
                    gap: 4px;
                }

                .shinigami-toggle.active {
                    border-color: var(--shinigami-active);
                    color: var(--shinigami-active);
                    background: rgba(105, 240, 174, 0.08);
                }

                .shinigami-toggle-dot {
                    width: 6px;
                    height: 6px;
                    border-radius: 999px;
                    background: rgba(255, 255, 255, 0.2);
                }

                .shinigami-toggle.active .shinigami-toggle-dot {
                    background: var(--shinigami-active);
                    box-shadow: 0 0 6px rgba(105, 240, 174, 0.8);
                }

                .shinigami-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 10px;
                    opacity: 0.75;
                }

                .shinigami-footer span.version {
                    font-weight: 500;
                }

                .shinigami-footer span.site {
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    font-size: 9px;
                }

                .shinigami-episode-info {
                    font-size: 11px;
                    opacity: 0.9;
                }

                .shinigami-drag-handle {
                    cursor: move;
                    padding: 4px 6px;
                    margin: -6px -6px 4px;
                    border-radius: 8px 8px 4px 4px;
                }

                .shinigami-drag-handle:hover {
                    background: rgba(255, 255, 255, 0.03);
                }

                .shinigami-skip-message {
                    position: absolute;
                    top: -32px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: rgba(0, 0, 0, 0.85);
                    color: #fff;
                    padding: 4px 8px;
                    border-radius: 999px;
                    font-size: 11px;
                    white-space: nowrap;
                    opacity: 0;
                    pointer-events: none;
                    transition: opacity 0.15s ease-out, transform 0.15s ease-out;
                }

                .shinigami-skip-message.visible {
                    opacity: 1;
                    transform: translate(-50%, -4px);
                }
            `);

            const panel = utils.createElement('div', '', '');
            panel.id = 'shinigami-panel';

            const site = siteDetector.detect();
            const themeBadge = site !== 'unknown' ? site.toUpperCase() : 'GENERIC';

            panel.innerHTML = `
                <div class="shinigami-drag-handle">
                    <div class="shinigami-header">
                        <div class="shinigami-title">
                            <span>死</span>
                            <div>
                                ShinigamiSkip
                                <div class="shinigami-episode-info">
                                    <span id="shinigami-episode-label">Episodio non rilevato</span>
                                </div>
                            </div>
                        </div>
                        <div class="shinigami-badge">${themeBadge}</div>
                    </div>
                </div>
                <div class="shinigami-body">
                    <div class="shinigami-controls">
                        <button class="shinigami-btn primary" id="shinigami-skip-intro">
                            <span class="icon">⏩</span>
                            <span>Salta Intro</span>
                        </button>
                        <button class="shinigami-btn primary" id="shinigami-skip-outro">
                            <span class="icon">⏭️</span>
                            <span>Salta Outro</span>
                        </button>
                    </div>

                    <div class="shinigami-controls">
                        <button class="shinigami-btn shinigami-btn-small" id="shinigami-next-episode">
                            <span class="icon">▶️</span>
                            <span>Prossimo Episodio</span>
                        </button>
                        <button class="shinigami-btn shinigami-btn-small" id="shinigami-fullscreen">
                            <span class="icon">🖥️</span>
                            <span>Fullscreen</span>
                        </button>
                    </div>

                    <div class="shinigami-section-title">Statistiche</div>
                    <div class="shinigami-stats">
                        <div class="shinigami-stat">
                            <div class="shinigami-stat-label">Intro/Outro</div>
                            <div class="shinigami-stat-value" id="shinigami-stat-skipped">0 / 0</div>
                        </div>
                        <div class="shinigami-stat">
                            <div class="shinigami-stat-label">Tempo Risparmiato</div>
                            <div class="shinigami-stat-value" id="shinigami-stat-time">0s</div>
                        </div>
                    </div>

                    <div class="shinigami-section-title">Impostazioni Rapide</div>
                    <div class="shinigami-toggles" id="shinigami-toggles">
                    </div>
                </div>
                <div class="shinigami-footer">
                    <span class="version">v2.0.0</span>
                    <span class="site">${themeBadge}</span>
                </div>
            `;

            document.body.appendChild(panel);
            state.ui.container = panel;

            this.initDrag();
            this.initControls();
            this.updateStats();
            this.updateToggles();
        },
        initDrag: function() {
            const panel = state.ui.container;
            const handle = panel.querySelector('.shinigami-drag-handle');

            handle.addEventListener('mousedown', (e) => {
                state.isDragging = true;
                state.dragOffset.x = e.clientX - panel.offsetLeft;
                state.dragOffset.y = e.clientY - panel.offsetTop;
                panel.classList.add('dragging');
            });

            document.addEventListener('mousemove', (e) => {
                if (!state.isDragging) return;

                const x = e.clientX - state.dragOffset.x;
                const y = e.clientY - state.dragOffset.y;

                panel.style.left = `${x}px`;
                panel.style.top = `${y}px`;
                panel.style.right = 'auto';
                panel.style.bottom = 'auto';
            });

            document.addEventListener('mouseup', () => {
                if (state.isDragging) {
                    state.isDragging = false;
                    panel.classList.remove('dragging');
                }
            });
        },
        initControls: function() {
            const panel = state.ui.container;

            const skipIntroBtn = panel.querySelector('#shinigami-skip-intro');
            const skipOutroBtn = panel.querySelector('#shinigami-skip-outro');
            const nextEpisodeBtn = panel.querySelector('#shinigami-next-episode');
            const fullscreenBtn = panel.querySelector('#shinigami-fullscreen');

            skipIntroBtn.addEventListener('click', () => playerControls.skipIntro());
            skipOutroBtn.addEventListener('click', () => playerControls.skipOutro());
            nextEpisodeBtn.addEventListener('click', () => navigation.goToNextEpisode());
            fullscreenBtn.addEventListener('click', () => playerControls.toggleFullscreen());
        },
        updateStats: function() {
            const skippedLabel = state.ui.container.querySelector('#shinigami-stat-skipped');
            const timeLabel = state.ui.container.querySelector('#shinigami-stat-time');

            if (skippedLabel) {
                skippedLabel.textContent = `${state.stats.introsSkipped} / ${state.stats.outrosSkipped}`;
            }

            if (timeLabel) {
                timeLabel.textContent = utils.formatTime(state.stats.totalTimeSaved);
            }
        },
        updateEpisodeInfo: function() {
            const label = state.ui.container.querySelector('#shinigami-episode-label');
            if (!label) return;

            if (state.currentSeries && state.currentEpisode) {
                label.textContent = `${state.currentSeries} · Ep. ${state.currentEpisode}`;
            } else {
                label.textContent = 'Episodio non rilevato';
            }
        },
        updateToggles: function() {
            const container = state.ui.container.querySelector('#shinigami-toggles');
            container.innerHTML = '';

            const toggles = [
                { id: 'autoSkipIntro', label: 'Auto-Intro', enabled: config.autoSkipIntro },
                { id: 'autoSkipOutro', label: 'Auto-Outro', enabled: config.autoSkipOutro },
                { id: 'autoNextEpisode', label: 'Auto Prossimo Ep', enabled: config.autoNextEpisode },
                { id: 'autoFullScreen', label: 'Auto-Fullscreen', enabled: config.autoFullScreen },
                { id: 'useAPI', label: 'Usa API Database', enabled: config.useAPI }
            ];

            toggles.forEach(t => {
                const toggle = document.createElement('button');
                toggle.className = 'shinigami-toggle';
                toggle.id = `shinigami-toggle-${t.id}`;

                if (t.enabled) {
                    toggle.classList.add('active');
                }

                toggle.innerHTML = `
                    <span class="shinigami-toggle-dot"></span>
                    <span>${t.label}</span>
                `;

                toggle.addEventListener('click', () => {
                    config[t.id] = !config[t.id];
                    toggle.classList.toggle('active', config[t.id]);
                    config.save();

                    utils.toast(`${t.label}: ${config[t.id] ? 'ON' : 'OFF'}`);
                });

                container.appendChild(toggle);
            });
        },
        showSkipMessage: function(text) {
            const panel = state.ui.container;
            if (!panel) return;

            let message = panel.querySelector('.shinigami-skip-message');
            if (!message) {
                message = document.createElement('div');
                message.className = 'shinigami-skip-message';
                panel.appendChild(message);
            }

            message.textContent = text;
            message.classList.add('visible');

            setTimeout(() => {
                message.classList.remove('visible');
            }, 1200);
        }
    };

    /* ===== PARTE 7 - Navigation & Next Episode (Linee 1251-1500) ===== */

    const navigation = {
        detectNextEpisodeUrl: function() {
            const site = siteDetector.detect();
            let nextLink = null;

            if (site === 'animeworld') {
                nextLink = document.querySelector('a[rel="next"], .next-episode a, .btn-next-ep, a:contains("Prossimo episodio")');
            } else if (site === 'animeunity') {
                nextLink = document.querySelector('.next-episode a, a[rel="next"], a.btn-next');
            } else if (site === 'animesaturn') {
                nextLink = document.querySelector('.next a, a[rel="next"], .next-episode a');
            }

            if (nextLink && nextLink.href) {
                state.nextEpisodeUrl = nextLink.href;
                utils.log(`Prossimo episodio rilevato: ${state.nextEpisodeUrl}`, 'debug');
            } else {
                state.nextEpisodeUrl = null;
                utils.log('Nessun link per il prossimo episodio trovato', 'debug');
            }
        },
        goToNextEpisode: function() {
            if (state.nextEpisodeUrl) {
                window.location.href = state.nextEpisodeUrl;
            } else {
                utils.toast('Nessun prossimo episodio trovato');
            }
        }
    };

    /* ===== PARTE 8 - Keyboard Shortcuts & Global Error Handling ===== */

    const keyboardShortcuts = {
        init: function() {
            document.addEventListener('keydown', (e) => {
                if (!state.player) return;

                if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable)) {
                    return;
                }

                switch (e.key.toLowerCase()) {
                    case 's':
                        playerControls.skipIntro();
                        break;
                    case 'e':
                        playerControls.skipOutro();
                        break;
                    case 'n':
                        navigation.goToNextEpisode();
                        break;
                    case 'f':
                        playerControls.toggleFullscreen();
                        break;
                }
            });

            utils.log('Scorciatoie da tastiera configurate', 'debug');
        }
    };

    const errorHandling = {
        setupGlobalErrorHandlers: function() {
            window.addEventListener('error', (event) => {
                utils.log(`Errore non gestito: ${event.message}`, 'error');
            });

            window.addEventListener('unhandledrejection', (event) => {
                utils.log(`Promise rejection non gestita: ${event.reason}`, 'error');
            });
        },
        exportDebugAPI: function() {
            window.shinigamiDebug = {
                state: state,
                config: config,
                utils: utils,
                playerDiscovery: playerDiscovery,
                apiIntegration: apiIntegration,
                skipActions: skipActions,
                navigation: navigation,
                playerControls: playerControls,
                dataManager: dataManager,
                uiCreation: uiCreation,
                themeManager: themeManager
            };

            utils.log('API di debug esportata in window.shinigamiDebug', 'debug');
        }
    };

    /* ===== PARTE 9 - Inizializzazione & SPA Handling ===== */

    const initialization = {
        initialize: function() {
            if (state.initialized) {
                utils.log('Già inizializzato, riuso stato esistente', 'debug');
                return;
            }

            const checkInterval = setInterval(() => {
                if (document.readyState === 'complete' || document.readyState === 'interactive') {
                    clearInterval(checkInterval);
                    this.setup();
                }
            }, 50);
        },
        setup: function() {
            utils.log('Inizializzazione ShinigamiSkip...', 'info');

            if (!playerDiscovery.initPlayer()) {
                const observer = new MutationObserver(utils.debounce(() => {
                    if (playerDiscovery.initPlayer()) {
                        observer.disconnect();
                        this.afterPlayerReady();
                    }
                }, 200));

                observer.observe(document.body, { childList: true, subtree: true });
                state.observer = observer;
            } else {
                this.afterPlayerReady();
            }
        },
        afterPlayerReady: function() {
            if (!state.player) return;

            state.initialized = true;

            apiIntegration.extractAnimeInfo();
            navigation.detectNextEpisodeUrl();

            uiCreation.createPanel();
            uiCreation.updateEpisodeInfo();

            skipActions.startPolling();
            keyboardShortcuts.init();

            playerControls.autoPlayAndFullscreen();

            utils.log('ShinigamiSkip inizializzato con successo', 'info');
        },
        cleanup: function() {
            state.initialized = false;

            skipActions.stopPolling();

            if (state.observer) {
                state.observer.disconnect();
                state.observer = null;
            }

            if (state.ui.container) {
                state.ui.container.remove();
                state.ui.container = null;
            }

            state.player = null;
            state.playerContainer = null;
        }
    };

    initialization.initialize();
    errorHandling.setupGlobalErrorHandlers();

    if (config.debugMode) {
        errorHandling.exportDebugAPI();
    }

    // Monitor SPA navigation
    let lastUrl = location.href;
    const observer = new MutationObserver(utils.throttle(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            initialization.cleanup();
            initialization.initialize();
        }
    }, 500));

    observer.observe(document, { subtree: true, childList: true });

})();
