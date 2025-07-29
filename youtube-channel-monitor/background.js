class YouTubeChannelMonitor {
  constructor() {
    this.config = {
      FOLDER_NAME: 'Vid',
      CHECK_INTERVAL: 15,
      MAX_RETRIES: 2,
      REQUEST_TIMEOUT: 30000,
      MAX_CONCURRENT: 2
    };
    this.state = {
      activeRequests: 0,
      lastRequestTime: 0,
      stats: { totalChecks: 0, successfulChecks: 0, failedChecks: 0 }
    };
    this.init();
  }

  async init() {
    try {
      console.log('🚀 YouTube Channel Monitor initializing...');
      const { checkInterval = this.config.CHECK_INTERVAL } = await this.getStorage(['checkInterval']);
      
      await chrome.alarms.clear('checkChannels');
      await chrome.alarms.create('checkChannels', { periodInMinutes: checkInterval });
      
      this.setupListeners();
      setTimeout(() => this.checkAllChannels(false), 5000);
      
      console.log('✅ YouTube Channel Monitor initialized');
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      this.updateBadge('!', '#FF6B6B');
    }
  }

  setupListeners() {
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkChannels') this.checkAllChannels(false);
    });

    chrome.storage.onChanged.addListener(async (changes) => {
      if (changes.checkInterval) {
        await chrome.alarms.clear('checkChannels');
        await chrome.alarms.create('checkChannels', { periodInMinutes: changes.checkInterval.newValue });
      }
    });

    chrome.commands.onCommand.addListener((command) => {
      if (command === 'check-now') this.checkAllChannels(true);
    });
  }

  getStorage(keys) {
    return new Promise(resolve => chrome.storage.local.get(keys, resolve));
  }

  setStorage(data) {
    return new Promise(resolve => chrome.storage.local.set(data, resolve));
  }

  async findVidFolder() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.search({ title: this.config.FOLDER_NAME }, (results) => {
        if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
        resolve(results.find(item => !item.url));
      });
    });
  }

  async getChannelBookmarks() {
    try {
      const folder = await this.findVidFolder();
      if (!folder) return [];

      return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(folder.id, (children) => {
          if (chrome.runtime.lastError) return reject(new Error(chrome.runtime.lastError.message));
          
          const channels = children.filter(b => 
            b.url && b.url.includes('youtube.com') && b.url.includes('/videos')
          );
          resolve(channels);
        });
      });
    } catch (error) {
      console.error('❌ Failed to get bookmarks:', error);
      return [];
    }
  }

  async fetchChannelVideos(channelUrl, retryCount = 0) {
    try {
      if (this.state.activeRequests >= this.config.MAX_CONCURRENT) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      this.state.activeRequests++;
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

      const response = await fetch(channelUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);

      const html = await response.text();
      return this.parseVideosFromHTML(html);
      
    } catch (error) {
      if (retryCount < this.config.MAX_RETRIES) {
        await new Promise(resolve => setTimeout(resolve, 2000));
        return this.fetchChannelVideos(channelUrl, retryCount + 1);
      }
      return null;
    } finally {
      this.state.activeRequests--;
    }
  }

  parseVideosFromHTML(html) {
    const videos = [];
    
    try {
      // Extract ytInitialData
      const match = html.match(/var ytInitialData = ({.*?});/);
      if (!match) return [];
      
      const data = JSON.parse(match[1]);
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
      if (!tabs) return [];

      const videosTab = tabs.find(tab => tab?.tabRenderer?.content?.richGridRenderer?.contents);
      if (!videosTab) return [];

      const contents = videosTab.tabRenderer.content.richGridRenderer.contents;
      
      contents.forEach(item => {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (videoRenderer) {
          const video = this.parseVideoRenderer(videoRenderer);
          if (video) videos.push(video);
        }
      });
      
      return videos.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp).slice(0, 20);
    } catch (error) {
      console.error('❌ Parse failed:', error);
      return [];
    }
  }

  parseVideoRenderer(videoRenderer) {
    try {
      const videoId = videoRenderer.videoId;
      const title = videoRenderer.title?.runs?.[0]?.text || 'Untitled Video';
      const publishedText = videoRenderer.publishedTimeText?.simpleText;
      
      if (!videoId || !publishedText) return null;
      
      return {
        id: videoId,
        title: title.trim(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published: publishedText,
        publishedTimestamp: this.parsePublishedTime(publishedText),
        discoveredAt: Date.now()
      };
    } catch { 
      return null; 
    }
  }

  parsePublishedTime(publishedText) {
    const now = Date.now();
    const text = publishedText.toLowerCase();
    
    const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
    
    if (match) {
      const amount = parseInt(match[1]);
      const multipliers = {
        second: 1000, minute: 60000, hour: 3600000, day: 86400000,
        week: 604800000, month: 2592000000, year: 31536000000
      };
      return now - (amount * (multipliers[match[2]] || 86400000));
    }
    
    return now - 86400000;
  }

  async getStoredVideos(channelUrl) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    const result = await this.getStorage([key]);
    return result[key] || [];
  }

  async storeVideos(channelUrl, videos) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    await this.setStorage({ [key]: videos.slice(0, 50) });
  }

  hashUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      hash = ((hash << 5) - hash) + url.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString();
  }

  async getTimeFilter() {
    const result = await this.getStorage(['timeFilter']);
    return result.timeFilter || '1day';
  }

  async getTimeFilterTimestamp(filter) {
    const now = Date.now();
    const timeMap = {
      '1hour': 3600000, '1day': 86400000, '1week': 604800000,
      '1month': 2592000000, '1year': 31536000000
    };
    
    if (filter === 'lastcheck') {
      const result = await this.getStorage(['lastManualCheck']);
      return result.lastManualCheck || (now - 86400000);
    }
    
    return now - (timeMap[filter] || timeMap['1day']);
  }

  async updateBadge(text, color = '#FF0000') {
    try {
      await chrome.action.setBadgeText({ text: text.toString() });
      await chrome.action.setBadgeBackgroundColor({ color });
    } catch (error) {
      console.error('❌ Badge update failed:', error);
    }
  }

  async checkAllChannels(isManualCheck = false) {
    console.log(`🔍 Starting check... (manual: ${isManualCheck})`);
    
    try {
      await this.updateBadge('...', '#FFA500');
      
      const bookmarks = await this.getChannelBookmarks();
      if (!bookmarks.length) {
        await this.storeChannelResults([]);
        await this.updateBadge('');
        return;
      }

      const timeFilter = await this.getTimeFilter();
      const filterTimestamp = await this.getTimeFilterTimestamp(timeFilter);
      
      let totalNewVideos = 0;
      const channelResults = [];

      for (const bookmark of bookmarks) {
        try {
          const result = await this.processChannel(bookmark, filterTimestamp);
          if (result) {
            channelResults.push(result);
            totalNewVideos += result.newVideos?.length || 0;
          }
        } catch (error) {
          channelResults.push({
            channelTitle: bookmark.title,
            channelUrl: bookmark.url,
            error: error.message,
            newVideos: [],
            filteredVideos: [],
            totalVideos: []
          });
        }
        
        // Small delay between requests
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      await this.storeChannelResults(channelResults, timeFilter);
      
      if (totalNewVideos > 0) {
        const badgeText = totalNewVideos > 99 ? '99+' : totalNewVideos.toString();
        await this.updateBadge(badgeText, '#00C851');
      } else {
        await this.updateBadge('');
      }

      await this.setStorage({ 
        lastCheck: Date.now(),
        lastCheckSuccess: true
      });
      
      if (isManualCheck) {
        await this.setStorage({ lastManualCheck: Date.now() });
      }

      console.log(`✅ Check completed. Found ${totalNewVideos} new videos.`);

    } catch (error) {
      console.error('❌ Check failed:', error);
      await this.updateBadge('!', '#FF6B6B');
      await this.setStorage({ lastCheck: Date.now(), lastCheckSuccess: false });
    }
  }

  async processChannel(bookmark, filterTimestamp) {
    const currentVideos = await this.fetchChannelVideos(bookmark.url);
    if (!currentVideos) throw new Error('Failed to fetch videos');

    const storedVideos = await this.getStoredVideos(bookmark.url);
    const storedIds = new Set(storedVideos.map(v => v.id));
    
    const newVideos = currentVideos.filter(video => !storedIds.has(video.id));
    const filteredVideos = currentVideos.filter(video => video.publishedTimestamp >= filterTimestamp);

    if (newVideos.length > 0) {
      await this.storeVideos(bookmark.url, currentVideos);
    }

    return {
      channelTitle: bookmark.title,
      channelUrl: bookmark.url,
      newVideos,
      filteredVideos,
      totalVideos: currentVideos // Store all videos for popup filtering
    };
  }

  async storeChannelResults(results, timeFilter) {
    await this.setStorage({ 
      channelResults: results,
      lastTimeFilter: timeFilter,
      lastResultsUpdate: Date.now()
    });
  }
}

const monitor = new YouTubeChannelMonitor();

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    async checkNow() {
      await monitor.checkAllChannels(true);
      return { success: true };
    },
    
    async getStatus() {
      const result = await monitor.getStorage(['lastCheck', 'lastCheckSuccess']);
      return {
        lastCheck: result.lastCheck,
        lastCheckSuccess: result.lastCheckSuccess !== false
      };
    },

    async clearCache() {
      const items = await monitor.getStorage(null);
      const cacheKeys = Object.keys(items).filter(key => key.startsWith('videos_'));
      if (cacheKeys.length > 0) {
        await new Promise(resolve => chrome.storage.local.remove(cacheKeys, resolve));
      }
      return { success: true };
    }
  };

  if (actions[message.action]) {
    actions[message.action]()
      .then(result => sendResponse(result || { success: true }))
      .catch(error => sendResponse({ success: false, error: error.message }));
    return true;
  }
});

chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    monitor.setStorage({
      checkInterval: 15,
      timeFilter: '1day',
      notifications: false,
      autoOpen: 'current',
      installDate: Date.now()
    });
  }
});