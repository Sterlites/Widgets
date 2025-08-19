class YouTubeChannelMonitor {
  constructor() {
    this.config = {
      FOLDER_NAME: 'Vid', CHECK_INTERVAL: 15, MAX_RETRIES: 2, REQUEST_TIMEOUT: 30000,
      MAX_CONCURRENT: 2, NOTIFICATION_TIMEOUT: 5000, MAX_CACHE_SIZE: 100
    };
    this.state = { activeRequests: 0, lastRequestTime: 0, stats: { totalChecks: 0, successfulChecks: 0, failedChecks: 0 }, isInitialized: false };
    this.init();
  }

  async init() {
    try {
      const { checkInterval = this.config.CHECK_INTERVAL } = await this.getStorage(['checkInterval']);
      await chrome.alarms.clear('checkChannels');
      await chrome.alarms.create('checkChannels', { periodInMinutes: checkInterval });
      this.setupListeners();
      setTimeout(() => this.checkAllChannels(false), 5000);
      this.state.isInitialized = true;
      await this.updateBadge('', '#22c55e');
    } catch (error) {
      await this.updateBadge('!', '#ef4444');
      await this.setStorage({ lastError: error.message, lastErrorTime: Date.now() });
    }
  }

  setupListeners() {
    chrome.alarms.onAlarm.addListener(alarm => alarm.name === 'checkChannels' && this.checkAllChannels(false));
    chrome.storage.onChanged.addListener(async changes => {
      if (changes.checkInterval) {
        const newInterval = changes.checkInterval.newValue;
        await chrome.alarms.clear('checkChannels');
        await chrome.alarms.create('checkChannels', { periodInMinutes: newInterval });
      }
    });
    chrome.commands.onCommand.addListener(command => command === 'check-now' && this.checkAllChannels(true));
    chrome.runtime.onStartup.addListener(() => this.updateStatus());
  }

  getStorage(keys) { return new Promise(resolve => chrome.storage.local.get(keys, result => resolve(result))); }
  setStorage(data) { return new Promise(resolve => chrome.storage.local.set(data, () => resolve())); }

  async findVidFolder() {
    return new Promise(resolve => {
      chrome.bookmarks.search({ title: this.config.FOLDER_NAME }, results => {
        resolve(results.find(item => !item.url));
      });
    });
  }

  async getChannelBookmarks() {
    try {
      const folder = await this.findVidFolder();
      if (!folder) return [];
      return new Promise(resolve => {
        chrome.bookmarks.getChildren(folder.id, children => {
          resolve(children.filter(b => b.url && b.url.includes('youtube.com') && (b.url.includes('/videos') || b.url.includes('/channel/') || b.url.includes('/@'))));
        });
      });
    } catch { return []; }
  }

  async fetchChannelVideos(channelUrl, retryCount = 0) {
    try {
      if (this.state.activeRequests >= this.config.MAX_CONCURRENT) await new Promise(r => setTimeout(r, 1000));
      this.state.activeRequests++;
      let videoUrl = channelUrl;
      if (!videoUrl.includes('/videos') && !videoUrl.includes('/streams')) {
        if (videoUrl.includes('/@') || videoUrl.includes('/channel/')) videoUrl = videoUrl.replace(/\/$/, '') + '/videos';
      }
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);
      const response = await fetch(videoUrl, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36' },
        signal: controller.signal
      });
      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const html = await response.text();
      return this.parseVideosFromHTML(html);
    } catch (error) {
      if (retryCount < this.config.MAX_RETRIES && !error.message.includes('aborted')) {
        await new Promise(r => setTimeout(r, 1000 * 2 ** retryCount));
        return this.fetchChannelVideos(channelUrl, retryCount + 1);
      }
      return null;
    } finally { this.state.activeRequests--; }
  }

  parseVideosFromHTML(html) {
    try {
      let data = null;
      for (const pattern of [/var ytInitialData = ({.*?});/s, /window\["ytInitialData"\] = ({.*?});/s, /ytInitialData":\s*({.*?}),\s*"ytInitialPlayerResponse"/s]) {
        const match = html.match(pattern);
        if (match) try { data = JSON.parse(match[1]); break; } catch { continue; }
      }
      if (!data) return [];
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
      if (!tabs.length) return [];
      let videosTab = tabs.find(tab => tab?.tabRenderer?.content?.richGridRenderer?.contents || tab?.tabRenderer?.content?.sectionListRenderer);
      if (!videosTab) return [];
      let contents = [];
      const tabContent = videosTab.tabRenderer.content;
      if (tabContent.richGridRenderer?.contents) contents = tabContent.richGridRenderer.contents;
      else if (tabContent.sectionListRenderer?.contents) {
        for (const section of tabContent.sectionListRenderer.contents) {
          if (section.itemSectionRenderer?.contents) contents.push(...section.itemSectionRenderer.contents);
        }
      }
      return contents.map(item => this.parseVideoRenderer(item?.richItemRenderer?.content?.videoRenderer || item?.videoRenderer)).filter(Boolean)
        .sort((a, b) => b.publishedTimestamp - a.publishedTimestamp).slice(0, 50);
    } catch { return []; }
  }

  parseVideoRenderer(vr) {
    try {
      if (!vr?.videoId) return null;
      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || 'Untitled';
      const publishedText = vr.publishedTimeText?.simpleText || vr.publishedTimeText?.runs?.[0]?.text;
      const thumbnails = vr.thumbnail?.thumbnails || [];
      return {
        id: vr.videoId, title: title.trim(), url: `https://www.youtube.com/watch?v=${vr.videoId}`,
        published: publishedText || 'Recently', publishedTimestamp: this.parsePublishedTime(publishedText),
        discoveredAt: Date.now(), thumbnail: thumbnails[thumbnails.length - 1]?.url || '',
        views: vr.viewCountText?.simpleText || vr.shortViewCountText?.simpleText || ''
      };
    } catch { return null; }
  }

  parsePublishedTime(text) {
    if (!text) return Date.now() - 864e5;
    const now = Date.now();
    const match = text.toLowerCase().trim().match(/(?:streamed|premiered)?\s*(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
    if (match) {
      const [, amount, unit] = match;
      const multipliers = { second: 1e3, minute: 6e4, hour: 36e5, day: 864e5, week: 6048e5, month: 2592e6, year: 31536e6 };
      return now - parseInt(amount) * (multipliers[unit] || 864e5);
    }
    return now - 864e5;
  }

  async getStoredVideos(channelUrl) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    try { const result = await this.getStorage([key]); return result[key] || []; } catch { return []; }
  }

  async storeVideos(channelUrl, videos) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    try { await this.setStorage({ [key]: videos.slice(0, this.config.MAX_CACHE_SIZE) }); } catch {}
  }

  hashUrl(url) { let h = 0; for (let i = 0; i < url.length; i++) h = ((h << 5) - h) + url.charCodeAt(i), h &= h; return Math.abs(h).toString(); }

  async getTimeFilter() { try { const r = await this.getStorage(['timeFilter']); return r.timeFilter || '1day'; } catch { return '1day'; } }

  async getTimeFilterTimestamp(filter) {
    const now = Date.now();
    if (filter === 'sincelastvisit' || filter === 'lastcheck') {
      try { const r = await this.getStorage(['lastManualCheck']); return r.lastManualCheck || (now - 864e5); } catch { return now - 864e5; }
    }
    const map = { '1hour': 36e5,'6hour': 216e5,'12hour': 432e5, '1day': 864e5, '1week': 6048e5, '1month': 2592e6, '1year': 31536e6 };
    return now - (map[filter] || map['1day']);
  }

  async updateBadge(text, color = '#ef4444') {
    try { await chrome.action.setBadgeText({ text: text.toString() }); await chrome.action.setBadgeBackgroundColor({ color }); } catch {}
  }

  async showNotification(title, message, channelResults) {
    try {
      const settings = await this.getStorage(['notifications']);
      if (!settings.notifications) return;
      const totalNew = channelResults.reduce((sum, ch) => sum + (ch.newVideos?.length || 0), 0);
      const channelsWithNew = channelResults.filter(ch => ch.newVideos?.length > 0);
      let notificationMessage = message;
      if (channelsWithNew.length > 0) {
        notificationMessage = `${channelsWithNew[0].newVideos[0].title} - ${channelsWithNew[0].channelTitle}`;
        if (totalNew > 1) notificationMessage += ` (+${totalNew - 1} more)`;
      }
      const notifId = await chrome.notifications.create({ type: 'basic', iconUrl: 'icons/icon48.png', title, message: notificationMessage });
      setTimeout(() => chrome.notifications.clear(notifId), this.config.NOTIFICATION_TIMEOUT);
    } catch {}
  }

  async getWatchedVideos() { try { const r = await this.getStorage(['watchedVideos']); return r.watchedVideos || {}; } catch { return {}; } }
  async markVideoWatched(videoId) { try { const w = await this.getWatchedVideos(); w[videoId] = Date.now(); await this.setStorage({ watchedVideos: w }); return { success: true }; } catch (e) { throw e; } }
  async clearWatchedVideos() { try { await this.setStorage({ watchedVideos: {} }); return { success: true }; } catch (e) { throw e; } }

  async checkAllChannels(isManualCheck = false) {
    const startTime = Date.now();
    try {
      await this.updateBadge('...', '#f59e0b');
      this.state.stats.totalChecks++;
      if (isManualCheck) await this.clearWatchedVideos();
      const bookmarks = await this.getChannelBookmarks();
      if (!bookmarks.length) { await this.storeChannelResults([]); await this.updateBadge(''); return; }
      const timeFilter = await this.getTimeFilter();
      const filterTimestamp = await this.getTimeFilterTimestamp(timeFilter);
      const watchedVideos = await this.getWatchedVideos();
      let totalNewVideos = 0, successfulChannels = 0;
      const channelResults = await Promise.all(bookmarks.map(async bookmark => {
        try {
          const result = await this.processChannel(bookmark, filterTimestamp, watchedVideos, isManualCheck);
          if (result) { totalNewVideos += result.newVideos?.length || 0; successfulChannels++; }
          return result;
        } catch (error) {
          return { channelTitle: bookmark.title, channelUrl: bookmark.url, error: error.message, newVideos: [], filteredVideos: [], totalVideos: [] };
        }
      }));
      await this.storeChannelResults(channelResults.filter(Boolean), timeFilter);
      if (totalNewVideos > 0) {
        await this.updateBadge(totalNewVideos > 99 ? '99+' : totalNewVideos.toString(), '#22c55e');
        if (isManualCheck || totalNewVideos >= 3) await this.showNotification('New Videos Found!', `Found ${totalNewVideos} new videos`, channelResults.filter(ch => ch.newVideos?.length > 0));
      } else { await this.updateBadge(''); }
      const duration = Date.now() - startTime;
      await this.setStorage({ lastCheck: Date.now(), lastCheckSuccess: true, lastCheckDuration: duration, channelsChecked: bookmarks.length, successfulChannels });
      if (isManualCheck) await this.setStorage({ lastManualCheck: Date.now() });
      this.state.stats.successfulChecks++;
    } catch (error) {
      await this.updateBadge('!', '#ef4444');
      await this.setStorage({ lastCheck: Date.now(), lastCheckSuccess: false, lastError: error.message, lastErrorTime: Date.now() });
      this.state.stats.failedChecks++;
    }
  }

  async processChannel(bookmark, filterTimestamp, watchedVideos = {}, isManualCheck = false) {
    const currentVideos = await this.fetchChannelVideos(bookmark.url);
    if (!currentVideos) throw new Error('Failed to fetch videos');
    const storedVideos = await this.getStoredVideos(bookmark.url);
    const storedIds = new Set(storedVideos.map(v => v.id));
    let newVideos = currentVideos.filter(video => !storedIds.has(video.id));
    let filteredVideos = currentVideos.filter(video => video.publishedTimestamp >= filterTimestamp);
    if (!isManualCheck) {
      newVideos = newVideos.filter(video => !watchedVideos[video.id]);
      filteredVideos = filteredVideos.filter(video => !watchedVideos[video.id]);
    }
    if (newVideos.length > 0) await this.storeVideos(bookmark.url, currentVideos);
    return { channelTitle: bookmark.title, channelUrl: bookmark.url, newVideos, filteredVideos, totalVideos: currentVideos, lastChecked: Date.now(), videoCount: currentVideos.length };
  }

  async storeChannelResults(results, timeFilter) { try { await this.setStorage({ channelResults: results, lastTimeFilter: timeFilter, lastResultsUpdate: Date.now() }); } catch {} }
  async updateStatus() { try { await this.getStorage(['lastCheck', 'lastCheckSuccess', 'lastError']); } catch {} }

  async getWatchLaterVideos() { try { const r = await this.getStorage(['watchLaterVideos']); return r.watchLaterVideos || []; } catch { return []; } }

  async addToWatchLater(video) {
    try {
      if (!video?.id || !video.url) throw new Error('Invalid video object');
      const existing = await this.getWatchLaterVideos();
      if (existing.find(v => v.id === video.id)) return { success: true, alreadyExists: true };
      const item = { id: video.id, title: video.title || 'Untitled', url: video.url, channelTitle: video.channelTitle || 'Unknown', published: video.published || 'Unknown', addedAt: Date.now(), thumbnail: video.thumbnail || '' };
      existing.unshift(item);
      if (existing.length > 1000) existing.length = 1000;
      await this.setStorage({ watchLaterVideos: existing });
      return { success: true, item };
    } catch (e) { throw e; }
  }

  async removeFromWatchLater(videoId) {
    try {
      if (!videoId) throw new Error('Missing videoId');
      const existing = await this.getWatchLaterVideos();
      const filtered = existing.filter(v => v.id !== videoId);
      if (filtered.length === existing.length) return { success: true, notFound: true };
      await this.setStorage({ watchLaterVideos: filtered });
      return { success: true };
    } catch (e) { throw e; }
  }

  async clearWatchLater() { try { await this.setStorage({ watchLaterVideos: [] }); return { success: true }; } catch (e) { throw e; } }
}

const monitor = new YouTubeChannelMonitor();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    checkNow: () => monitor.checkAllChannels(true).then(() => ({ success: true })),
    getStatus: () => monitor.getStorage(['lastCheck', 'lastCheckSuccess', 'lastCheckDuration', 'channelsChecked', 'successfulChannels', 'lastError', 'lastErrorTime'])
      .then(r => ({ ...r, stats: monitor.state.stats, isInitialized: monitor.state.isInitialized })),
    clearCache: async () => {
      const items = await monitor.getStorage(null);
      const keys = Object.keys(items).filter(k => k.startsWith('videos_'));
      if (keys.length) await chrome.storage.local.remove(keys);
      return { success: true, clearedItems: keys.length };
    },
    markVideoWatched: () => monitor.markVideoWatched(message.videoId),
    getWatchedVideos: () => monitor.getWatchedVideos().then(w => ({ success: true, watchedVideos: w })),
    clearWatchedVideos: () => monitor.clearWatchedVideos(),
    getWatchLater: () => monitor.getWatchLaterVideos().then(list => ({ success: true, list, count: list.length })),
    addToWatchLater: () => monitor.addToWatchLater(message.video),
    removeFromWatchLater: () => monitor.removeFromWatchLater(message.videoId),
    clearWatchLater: () => monitor.clearWatchLater(),
  };

  const action = actions[message.action];
  if (action) {
    action().then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    await monitor.setStorage({
      checkInterval: 15, timeFilter: '1day', notifications: false, autoOpen: 'current', installDate: Date.now(),
      watchLaterVideos: [], watchedVideos: {}, hideWatched: false,
      features: { watchedVideoTracking: true }
    });
    setTimeout(() => chrome.notifications.create({
      type: 'basic', iconUrl: 'icons/icon48.png', title: 'YouTube Channel Monitor Installed!',
      message: 'Create a "Vid" bookmarks folder with YouTube channels to get started.'
    }), 2000);
  } else if (details.reason === 'update') {
    const existing = await monitor.getStorage(['watchedVideos']);
    if (!existing.watchedVideos) await monitor.setStorage({ watchedVideos: {}, hideWatched: false });
  }
});