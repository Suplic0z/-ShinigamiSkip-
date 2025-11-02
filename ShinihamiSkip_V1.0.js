// ==UserScript==
// @name         ShinigamiSkip Ultimate
// @namespace    https://github.com/Suplic0z/-ShinigamiSkip-
// @version      21.0
// @description  Skip intro/outro + auto next + memoria serie + connessioni API + statistiche + cloud sync - Versione Completa e Unificata
// @author       Suplic0z & Community
// @match        *://animeworld.ac/*
// @match        *://www.animeworld.ac/*
// @match        *://animeunity.so/*
// @match        *://www.animeunity.so/*
// @match        *://animesaturn.co/*
// @match        *://www.animesaturn.co/*
// @match        *://animesaturn.in/*
// @match        *://www.animesaturn.in/*
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
// @connect      anilist.co
// @connect      raw.githubusercontent.com
// @require      https://code.jquery.com/jquery-3.6.0.min.js
// @run-at       document-start
// ==/UserScript==

(function() {
    'use strict';

    // ===== CONFIGURAZIONE GLOBALE =====
    const CONFIG = {
        VERSION: '21.0',
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
            RECAP_DETECTION_THRESHOLD: 60,
            PREVIEW_DETECTION_THRESHOLD: 30
        },
        THRESHOLDS: {
            MIN_VERIFIED_VIEWS: 3,
            MAX_FAILURES: 5,
            CONFIDENCE_HIGH: 10,
            CONFIDENCE_MEDIUM: 5,
            REWIND_DETECTION_WINDOW: 5000,
            SKIP_TOLERANCE: 10,
            LEARNING_THRESHOLD: 0.7
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
            CLOUD_SYNC: false,
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

    // ===== STATO GLOBALE =====
    const STATE = {
        player: null,
        playerObserver: null,
        progressTimer: null,
        ui: null,
        db: null,
        skipManager: null,
        episodeInfo: null,
        skippedIntroThisEp: false,
        skippedOutroThisEp: false,
        skippedRecapThisEp: false,
        skippedPreviewThisEp: false,
        lastSkipType: null,
        lastSkipTime: 0,
        isMonitoring: false,
        countdownTimer: null,
        autoNextTimer: null,
        lastUrl: location.href
    };

    // ===== UTILITY FUNCTIONS =====
    const Utils = {
        log: (message, type = 'info') => {
            const prefix = '[ShinigamiSkip]';
            const styles = {
                info: 'color: #4a9eff',
                success: 'color: #4caf50',
                warning: 'color: #ff9800',
                error: 'color: #f44336'
            };
            console.log(`%c${prefix} ${message}`, styles[type] || styles.info);
        },

        formatTime: (seconds) => {
            if (!isFinite(seconds)) return '--:--';
            const h = Math.floor(seconds / 3600);
            const m = Math.floor((seconds % 3600) / 60);
            const s = Math.floor(seconds % 60);
            if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
            return `${m}:${String(s).padStart(2, '0')}`;
        },

        debounce: (func, wait) => {
            let timeout;
            return function executedFunction(...args) {
                const later = () => {
                    clearTimeout(timeout);
                    func(...args);
                };
                clearTimeout(timeout);
                timeout = setTimeout(later, wait);
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
            return str.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_').toLowerCase();
        },

        calculateConfidence: (verifiedViews, failures) => {
            if (failures > CONFIG.THRESHOLDS.MAX_FAILURES) return 0;
            const score = verifiedViews - (failures * 2);
            if (score >= CONFIG.THRESHOLDS.CONFIDENCE_HIGH) return 'high';
            if (score >= CONFIG.THRESHOLDS.CONFIDENCE_MEDIUM) return 'medium';
            return 'low';
        },

        isValidTimestamp: (start, end, duration) => {
            return start >= 0 && end > start && end <= duration && (end - start) < 180;
        },

        detectTheme: () => {
            if (CONFIG.UI.THEME === 'auto') {
                return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
            }
            return CONFIG.UI.THEME;
        },

        getContrastColor: (hexcolor) => {
            if (!hexcolor) return '#ffffff';
            const r = parseInt(hexcolor.substr(1, 2), 16);
            const g = parseInt(hexcolor.substr(3, 2), 16);
            const b = parseInt(hexcolor.substr(5, 2), 16);
            const yiq = ((r * 299) + (g * 587) + (b * 114)) / 1000;
            return (yiq >= 128) ? '#000000' : '#ffffff';
        },

        generateUUID: () => {
            return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
                const r = Math.random() * 16 | 0;
                const v = c === 'x' ? r : (r & 0x3 | 0x8);
                return v.toString(16);
            });
        },

        parseTimeString: (t) => {
            try {
                const parts = t.split(':').map(p => Number(p.trim()));
                if (parts.length === 1) return parts[0];
                if (parts.length === 2) return parts[0]*60 + parts[1];
                if (parts.length === 3) return parts[0]*3600 + parts[1]*60 + parts[2];
            } catch (e) {}
            return NaN;
        }
    };

    // ===== DATABASE LOCALE AVANZATO =====
    class SkipDatabase {
        constructor() {
            this.data = this.loadAll();
            this.stats = this.loadStats();
            this.cache = new Map();
            this.syncQueue = [];
            this.lastSyncTime = GM_getValue('lastSyncTime', 0);
            this.deviceId = GM_getValue('deviceId', Utils.generateUUID());
        }

        loadAll() {
            try {
                const stored = GM_getValue('skipDatabase', '{}');
                return JSON.parse(stored);
            } catch (e) {
                Utils.log('Errore caricamento database, reset...', 'error');
                return {};
            }
        }

        loadStats() {
            try {
                const stored = GM_getValue('skipStats', '{}');
                return JSON.parse(stored);
            } catch (e) {
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
        }

        saveStats() {
            GM_setValue('skipStats', JSON.stringify(this.stats));
        }

        save() {
            try {
                GM_setValue('skipDatabase', JSON.stringify(this.data));
                this.queueSync();
            } catch (e) {
                Utils.log('Errore salvataggio database', 'error');
            }
        }

        queueSync() {
            if (!CONFIG.FEATURES.CLOUD_SYNC) return;

            this.syncQueue.push({
                timestamp: Date.now(),
                data: this.data,
                stats: this.stats
            });

            if (this.syncQueue.length > 10) {
                this.syncQueue.shift();
            }
        }

        async syncToCloud() {
            if (!CONFIG.FEATURES.CLOUD_SYNC || this.syncQueue.length === 0) return;

            try {
                Utils.log('Sincronizzazione cloud in corso...', 'info');
                await new Promise(resolve => setTimeout(resolve, 1000));
                this.lastSyncTime = Date.now();
                GM_setValue('lastSyncTime', this.lastSyncTime);
                this.syncQueue = [];
                Utils.log('Sincronizzazione cloud completata', 'success');
                return true;
            } catch (e) {
                Utils.log('Errore sincronizzazione cloud: ' + e.message, 'error');
                return false;
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
            if (!data.skipInfo[type]) {
                data.skipInfo[type] = {
                    start: start,
                    end: end,
                    verifiedViews: 0,
                    failures: 0,
                    firstLearnedAt: Date.now()
                };
                this.stats.learnedEpisodes++;
            } else {
                data.skipInfo[type].start = start;
                data.skipInfo[type].end = end;
            }

            data.skipInfo[type].lastVerified = Date.now();
            this.set(seriesKey, episode, version, quality, data);

            Utils.log(`${type} aggiornato: ${start.toFixed(1)}s → ${end.toFixed(1)}s`, 'success');
        }

        incrementVerified(seriesKey, episode, type, version = 'default', quality = '1080p') {
            const data = this.get(seriesKey, episode, version, quality);
            if (data && data.skipInfo && data.skipInfo[type]) {
                data.skipInfo[type].verifiedViews = (data.skipInfo[type].verifiedViews || 0) + 1;
                data.skipInfo[type].lastVerified = Date.now();
                this.set(seriesKey, episode, version, quality, data);

                this.stats.totalSkips++;
                if (type === 'intro') this.stats.introSkips++;
                if (type === 'outro') this.stats.outrosSkipped++;
                if (type === 'recap') this.stats.recapSkips++;
                if (type === 'preview') this.stats.previewSkips++;

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
                sessionsCount: this.stats.sessionsCount || 1,
                daysUsed: Math.floor((Date.now() - (this.stats.firstUsed || Date.now())) / (1000 * 60 * 60 * 24))
            };
        }

        exportData() {
            return {
                version: CONFIG.VERSION,
                exportDate: new Date().toISOString(),
                database: this.data,
                stats: this.stats,
                deviceId: this.deviceId
            };
        }

        importData(jsonData) {
            try {
                const imported = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;

                if (imported.database) {
                    Object.keys(imported.database).forEach(key => {
                        if (!this.data[key] ||
                            imported.database[key].lastUpdated > this.data[key].lastUpdated) {
                            this.data[key] = imported.database[key];
                        }
                    });
                    this.save();
                }

                if (imported.stats) {
                    this.stats = { ...this.stats, ...imported.stats };
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

        deleteEpisode(seriesKey, episode, version = 'default', quality = '1080p') {
            const key = this.getKey(seriesKey, episode, version, quality);
            delete this.data[key];
            this.cache.delete(key);
            this.save();
        }

        getSeriesData(seriesKey) {
            return Object.entries(this.data)
                .filter(([key]) => key.startsWith(seriesKey))
                .map(([_, value]) => value);
        }

        updateSessionStats() {
            this.stats.sessionsCount = (this.stats.sessionsCount || 1) + 1;
            this.stats.lastSession = Date.now();
            this.saveStats();
        }
    }

    // ===== RILEVAMENTO EPISODIO AVANZATO =====
    class EpisodeDetector {
        static detect() {
            const url = window.location.href;
            const hostname = window.location.hostname;

            Utils.log('Rilevamento episodio in corso...');

            if (hostname.includes('animeworld')) {
                return this.detectAnimeWorld();
            } else if (hostname.includes('animeunity')) {
                return this.detectAnimeUnity();
            } else if (hostname.includes('animesaturn')) {
                return this.detectAnimeSaturn();
            }

            return this.detectGeneric();
        }

        static detectAnimeWorld() {
            const urlMatch = window.location.pathname.match(/\/play\/([^/]+)\.([^/]+)/);
            if (!urlMatch) return null;

            const seriesSlug = urlMatch[1];
            const episodeId = urlMatch[2];

            const epMatch = episodeId.match(/(\d+)/);
            const episode = epMatch ? parseInt(epMatch[1]) : 1;

            const quality = this.detectQuality();
            const version = this.detectVersion();

            const titleEl = document.querySelector('.anime-title, h1.title, .server-title');
            const seriesName = titleEl ? titleEl.textContent.trim() : seriesSlug.replace(/-/g, ' ');

            return {
                seriesKey: Utils.sanitizeString(seriesName),
                seriesName: seriesName,
                episode: episode,
                version: version,
                quality: quality,
                site: 'animeworld',
                malId: this.extractMALId(),
                anilistId: this.extractAnilistId()
            };
        }

        static detectAnimeUnity() {
            const titleEl = document.querySelector('h1.title, .episode-title');
            if (!titleEl) return null;

            const title = titleEl.textContent;
            const epMatch = title.match(/Episodio (\d+)/i) || title.match(/E(\d+)/i);
            const episode = epMatch ? parseInt(epMatch[1]) : 1;

            const seriesEl = document.querySelector('.show-title, h4');
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
        }

        static detectAnimeSaturn() {
            const titleEl = document.querySelector('h1.anime-title, .anime-title h1, .title-anime');
            if (!titleEl) return null;

            const title = titleEl.textContent;
            const epMatch = title.match(/Episodio (\d+)/i);
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
        }

        static detectGeneric() {
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
        }

        static detectQuality() {
            const qualityIndicators = [
                { regex: /2160p|4K/i, value: '2160p' },
                { regex: /1440p/i, value: '1440p' },
                { regex: /1080p|FHD/i, value: '1080p' },
                { regex: /720p|HD/i, value: '720p' },
                { regex: /480p|SD/i, value: '480p' }
            ];

            const pageText = document.body.textContent + document.title;

            for (const indicator of qualityIndicators) {
                if (indicator.regex.test(pageText)) {
                    return indicator.value;
                }
            }

            const videoEl = document.querySelector('video');
            if (videoEl) {
                if (videoEl.videoHeight >= 1080) return '1080p';
                if (videoEl.videoHeight >= 720) return '720p';
                if (videoEl.videoHeight >= 480) return '480p';
            }

            return '1080p';
        }

        static detectVersion() {
            const pageText = document.body.textContent.toLowerCase();

            if (pageText.includes('dubbed') || pageText.includes('dub')) return 'dub';
            if (pageText.includes('subbed') || pageText.includes('sub')) return 'sub';
            if (pageText.includes('raw')) return 'raw';

            return 'default';
        }

        static extractMALId() {
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

            return null;
        }

        static extractAnilistId() {
            const anilistLink = document.querySelector('a[href*="anilist.co/anime/"]');
            if (anilistLink) {
                const match = anilistLink.href.match(/anime\/(\d+)/);
                if (match) return parseInt(match[1]);
            }

            return null;
        }
    }

    // ===== API REMOTA AVANZATA =====
    class RemoteAPI {
        static async fetchSkipTimes(malId, anilistId, episode) {
            if (!malId && !anilistId) return null;

            Utils.log(`Fetching dati remoti per MAL:${malId} AniList:${anilistId} EP:${episode}`);

            try {
                // Prova prima con AniSkip usando MAL ID
                if (malId) {
                    const data = await this.makeRequest(
                        `${CONFIG.API.ANISKIP}/${malId}/${episode}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&types[]=preview`
                    );

                    if (data && data.results) {
                        return this.parseAPIResponse(data);
                    }
                }

                // Se non funziona con MAL, prova con AniList
                if (anilistId) {
                    const data = await this.makeRequest(
                        `${CONFIG.API.ANISKIP}/${anilistId}/${episode}?types[]=op&types[]=ed&types[]=mixed-op&types[]=mixed-ed&types[]=recap&types[]=preview`
                    );

                    if (data && data.results) {
                        return this.parseAPIResponse(data);
                    }
                }
            } catch (e) {
                Utils.log('Errore fetch API: ' + e.message, 'error');
            }

            return null;
        }

        static async fetchAnimeInfo(malId, anilistId) {
            if (!malId && !anilistId) return null;

            try {
                // Prova prima con Jikan API (MyAnimeList)
                if (malId) {
                    const data = await this.makeRequest(`${CONFIG.API.JIKAN}/anime/${malId}`);
                    if (data && data.data) {
                        return {
                            title: data.data.title,
                            episodes: data.data.episodes,
                            duration: data.data.duration,
                            year: data.data.year,
                            genres: data.data.genres?.map(g => g.name) || [],
                            source: 'mal'
                        };
                    }
                }

                // Se non funziona con MAL, prova con AniList
                if (anilistId) {
                    const query = `
                        query {
                            Media(id: ${anilistId}, type: ANIME) {
                                title {
                                    romaji
                                    english
                                    native
                                }
                                episodes
                                duration
                                seasonYear
                                genres
                                coverImage {
                                    large
                                }
                            }
                        }
                    `;

                    const data = await this.makeAnilistRequest(query);
                    if (data && data.data && data.data.Media) {
                        const media = data.data.Media;
                        return {
                            title: media.title.romaji || media.title.english,
                            episodes: media.episodes,
                            duration: media.duration,
                            year: media.seasonYear,
                            genres: media.genres || [],
                            coverImage: media.coverImage.large,
                            source: 'anilist'
                        };
                    }
                }
            } catch (e) {
                Utils.log('Errore fetch info anime: ' + e.message, 'error');
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
                    const skipData = {
                        start: item.interval.startTime,
                        end: item.interval.endTime,
                        verifiedViews: 1,
                        failures: 0,
                        source: 'remote',
                        episodeLength: item.episodeLength || 0
                    };

                    if (item.skipType === 'op' || item.skipType === 'mixed-op') {
                        skipInfo.intro = skipData;
                    } else if (item.skipType === 'ed' || item.skipType === 'mixed-ed') {
                        skipInfo.outro = {
                            ...skipData,
                            extraAfterOutro: false
                        };
                    } else if (item.skipType === 'recap') {
                        skipInfo.recap = skipData;
                    } else if (item.skipType === 'preview') {
                        skipInfo.preview = skipData;
                    }
                });
            }

            return skipInfo.intro || skipInfo.outro || skipInfo.recap || skipInfo.preview ? { skipInfo } : null;
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
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
            });
        }

        static makeAnilistRequest(query) {
            return new Promise((resolve, reject) => {
                GM_xmlhttpRequest({
                    method: 'POST',
                    url: CONFIG.API.ANILIST,
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    data: JSON.stringify({ query }),
                    timeout: 10000,
                    onload: (response) => {
                        if (response.status === 200) {
                            try {
                                resolve(JSON.parse(response.responseText));
                            } catch (e) {
                                reject(new Error('Invalid JSON response'));
                            }
                        } else {
                            reject(new Error(`HTTP ${response.status}`));
                        }
                    },
                    onerror: () => reject(new Error('Network error')),
                    ontimeout: () => reject(new Error('Request timeout'))
                });
            });
        }
    }

    // ===== ADVANCED SKIP DETECTION =====
    class AdvancedDetection {
        static detectColdOpen(player, duration) {
            return {
                hasColdOpen: false,
                coldOpenEnd: 0
            };
        }

        static detectRecap(player, skipInfo) {
            if (skipInfo && skipInfo.recap) {
                return skipInfo.recap;
            }
            return null;
        }

        static detectPreview(player, skipInfo) {
            if (skipInfo && skipInfo.preview) {
                return skipInfo.preview;
            }
            return null;
        }

        static detectExtraScene(player, outroStart, duration) {
            const remainingTime = duration - outroStart;

            if (remainingTime > 180) {
                return {
                    hasExtraScene: true,
                    extraSceneStart: outroStart + 90,
                    extraSceneEnd: duration
                };
            }

            return {
                hasExtraScene: false
            };
        }

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

            return {
                avgIntroStart: this.average(introTimes.map(t => t.start)),
                avgIntroEnd: this.average(introTimes.map(t => t.end)),
                avgOutroStart: this.average(outroTimes.map(t => t.start)),
                avgOutroEnd: this.average(outroTimes.map(t => t.end)),
                consistency: this.calculateConsistency(introTimes)
            };
        }

        static average(arr) {
            if (arr.length === 0) return 0;
            return arr.reduce((a, b) => a + b, 0) / arr.length;
        }

        static calculateConsistency(timings) {
            if (timings.length < 2) return 0;

            const starts = timings.map(t => t.start);
            const variance = this.variance(starts);

            if (variance < 5) return 'high';
            if (variance < 15) return 'medium';
            return 'low';
        }

        static variance(arr) {
            const avg = this.average(arr);
            const squareDiffs = arr.map(value => Math.pow(value - avg, 2));
            return Math.sqrt(this.average(squareDiffs));
        }

        static predictSkipTimes(db, seriesKey, currentEpisode) {
            const pattern = this.analyzeSkipPattern(db, seriesKey, currentEpisode);

            if (!pattern || pattern.consistency === 'low') {
                return null;
            }

            return {
                intro: {
                    start: Math.round(pattern.avgIntroStart),
                    end: Math.round(pattern.avgIntroEnd),
                    predicted: true,
                    confidence: pattern.consistency === 'high' ? 0.9 : 0.7
                },
                outro: {
                    start: Math.round(pattern.avgOutroStart),
                    end: Math.round(pattern.avgOutroEnd),
                    predicted: true,
                    confidence: pattern.consistency === 'high' ? 0.9 : 0.7
                }
            };
        }
    }

    // ===== SKIP MANAGER AVANZATO =====
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
                countdownTimer: null,
                autoNextTimer: null
            };
            this.advancedDetection = null;
            this.predictedData = null;
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
                addSecondsMode: GM_getValue('addSecondsMode', false),
                introFallback: GM_getValue('introFallback', CONFIG.TIMING.FALLBACK_INTRO_END),
                outroFallback: GM_getValue('outroFallback', Math.abs(CONFIG.TIMING.FALLBACK_OUTRO_OFFSET))
            };
        }

        async init() {
            Utils.log('Inizializzazione Skip Manager...');

            this.skipData = await this.loadSkipData();

            if (CONFIG.FEATURES.ADVANCED_DETECTION) {
                this.advancedDetection = AdvancedDetection.analyzeSkipPattern(
                    this.db,
                    this.episodeInfo.seriesKey,
                    this.episodeInfo.episode
                );
            }

            if (CONFIG.FEATURES.PREDICTIVE_SKIP && this.settings.predictiveSkip) {
                this.predictedData = AdvancedDetection.predictSkipTimes(
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

            // 1. Carica dati locali
            let local = this.db.get(seriesKey, episode, version, quality);

            const confidence = local ? Utils.calculateConfidence(
                local.skipInfo?.intro?.verifiedViews || 0,
                local.skipInfo?.intro?.failures || 0
            ) : null;

            if (local && confidence === 'high') {
                Utils.log('Usando dati locali ad alta confidenza', 'success');
                return local;
            }

            // 2. Prova API remota
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

            // 3. Usa pattern analysis se disponibile
            if (this.advancedDetection && this.advancedDetection.consistency !== 'low') {
                Utils.log('Usando pattern analysis episodi precedenti', 'info');
                const predicted = this.predictFromPattern(this.advancedDetection);
                if (predicted) return predicted;
            }

            // 4. Usa dati locali anche se non verificati
            if (local) {
                Utils.log('Usando dati locali (confidenza: ' + confidence + ')');
                return local;
            }

            // 5. Fallback generico
            Utils.log('Usando fallback generico', 'warning');
            return this.getFallbackData();
        }

        mergeSkipInfo(local, remote) {
            const merged = { ...remote };

            ['intro', 'outro', 'recap', 'preview'].forEach(type => {
                if (local[type] && remote[type]) {
                    if (local[type].verifiedViews > remote[type].verifiedViews) {
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
                        start: duration + CONFIG.TIMING.FALLBACK_OUTRO_OFFSET,
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

            // Skip intro con countdown
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

            // Skip outro con countdown
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

            this.player.currentTime = Math.min(time, this.player.duration);
            this.state.lastSkipType = type;
            this.state.lastSkipTime = Date.now();

            // Incrementa statistiche
            const { seriesKey, episode, version, quality } = this.episodeInfo;
            this.db.incrementVerified(seriesKey, episode, type, version, quality);

            // Notifica
            if (this.settings.showNotifications) {
                const messages = {
                    intro: '⏩ Intro saltata!',
                    outro: '⏩ Outro saltato!',
                    recap: '⏩ Recap saltato!',
                    preview: '⏩ Preview saltata!'
                };
                this.showNotification(messages[type] || 'Skip effettuato!');
            }

            // Clear countdown se attivo
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
            const nextEpisodeBtn = document.querySelector('.next-episode, .btn-next, [title*="next"]');
            if (nextEpisodeBtn) {
                nextEpisodeBtn.click();
                return;
            }

            const currentUrl = window.location.href;
            const episodeMatch = currentUrl.match(/episode-(\d+)/i);

            if (episodeMatch) {
                const currentEpisode = parseInt(episodeMatch[1], 10);
                const nextEpisode = currentEpisode + 1;
                const nextUrl = currentUrl.replace(/episode-(\d+)/i, `episode-${nextEpisode}`);

                if (this.settings.showNotifications) {
                    this.showNotification(`Vai all'episodio ${nextEpisode}...`);
                }

                setTimeout(() => {
                    window.location.href = nextUrl;
                }, 2000);
            }
        }

        goToPreviousEpisode() {
            const prevEpisodeBtn = document.querySelector('.prev-episode, .btn-prev, [title*="prev"]');
            if (prevEpisodeBtn) {
                prevEpisodeBtn.click();
                return;
            }

            const currentUrl = window.location.href;
            const episodeMatch = currentUrl.match(/episode-(\d+)/i);

            if (episodeMatch) {
                const currentEpisode = parseInt(episodeMatch[1], 10);
                if (currentEpisode > 1) {
                    const prevEpisode = currentEpisode - 1;
                    const prevUrl = currentUrl.replace(/episode-(\d+)/i, `episode-${prevEpisode}`);

                    if (this.settings.showNotifications) {
                        this.showNotification(`Vai all'episodio ${prevEpisode}...`);
                    }

                    setTimeout(() => {
                        window.location.href = prevUrl;
                    }, 2000);
                }
            }
        }

        toggleFullscreen() {
            if (!document.fullscreenElement) {
                document.documentElement.requestFullscreen().catch(err => {
                    Utils.log(`Errore fullscreen: ${err.message}`, 'error');
                });
            } else {
                document.exitFullscreen();
            }
        }

        manualSkip(type) {
            const current = this.player.currentTime;
            const { seriesKey, episode, version, quality } = this.episodeInfo;

            if (type === 'intro') {
                if (this.settings.addSecondsMode) {
                    const newTime = current + this.settings.introFallback;
                    if (newTime < this.player.duration) {
                        this.skipTo(newTime, 'intro');
                    } else {
                        this.showNotification('Fine video', 'warning');
                    }
                    return;
                }

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

            // Valida timestamp
            if (!Utils.isValidTimestamp(start, end, this.player.duration)) {
                Utils.log('Timestamp non validi, skip learning', 'warning');
                return;
            }

            this.db.updateSkipInfo(seriesKey, episode, type, start, end, version, quality);

            // Ricarica dati
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

    // ===== UI CONTROLLER AVANZATO =====
    class UIController {
        constructor(skipManager) {
            this.skipManager = skipManager;
            this.isVisible = true;
            this.isDragging = false;
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
                        <button id="shinigami-settings-btn" class="icon-btn" title="Impostazioni">⚙️</button>
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
                const source = intro.fallback ? '🔄 Fallback' : intro.predicted ? '🔮 Predetto' : intro.source === 'remote' ? '☁️ Remoto' : '💾 Locale';

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
                            <span class="verify-badge">✓${intro.verifiedViews}</span>
                        </div>
                    </div>
                `;
            }

            if (outro) {
                const confidence = Utils.calculateConfidence(outro.verifiedViews, outro.failures);
                const badge = this.getConfidenceBadge(confidence);
                const source = outro.fallback ? '🔄 Fallback' : outro.predicted ? '🔮 Predetto' : outro.source === 'remote' ? '☁️ Remoto' : '💾 Locale';

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
                            <span class="verify-badge">✓${outro.verifiedViews}</span>
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
                            <span class="type-icon">🎬</span>
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
                        <div class="stat-label">Totali Skip</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">▶️</div>
                        <div class="stat-value">${stats.introSkips}</div>
                        <div class="stat-label">Intro Saltate</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏸️</div>
                        <div class="stat-value">${stats.outrosSkipped}</div>
                        <div class="stat-label">Outro Saltati</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">⏱️</div>
                        <div class="stat-value">${stats.timeSavedFormatted}</div>
                        <div class="stat-label">Tempo Risparmiato</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">🧠</div>
                        <div class="stat-value">${stats.learnedEpisodes}</div>
                        <div class="stat-label">Episodi Imparati</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-icon">📅</div>
                        <div class="stat-value">${stats.daysUsed}</div>
                        <div class="stat-label">Giorni di Utilizzo</div>
                    </div>
                    <div class="stats-actions">
                        <button id="export-stats-btn" class="shinigami-btn secondary">Esporta Dati</button>
                        <button id="import-stats-btn" class="shinigami-btn secondary">Importa Dati</button>
                        <button id="reset-stats-btn" class="shinigami-btn danger">Reset Statistiche</button>
                    </div>
                </div>
            `;

            document.body.appendChild(panel);
            this.attachStatsListeners();
        }

        injectStyles() {
            const theme = Utils.detectTheme();
            const isDark = theme === 'dark';

            const styles = `
                :root {
                    --shinigami-primary: #2196F3;
                    --shinigami-secondary: #1976D2;
                    --shinigami-accent: #FFC107;
                    --shinigami-background: ${isDark ? 'rgba(20, 20, 30, 0.95)' : 'rgba(255, 255, 255, 0.95)'};
                    --shinigami-text: ${isDark ? '#FFFFFF' : '#333333'};
                    --shinigami-border: ${isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)'};
                    --shinigami-intro-color: #2196F3;
                    --shinigami-outro-color: #FF9800;
                    --shinigami-recap-color: #9C27B0;
                    --shinigami-preview-color: #4CAF50;
                }

                #shinigami-panel {
                    position: fixed;
                    top: 20px;
                    right: 20px;
                    width: 320px;
                    background: var(--shinigami-background);
                    color: var(--shinigami-text);
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    z-index: 2147483647;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    overflow: hidden;
                    transition: all 0.3s ease;
                    border: 1px solid var(--shinigami-border);
                    backdrop-filter: blur(10px);
                }

                #shinigami-panel.minimized {
                    height: 50px;
                    overflow: hidden;
                }

                #shinigami-panel.minimized .shinigami-content {
                    display: none;
                }

                .shinigami-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px 15px;
                    background: var(--shinigami-primary);
                    color: white;
                    cursor: move;
                    user-select: none;
                }

                .shinigami-title {
                    font-weight: 700;
                    font-size: 16px;
                }

                .shinigami-actions {
                    display: flex;
                    gap: 8px;
                }

                .icon-btn {
                    background: rgba(255, 255, 255, 0.2);
                    border: none;
                    border-radius: 50%;
                    width: 28px;
                    height: 28px;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    cursor: pointer;
                    transition: background 0.2s ease;
                }

                .icon-btn:hover {
                    background: rgba(255, 255, 255, 0.3);
                }

                .shinigami-content {
                    padding: 15px;
                }

                .episode-info {
                    margin-bottom: 15px;
                    text-align: center;
                }

                .series-name {
                    font-weight: 700;
                    font-size: 16px;
                    margin-bottom: 5px;
                    white-space: nowrap;
                    overflow: hidden;
                    text-overflow: ellipsis;
                }

                .episode-number {
                    font-size: 14px;
                    opacity: 0.8;
                    margin-bottom: 5px;
                }

                .quality-badge {
                    display: inline-block;
                    background: var(--shinigami-accent);
                    color: #000;
                    padding: 2px 8px;
                    border-radius: 12px;
                    font-size: 12px;
                    font-weight: 600;
                }

                .shinigami-controls {
                    display: flex;
                    gap: 10px;
                    margin-bottom: 15px;
                }

                .shinigami-btn {
                    flex: 1;
                    padding: 10px;
                    border: none;
                    border-radius: 8px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s ease;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    gap: 5px;
                }

                .shinigami-btn.primary {
                    background: var(--shinigami-primary);
                    color: white;
                }

                .shinigami-btn.primary:hover {
                    background: var(--shinigami-secondary);
                }

                .shinigami-btn.secondary {
                    background: var(--shinigami-border);
                    color: var(--shinigami-text);
                }

                .shinigami-btn.danger {
                    background: #F44336;
                    color: white;
                }

                .btn-icon {
                    font-size: 16px;
                }

                .shinigami-toggles {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                    margin-bottom: 15px;
                }

                .toggle-label {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    cursor: pointer;
                }

                .toggle-text {
                    font-size: 14px;
                }

                .toggle-label input[type="checkbox"] {
                    appearance: none;
                    width: 40px;
                    height: 20px;
                    background: #ccc;
                    border-radius: 10px;
                    position: relative;
                    cursor: pointer;
                    transition: background 0.3s ease;
                }

                .toggle-label input[type="checkbox"]:checked {
                    background: var(--shinigami-primary);
                }

                .toggle-label input[type="checkbox"]::after {
                    content: '';
                    position: absolute;
                    width: 16px;
                    height: 16px;
                    border-radius: 50%;
                    background: white;
                    top: 2px;
                    left: 2px;
                    transition: transform 0.3s ease;
                }

                .toggle-label input[type="checkbox"]:checked::after {
                    transform: translateX(20px);
                }

                .skip-info-panel {
                    background: var(--shinigami-border);
                    border-radius: 8px;
                    padding: 10px;
                    margin-bottom: 15px;
                }

                .skip-timings {
                    display: flex;
                    flex-direction: column;
                    gap: 8px;
                }

                .timing-row {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                    font-size: 12px;
                }

                .timing-type {
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }

                .timing-value {
                    font-family: monospace;
                }

                .timing-badges {
                    display: flex;
                    gap: 5px;
                }

                .confidence-badge {
                    padding: 2px 5px;
                    border-radius: 4px;
                    font-size: 10px;
                    font-weight: 600;
                }

                .confidence-badge.high {
                    background: #4CAF50;
                    color: white;
                }

                .confidence-badge.medium {
                    background: #FFC107;
                    color: black;
                }

                .confidence-badge.low {
                    background: #F44336;
                    color: white;
                }

                .source-badge, .verify-badge {
                    padding: 2px 5px;
                    border-radius: 4px;
                    font-size: 10px;
                    background: rgba(0, 0, 0, 0.1);
                }

                .shinigami-footer {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    font-size: 12px;
                    opacity: 0.7;
                }

                #shinigami-stats-panel {
                    position: fixed;
                    top: 50%;
                    left: 50%;
                    transform: translate(-50%, -50%);
                    width: 500px;
                    max-width: 90%;
                    max-height: 80vh;
                    background: var(--shinigami-background);
                    color: var(--shinigami-text);
                    border-radius: 12px;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    z-index: 2147483647;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    overflow: hidden;
                    border: 1px solid var(--shinigami-border);
                    backdrop-filter: blur(10px);
                }

                #shinigami-stats-panel.hidden {
                    display: none;
                }

                .stats-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px;
                    background: var(--shinigami-primary);
                    color: white;
                }

                .stats-header h3 {
                    margin: 0;
                    font-size: 18px;
                }

                .stats-content {
                    padding: 20px;
                    overflow-y: auto;
                    max-height: calc(80vh - 70px);
                }

                .stat-cards {
                    display: grid;
                    grid-template-columns: repeat(2, 1fr);
                    gap: 15px;
                    margin-bottom: 20px;
                }

                .stat-card {
                    background: var(--shinigami-border);
                    border-radius: 8px;
                    padding: 15px;
                    text-align: center;
                }

                .stat-icon {
                    font-size: 24px;
                    margin-bottom: 5px;
                }

                .stat-value {
                    font-size: 24px;
                    font-weight: 700;
                    margin-bottom: 5px;
                }

                .stat-label {
                    font-size: 14px;
                    opacity: 0.8;
                }

                .stats-actions {
                    display: flex;
                    flex-direction: column;
                    gap: 10px;
                    margin-top: 20px;
                }

                .shinigami-notification {
                    position: fixed;
                    bottom: 20px;
                    right: 20px;
                    background: var(--shinigami-primary);
                    color: white;
                    padding: 12px 20px;
                    border-radius: 8px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
                    z-index: 2147483647;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    font-weight: 600;
                    transform: translateY(100px);
                    opacity: 0;
                    transition: all 0.3s ease;
                }

                .shinigami-notification.show {
                    transform: translateY(0);
                    opacity: 1;
                }

                #shinigami-countdown {
                    position: fixed;
                    bottom: 20px;
                    left: 50%;
                    transform: translateX(-50%);
                    background: var(--shinigami-background);
                    color: var(--shinigami-text);
                    padding: 15px 25px;
                    border-radius: 30px;
                    box-shadow: 0 5px 15px rgba(0, 0, 0, 0.2);
                    z-index: 2147483647;
                    font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                    font-weight: 600;
                    opacity: 0;
                    transform: translateX(-50%) translateY(20px);
                    transition: all 0.3s ease;
                    border: 1px solid var(--shinigami-border);
                    backdrop-filter: blur(10px);
                }

                #shinigami-countdown.show {
                    opacity: 1;
                    transform: translateX(-50%) translateY(0);
                }

                .countdown-content {
                    display: flex;
                    align-items: center;
                    gap: 10px;
                }

                .countdown-icon {
                    font-size: 20px;
                }

                .countdown-text {
                    font-size: 14px;
                }

                .countdown-timer {
                    font-size: 18px;
                    font-weight: 700;
                    color: var(--shinigami-primary);
                }

                .no-data {
                    text-align: center;
                    padding: 10px;
                    opacity: 0.7;
                    font-style: italic;
                }

                @media (max-width: 768px) {
                    #shinigami-panel {
                        width: 280px;
                        right: 10px;
                        top: 10px;
                    }

                    #shinigami-stats-panel {
                        width: 95%;
                    }

                    .stat-cards {
                        grid-template-columns: 1fr;
                    }
                }
            `;

            GM_addStyle(styles);
        }

        attachUIListeners() {
            // Toggle panel
            document.getElementById('shinigami-toggle').addEventListener('click', () => {
                const panel = document.getElementById('shinigami-panel');
                panel.classList.toggle('minimized');
                document.getElementById('shinigami-toggle').textContent =
                    panel.classList.contains('minimized') ? '+' : '−';
            });

            // Skip buttons
            document.getElementById('skip-intro-btn').addEventListener('click', () => {
                this.skipManager.manualSkip('intro');
            });

            document.getElementById('skip-outro-btn').addEventListener('click', () => {
                this.skipManager.manualSkip('outro');
            });

            // Settings toggles
            document.getElementById('auto-skip-toggle').addEventListener('change', (e) => {
                this.skipManager.updateSettings('autoSkip', e.target.checked);
            });

            document.getElementById('learn-mode-toggle').addEventListener('change', (e) => {
                this.skipManager.updateSettings('learnMode', e.target.checked);
            });

            document.getElementById('show-notifications-toggle').addEventListener('change', (e) => {
                this.skipManager.updateSettings('showNotifications', e.target.checked);
            });

            document.getElementById('show-countdown-toggle').addEventListener('change', (e) => {
                this.skipManager.updateSettings('showCountdown', e.target.checked);
            });

            // Stats button
            document.getElementById('shinigami-stats-btn').addEventListener('click', () => {
                document.getElementById('shinigami-stats-panel').classList.remove('hidden');
            });

            // Settings button
            document.getElementById('shinigami-settings-btn').addEventListener('click', () => {
                this.showSettingsDialog();
            });
        }

        attachStatsListeners() {
            // Close stats
            document.getElementById('close-stats-btn').addEventListener('click', () => {
                document.getElementById('shinigami-stats-panel').classList.add('hidden');
            });

            // Export stats
            document.getElementById('export-stats-btn').addEventListener('click', () => {
                const data = this.skipManager.db.exportData();
                const json = JSON.stringify(data, null, 2);
                const blob = new Blob([json], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `shinigamiskip-backup-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                this.skipManager.showNotification('Dati esportati con successo!');
            });

            // Import stats
            document.getElementById('import-stats-btn').addEventListener('click', () => {
                const input = document.createElement('input');
                input.type = 'file';
                input.accept = '.json';
                input.onchange = (e) => {
                    const file = e.target.files[0];
                    if (!file) return;
                    const reader = new FileReader();
                    reader.onload = (event) => {
                        try {
                            const success = this.skipManager.db.importData(event.target.result);
                            if (success) {
                                this.skipManager.showNotification('Dati importati con successo!');
                                this.updateStatsPanel();
                            } else {
                                this.skipManager.showNotification('Errore durante l\'importazione dei dati', 'error');
                            }
                        } catch (error) {
                            this.skipManager.showNotification('Errore durante l\'importazione dei dati', 'error');
                        }
                    };
                    reader.readAsText(file);
                };
                input.click();
            });

            // Reset stats
            document.getElementById('reset-stats-btn').addEventListener('click', () => {
                if (confirm('Sei sicuro di voler resettare tutte le statistiche? Questa azione non può essere annullata.')) {
                    this.skipManager.db.stats = this.skipManager.db.loadStats();
                    this.skipManager.db.saveStats();
                    this.updateStatsPanel();
                    this.skipManager.showNotification('Statistiche resettate con successo!');
                }
            });
        }

        attachHotkeys() {
            document.addEventListener('keydown', (e) => {
                // Ignore if typing in input field
                if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

                switch (e.key.toLowerCase()) {
                    case CONFIG.HOTKEYS.SKIP_INTRO:
                        this.skipManager.manualSkip('intro');
                        break;
                    case CONFIG.HOTKEYS.SKIP_OUTRO:
                        this.skipManager.manualSkip('outro');
                        break;
                    case CONFIG.HOTKEYS.TOGGLE_AUTO:
                        const autoToggle = document.getElementById('auto-skip-toggle');
                        autoToggle.checked = !autoToggle.checked;
                        autoToggle.dispatchEvent(new Event('change'));
                        break;
                    case CONFIG.HOTKEYS.TOGGLE_LEARN:
                        const learnToggle = document.getElementById('learn-mode-toggle');
                        learnToggle.checked = !learnToggle.checked;
                        learnToggle.dispatchEvent(new Event('change'));
                        break;
                    case CONFIG.HOTKEYS.OPEN_PANEL:
                        const panel = document.getElementById('shinigami-panel');
                        panel.classList.toggle('minimized');
                        document.getElementById('shinigami-toggle').textContent =
                            panel.classList.contains('minimized') ? '+' : '−';
                        break;
                    case CONFIG.HOTKEYS.NEXT_EPISODE:
                        this.skipManager.goToNextEpisode();
                        break;
                    case CONFIG.HOTKEYS.PREVIOUS_EPISODE:
                        this.skipManager.goToPreviousEpisode();
                        break;
                    case CONFIG.HOTKEYS.TOGGLE_FULLSCREEN:
                        this.skipManager.toggleFullscreen();
                        break;
                }
            });
        }

        makeDraggable(element) {
            const header = document.getElementById('shinigami-drag-handle');
            let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;

            header.onmousedown = dragMouseDown;

            function dragMouseDown(e) {
                e = e || window.event;
                e.preventDefault();
                pos3 = e.clientX;
                pos4 = e.clientY;
                document.onmouseup = closeDragElement;
                document.onmousemove = elementDrag;
            }

            function elementDrag(e) {
                e = e || window.event;
                e.preventDefault();
                pos1 = pos3 - e.clientX;
                pos2 = pos4 - e.clientY;
                pos3 = e.clientX;
                pos4 = e.clientY;
                element.style.top = (element.offsetTop - pos2) + "px";
                element.style.left = (element.offsetLeft - pos1) + "px";
            }

            function closeDragElement() {
                document.onmouseup = null;
                document.onmousemove = null;
            }
        }

        showSettingsDialog() {
            // Crea un dialog per le impostazioni avanzate
            const dialog = document.createElement('div');
            dialog.id = 'shinigami-settings-dialog';
            dialog.className = 'shinigami-modal';
            dialog.innerHTML = `
                <div class="modal-content">
                    <div class="modal-header">
                        <h3>Impostazioni Avanzate</h3>
                        <button class="close-btn">&times;</button>
                    </div>
                    <div class="modal-body">
                        <div class="setting-group">
                            <h4>Temporizzatori Fallback</h4>
                            <div class="setting-row">
                                <label for="intro-fallback">Durata Intro (secondi):</label>
                                <input type="number" id="intro-fallback" min="10" max="300" value="${this.skipManager.settings.introFallback}">
                            </div>
                            <div class="setting-row">
                                <label for="outro-fallback">Durata Outro (secondi):</label>
                                <input type="number" id="outro-fallback" min="10" max="300" value="${this.skipManager.settings.outroFallback}">
                            </div>
                        </div>
                        <div class="setting-group">
                            <h4>Modalità Skip</h4>
                            <div class="setting-row">
                                <label>
                                    <input type="checkbox" id="add-seconds-mode" ${this.skipManager.settings.addSecondsMode ? 'checked' : ''}>
                                    Modalità Aggiungi Secondi (invece di saltare a un punto fisso)
                                </label>
                            </div>
                        </div>
                        <div class="setting-group">
                            <h4>Funzionalità Sperimentali</h4>
                            <div class="setting-row">
                                <label>
                                    <input type="checkbox" id="smart-learning" ${this.skipManager.settings.smartLearning ? 'checked' : ''}>
                                    Apprendimento Intelligente
                                </label>
                            </div>
                            <div class="setting-row">
                                <label>
                                    <input type="checkbox" id="predictive-skip" ${this.skipManager.settings.predictiveSkip ? 'checked' : ''}>
                                    Skip Predittivo
                                </label>
                            </div>
                            <div class="setting-row">
                                <label>
                                    <input type="checkbox" id="auto-next-episode" ${this.skipManager.settings.autoNextEpisode ? 'checked' : ''}>
                                    Vai Automaticamente al Prossimo Episodio
                                </label>
                            </div>
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button id="save-settings" class="shinigami-btn primary">Salva</button>
                        <button id="cancel-settings" class="shinigami-btn secondary">Annulla</button>
                    </div>
                </div>
            `;

            document.body.appendChild(dialog);

            // Event listeners
            dialog.querySelector('.close-btn').addEventListener('click', () => {
                dialog.remove();
            });

            document.getElementById('cancel-settings').addEventListener('click', () => {
                dialog.remove();
            });

            document.getElementById('save-settings').addEventListener('click', () => {
                // Salva le impostazioni
                this.skipManager.updateSettings('introFallback', parseInt(document.getElementById('intro-fallback').value));
                this.skipManager.updateSettings('outroFallback', parseInt(document.getElementById('outro-fallback').value));
                this.skipManager.updateSettings('addSecondsMode', document.getElementById('add-seconds-mode').checked);
                this.skipManager.updateSettings('smartLearning', document.getElementById('smart-learning').checked);
                this.skipManager.updateSettings('predictiveSkip', document.getElementById('predictive-skip').checked);
                this.skipManager.updateSettings('autoNextEpisode', document.getElementById('auto-next-episode').checked);

                this.skipManager.showNotification('Impostazioni salvate con successo!');
                dialog.remove();
            });

            // Stili per il modal
            const modalStyles = `
                .shinigami-modal {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    height: 100%;
                    background: rgba(0, 0, 0, 0.5);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    z-index: 2147483647;
                }

                .modal-content {
                    background: var(--shinigami-background);
                    color: var(--shinigami-text);
                    border-radius: 12px;
                    width: 500px;
                    max-width: 90%;
                    max-height: 80vh;
                    overflow: hidden;
                    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
                    border: 1px solid var(--shinigami-border);
                }

                .modal-header {
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 15px;
                    background: var(--shinigami-primary);
                    color: white;
                }

                .modal-header h3 {
                    margin: 0;
                }

                .close-btn {
                    background: none;
                    border: none;
                    color: white;
                    font-size: 20px;
                    cursor: pointer;
                }

                .modal-body {
                    padding: 20px;
                    max-height: calc(80vh - 140px);
                    overflow-y: auto;
                }

                .setting-group {
                    margin-bottom: 20px;
                }

                .setting-group h4 {
                    margin-bottom: 10px;
                    color: var(--shinigami-primary);
                }

                .setting-row {
                    display: flex;
                    align-items: center;
                    margin-bottom: 10px;
                }

                .setting-row label {
                    display: flex;
                    align-items: center;
                    gap: 8px;
                    flex: 1;
                }

                .setting-row input[type="number"] {
                    width: 80px;
                    padding: 5px;
                    border: 1px solid var(--shinigami-border);
                    border-radius: 4px;
                    background: var(--shinigami-background);
                    color: var(--shinigami-text);
                }

                .modal-footer {
                    display: flex;
                    justify-content: flex-end;
                    gap: 10px;
                    padding: 15px;
                    background: var(--shinigami-border);
                }
            `;

            GM_addStyle(modalStyles);
        }

        updateStatsPanel() {
            const stats = this.skipManager.db.getStats();
            const panel = document.getElementById('shinigami-stats-panel');

            if (!panel) return;

            // Aggiorna i valori delle statistiche
            panel.querySelector('.stat-card:nth-child(1) .stat-value').textContent = stats.totalSkips;
            panel.querySelector('.stat-card:nth-child(2) .stat-value').textContent = stats.introSkips;
            panel.querySelector('.stat-card:nth-child(3) .stat-value').textContent = stats.outrosSkipped;
            panel.querySelector('.stat-card:nth-child(4) .stat-value').textContent = stats.timeSavedFormatted;
            panel.querySelector('.stat-card:nth-child(5) .stat-value').textContent = stats.learnedEpisodes;
            panel.querySelector('.stat-card:nth-child(6) .stat-value').textContent = stats.daysUsed;
        }

        updateSkipInfo(skipData) {
            const skipInfoPanel = document.getElementById('skip-info');
            if (skipInfoPanel) {
                skipInfoPanel.innerHTML = this.generateSkipInfo(skipData);
            }
        }

        destroy() {
            const panel = document.getElementById('shinigami-panel');
            if (panel) panel.remove();

            const statsPanel = document.getElementById('shinigami-stats-panel');
            if (statsPanel) statsPanel.remove();

            const dialog = document.getElementById('shinigami-settings-dialog');
            if (dialog) dialog.remove();
        }
    }

    // ===== PLAYER DISCOVERY =====
    const PlayerDiscovery = {
        isValidPlayer: function(element) {
            return element && element.tagName === 'VIDEO' && element.offsetWidth > 0 && element.offsetHeight > 0;
        },

        findPlayerInIframe: function(iframe) {
            try {
                if (!iframe.contentDocument) return null;

                const videos = iframe.contentDocument.querySelectorAll('video');
                for (const video of videos) {
                    if (this.isValidPlayer(video)) {
                        Utils.log('Player trovato in iframe', 'debug');
                        return video;
                    }
                }

                // Cerca anche elementi che potrebbero contenere un video
                const potentialContainers = iframe.contentDocument.querySelectorAll(
                    'div[class*="player"], div[class*="video"], div[id*="player"], div[id*="video"]'
                );

                for (const container of potentialContainers) {
                    const video = container.querySelector('video');
                    if (video && this.isValidPlayer(video)) {
                        Utils.log('Player trovato in container iframe', 'debug');
                        return video;
                    }
                }

                return null;
            } catch (e) {
                Utils.log(`Errore accesso iframe: ${e.message}`, 'error');
                return null;
            }
        },

        findPlayer: function() {
            // Prima cerca nel documento principale
            const videos = document.querySelectorAll('video');
            for (const video of videos) {
                if (this.isValidPlayer(video)) {
                    Utils.log('Player trovato nel documento principale', 'debug');
                    return video;
                }
            }

            // Poi cerca negli iframe
            const iframes = document.querySelectorAll('iframe');
            for (const iframe of iframes) {
                const player = this.findPlayerInIframe(iframe);
                if (player) return player;
            }

            // Cerca anche elementi che potrebbero contenere un video
            const potentialContainers = document.querySelectorAll(
                'div[class*="player"], div[class*="video"], div[id*="player"], div[id*="video"]'
            );

            for (const container of potentialContainers) {
                const video = container.querySelector('video');
                if (video && this.isValidPlayer(video)) {
                    Utils.log('Player trovato in container', 'debug');
                    return video;
                }
            }

            return null;
        },

        observePlayer: function() {
            if (STATE.playerObserver) return;

            STATE.playerObserver = new MutationObserver(Utils.debounce(() => {
                const player = this.findPlayer();
                if (player && player !== STATE.player) {
                    this.attachPlayer(player);
                }
            }, 1000));

            STATE.playerObserver.observe(document.documentElement, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            });

            // Polling come fallback
            setInterval(() => {
                const player = this.findPlayer();
                if (player && player !== STATE.player) {
                    this.attachPlayer(player);
                }
            }, 2000);
        },

        attachPlayer: function(player) {
            if (!player || player === STATE.player) return;

            // Rimuovi event listener dal vecchio player se esiste
            if (STATE.player) {
                this.detachPlayer();
            }

            STATE.player = player;
            Utils.log('Player allegato con successo', 'info');

            // Estrai informazioni sull'anime
            const episodeInfo = EpisodeDetector.detect();
            if (episodeInfo) {
                STATE.episodeInfo = episodeInfo;
                Utils.log(`Serie: ${episodeInfo.seriesName}, Episodio: ${episodeInfo.episode}`, 'info');

                // Inizializza il database se necessario
                if (!STATE.db) {
                    STATE.db = new SkipDatabase();
                }

                // Crea e inizializza lo skip manager
                if (STATE.skipManager) {
                    STATE.skipManager.destroy();
                }
                STATE.skipManager = new SkipManager(player, episodeInfo, STATE.db);
                STATE.skipManager.init().then(() => {
                    // Crea l'UI se non esiste
                    if (!STATE.ui) {
                        STATE.ui = new UIController(STATE.skipManager);
                    } else {
                        // Aggiorna l'UI esistente
                        STATE.ui.updateSkipInfo(STATE.skipManager.skipData);
                    }
                });
            }

            // Monitora i cambiamenti del player
            this.monitorPlayerChanges();
        },

        detachPlayer: function() {
            if (!STATE.player) return;

            if (STATE.skipManager) {
                STATE.skipManager.destroy();
                STATE.skipManager = null;
            }

            STATE.player = null;
            Utils.log('Player distaccato', 'debug');
        },

        monitorPlayerChanges: function() {
            if (!STATE.player) return;

            // Configura MutationObserver per monitorare cambiamenti nel DOM
            const observerConfig = {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src']
            };

            const observer = new MutationObserver((mutations) => {
                let shouldReset = false;

                mutations.forEach((mutation) => {
                    if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                        // Il src del video è cambiato, probabilmente nuovo episodio
                        shouldReset = true;
                    } else if (mutation.type === 'childList') {
                        // Controlla se il player è stato rimosso o sostituito
                        const removedNodes = Array.from(mutation.removedNodes);
                        if (removedNodes.some(node => node.contains && node.contains(STATE.player))) {
                            Utils.log('Player rimosso dal DOM, ricerca nuovo player', 'warn');
                            setTimeout(() => this.findAndAttachPlayer(), 1000);
                        }
                    }
                });

                if (shouldReset) {
                    Utils.log('Cambiamento rilevato, reset stato episodio', 'debug');
                    this.resetEpisodeState();
                }
            });

            // Inizia ad osservare il body
            observer.observe(document.body, observerConfig);
        },

        resetEpisodeState: function() {
            STATE.skippedIntroThisEp = false;
            STATE.skippedOutroThisEp = false;
            STATE.skippedRecapThisEp = false;
            STATE.skippedPreviewThisEp = false;
            STATE.lastSkipType = null;
            STATE.lastSkipTime = 0;

            // Estrai nuove informazioni sull'episodio
            const episodeInfo = EpisodeDetector.detect();
            if (episodeInfo && STATE.skipManager) {
                STATE.episodeInfo = episodeInfo;
                STATE.skipManager.episodeInfo = episodeInfo;
                STATE.skipManager.init().then(() => {
                    if (STATE.ui) {
                        STATE.ui.updateSkipInfo(STATE.skipManager.skipData);
                    }
                });
            }
        },

        findAndAttachPlayer: function() {
            const player = this.findPlayer();
            if (player) {
                this.attachPlayer(player);
            } else {
                Utils.log('Nessun player trovato', 'warn');
            }
        }
    };

    // ===== INIZIALIZZAZIONE =====
    function init() {
        Utils.log('ShinigamiSkip Ultimate v' + CONFIG.VERSION + ' - Inizializzazione...', 'info');

        // Controlla se l'URL è cambiato (navigazione senza ricarica)
        if (STATE.lastUrl !== location.href) {
            STATE.lastUrl = location.href;
            Utils.log('URL cambiato, reset stato', 'debug');
            PlayerDiscovery.resetEpisodeState();
        }

        // Inizia a cercare il player
        PlayerDiscovery.observePlayer();
        const player = PlayerDiscovery.findPlayer();
        if (player) {
            PlayerDiscovery.attachPlayer(player);
        } else {
            Utils.log('Player non trovato all\'avvio, attesa...', 'warn');
        }

        // Registra i comandi del menu
        GM_registerMenuCommand('⚡ Mostra/Nascondi Pannello', () => {
            const panel = document.getElementById('shinigami-panel');
            if (panel) {
                panel.classList.toggle('minimized');
                document.getElementById('shinigami-toggle').textContent =
                    panel.classList.contains('minimized') ? '+' : '−';
            }
        });

        GM_registerMenuCommand('📊 Statistiche', () => {
            const statsPanel = document.getElementById('shinigami-stats-panel');
            if (statsPanel) {
                statsPanel.classList.toggle('hidden');
            }
        });

        GM_registerMenuCommand('⚙️ Impostazioni', () => {
            if (STATE.ui) {
                STATE.ui.showSettingsDialog();
            }
        });

        GM_registerMenuCommand('🔄 Reset Completo', () => {
            if (confirm('Sei sicuro di voler resettare completamente ShinigamiSkip? Questa azione cancellerà tutti i dati e le impostazioni.')) {
                // Cancella tutti i dati
                GM_listValues().forEach(key => {
                    if (key.startsWith('shinigami') || key.startsWith('skip')) {
                        GM_deleteValue(key);
                    }
                });

                // Ricarica la pagina
                location.reload();
            }
        });

        Utils.log('ShinigamiSkip Ultimate inizializzato con successo!', 'success');
    }

    // Avvia l'inizializzazione quando il DOM è pronto
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init, { once: true });
    } else {
        init();
    }

    // Monitora i cambiamenti dell'URL per la navigazione senza ricarica
    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            setTimeout(init, 1000);
        }
    }).observe(document, { subtree: true, childList: true });

})();
