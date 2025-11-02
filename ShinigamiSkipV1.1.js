// ==UserScript==
// @name         ShinigamiSkip Ultimate Edition
// @namespace    https://github.com/Suplic0z/-ShinigamiSkip-
// @version      3.0.0
// @description  Skip automatico intro/outro + AI learning + pattern analysis + multi-site + statistiche avanzate
// @author       Suplic0z & Community
// @match        https://www.animeworld.so/*
// @match        https://animeworld.so/*
// @match        https://www.animeworld.ac/*
// @match        https://animeworld.ac/*
// @match        https://www.animeunity.so/*
// @match        https://animeunity.so/*
// @match        https://www.animeunity.to/*
// @match        https://animeunity.to/*
// @match        https://www.animesaturn.co/*
// @match        https://animesaturn.co/*
// @match        https://www.animesaturn.in/*
// @match        https://animesaturn.in/*
// @match        https://*.gogoanime.*/*
// @match        https://*.9anime.*/*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_deleteValue
// @grant        GM_listValues
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @grant        GM_registerMenuCommand
// @grant        GM_notification
// @grant        GM_openInTab
// @grant        GM_setClipboard
// @connect      api.aniskip.com
// @connect      api.myanimelist.net
// @connect      api.jikan.moe
// @connect      graphql.anilist.co
// @run-at       document-start
// @updateURL    https://raw.githubusercontent.com/Suplic0z/ShinigamiSkip/main/shinigamiskip.user.js
// @downloadURL  https://raw.githubusercontent.com/Suplic0z/ShinigamiSkip/main/shinigamiskip.user.js
// ==/UserScript==

(function() {
    'use strict';

    // Prevenzione duplicati
    if (window.shinigamiSkipLoaded) {
        console.warn('[ShinigamiSkip] Script già caricato, prevenzione duplicati');
        return;
    }
    window.shinigamiSkipLoaded = true;

    // ===== CONFIGURAZIONE GLOBALE =====
    const CONFIG = {
        VERSION: '3.0.0',
        API: {
            ANISKIP: 'https://api.aniskip.com/v2/skip-times',
            JIKAN: 'https://api.jikan.moe/v4',
            MAL: 'https://api.myanimelist.net/v2',
            ANILIST: 'https://graphql.anilist.co'
        },
        TIMING: {
            FALLBACK_INTRO_START: 0,
            FALLBACK_INTRO_END: 90,
            FALLBACK_OUTRO_OFFSET: -90,
            COLD_OPEN_MAX: 180,
            MIN_EPISODE_DURATION: 300,
            RECAP_THRESHOLD: 60,
            PREVIEW_THRESHOLD: 30
        },
        THRESHOLDS: {
            MIN_VERIFIED_VIEWS: 3,
            MAX_FAILURES: 5,
            CONFIDENCE_HIGH: 10,
            CONFIDENCE_MEDIUM: 5,
            REWIND_DETECTION_WINDOW: 5000,
            SKIP_TOLERANCE: 10
        },
        UI: {
            POSITION: 'bottom-right',
            NOTIFICATION_DURATION: 3000,
            ANIMATION_SPEED: 300,
            THEME: 'dark',
            COMPACT_MODE: false
        },
        FEATURES: {
            AUTO_SKIP: true,
            LEARN_MODE: true,
            SHOW_NOTIFICATIONS: true,
            SHOW_COUNTDOWN: true,
            ADVANCED_DETECTION: true,
            STATISTICS: true,
            HOTKEYS: true,
            RECAP_SKIP: true,
            PREVIEW_SKIP: true,
            AUTO_NEXT_EPISODE: false,
            SMART_LEARNING: true,
            PREDICTIVE_SKIP: true
        },
        HOTKEYS: {
            SKIP_INTRO: 's',
            SKIP_OUTRO: 'e',
            TOGGLE_AUTO: 'a',
            TOGGLE_LEARN: 'l',
            OPEN_PANEL: 'k',
            NEXT_EPISODE: 'n',
            PREVIOUS_EPISODE: 'p',
            TOGGLE_FULLSCREEN: 'f'
        }
    };

    // ===== UTILITY FUNCTIONS =====
    const Utils = {
        log: (message, type = 'info') => {
            const prefix = '[ShinigamiSkip]';
            const styles = {
                info: 'color: #4a9eff; font-weight: bold;',
                success: 'color: #4caf50; font-weight: bold;',
                warning: 'color: #ff9800; font-weight: bold;',
                error: 'color: #f44336; font-weight: bold;'
            };
            console.log(`%c${prefix} ${message}`, styles[type] || styles.info);
        },

        formatTime: (seconds) => {
            if (!isFinite(seconds) || seconds < 0) return '--:--';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            return `${m}:${String(s).padStart(2, '0')}`;
        },

        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                clearTimeout(timeout);
                timeout = setTimeout(() => func.apply(this, args), wait);
            };
        },

        throttle: (func, limit) => {
            let inThrottle;
            return function(...args) {
                if (!inThrottle) {
                    func.apply(this, args);
                    inThrottle = true;
                    setTimeout(() => inThrottle = false, limit);
                }
            };
        },

        sanitizeString: (str) => {
            if (!str) return 'unknown';
            return str.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
        },

        calculateConfidence: (verifiedViews, failures) => {
            if (failures > CONFIG.THRESHOLDS.MAX_FAILURES) return 'low';
            const score = (verifiedViews || 0) - ((failures || 0) * 2);
            if (score >= CONFIG.THRESHOLDS.CONFIDENCE_HIGH) return 'high';
            if (score >= CONFIG.THRESHOLDS.CONFIDENCE_MEDIUM) return 'medium';
            return 'low';
        },

        isValidTimestamp: (start, end, duration) => {
            return typeof start === 'number' &&
                   typeof end === 'number' &&
                   start >= 0 &&
                   end > start &&
                   end <= duration &&
                   (end - start) < 200;
        },

        generateUUID: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        }
    };

    // ===== DATABASE LOCALE =====
    class SkipDatabase {
        constructor() {
            this.data = this.loadAll();
            this.stats = this.loadStats();
            this.cache = new Map();
        }

        loadAll() {
            try {
                const stored = GM_getValue('skipDatabase_v3', '{}');
                return JSON.parse(stored);
            } catch (e) {
                Utils.log('Errore caricamento database, inizializzazione...', 'warning');
                return {};
            }
        }

        loadStats() {
            try {
                const stored = GM_getValue('skipStats_v3', null);
                if (stored) return JSON.parse(stored);
            } catch (e) {
                Utils.log('Errore caricamento statistiche', 'warning');
            }

            return {
                totalSkips: 0,
                introSkips: 0,
                outroSkips: 0,
                recapSkips: 0,
                previewSkips: 0,
                learnedEpisodes: 0,
                timeSaved: 0,
                lastUpdated: Date.now(),
                sessionsCount: 1,
                firstUsed: Date.now()
            };
        }

        saveStats() {
            try {
                this.stats.lastUpdated = Date.now();
                GM_setValue('skipStats_v3', JSON.stringify(this.stats));
            } catch (e) {
                Utils.log('Errore salvataggio statistiche', 'error');
            }
        }

        save() {
            try {
                GM_setValue('skipDatabase_v3', JSON.stringify(this.data));
            } catch (e) {
                Utils.log('Errore salvataggio database', 'error');
            }
        }

        getKey(seriesKey, episode, version = 'default', quality = '1080p') {
            return `${seriesKey}_E${episode}_${version}_${quality}`;
        }

        get(seriesKey, episode, version = 'default', quality = '1080p') {
            const key = this.getKey(seriesKey, episode, version, quality);

            if (this.cache.has(key)) {
                return this.cache.get(key);
            }

            const data = this.data[key] || null;
            if (data) {
                this.cache.set(key, data);
            }
            return data;
        }

        set(seriesKey, episode, version = 'default', quality = '1080p', skipInfo) {
            const key = this.getKey(seriesKey, episode, version, quality);

            const existingData = this.data[key] || {};
            this.data[key] = {
                ...existingData,
                ...skipInfo,
                seriesKey,
                episode,
                version,
                quality,
                lastUpdated: Date.now(),
                updatedBy: 'local'
            };

            this.cache.set(key, this.data[key]);
            this.save();
        }

        updateSkipInfo(seriesKey, episode, type, start, end, version = 'default', quality = '1080p') {
            let data = this.get(seriesKey, episode, version, quality) || { skipInfo: {} };

            if (!data.skipInfo) data.skipInfo = {};

            const isNew = !data.skipInfo[type];

            data.skipInfo[type] = {
                start: start,
                end: end,
                verifiedViews: (data.skipInfo[type]?.verifiedViews || 0),
                failures: 0,
                firstLearnedAt: data.skipInfo[type]?.firstLearnedAt || Date.now(),
                lastVerified: Date.now()
            };

            if (isNew) {
                this.stats.learnedEpisodes++;
                this.saveStats();
            }

            this.set(seriesKey, episode, version, quality, data);
            Utils.log(`${type} aggiornato: ${start.toFixed(1)}s → ${end.toFixed(1)}s`, 'success');
        }

        incrementVerified(seriesKey, episode, type, version = 'default', quality = '1080p') {
            const data = this.get(seriesKey, episode, version, quality);
            if (data && data.skipInfo && data.skipInfo[type]) {
                data.skipInfo[type].verifiedViews = (data.skipInfo[type].verifiedViews || 0) + 1;
                data.skipInfo[type].lastVerified = Date.now();
                this.set(seriesKey, episode, version, quality, data);

                // Aggiorna statistiche
                this.stats.totalSkips++;
                if (type === 'intro') this.stats.introSkips++;
                else if (type === 'outro') this.stats.outroSkips++;
                else if (type === 'recap') this.stats.recapSkips++;
                else if (type === 'preview') this.stats.previewSkips++;

                const duration = data.skipInfo[type].end - data.skipInfo[type].start;
                this.stats.timeSaved += duration;
                this.saveStats();
            }
        }

        incrementFailures(seriesKey, episode, type, version = 'default', quality = '1080p') {
            const data = this.get(seriesKey, episode, version, quality);
            if (data && data.skipInfo && data.skipInfo[type]) {
                data.skipInfo[type].failures = (data.skipInfo[type].failures || 0) + 1;

                if (data.skipInfo[type].failures > CONFIG.THRESHOLDS.MAX_FAILURES) {
                    Utils.log(`Troppi errori per ${type}, richiesta riapprendimento`, 'warning');
                    data.skipInfo[type].needsRelearn = true;
                }

                this.set(seriesKey, episode, version, quality, data);
            }
        }

        getStats() {
            return {
                ...this.stats,
                timeSavedFormatted: Utils.formatTime(this.stats.timeSaved),
                averageSkipTime: this.stats.totalSkips > 0 ?
                    (this.stats.timeSaved / this.stats.totalSkips).toFixed(1) : 0,
                daysUsed: Math.floor((Date.now() - (this.stats.firstUsed || Date.now())) / (1000 * 60 * 60 * 24))
            };
        }

        exportData() {
            return {
                version: CONFIG.VERSION,
                exportDate: new Date().toISOString(),
                database: this.data,
                stats: this.stats
            };
        }

        importData(jsonData) {
            try {
                const imported = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

                if (imported.database) {
                    Object.keys(imported.database).forEach(key => {
                        if (!this.data[key] ||
                            (imported.database[key].lastUpdated || 0) > (this.data[key].lastUpdated || 0)) {
                            this.data[key] = imported.database[key];
                        }
                    });
                    this.save();
                }

                if (imported.stats) {
                    // Merge stats intelligente
                    this.stats.totalSkips += imported.stats.totalSkips || 0;
                    this.stats.introSkips += imported.stats.introSkips || 0;
                    this.stats.outroSkips += imported.stats.outroSkips || 0;
                    this.stats.timeSaved += imported.stats.timeSaved || 0;
                    this.saveStats();
                }

                return true;
            } catch (e) {
                Utils.log('Errore import dati: ' + e.message, 'error');
                return false;
            }
        }

        clearCache() {
            this.cache.clear();
        }

        getSeriesData(seriesKey) {
            return Object.entries(this.data)
                .filter(([key]) => key.startsWith(seriesKey))
                .map(([_, value]) => value);
        }
    }

    // ===== RILEVAMENTO EPISODIO =====
    class EpisodeDetector {
        static detect() {
            const hostname = window.location.hostname;

            Utils.log('Rilevamento episodio in corso...');

            if (hostname.includes('animeworld')) {
                return this.detectAnimeWorld();
            } else if (hostname.includes('animeunity')) {
                return this.detectAnimeUnity();
            } else if (hostname.includes('animesaturn')) {
                return this.detectAnimeSaturn();
            } else if (hostname.includes('gogoanime')) {
                return this.detectGogoanime();
            } else if (hostname.includes('9anime')) {
                return this.detect9anime();
            }

            return this.detectGeneric();
        }

        static detectAnimeWorld() {
            try {
                const urlMatch = window.location.pathname.match(/\/play\/([^/]+)\.([^/]+)/);
                if (!urlMatch) return null;

                const seriesSlug = urlMatch[1];
                const episodeId = urlMatch[2];

                const epMatch = episodeId.match(/(\d+)/);
                const episode = epMatch ? parseInt(epMatch[1]) : 1;

                const titleEl = document.querySelector('.anime-title, h1.title, .server-title, .film-name');
                const seriesName = titleEl ? titleEl.textContent.trim() : seriesSlug.replace(/-/g, ' ');

                return {
                    seriesKey: Utils.sanitizeString(seriesName),
                    seriesName: seriesName,
                    episode: episode,
                    version: this.detectVersion(),
                    quality: this.detectQuality(),
                    site: 'animeworld',
                    malId: this.extractMALId(),
                    anilistId: this.extractAnilistId()
                };
            } catch (e) {
                Utils.log('Errore detection AnimeWorld: ' + e.message, 'error');
                return null;
            }
        }

        static detectAnimeUnity() {
            try {
                const titleEl = document.querySelector('h1.title, .episode-title, .video-title');
                if (!titleEl) return null;

                const title = titleEl.textContent;
                const epMatch = title.match(/Episodio (\d+)/i) || title.match(/E(\d+)/i) || title.match(/Ep\.?\s*(\d+)/i);
                const episode = epMatch ? parseInt(epMatch[1]) : 1;

                const seriesEl = document.querySelector('.show-title, h4, .anime-name');
                const seriesName = seriesEl ? seriesEl.textContent.trim() : title;

                return {
                    seriesKey: Utils.sanitizeString(seriesName),
                    seriesName: seriesName,
                    episode: episode,
                    version: this.detectVersion(),
                    quality: this.detectQuality(),
                    site: 'animeunity',
                    malId: this.extractMALId(),
                    anilistId: this.extractAnilistId()
                };
            } catch (e) {
                Utils.log('Errore detection AnimeUnity: ' + e.message, 'error');
                return null;
            }
        }

        static detectAnimeSaturn() {
            try {
                const titleEl = document.querySelector('.title, h1, .anime-title');
                if (!titleEl) return null;

                const title = titleEl.textContent;
                const epMatch = title.match(/Episodio (\d+)/i) || title.match(/Ep\.?\s*(\d+)/i);
                const episode = epMatch ? parseInt(epMatch[1]) : 1;

                const seriesName = title.replace(/Episodio \d+/i, '').trim();

                return {
                    seriesKey: Utils.sanitizeString(seriesName),
                    seriesName: seriesName,
                    episode: episode,
                    version: this.detectVersion(),
                    quality: this.detectQuality(),
                    site: 'animesaturn',
                    malId: this.extractMALId(),
                    anilistId: this.extractAnilistId()
                };
            } catch (e) {
                Utils.log('Errore detection AnimeSaturn: ' + e.message, 'error');
                return null;
            }
        }

        static detectGogoanime() {
            try {
                const title = document.title;
                const epMatch = title.match(/Episode (\d+)/i) || title.match(/Ep\.?\s*(\d+)/i);
                const episode = epMatch ? parseInt(epMatch[1]) : 1;

                const seriesMatch = title.match(/^(.+?) Episode/i);
                const seriesName = seriesMatch ? seriesMatch[1].trim() : 'unknown';

                return {
                    seriesKey: Utils.sanitizeString(seriesName),
                    seriesName: seriesName,
                    episode: episode,
                    version: this.detectVersion(),
                    quality: this.detectQuality(),
                    site: 'gogoanime',
                    malId: this.extractMALId(),
                    anilistId: this.extractAnilistId()
                };
            } catch (e) {
                Utils.log('Errore detection Gogoanime: ' + e.message, 'error');
                return null;
            }
        }

        static detect9anime() {
            try {
                const titleEl = document.querySelector('.title, h2.title, .film-name');
                if (!titleEl) return null;

                const title = titleEl.textContent;
                const epMatch = title.match(/Episode (\d+)/i) || title.match(/Ep\.?\s*(\d+)/i);
                const episode = epMatch ? parseInt(epMatch[1]) : 1;

                const seriesName = title.replace(/Episode \d+/i, '').replace(/Ep\.?\s*\d+/i, '').trim();

                return {
                    seriesKey: Utils.sanitizeString(seriesName),
                    seriesName: seriesName,
                    episode: episode,
                    version: this.detectVersion(),
                    quality: this.detectQuality(),
                    site: '9anime',
                    malId: this.extractMALId(),
                    anilistId: this.extractAnilistId()
                };
            } catch (e) {
                Utils.log('Errore detection 9anime: ' + e.message, 'error');
                return null;
            }
        }

        static detectGeneric() {
            try {
                const title = document.title;
                const epMatch = title.match(/(?:Episode|Episodio|Ep\.?)\s*(\d+)/i);
                const episode = epMatch ? parseInt(epMatch[1]) : 1;

                return {
                    seriesKey: Utils.sanitizeString(title),
                    seriesName: title,
                    episode: episode,
                    version: 'default',
                    quality: '1080p',
                    site: 'generic',
                    malId: null,
                    anilistId: null
                };
            } catch (e) {
                Utils.log('Errore detection generic: ' + e.message, 'error');
                return null;
            }
        }

        static detectQuality() {
            const qualityIndicators = [
                { regex: /2160p|4K/i, value: '2160p' },
                { regex: /1440p/i, value: '1440p' },
                { regex: /1080p|FHD/i, value: '1080p' },
                { regex: /720p|HD/i, value: '720p' },
                { regex: /480p|SD/i, value: '480p' }
            ];

            try {
                const pageText = document.body.textContent + document.title;

                for (const indicator of qualityIndicators) {
                    if (indicator.regex.test(pageText)) {
                        return indicator.value;
                    }
                }

                const videoEl = document.querySelector('video');
                if (videoEl && videoEl.videoHeight) {
                    if (videoEl.videoHeight >= 1080) return '1080p';
                    if (videoEl.videoHeight >= 720) return '720p';
                    if (videoEl.videoHeight >= 480) return '480p';
                }
            } catch (e) {
                Utils.log('Errore detection quality: ' + e.message, 'warning');
            }

            return '1080p';
        }

        static detectVersion() {
            try {
                const pageText = document.body.textContent.toLowerCase();

                if (pageText.includes('dubbed') || pageText.includes('dub')) return 'dub';
                if (pageText.includes('subbed') || pageText.includes('sub')) return 'sub';
                if (pageText.includes('raw')) return 'raw';
            } catch (e) {
                Utils.log('Errore detection version: ' + e.message, 'warning');
            }

            return 'default';
        }

        static extractMALId() {
            try {
                const malLink = document.querySelector('a[href*="myanimelist.net/anime/"]');
                if (malLink) {
                    const match = malLink.href.match(/anime\/(\d+)/);
                    if (match) return parseInt(match[1]);
                }

                const metaTag = document.querySelector('meta[property="og:url"][content*="myanimelist"]');
                if (metaTag) {
                    const match = metaTag.content.match(/anime\/(\d+)/);
                    if (match) return parseInt(match[1]);
                }
            } catch (e) {
                Utils.log('Errore extraction MAL ID: ' + e.message, 'warning');
            }

            return null;
        }

        static extractAnilistId() {
            try {
                const anilistLink = document.querySelector('a[href*="anilist.co/anime/"]');
                if (anilistLink) {
                    const match = anilistLink.href.match(/anime\/(\d+)/);
                    if (match) return parseInt(match[1]);
                }
            } catch (e) {
                Utils.log('Errore extraction AniList ID: ' + e.message, 'warning');
            }

            return null;
        }
    }

    // ===== API REMOTA =====
    class RemoteAPI {
        static async fetchSkipTimes(malId, anilistId, episode) {
            if (!malId && !anilistId) return null;

            Utils.log(`Fetching dati remoti per MAL:${malId} AniList:${anilistId} EP:${episode}`);

            try {
                if (malId) {
                    const data = await this.makeRequest(
                        `${CONFIG.API.ANISKIP}/${malId}/${episode}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&types[]=preview`
                    );

                    if (data && data.results && data.results.length > 0) {
                        return this.parseAPIResponse(data);
                    }
                }

                if (anilistId) {
                    const data = await this.makeRequest(
                        `${CONFIG.API.ANISKIP}/${anilistId}/${episode}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&types[]=preview`
                    );

                    if (data && data.results && data.results.length > 0) {
                        return this.parseAPIResponse(data);
                    }
                }
            } catch (e) {
                Utils.log('Errore fetch API: ' + e.message, 'error');
            }

            return null;
        }

        static parseAPIResponse(data) {
            const skipInfo = {
                intro: null,
                outro: null,
                recap: null,
                preview: null
            };

            if (data.results && Array.isArray(data.results)) {
                data.results.forEach(item => {
                    if (!item.interval) return;

                    const skipData = {
                        start: item.interval.startTime,
                        end: item.interval.endTime,
                        verifiedViews: 1,
                        failures: 0,
                        source: 'remote',
                        episodeLength: item.episodeLength || 0
                    };

                    const type = item.skipType || item.skip_type;

                    if (type === 'op' || type === 'mixed-op') {
                        skipInfo.intro = skipData;
                    } else if (type === 'ed' || type === 'mixed-ed') {
                        skipInfo.outro = {
                            ...skipData,
                            extraAfterOutro: false
                        };
                    } else if (type === 'recap') {
                        skipInfo.recap = skipData;
                    } else if (type === 'preview') {
                        skipInfo.preview = skipData;
                    }
                });
            }

            const hasData = skipInfo.intro || skipInfo.outro || skipInfo.recap || skipInfo.preview;
            return hasData ? { skipInfo } : null;
        }

        static makeRequest(url) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'GET',
                    url: url,
                    timeout: 10000,
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                resolve(JSON.parse(response.responseText));
                            } catch (e) {
                                reject(new Error('Invalid JSON response'));
                            }
                        } else if (response.status === 404) {
                            resolve(null);
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => resolve(null), // Non bloccare su errore rete
                    ontimeout: () => resolve(null)
                });
            });
        }
    }

    // ===== ADVANCED DETECTION =====
    class AdvancedDetection {
        static analyzeSkipPattern(db, seriesKey, currentEpisode) {
            const seriesData = db.getSeriesData(seriesKey);

            if (seriesData.length < 3) return null;

            const introTimes = [];
            const outroTimes = [];

            seriesData.forEach(ep => {
                if (ep.skipInfo?.intro && ep.episode < currentEpisode) {
                    introTimes.push({
                        start: ep.skipInfo.intro.start,
                        end: ep.skipInfo.intro.end
                    });
                }
                if (ep.skipInfo?.outro && ep.episode < currentEpisode) {
                    outroTimes.push({
                        start: ep.skipInfo.outro.start,
                        end: ep.skipInfo.outro.end
                    });
                }
            });

            if (introTimes.length < 2) return null;

            return {
                avgIntroStart: this.average(introTimes.map(t => t.start)),
                avgIntroEnd: this.average(introTimes.map(t => t.end)),
                avgOutroStart: outroTimes.length > 0 ? this.average(outroTimes.map(t => t.start)) : null,
                avgOutroEnd: outroTimes.length > 0 ? this.average(outroTimes.map(t => t.end)) : null,
                consistency: this.calculateConsistency(introTimes)
            };
        }

        static average(arr) {
            if (arr.length === 0) return 0;
            return arr.reduce((a, b) => a + b, 0) / arr.length;
        }

        static calculateConsistency(timings) {
            if (timings.length < 2) return 'low';

            const starts = timings.map(t => t.start);
            const variance = this.variance(starts);

            if (variance < 5) return 'high';
            if (variance < 15) return 'medium';
            return 'low';
        }

        static variance(arr) {
            if (arr.length === 0) return 0;
            const avg = this.average(arr);
            const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
            return Math.sqrt(this.average(squareDiffs));
        }
    }

    // ===== SKIP MANAGER =====
    class SkipManager {
        constructor(videoPlayer, episodeInfo, db) {
            this.player = videoPlayer;
            this.episodeInfo = episodeInfo;
            this.db = db;
            this.skipData = null;
            this.settings = this.loadSettings();
            this.state = {
                hasSkippedIntro: false,
                hasSkippedOutro: false,
                hasSkippedRecap: false,
                hasSkippedPreview: false,
                lastSkipType: null,
                lastSkipTime: 0,
                isMonitoring: false,
                countdownTimer: null
            };
            this.advancedDetection = null;
        }

        loadSettings() {
            return {
                autoSkip: GM_getValue('autoSkipEnabled', CONFIG.FEATURES.AUTO_SKIP),
                learnMode: GM_getValue('learnMode', CONFIG.FEATURES.LEARN_MODE),
                showNotifications: GM_getValue('showNotifications', CONFIG.FEATURES.SHOW_NOTIFICATIONS),
                showCountdown: GM_getValue('showCountdown', CONFIG.FEATURES.SHOW_COUNTDOWN),
                skipRecap: GM_getValue('skipRecap', CONFIG.FEATURES.RECAP_SKIP),
                skipPreview: GM_getValue('skipPreview', CONFIG.FEATURES.PREVIEW_SKIP),
                autoNextEpisode: GM_getValue('autoNextEpisode', CONFIG.FEATURES.AUTO_NEXT_EPISODE),
                smartLearning: GM_getValue('smartLearning', CONFIG.FEATURES.SMART_LEARNING),
                predictiveSkip: GM_getValue('predictiveSkip', CONFIG.FEATURES.PREDICTIVE_SKIP),
                introFallback: GM_getValue('introFallback', CONFIG.TIMING.FALLBACK_INTRO_END),
                outroFallback: GM_getValue('outroFallback', Math.abs(CONFIG.TIMING.FALLBACK_OUTRO_OFFSET))
            };
        }

        async init() {
            Utils.log('Inizializzazione Skip Manager...');

            this.skipData = await this.loadSkipData();

            if (CONFIG.FEATURES.ADVANCED_DETECTION && this.settings.predictiveSkip) {
                this.advancedDetection = AdvancedDetection.analyzeSkipPattern(
                    this.db,
                    this.episodeInfo.seriesKey,
                    this.episodeInfo.episode
                );
            }

            this.attachListeners();
            this.state.isMonitoring = true;

            Utils.log('Skip Manager pronto!', 'success');
        }

        async loadSkipData() {
            const { seriesKey, episode, version, quality } = this.episodeInfo;

            // 1. Dati locali
            let local = this.db.get(seriesKey, episode, version, quality);

            const confidence = local ? Utils.calculateConfidence(
                local.skipInfo?.intro?.verifiedViews || 0,
                local.skipInfo?.intro?.failures || 0
            ) : null;

            if (local && confidence === 'high') {
                Utils.log('Usando dati locali ad alta confidenza', 'success');
                return local;
            }

            // 2. API remota
            if (this.episodeInfo.malId || this.episodeInfo.anilistId) {
                const remote = await RemoteAPI.fetchSkipTimes(
                    this.episodeInfo.malId,
                    this.episodeInfo.anilistId,
                    episode
                );

                if (remote) {
                    Utils.log('Dati scaricati da API remota', 'success');

                    if (local) {
                        remote.skipInfo = this.mergeSkipInfo(local.skipInfo, remote.skipInfo);
                    }

                    this.db.set(seriesKey, episode, version, quality, remote);
                    return remote;
                }
            }

            // 3. Pattern analysis
            if (this.advancedDetection && this.advancedDetection.consistency !== 'low') {
                Utils.log('Usando pattern analysis', 'info');
                const predicted = this.predictFromPattern(this.advancedDetection);
                if (predicted) return predicted;
            }

            // 4. Dati locali non verificati
            if (local) {
                Utils.log(`Usando dati locali (confidenza: ${confidence})`, 'info');
                return local;
            }

            // 5. Fallback
            Utils.log('Usando fallback generico', 'warning');
            return this.getFallbackData();
        }

        mergeSkipInfo(local, remote) {
            const merged = { ...remote };

            ['intro', 'outro', 'recap', 'preview'].forEach(type => {
                if (local[type] && remote[type]) {
                    if ((local[type].verifiedViews || 0) > (remote[type].verifiedViews || 0)) {
                        merged[type] = local[type];
                    }
                } else if (local[type]) {
                    merged[type] = local[type];
                }
            });

            return merged;
        }

        predictFromPattern(pattern) {
            if (!pattern || !pattern.avgIntroStart) return null;

            return {
                skipInfo: {
                    intro: {
                        start: Math.round(pattern.avgIntroStart),
                        end: Math.round(pattern.avgIntroEnd),
                        verifiedViews: 0,
                        failures: 0,
                        predicted: true
                    },
                    outro: pattern.avgOutroStart ? {
                        start: Math.round(pattern.avgOutroStart),
                        end: Math.round(pattern.avgOutroEnd),
                        verifiedViews: 0,
                        failures: 0,
                        predicted: true,
                        extraAfterOutro: false
                    } : null
                }
            };
        }

        getFallbackData() {
            const duration = this.player.duration || 1500;
            return {
                skipInfo: {
                    intro: {
                        start: CONFIG.TIMING.FALLBACK_INTRO_START,
                        end: this.settings.introFallback,
                        verifiedViews: 0,
                        failures: 0,
                        fallback: true
                    },
                    outro: {
                        start: Math.max(0, duration - this.settings.outroFallback),
                        end: duration,
                        verifiedViews: 0,
                        failures: 0,
                        fallback: true,
                        extraAfterOutro: false
                    }
                }
            };
        }

        attachListeners() {
            this.player.addEventListener('timeupdate',
                Utils.throttle(() => this.checkSkip(), 500)
            );
            this.player.addEventListener('seeking', () => this.onSeeking());
            this.player.addEventListener('play', () => this.onPlay());
            this.player.addEventListener('pause', () => this.onPause());
            this.player.addEventListener('ended', () => this.onEnded());
        }

        checkSkip() {
            if (!this.settings.autoSkip || !this.skipData || !this.state.isMonitoring) return;

            const current = this.player.currentTime;
            const { intro, outro, recap, preview } = this.skipData.skipInfo;

            // Skip recap
            if (this.settings.skipRecap && recap && !this.state.hasSkippedRecap &&
                current >= recap.start && current < recap.end) {
                this.skipTo(recap.end, 'recap');
                this.state.hasSkippedRecap = true;
            }

            // Skip intro
            if (intro && !this.state.hasSkippedIntro) {
                const timeToSkip = intro.start - current;

                if (timeToSkip > 0 && timeToSkip <= 5 && this.settings.showCountdown) {
                    this.showCountdown(timeToSkip, 'intro');
                }

                if (current >= intro.start && current < intro.end) {
                    this.skipTo(intro.end, 'intro');
                    this.state.hasSkippedIntro = true;
                }
            }

            // Skip outro
            if (outro && !this.state.hasSkippedOutro) {
                const timeToSkip = outro.start - current;

                if (timeToSkip > 0 && timeToSkip <= 5 && this.settings.showCountdown) {
                    this.showCountdown(timeToSkip, 'outro');
                }

                if (current >= outro.start && current < outro.end) {
                    const target = outro.extraAfterOutro ? outro.extraSceneEnd : this.player.duration;
                    this.skipTo(target, 'outro');
                    this.state.hasSkippedOutro = true;
                }
            }

            // Skip preview
            if (this.settings.skipPreview && preview && !this.state.hasSkippedPreview &&
                current >= preview.start && current < preview.end) {
                this.skipTo(preview.end, 'preview');
                this.state.hasSkippedPreview = true;
            }
        }

        skipTo(time, type) {
            Utils.log(`Skipping ${type} → ${time.toFixed(1)}s`, 'success');

            this.player.currentTime = Math.min(time, this.player.duration - 1);
            this.state.lastSkipType = type;
            this.state.lastSkipTime = Date.now();

            const { seriesKey, episode, version, quality } = this.episodeInfo;
            this.db.incrementVerified(seriesKey, episode, type, version, quality);

            if (this.settings.showNotifications) {
                const messages = {
                    intro: '⏩ Intro saltata!',
                    outro: '⏩ Outro saltato!',
                    recap: '⏩ Recap saltato!',
                    preview: '⏩ Preview saltata!'
                };
                this.showNotification(messages[type] || 'Skip effettuato!');
            }

            if (this.state.countdownTimer) {
                clearInterval(this.state.countdownTimer);
                this.state.countdownTimer = null;
                this.hideCountdown();
            }
        }

        showCountdown(seconds, type) {
            if (this.state.countdownTimer) return;

            let countdown = Math.ceil(seconds);
            const countdownEl = this.createCountdownElement(countdown, type);

            this.state.countdownTimer = setInterval(() => {
                countdown--;
                if (countdown <= 0) {
                    clearInterval(this.state.countdownTimer);
                    this.state.countdownTimer = null;
                    this.hideCountdown();
                } else {
                    this.updateCountdownElement(countdownEl, countdown);
                }
            }, 1000);
        }

        createCountdownElement(seconds, type) {
            let el = document.getElementById('shinigami-countdown');
            if (!el) {
                el = document.createElement('div');
                el.id = 'shinigami-countdown';
                document.body.appendChild(el);
            }

            const typeText = type === 'intro' ? 'Intro' :
                           type === 'outro' ? 'Outro' :
                           type === 'recap' ? 'Recap' : 'Preview';
            el.innerHTML = `
                <div class="countdown-content">
                    <div class="countdown-icon">⏩</div>
                    <div class="countdown-text">Skip ${typeText} tra</div>
                    <div class="countdown-timer">${seconds}s</div>
                </div>
            `;
            el.classList.add('show');
            return el;
        }

        updateCountdownElement(el, seconds) {
            const timer = el.querySelector('.countdown-timer');
            if (timer) timer.textContent = `${seconds}s`;
        }

        hideCountdown() {
            const el = document.getElementById('shinigami-countdown');
            if (el) {
                el.classList.remove('show');
                setTimeout(() => el.remove(), 300);
            }
        }

        onSeeking() {
            if (this.state.lastSkipType &&
                Date.now() - this.state.lastSkipTime < CONFIG.THRESHOLDS.REWIND_DETECTION_WINDOW) {

                const current = this.player.currentTime;
                const skipInfo = this.skipData.skipInfo[this.state.lastSkipType];

                if (skipInfo && current < (skipInfo.end - CONFIG.THRESHOLDS.SKIP_TOLERANCE)) {
                    Utils.log('Rilevato rewind dopo skip → possibile errore', 'warning');

                    const { seriesKey, episode, version, quality } = this.episodeInfo;
                    this.db.incrementFailures(seriesKey, episode, this.state.lastSkipType, version, quality);

                    if (this.settings.showNotifications) {
                        this.showNotification('⚠️ Skip segnalato come errato');
                    }
                }
            }
        }

        onPlay() {
            this.state.isMonitoring = true;
        }

        onPause() {
            if (this.state.countdownTimer) {
                clearInterval(this.state.countdownTimer);
                this.state.countdownTimer = null;
                this.hideCountdown();
            }
        }

        onEnded() {
            if (this.settings.autoNextEpisode) {
                this.goToNextEpisode();
            }
        }

        goToNextEpisode() {
            // Cerca pulsante next
            const nextBtn = document.querySelector('.next-episode, .btn-next, [title*="next"], [title*="Next"], [title*="Prossimo"], [title*="prossimo"]');
            if (nextBtn && nextBtn.offsetParent) {
                nextBtn.click();
                return;
            }

            // Prova con URL pattern
            const currentUrl = window.location.href;
            const episodeMatch = currentUrl.match(/episode-(\d+)|episode\/(\d+)|ep\/(\d+)|episodio-(\d+)/i);

            if (episodeMatch) {
                const currentEpisode = parseInt(episodeMatch[1] || episodeMatch[2] || episodeMatch[3] || episodeMatch[4]);
                const nextEpisode = currentEpisode + 1;
                const nextUrl = currentUrl.replace(/episode-\d+|episode\/\d+|ep\/\d+|episodio-\d+/i,
                    (match) => match.replace(/\d+/, nextEpisode));

                if (this.settings.showNotifications) {
                    this.showNotification(`Vai all'episodio ${nextEpisode}...`);
                }

                setTimeout(() => {
                    window.location.href = nextUrl;
                }, 2000);
            }
        }

        manualSkip(type) {
            const current = this.player.currentTime;
            const { seriesKey, episode, version, quality } = this.episodeInfo;

            if (type === 'intro') {
                let end = current + this.settings.introFallback;

                if (this.skipData?.skipInfo?.intro) {
                    end = this.skipData.skipInfo.intro.end;
                } else if (this.advancedDetection?.avgIntroEnd) {
                    end = this.advancedDetection.avgIntroEnd;
                }

                const start = Math.max(0, current - 5);
                this.skipTo(end, 'intro');

                if (this.settings.learnMode) {
                    this.learnSkipTime(seriesKey, episode, version, quality, 'intro', start, end);
                }

            } else if (type === 'outro') {
                const start = Math.max(0, current - 5);
                this.skipTo(this.player.duration, 'outro');

                if (this.settings.learnMode) {
                    this.learnSkipTime(seriesKey, episode, version, quality, 'outro', start, this.player.duration);
                }
            }
        }

        learnSkipTime(seriesKey, episode, version, quality, type, start, end) {
            Utils.log(`Learning ${type}: ${start.toFixed(1)}s → ${end.toFixed(1)}s`, 'success');

            if (!Utils.isValidTimestamp(start, end, this.player.duration)) {
                Utils.log('Timestamp non validi, skip learning', 'warning');
                return;
            }

            this.db.updateSkipInfo(seriesKey, episode, type, start, end, version, quality);
            this.skipData = this.db.get(seriesKey, episode, version, quality);

            if (this.settings.showNotifications) {
                this.showNotification(`✓ ${type.toUpperCase()} imparato! (${start.toFixed(1)}s - ${end.toFixed(1)}s)`);
            }
        }

        showNotification(message, duration = CONFIG.UI.NOTIFICATION_DURATION) {
            const notif = document.createElement('div');
            notif.className = 'shinigami-notification';
            notif.textContent = message;
            document.body.appendChild(notif);

            setTimeout(() => notif.classList.add('show'), 10);
            setTimeout(() => {
                notif.classList.remove('show');
                setTimeout(() => notif.remove(), CONFIG.UI.ANIMATION_SPEED);
            }, duration);
        }

        updateSettings(key, value) {
            this.settings[key] = value;
            GM_setValue(key, value);
        }

        destroy() {
            this.state.isMonitoring = false;
            if (this.state.countdownTimer) {
                clearInterval(this.state.countdownTimer);
            }
        }
    }

    // ===== UI CONTROLLER =====
    class UIController {
        constructor(skipManager) {
            this.skipManager = skipManager;
            this.isVisible = true;
            this.createUI();
            this.attachHotkeys();
        }

        createUI() {
            this.injectStyles();
            this.createMainPanel();
            this.createStatsPanel();
        }

        createMainPanel() {
            const panel = document.createElement('div');
            panel.id = 'shinigami-panel';

            const episodeInfo = this.skipManager.episodeInfo;
            const skipData = this.skipManager.skipData;
            const settings = this.skipManager.settings;

            panel.innerHTML = `
                <div class="shinigami-header" id="shinigami-drag-handle">
                    <span class="shinigami-title">⚡ ShinigamiSkip</span>
                    <div class="shinigami-actions">
                        <button id="shinigami-stats-btn" class="icon-btn" title="Statistiche">📊</button>
                        <button id="shinigami-toggle" class="icon-btn">−</button>
                    </div>
                </div>
                <div class="shinigami-content">
                    <div class="episode-info">
                        <div class="series-name">${episodeInfo.seriesName}</div>
                        <div class="episode-number">Episodio ${episodeInfo.episode}</div>
                        <div class="quality-badge">${episodeInfo.quality} • ${episodeInfo.version}</div>
                    </div>

                    <div class="shinigami-controls">
                        <button id="skip-intro-btn" class="shinigami-btn primary">
                            <span class="btn-icon">⏭️</span>
                            Skip Intro
                        </button>
                        <button id="skip-outro-btn" class="shinigami-btn primary">
                            <span class="btn-icon">⏭️</span>
                            Skip Outro
                        </button>
                    </div>

                    <div class="shinigami-toggles">
                        <label class="toggle-label">
                            <input type="checkbox" id="auto-skip-toggle" ${settings.autoSkip ? 'checked' : ''}>
                            <span class="toggle-text">Auto Skip</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="learn-mode-toggle" ${settings.learnMode ? 'checked' : ''}>
                            <span class="toggle-text">Learn Mode</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="show-notifications-toggle" ${settings.showNotifications ? 'checked' : ''}>
                            <span class="toggle-text">Notifiche</span>
                        </label>
                        <label class="toggle-label">
                            <input type="checkbox" id="show-countdown-toggle" ${settings.showCountdown ? 'checked' : ''}>
                            <span class="toggle-text">Countdown</span>
                        </label>
                    </div>

                    <div class="skip-info-panel" id="skip-info">
                        ${this.generateSkipInfo(skipData)}
                    </div>

                    <div class="shinigami-footer">
                        <span class="version">v${CONFIG.VERSION}</span>
                        <span class="hotkey-hint">Premi K per aprire/chiudere</span>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.attachUIListeners();
            this.makeDraggable(panel);
        }

        generateSkipInfo(skipData) {
            if (!skipData || !skipData.skipInfo) {
                return '<div class="no-data">⚠️ Nessun dato disponibile</div>';
            }

            const { intro, outro, recap, preview } = skipData.skipInfo;
            let html = '<div class="skip-timings">';

            if (intro) {
                const confidence = Utils.calculateConfidence(intro.verifiedViews, intro.failures);
                const badge = this.getConfidenceBadge(confidence);
                const source = intro.fallback ? '🔄 Fallback' :
                              intro.predicted ? '🔮 Predetto' :
                              intro.source === 'remote' ? '☁️ Remoto' : '💾 Locale';

                html += `
                    <div class="timing-row">
                        <div class="timing-type">
                            <span class="type-icon">▶️</span>
                            <span class="type-label">Intro</span>
                        </div>
                        <div class="timing-value">
                            ${Utils.formatTime(intro.start)} → ${Utils.formatTime(intro.end)}
                        </div>
                        <div class="timing-badges">
                            ${badge}
                            <span class="source-badge">${source}</span>
                            <span class="verify-badge">✓${intro.verifiedViews || 0}</span>
                        </div>
                    </div>
                `;
            }

            if (outro) {
                const confidence = Utils.calculateConfidence(outro.verifiedViews, outro.failures);
                const badge = this.getConfidenceBadge(confidence);
                const source = outro.fallback ? '🔄 Fallback' :
                              outro.predicted ? '🔮 Predetto' :
                              outro.source === 'remote' ? '☁️ Remoto' : '💾 Locale';

                html += `
                    <div class="timing-row">
                        <div class="timing-type">
                            <span class="type-icon">⏸️</span>
                            <span class="type-label">Outro</span>
                        </div>
                        <div class="timing-value">
                            ${Utils.formatTime(outro.start)} → ${Utils.formatTime(outro.end)}
                        </div>
                        <div class="timing-badges">
                            ${badge}
                            <span class="source-badge">${source}</span>
                            <span class="verify-badge">✓${outro.verifiedViews || 0}</span>
                        </div>
                    </div>
                `;
            }

            if (recap) {
                html += `
                    <div class="timing-row">
                        <div class="timing-type">
                            <span class="type-icon">🔄</span>
                            <span class="type-label">Recap</span>
                        </div>
                        <div class="timing-value">
                            ${Utils.formatTime(recap.start)} → ${Utils.formatTime(recap.end)}
                        </div>
                    </div>
                `;
            }

            if (preview) {
                html += `
                    <div class="timing-row">
                        <div class="timing-type">
                            <span class="type-icon">👁️</span>
                            <span class="type-label">Preview</span>
                        </div>
                        <div class="timing-value">
                            ${Utils.formatTime(preview.start)} → ${Utils.formatTime(preview.end)}
                        </div>
                    </div>
                `;
            }

            html += '</div>';
            return html;
        }

        getConfidenceBadge(confidence) {
            const badges = {
                high: '<span class="confidence-badge high">Alta</span>',
                medium: '<span class="confidence-badge medium">Media</span>',
                low: '<span class="confidence-badge low">Bassa</span>'
            };
            return badges[confidence] || badges.low;
        }

        createStatsPanel() {
            const stats = this.skipManager.db.getStats();

            const panel = document.createElement('div');
            panel.id = 'shinigami-stats-panel';
            panel.className = 'hidden';
            panel.innerHTML = `
                <div class="stats-header">
                    <h3>📊 Statistiche ShinigamiSkip</h3>
                    <button id="close-stats-btn" class="icon-btn">✕</button>
                </div>
                <div class="stats-content">
                    <div class="stat-card">
                        <div class="stat-icon">⏩</div>
                        <div class="stat-value">${stats.totalSkips}</div>
                        <div class="stat-label">Skip Totali</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">▶️</div>
                        <div class="stat-value">${stats.introSkips}</div>
                        <div class="stat-label">Intro</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏸️</div>
                        <div class="stat-value">${stats.outroSkips}</div>
                        <div class="stat-label">Outro</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🔄</div>
                        <div class="stat-value">${stats.recapSkips || 0}</div>
                        <div class="stat-label">Recap</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">👁️</div>
                        <div class="stat-value">${stats.previewSkips || 0}</div>
                        <div class="stat-label">Preview</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🎓</div>
                        <div class="stat-value">${stats.learnedEpisodes}</div>
                        <div class="stat-label">Episodi Imparati</div>
                    </div>
                    <div class="stat-card highlight">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-value">${stats.timeSavedFormatted}</div>
                        <div class="stat-label">Tempo Risparmiato</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📈</div>
                        <div class="stat-value">${stats.averageSkipTime}s</div>
                        <div class="stat-label">Media Skip</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📅</div>
                        <div class="stat-value">${stats.daysUsed}</div>
                        <div class="stat-label">Giorni di Utilizzo</div>
                    </div>
                </div>
                <div class="stats-actions">
                    <button id="export-data-btn" class="shinigami-btn secondary">
                        📥 Esporta Dati
                    </button>
                    <button id="import-data-btn" class="shinigami-btn secondary">
                        📤 Importa Dati
                    </button>
                    <button id="reset-stats-btn" class="shinigami-btn danger">
                        🗑️ Reset Statistiche
                    </button>
                </div>
            `;

            document.body.appendChild(panel);
            this.attachStatsListeners();
        }

        attachUIListeners() {
            document.getElementById('shinigami-toggle')?.addEventListener('click', () => {
                this.togglePanel();
            });

            document.getElementById('shinigami-stats-btn')?.addEventListener('click', () => {
                this.toggleStats();
            });

            document.getElementById('skip-intro-btn')?.addEventListener('click', () => {
                this.skipManager.manualSkip('intro');
            });

            document.getElementById('skip-outro-btn')?.addEventListener('click', () => {
                this.skipManager.manualSkip('outro');
            });

            document.getElementById('auto-skip-toggle')?.addEventListener('change', (e) => {
                this.skipManager.updateSettings('autoSkip', e.target.checked);
            });

            document.getElementById('learn-mode-toggle')?.addEventListener('change', (e) => {
                this.skipManager.updateSettings('learnMode', e.target.checked);
            });

            document.getElementById('show-notifications-toggle')?.addEventListener('change', (e) => {
                this.skipManager.updateSettings('showNotifications', e.target.checked);
            });

            document.getElementById('show-countdown-toggle')?.addEventListener('change', (e) => {
                this.skipManager.updateSettings('showCountdown', e.target.checked);
            });
        }

        attachStatsListeners() {
            document.getElementById('close-stats-btn')?.addEventListener('click', () => {
                this.toggleStats();
            });

            document.getElementById('export-data-btn')?.addEventListener('click', () => {
                this.exportData();
            });

            document.getElementById('import-data-btn')?.addEventListener('click', () => {
                this.importData();
            });

            document.getElementById('reset-stats-btn')?.addEventListener('click', () => {
                this.resetStats();
            });
        }

        attachHotkeys() {
            if (!CONFIG.FEATURES.HOTKEYS) return;

            document.addEventListener('keydown', (e) => {
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                const key = e.key.toLowerCase();

                if (key === CONFIG.HOTKEYS.SKIP_INTRO) {
                    e.preventDefault();
                    this.skipManager.manualSkip('intro');
                } else if (key === CONFIG.HOTKEYS.SKIP_OUTRO) {
                    e.preventDefault();
                    this.skipManager.manualSkip('outro');
                } else if (key === CONFIG.HOTKEYS.TOGGLE_AUTO) {
                    e.preventDefault();
                    const toggle = document.getElementById('auto-skip-toggle');
                    if (toggle) {
                        toggle.checked = !toggle.checked;
                        toggle.dispatchEvent(new Event('change'));
                    }
                } else if (key === CONFIG.HOTKEYS.TOGGLE_LEARN) {
                    e.preventDefault();
                    const toggle = document.getElementById('learn-mode-toggle');
                    if (toggle) {
                        toggle.checked = !toggle.checked;
                        toggle.dispatchEvent(new Event('change'));
                    }
                } else if (key === CONFIG.HOTKEYS.OPEN_PANEL) {
                    e.preventDefault();
                    this.togglePanel();
                } else if (key === CONFIG.HOTKEYS.NEXT_EPISODE) {
                    e.preventDefault();
                    this.skipManager.goToNextEpisode();
                } else if (key === CONFIG.HOTKEYS.TOGGLE_FULLSCREEN) {
                    e.preventDefault();
                    if (!document.fullscreenElement) {
                        document.documentElement.requestFullscreen();
                    } else {
                        document.exitFullscreen();
                    }
                }
            });
        }

        togglePanel() {
            const content = document.querySelector('.shinigami-content');
            const btn = document.getElementById('shinigami-toggle');

            if (content && btn) {
                content.classList.toggle('collapsed');
                btn.textContent = content.classList.contains('collapsed') ? '+' : '−';
                this.isVisible = !content.classList.contains('collapsed');
            }
        }

        toggleStats() {
            const statsPanel = document.getElementById('shinigami-stats-panel');
            if (statsPanel) {
                statsPanel.classList.toggle('hidden');

                if (!statsPanel.classList.contains('hidden')) {
                    this.updateStatsDisplay();
                }
            }
        }

        updateStatsDisplay() {
            const stats = this.skipManager.db.getStats();
            const panel = document.getElementById('shinigami-stats-panel');
            if (!panel) return;

            const statCards = panel.querySelectorAll('.stat-card');
            if (statCards[0]) statCards[0].querySelector('.stat-value').textContent = stats.totalSkips;
            if (statCards[1]) statCards[1].querySelector('.stat-value').textContent = stats.introSkips;
            if (statCards[2]) statCards[2].querySelector('.stat-value').textContent = stats.outroSkips;
            if (statCards[3]) statCards[3].querySelector('.stat-value').textContent = stats.recapSkips || 0;
            if (statCards[4]) statCards[4].querySelector('.stat-value').textContent = stats.previewSkips || 0;
            if (statCards[5]) statCards[5].querySelector('.stat-value').textContent = stats.learnedEpisodes;
            if (statCards[6]) statCards[6].querySelector('.stat-value').textContent = stats.timeSavedFormatted;
            if (statCards[7]) statCards[7].querySelector('.stat-value').textContent = stats.averageSkipTime + 's';
            if (statCards[8]) statCards[8].querySelector('.stat-value').textContent = stats.daysUsed;
        }

        makeDraggable(element) {
            const handle = element.querySelector('#shinigami-drag-handle');
            if (!handle) return;

            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            handle.style.cursor = 'move';
            handle.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                element.style.top = (element.offsetTop - pos2) + "px";
                element.style.left = (element.offsetLeft - pos1) + "px";
                element.style.bottom = 'auto';
                element.style.right = 'auto';
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }

        exportData() {
            const data = this.skipManager.db.exportData();
            const json = JSON.stringify(data, null, 2);
            const blob = new Blob([json], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `shinigamiskip-backup-${Date.now()}.json`;
            a.click();
            URL.revokeObjectURL(url);

            GM_notification({
                text: 'Dati esportati con successo!',
                title: 'ShinigamiSkip',
                timeout: 3000
            });
        }

        importData() {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = '.json';

            input.onchange = (e) => {
                const file = e.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (event) => {
                    try {
                        const imported = JSON.parse(event.target.result);
                        const success = this.skipManager.db.importData(imported);

                        if (success) {
                            GM_notification({
                                text: 'Dati importati con successo!',
                                title: 'ShinigamiSkip',
                                timeout: 3000
                            });
                            location.reload();
                        } else {
                            alert('Errore durante l\'importazione dei dati.');
                        }
                    } catch (err) {
                        alert('File JSON non valido: ' + err.message);
                    }
                };
                reader.readAsText(file);
            };

            input.click();
        }

        resetStats() {
            if (!confirm('Sei sicuro di voler resettare tutte le statistiche? Questa azione è irreversibile!')) {
                return;
            }

            this.skipManager.db.stats = {
                totalSkips: 0,
                introSkips: 0,
                outroSkips: 0,
                recapSkips: 0,
                previewSkips: 0,
                learnedEpisodes: 0,
                timeSaved: 0,
                lastUpdated: Date.now(),
                sessionsCount: 1,
                firstUsed: Date.now()
            };
            this.skipManager.db.saveStats();

            this.updateStatsDisplay();

            GM_notification({
                text: 'Statistiche resettate!',
                title: 'ShinigamiSkip',
                timeout: 3000
            });
        }

        injectStyles() {
            const style = document.createElement('style');
            style.textContent = `
                #shinigami-panel {
                    position: fixed;
                    bottom: 80px;
                    right: 20px;
                    background: linear-gradient(145deg, rgba(15, 15, 25, 0.98), rgba(25, 25, 40, 0.98));
                    border: 2px solid #ff6b6b;
                    border-radius: 16px;
                    padding: 0;
                    z-index: 999999;
                    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
                    color: white;
                    min-width: 320px;
                    max-width: 380px;
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.8), 0 0 0 1px rgba(255, 107, 107, 0.2);
                    backdrop-filter: blur(10px);
                    transition: all 0.3s ease;
                }

                #shinigami-panel:hover {
                    box-shadow: 0 25px 70px rgba(0, 0, 0, 0.9), 0 0 0 2px rgba(255, 107, 107, 0.4);
                    transform: translateY(-2px);
                }

                .shinigami-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 16px 20px;
                    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
                    border-radius: 14px 14px 0 0;
                    cursor: move;
                    user-select: none;
                }

                .shinigami-title {
                    font-weight: 700;
                    font-size: 16px;
                    color: white;
                    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
                }

                .shinigami-actions {
                    display: flex;
                    gap: 8px;
                }

                .icon-btn {
                    background: rgba(255, 255, 255, 0.2);
                    border: 1px solid rgba(255, 255, 255, 0.3);
                    color: white;
                    cursor: pointer;
                    width: 28px;
                    height: 28px;
                    border-radius: 6px;
                    font-size: 14px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    transition: all 0.2s;
                }

                .icon-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                    transform: scale(1.1);
                }

                .shinigami-content {
                    padding: 20px;
                    max-height: 600px;
                    overflow: hidden;
                    transition: max-height 0.3s ease, padding 0.3s ease;
                }

                .shinigami-content.collapsed {
                    max-height: 0;
                    padding: 0 20px;
                }

                .episode-info {
                    margin-bottom: 16px;
                    padding: 12px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 10px;
                    border-left: 3px solid #ff6b6b;
                }

                .series-name {
                    font-weight: 600;
                    font-size: 14px;
                    margin-bottom: 4px;
                    color: #fff;
                }

                .episode-number {
                    font-size: 13px;
                    color: #aaa;
                    margin-bottom: 6px;
                }

                .quality-badge {
                    display: inline-block;
                    font-size: 11px;
                    padding: 4px 8px;
                    background: rgba(255, 107, 107, 0.2);
                    border-radius: 4px;
                    color: #ff6b6b;
                }

                .shinigami-controls {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 16px;
                }

                .shinigami-btn {
                    padding: 12px 16px;
                    border: none;
                    border-radius: 10px;
                    cursor: pointer;
                    font-size: 13px;
                    font-weight: 600;
                    transition: all 0.2s;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 6px;
                }

                .shinigami-btn.primary {
                    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
                    color: white;
                    box-shadow: 0 4px 15px rgba(255, 107, 107, 0.3);
                }

                .shinigami-btn.primary:hover {
                    transform: translateY(-2px);
                    box-shadow: 0 6px 20px rgba(255, 107, 107, 0.4);
                }

                .shinigami-btn.primary:active {
                    transform: translateY(0);
                }

                .shinigami-btn.secondary {
                    background: rgba(255, 255, 255, 0.1);
                    color: white;
                    border: 1px solid rgba(255, 255, 255, 0.2);
                }

                .shinigami-btn.secondary:hover {
                    background: rgba(255, 255, 255, 0.15);
                }

                .shinigami-btn.danger {
                    background: rgba(244, 67, 54, 0.2);
                    color: #ff5252;
                    border: 1px solid rgba(244, 67, 54, 0.3);
                }

                .shinigami-btn.danger:hover {
                    background: rgba(244, 67, 54, 0.3);
                }

                .btn-icon {
                    font-size: 16px;
                }

                .shinigami-toggles {
                    display: grid;
                    grid-template-columns: 1fr 1fr;
                    gap: 10px;
                    margin-bottom: 16px;
                }

                .toggle-label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    font-size: 12px;
                    padding: 8px 10px;
                    background: rgba(255, 255, 255, 0.05);
                    border-radius: 8px;
                    cursor: pointer;
                    transition: all 0.2s;
                }

                .toggle-label:hover {
                    background: rgba(255, 255, 255, 0.08);
                }

                .toggle-label input[type="checkbox"] {
                    width: 18px;
                    height: 18px;
                    cursor: pointer;
                    accent-color: #ff6b6b;
                }

                .toggle-text {
                    color: #ddd;
                    user-select: none;
                }

                .skip-info-panel {
                    margin-bottom: 16px;
                    padding: 14px;
                    background: rgba(0, 0, 0, 0.3);
                    border-radius: 10px;
                    border: 1px solid rgba(255, 255, 255, 0.1);
                }

                .no-data {
                    text-align: center;
                    padding: 20px;
                    color: #888;
                    font-size: 13px;
                }

                .skip-timings {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                }

                .timing-row {
                    display: grid;
                    grid-template-columns: auto 1fr auto;
                    gap: 10px;
                    align-items: center;
                    padding: 10px;
                    background: rgba(255, 255, 255, 0.03);
                    border-radius: 8px;
                    transition: all 0.2s;
                }

                .timing-row:hover {
                    background: rgba(255, 255, 255, 0.06);
                }

                .timing-type {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }

                .type-icon {
                    font-size: 16px;
                }

                .type-label {
                    font-size: 12px;
                    font-weight: 600;
                    color: #fff;
                }

                .timing-value {
                    font-size: 12px;
                    font-family: 'Courier New', monospace;
                    color: #4a9eff;
                    text-align: center;
                }

                .timing-badges {
                    display: flex;
                    gap: 4px;
                    flex-wrap: wrap;
                }

                .confidence-badge, .source-badge, .verify-badge {
                    font-size: 10px;
                    padding: 3px 6px;
                    border-radius: 4px;
                    font-weight: 600;
                }

                .confidence-badge.high {
                    background: rgba(76, 175, 80, 0.3);
                    color: #4caf50;
                }

                .confidence-badge.medium {
                    background: rgba(255, 152, 0, 0.3);
                    color: #ff9800;
                }

                .confidence-badge.low {
                    background: rgba(244, 67, 54, 0.3);
                    color: #ff5252;
                }

                .source-badge {
                    background: rgba(255, 255, 255, 0.1);
                    color: #aaa;
                }

                .verify-badge {
                    background: rgba(74, 158, 255, 0.3);
                    color: #4a9eff;
                }

                .shinigami-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding-top: 12px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    font-size: 10px;
                    color: #666;
                }

                .version {
                    font-weight: 600;
                }

                .hotkey-hint {
                    font-style: italic;
                }

                .shinigami-notification {
                    position: fixed;
                    top: 20px;
                    left: 50%;
                    transform: translateX(-50%) translateY(-100px);
                    background: linear-gradient(145deg, rgba(15, 15, 25, 0.98), rgba(25, 25, 40, 0.98));
                    color: white;
                    padding: 16px 28px;
                    border-radius: 12px;
                    border: 2px solid #ff6b6b;
                    z-index: 10000000;
                    font-weight: 600;
                    font-size: 14px;
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    box-shadow: 0 10px 40px rgba(0, 0, 0, 0.8);
                    backdrop-filter: blur(10px);
                }

                .shinigami-notification.show {
                    transform: translateX(-50%) translateY(0);
                    opacity: 1;
                }

                #shinigami-countdown {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%) scale(0.8);
                    background: linear-gradient(145deg, rgba(15, 15, 25, 0.98), rgba(25, 25, 40, 0.98));
                    border: 3px solid #ff6b6b;
                    border-radius: 20px;
                    padding: 30px 40px;
                    z-index: 10000000;
                    opacity: 0;
                    transition: all 0.3s cubic-bezier(0.68, -0.55, 0.265, 1.55);
                    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.9);
                    backdrop-filter: blur(15px);
                }

                #shinigami-countdown.show {
                    transform: translate(-50%, -50%) scale(1);
                    opacity: 1;
                }

                .countdown-content {
                    display: flex;
                    flex-direction: column;
                    align-items: center;
                    gap: 12px;
                }

                .countdown-icon {
                    font-size: 48px;
                    animation: pulse 1s infinite;
                }

                .countdown-text {
                    font-size: 16px;
                    color: #ddd;
                    font-weight: 600;
                }

                .countdown-timer {
                    font-size: 36px;
                    font-weight: 700;
                    color: #ff6b6b;
                    font-family: 'Courier New', monospace;
                }

                @keyframes pulse {
                    0%, 100% { transform: scale(1); }
                    50% { transform: scale(1.1); }
                }

                #shinigami-stats-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    background: linear-gradient(145deg, rgba(15, 15, 25, 0.98), rgba(25, 25, 40, 0.98));
                    border: 2px solid #ff6b6b;
                    border-radius: 20px;
                    padding: 0;
                    z-index: 10000000;
                    min-width: 500px;
                    max-width: 600px;
                    box-shadow: 0 25px 80px rgba(0, 0, 0, 0.9);
                    backdrop-filter: blur(15px);
                    transition: all 0.3s;
                    color: white;
                }

                #shinigami-stats-panel.hidden {
                    opacity: 0;
                    pointer-events: none;
                    transform: translate(-50%, -50%) scale(0.9);
                }

                .stats-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 20px 25px;
                    background: linear-gradient(135deg, #ff6b6b, #ee5a6f);
                    border-radius: 18px 18px 0 0;
                }

                .stats-header h3 {
                    margin: 0;
                    font-size: 20px;
                    color: white;
                    font-weight: 700;
                }

                .stats-content {
                    padding: 25px;
                    display: grid;
                    grid-template-columns: repeat(3, 1fr);
                    gap: 15px;
                }

                .stat-card {
                    background: rgba(255, 255, 255, 0.05);
                    border: 1px solid rgba(255, 255, 255, 0.1);
                    border-radius: 12px;
                    padding: 20px;
                    text-align: center;
                    transition: all 0.3s;
                }

                .stat-card:hover {
                    background: rgba(255, 255, 255, 0.08);
                    transform: translateY(-5px);
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.5);
                }

                .stat-card.highlight {
                    grid-column: span 3;
                    background: linear-gradient(135deg, rgba(255, 107, 107, 0.2), rgba(238, 90, 111, 0.2));
                    border-color: rgba(255, 107, 107, 0.5);
                }

                .stat-icon {
                    font-size: 32px;
                    margin-bottom: 10px;
                }

                .stat-value {
                    font-size: 28px;
                    font-weight: 700;
                    color: #ff6b6b;
                    margin-bottom: 8px;
                }

                .stat-label {
                    font-size: 12px;
                    color: #aaa;
                    text-transform: uppercase;
                    letter-spacing: 1px;
                }

                .stats-actions {
                    padding: 20px 25px;
                    border-top: 1px solid rgba(255, 255, 255, 0.1);
                    display: flex;
                    gap: 10px;
                }

                .stats-actions .shinigami-btn {
                    flex: 1;
                }

                @media (max-width: 768px) {
                    #shinigami-panel {
                        min-width: 280px;
                        max-width: 300px;
                        bottom: 10px;
                        right: 10px;
                    }

                    #shinigami-stats-panel {
                        min-width: 90%;
                        max-width: 95%;
                    }

                    .stats-content {
                        grid-template-columns: repeat(2, 1fr);
                    }

                    .stat-card.highlight {
                        grid-column: span 2;
                    }
                }

                @keyframes slideIn {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }

                #shinigami-panel {
                    animation: slideIn 0.4s ease-out;
                }
            `;
            document.head.appendChild(style);
        }
    }

    // ===== PLAYER FINDER =====
    class PlayerFinder {
        static find() {
            Utils.log('Ricerca video player...');

            const selectors = [
                'video',
                'video.jw-video',
                'video.vjs-tech',
                'video.html5-main-video',
                '.player video',
                '#player video',
                '.video-player video'
            ];

            for (const selector of selectors) {
                const video = document.querySelector(selector);
                if (video && video.duration) {
                    Utils.log('Player trovato: ' + selector, 'success');
                    return video;
                }
            }

            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                try {
                    const iframeVideo = iframe.contentDocument?.querySelector('video');
                    if (iframeVideo && iframeVideo.duration) {
                        Utils.log('Player trovato in iframe', 'success');
                        return iframeVideo;
                    }
                } catch (e) {
                    // Cross-origin iframe
                }
            }

            return null;
        }

        static async waitForPlayer(maxRetries = 30, interval = 500) {
            return new Promise((resolve) => {
                let retries = 0;

                const check = setInterval(() => {
                    const player = this.find();

                    if (player && player.readyState >= 2) {
                        clearInterval(check);
                        resolve(player);
                    }

                    retries++;
                    if (retries >= maxRetries) {
                        clearInterval(check);
                        Utils.log('Timeout: player non trovato', 'error');
                        resolve(null);
                    }
                }, interval);
            });
        }
    }

    // ===== INIZIALIZZAZIONE =====
    async function init() {
        Utils.log('='.repeat(50));
        Utils.log(`ShinigamiSkip v${CONFIG.VERSION} - Inizializzazione...`);
        Utils.log('='.repeat(50));

        const player = await PlayerFinder.waitForPlayer();
        if (!player) {
            Utils.log('Impossibile trovare video player', 'error');
            return;
        }

        const episodeInfo = EpisodeDetector.detect();
        if (!episodeInfo) {
            Utils.log('Impossibile rilevare informazioni episodio', 'error');
            return;
        }

        Utils.log(`Serie: ${episodeInfo.seriesName}`, 'info');
        Utils.log(`Episodio: ${episodeInfo.episode}`, 'info');
        Utils.log(`Qualità: ${episodeInfo.quality}`, 'info');
        Utils.log(`Versione: ${episodeInfo.version}`, 'info');
        Utils.log(`Sito: ${episodeInfo.site}`, 'info');

        const db = new SkipDatabase();
        const skipManager = new SkipManager(player, episodeInfo, db);
        await skipManager.init();

        new UIController(skipManager);

        Utils.log('='.repeat(50));
        Utils.log('✓ ShinigamiSkip pronto!', 'success');
        Utils.log('Premi K per aprire/chiudere il pannello', 'info');
        Utils.log('='.repeat(50));

        if (skipManager.settings.showNotifications) {
            setTimeout(() => {
                const notif = document.createElement('div');
                notif.className = 'shinigami-notification';
                notif.innerHTML = '⚡ <strong>ShinigamiSkip</strong> attivo!';
                document.body.appendChild(notif);
                setTimeout(() => notif.classList.add('show'), 10);
                setTimeout(() => {
                    notif.classList.remove('show');
                    setTimeout(() => notif.remove(), 300);
                }, 3000);
            }, 1000);
        }
    }

    // ===== MENU TAMPERMONKEY =====
    GM_registerMenuCommand('📊 Statistiche', () => {
        const statsPanel = document.getElementById('shinigami-stats-panel');
        if (statsPanel) {
            statsPanel.classList.remove('hidden');
        }
    });

    GM_registerMenuCommand('⚙️ Apri Pannello', () => {
        const panel = document.getElementById('shinigami-panel');
        if (panel) {
            const content = panel.querySelector('.shinigami-content');
            if (content) {
                content.classList.remove('collapsed');
                panel.querySelector('#shinigami-toggle').textContent = '−';
            }
        }
    });

    GM_registerMenuCommand('📥 Esporta Database', () => {
        const db = new SkipDatabase();
        const data = db.exportData();
        const json = JSON.stringify(data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `shinigamiskip-backup-${Date.now()}.json`;
        a.click();
        URL.revokeObjectURL(url);

        GM_notification({
            text: 'Database esportato con successo!',
            title: 'ShinigamiSkip',
            timeout: 3000
        });
    });

    GM_registerMenuCommand('🗑️ Reset Database', () => {
        if (confirm('Sei sicuro di voler eliminare tutti i dati salvati?\n\nQuesta azione è irreversibile!')) {
            GM_listValues().forEach(key => {
                if (key.includes('skip')) {
                    GM_deleteValue(key);
                }
            });

            GM_notification({
                text: 'Database resettato! Ricarica la pagina.',
                title: 'ShinigamiSkip',
                timeout: 5000
            });

            setTimeout(() => location.reload(), 2000);
        }
    });

    GM_registerMenuCommand('ℹ️ Info & Aiuto', () => {
        const helpText = `
ShinigamiSkip v${CONFIG.VERSION}

HOTKEYS:
- S: Skip Intro manuale
- E: Skip Outro manuale
- A: Toggle Auto Skip
- L: Toggle Learn Mode
- K: Apri/Chiudi pannello
- N: Prossimo episodio
- F: Toggle Fullscreen

FUNZIONALITÀ:
✓ Skip automatico intro/outro
✓ Learning automatico dai tuoi skip
✓ Statistiche complete
✓ Supporto multi-sito
✓ Countdown prima dello skip
✓ Database locale
✓ Import/Export dati
✓ Skip recap e preview
✓ Pattern analysis
✓ API integration

SUPPORTO:
- AnimeWorld
- AnimeUnity
- AnimeSaturn
- Gogoanime
- 9anime

Creato con ❤️ per gli amanti degli anime!
        `;
        alert(helpText);
    });

    // ===== AVVIO =====
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
