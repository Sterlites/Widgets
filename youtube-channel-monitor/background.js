class YouTubeChannelMonitor {
  constructor() {
    this.config = {
      FOLDER_NAME: 'Vid',
      CHECK_INTERVAL: 15,
      MAX_RETRIES: 2,
      REQUEST_TIMEOUT: 30000,
      MAX_CONCURRENT: 2,
      NOTIFICATION_TIMEOUT: 5000,
      MAX_CACHE_SIZE: 100
    };
    this.state = {
      activeRequests: 0,
      lastRequestTime: 0,
      stats: { totalChecks: 0, successfulChecks: 0, failedChecks: 0 },
      isInitialized: false
    };
    this.init();
  }

  async init() {
    try {
      console.log('🚀 YouTube Channel Monitor initializing...');
      
      // Load settings
      const { checkInterval = this.config.CHECK_INTERVAL } = await this.getStorage(['checkInterval']);
      
      // Clear existing alarms and create new one
      await chrome.alarms.clear('checkChannels');
      await chrome.alarms.create('checkChannels', { periodInMinutes: checkInterval });
      
      this.setupListeners();
      
      // Initial check after delay
      setTimeout(() => this.checkAllChannels(false), 5000);
      
      this.state.isInitialized = true;
      console.log('✅ YouTube Channel Monitor initialized');
      
      // Update badge to show ready state
      await this.updateBadge('', '#22c55e');
      
    } catch (error) {
      console.error('❌ Initialization failed:', error);
      await this.updateBadge('!', '#ef4444');
      await this.setStorage({ lastError: error.message, lastErrorTime: Date.now() });
    }
  }

  setupListeners() {
    // Alarm listener for periodic checks
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkChannels') {
        this.checkAllChannels(false);
      }
    });

    // Storage change listener for settings updates
    chrome.storage.onChanged.addListener(async (changes) => {
      if (changes.checkInterval) {
        const newInterval = changes.checkInterval.newValue;
        await chrome.alarms.clear('checkChannels');
        await chrome.alarms.create('checkChannels', { periodInMinutes: newInterval });
        console.log(`⏰ Check interval updated to ${newInterval} minutes`);
      }
    });

    // Keyboard shortcut listener
    chrome.commands.onCommand.addListener((command) => {
      if (command === 'check-now') {
        this.checkAllChannels(true);
      }
    });

    // Installation/startup listener
    chrome.runtime.onStartup.addListener(() => {
      console.log('🔄 Extension startup detected');
      this.updateStatus();
    });
  }

  // Enhanced storage helpers with error handling
  getStorage(keys) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.get(keys, (result) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(result);
        }
      });
    });
  }

  setStorage(data) {
    return new Promise((resolve, reject) => {
      chrome.storage.local.set(data, () => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve();
        }
      });
    });
  }

  async findVidFolder() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.search({ title: this.config.FOLDER_NAME }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        // Find folder (not a URL)
        const folder = results.find(item => !item.url);
        resolve(folder);
      });
    });
  }

  async getChannelBookmarks() {
    try {
      const folder = await this.findVidFolder();
      if (!folder) {
        console.log('📁 No "Vid" folder found');
        return [];
      }

      return new Promise((resolve, reject) => {
        chrome.bookmarks.getChildren(folder.id, (children) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
            return;
          }
          
          const channels = children.filter(b => 
            b.url && 
            b.url.includes('youtube.com') && 
            (b.url.includes('/videos') || b.url.includes('/channel/') || b.url.includes('/@'))
          );
          
          console.log(`📺 Found ${channels.length} YouTube channel bookmarks`);
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
      // Rate limiting
      if (this.state.activeRequests >= this.config.MAX_CONCURRENT) {
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      this.state.activeRequests++;
      
      // Ensure we have the /videos endpoint
      let videoUrl = channelUrl;
      if (!videoUrl.includes('/videos') && !videoUrl.includes('/streams')) {
        if (videoUrl.includes('/@') || videoUrl.includes('/channel/')) {
          videoUrl = videoUrl.replace(/\/$/, '') + '/videos';
        }
      }
      
      console.log(`🔍 Fetching: ${videoUrl}`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.config.REQUEST_TIMEOUT);

      const response = await fetch(videoUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const videos = this.parseVideosFromHTML(html);
      
      console.log(`✅ Found ${videos.length} videos from ${videoUrl}`);
      return videos;
      
    } catch (error) {
      console.error(`❌ Fetch failed (attempt ${retryCount + 1}):`, error.message);
      
      if (retryCount < this.config.MAX_RETRIES && !error.message.includes('aborted')) {
        const delay = Math.min(1000 * Math.pow(2, retryCount), 5000); // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
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
      // Extract ytInitialData - more robust regex
      const patterns = [
        /var ytInitialData = ({.*?});/s,
        /window\["ytInitialData"\] = ({.*?});/s,
        /ytInitialData":\s*({.*?}),\s*"ytInitialPlayerResponse"/s
      ];
      
      let data = null;
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          try {
            data = JSON.parse(match[1]);
            break;
          } catch (e) {
            continue;
          }
        }
      }
      
      if (!data) {
        console.warn('⚠️ Could not find ytInitialData');
        return [];
      }
      
      // Navigate through the data structure more safely
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs || 
                   data?.contents?.singleColumnBrowseResultsRenderer?.tabs || [];
      
      if (!tabs.length) {
        console.warn('⚠️ No tabs found in data structure');
        return [];
      }

      // Find videos tab
      let videosTab = null;
      for (const tab of tabs) {
        const tabContent = tab?.tabRenderer?.content;
        if (tabContent?.richGridRenderer?.contents || tabContent?.sectionListRenderer) {
          videosTab = tab;
          break;
        }
      }
      
      if (!videosTab) {
        console.warn('⚠️ No videos tab found');
        return [];
      }

      // Extract videos from rich grid or section list
      let contents = [];
      const tabContent = videosTab.tabRenderer.content;
      
      if (tabContent.richGridRenderer?.contents) {
        contents = tabContent.richGridRenderer.contents;
      } else if (tabContent.sectionListRenderer?.contents) {
        // Handle section list format
        for (const section of tabContent.sectionListRenderer.contents) {
          if (section.itemSectionRenderer?.contents) {
            contents = contents.concat(section.itemSectionRenderer.contents);
          }
        }
      }
      
      // Parse individual videos
      contents.forEach(item => {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer ||
                            item?.videoRenderer;
                            
        if (videoRenderer) {
          const video = this.parseVideoRenderer(videoRenderer);
          if (video) {
            videos.push(video);
          }
        }
      });
      
      // Sort by publish time and limit results
      return videos
        .sort((a, b) => b.publishedTimestamp - a.publishedTimestamp)
        .slice(0, 50); // Increased limit for better coverage
        
    } catch (error) {
      console.error('❌ Parse failed:', error);
      return [];
    }
  }

  parseVideoRenderer(videoRenderer) {
    try {
      const videoId = videoRenderer.videoId;
      const title = videoRenderer.title?.runs?.[0]?.text || 
                   videoRenderer.title?.simpleText ||
                   'Untitled Video';
      const publishedText = videoRenderer.publishedTimeText?.simpleText ||
                           videoRenderer.publishedTimeText?.runs?.[0]?.text;
      
      if (!videoId) return null;
      
      // Extract thumbnail
      const thumbnails = videoRenderer.thumbnail?.thumbnails || [];
      const thumbnail = thumbnails.length > 0 ? 
        thumbnails[thumbnails.length - 1]?.url || '' : '';

      // Extract view count if available
      const viewText = videoRenderer.viewCountText?.simpleText ||
                      videoRenderer.shortViewCountText?.simpleText || '';

      return {
        id: videoId,
        title: title.trim(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published: publishedText || 'Recently',
        publishedTimestamp: this.parsePublishedTime(publishedText),
        discoveredAt: Date.now(),
        thumbnail: thumbnail,
        views: viewText
      };
    } catch (error) {
      console.error('❌ Video parse failed:', error);
      return null; 
    }
  }

  parsePublishedTime(publishedText) {
    if (!publishedText) return Date.now() - 86400000; // Default to 1 day ago
    
    const now = Date.now();
    const text = publishedText.toLowerCase().trim();
    
    // Handle "Streamed X ago" format
    const streamMatch = text.match(/streamed\s+(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
    if (streamMatch) {
      const amount = parseInt(streamMatch[1]);
      const unit = streamMatch[2];
      return now - this.getTimeMultiplier(unit) * amount;
    }
    
    // Handle standard "X ago" format
    const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
    if (match) {
      const amount = parseInt(match[1]);
      const unit = match[2];
      return now - this.getTimeMultiplier(unit) * amount;
    }
    
    // Handle "Premiered X ago"
    const premiereMatch = text.match(/premiered\s+(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
    if (premiereMatch) {
      const amount = parseInt(premiereMatch[1]);
      const unit = premiereMatch[2];
      return now - this.getTimeMultiplier(unit) * amount;
    }
    
    // Default fallback
    return now - 86400000;
  }

  getTimeMultiplier(unit) {
    const multipliers = {
      second: 1000,
      minute: 60000,
      hour: 3600000,
      day: 86400000,
      week: 604800000,
      month: 2592000000,
      year: 31536000000
    };
    return multipliers[unit] || 86400000;
  }

  async getStoredVideos(channelUrl) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    try {
      const result = await this.getStorage([key]);
      return result[key] || [];
    } catch (error) {
      console.error('❌ Failed to get stored videos:', error);
      return [];
    }
  }

  async storeVideos(channelUrl, videos) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    try {
      // Limit stored videos to prevent storage bloat
      const videosToStore = videos.slice(0, this.config.MAX_CACHE_SIZE);
      await this.setStorage({ [key]: videosToStore });
    } catch (error) {
      console.error('❌ Failed to store videos:', error);
    }
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
    try {
      const result = await this.getStorage(['timeFilter']);
      return result.timeFilter || '1day';
    } catch (error) {
      console.error('❌ Failed to get time filter:', error);
      return '1day';
    }
  }

  async getTimeFilterTimestamp(filter) {
    const now = Date.now();
    const timeMap = {
      '1hour': 3600000,
      '1day': 86400000,
      '1week': 604800000,
      '1month': 2592000000,
      '1year': 31536000000
    };
    
    if (filter === 'sincelastvisit' || filter === 'lastcheck') {
      try {
        const result = await this.getStorage(['lastManualCheck']);
        return result.lastManualCheck || (now - 86400000);
      } catch (error) {
        return now - 86400000;
      }
    }
    
    return now - (timeMap[filter] || timeMap['1day']);
  }

  async updateBadge(text, color = '#ef4444') {
    try {
      await chrome.action.setBadgeText({ text: text.toString() });
      await chrome.action.setBadgeBackgroundColor({ color });
    } catch (error) {
      console.error('❌ Badge update failed:', error);
    }
  }

  async showNotification(title, message, channelResults) {
    try {
      const settings = await this.getStorage(['notifications']);
      if (!settings.notifications) return;

      // Create rich notification with channel info
      const totalNew = channelResults.reduce((sum, ch) => sum + (ch.newVideos?.length || 0), 0);
      const channelsWithNew = channelResults.filter(ch => ch.newVideos?.length > 0);
      
      let notificationMessage = message;
      if (channelsWithNew.length > 0) {
        const firstChannel = channelsWithNew[0];
        const firstVideo = firstChannel.newVideos[0];
        notificationMessage = `${firstVideo.title} - ${firstChannel.channelTitle}`;
        
        if (totalNew > 1) {
          notificationMessage += ` (+${totalNew - 1} more)`;
        }
      }

      await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: notificationMessage
      });
      
      // Auto-clear notification
      setTimeout(() => {
        chrome.notifications.clear();
      }, this.config.NOTIFICATION_TIMEOUT);
      
    } catch (error) {
      console.error('❌ Notification failed:', error);
    }
  }

  async checkAllChannels(isManualCheck = false) {
    const startTime = Date.now();
    console.log(`🔍 Starting ${isManualCheck ? 'manual' : 'automatic'} check...`);
    
    try {
      await this.updateBadge('...', '#f59e0b');
      this.state.stats.totalChecks++;
      
      const bookmarks = await this.getChannelBookmarks();
      if (!bookmarks.length) {
        console.log('📭 No bookmarks found');
        await this.storeChannelResults([]);
        await this.updateBadge('');
        return;
      }

      const timeFilter = await this.getTimeFilter();
      const filterTimestamp = await this.getTimeFilterTimestamp(timeFilter);
      
      let totalNewVideos = 0;
      const channelResults = [];
      let successfulChannels = 0;

      // Process channels with better error handling
      for (const [index, bookmark] of bookmarks.entries()) {
        try {
          console.log(`📺 Processing ${bookmark.title} (${index + 1}/${bookmarks.length})`);
          
          const result = await this.processChannel(bookmark, filterTimestamp);
          if (result) {
            channelResults.push(result);
            totalNewVideos += result.newVideos?.length || 0;
            successfulChannels++;
          }
        } catch (error) {
          console.error(`❌ Failed to process ${bookmark.title}:`, error);
          channelResults.push({
            channelTitle: bookmark.title,
            channelUrl: bookmark.url,
            error: error.message,
            newVideos: [],
            filteredVideos: [],
            totalVideos: []
          });
        }
        
        // Progress update for long operations
        if (bookmarks.length > 5 && (index + 1) % 3 === 0) {
          await this.updateBadge(`${index + 1}/${bookmarks.length}`, '#f59e0b');
        }
        
        // Delay between requests to be respectful
        if (index < bookmarks.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
      }

      // Store results
      await this.storeChannelResults(channelResults, timeFilter);
      
      // Update badge and show notifications
      if (totalNewVideos > 0) {
        const badgeText = totalNewVideos > 99 ? '99+' : totalNewVideos.toString();
        await this.updateBadge(badgeText, '#22c55e');
        
        if (isManualCheck || totalNewVideos >= 3) { // Show notification for manual checks or significant updates
          await this.showNotification(
            'New Videos Found!',
            `Found ${totalNewVideos} new videos`,
            channelResults.filter(ch => ch.newVideos?.length > 0)
          );
        }
      } else {
        await this.updateBadge('');
      }

      // Update statistics and status
      const duration = Date.now() - startTime;
      await this.setStorage({ 
        lastCheck: Date.now(),
        lastCheckSuccess: true,
        lastCheckDuration: duration,
        channelsChecked: bookmarks.length,
        successfulChannels: successfulChannels
      });
      
      if (isManualCheck) {
        await this.setStorage({ lastManualCheck: Date.now() });
      }

      this.state.stats.successfulChecks++;
      console.log(`✅ Check completed in ${duration}ms. Found ${totalNewVideos} new videos from ${successfulChannels}/${bookmarks.length} channels.`);

    } catch (error) {
      console.error('❌ Check failed:', error);
      await this.updateBadge('!', '#ef4444');
      await this.setStorage({ 
        lastCheck: Date.now(), 
        lastCheckSuccess: false,
        lastError: error.message,
        lastErrorTime: Date.now()
      });
      this.state.stats.failedChecks++;
    }
  }

  async processChannel(bookmark, filterTimestamp) {
    const currentVideos = await this.fetchChannelVideos(bookmark.url);
    if (!currentVideos) {
      throw new Error('Failed to fetch videos - channel may be private or deleted');
    }

    const storedVideos = await this.getStoredVideos(bookmark.url);
    const storedIds = new Set(storedVideos.map(v => v.id));
    
    // Find truly new videos (not in stored cache)
    const newVideos = currentVideos.filter(video => !storedIds.has(video.id));
    
    // Find videos matching time filter
    const filteredVideos = currentVideos.filter(video => 
      video.publishedTimestamp >= filterTimestamp
    );

    // Store updated video list if we found new content
    if (newVideos.length > 0) {
      await this.storeVideos(bookmark.url, currentVideos);
    }

    return {
      channelTitle: bookmark.title,
      channelUrl: bookmark.url,
      newVideos,
      filteredVideos,
      totalVideos: currentVideos,
      lastChecked: Date.now(),
      videoCount: currentVideos.length
    };
  }

  async storeChannelResults(results, timeFilter) {
    try {
      await this.setStorage({ 
        channelResults: results,
        lastTimeFilter: timeFilter,
        lastResultsUpdate: Date.now()
      });
    } catch (error) {
      console.error('❌ Failed to store channel results:', error);
    }
  }

  async updateStatus() {
    try {
      const stats = await this.getStorage([
        'lastCheck', 'lastCheckSuccess', 'lastCheckDuration', 
        'channelsChecked', 'successfulChannels', 'lastError'
      ]);
      
      console.log('📊 Status update:', {
        lastCheck: stats.lastCheck ? new Date(stats.lastCheck).toLocaleString() : 'Never',
        success: stats.lastCheckSuccess,
        duration: stats.lastCheckDuration ? `${stats.lastCheckDuration}ms` : 'N/A',
        channels: `${stats.successfulChannels || 0}/${stats.channelsChecked || 0}`,
        error: stats.lastError || 'None'
      });
    } catch (error) {
      console.error('❌ Status update failed:', error);
    }
  }

  /* ---------------------------
     Watch Later: Enhanced storage helpers with better error handling
     --------------------------- */
  async getWatchLaterVideos() {
    try {
      const result = await this.getStorage(['watchLaterVideos']);
      return result.watchLaterVideos || [];
    } catch (error) {
      console.error('❌ Failed to get watch later videos:', error);
      return [];
    }
  }

  async addToWatchLater(video) {
    try {
      if (!video || !video.id || !video.url) {
        throw new Error('Invalid video object - missing required fields');
      }
      
      const existing = await this.getWatchLaterVideos();

      // Check for duplicates
      if (existing.find(v => v.id === video.id)) {
        return { success: true, message: 'Video already in Watch Later', alreadyExists: true };
      }

      const item = {
        id: video.id,
        title: video.title || 'Untitled Video',
        url: video.url,
        channelTitle: video.channelTitle || 'Unknown Channel',
        published: video.published || 'Unknown',
        addedAt: Date.now(),
        thumbnail: video.thumbnail || ''
      };

      // Add to front (most recent first)
      existing.unshift(item);

      // Keep list size manageable
      const MAX_ITEMS = 1000;
      if (existing.length > MAX_ITEMS) {
        existing.splice(MAX_ITEMS);
        console.log(`⚠️ Watch Later list trimmed to ${MAX_ITEMS} items`);
      }

      await this.setStorage({ watchLaterVideos: existing });
      console.log(`✅ Added "${item.title}" to Watch Later`);
      
      return { success: true, item };
    } catch (error) {
      console.error('❌ addToWatchLater failed:', error);
      throw error;
    }
  }

  async removeFromWatchLater(videoId) {
    try {
      if (!videoId) {
        throw new Error('Missing videoId parameter');
      }
      
      const existing = await this.getWatchLaterVideos();
      const initialLength = existing.length;
      const filtered = existing.filter(v => v.id !== videoId);
      
      if (filtered.length === initialLength) {
        return { success: true, message: 'Video was not in Watch Later', notFound: true };
      }
      
      await this.setStorage({ watchLaterVideos: filtered });
      console.log(`✅ Removed video ${videoId} from Watch Later`);
      
      return { success: true };
    } catch (error) {
      console.error('❌ removeFromWatchLater failed:', error);
      throw error;
    }
  }

  async clearWatchLater() {
    try {
      await this.setStorage({ watchLaterVideos: [] });
      console.log('✅ Watch Later cleared');
      return { success: true };
    } catch (error) {
      console.error('❌ clearWatchLater failed:', error);
      throw error;
    }
  }
}

// Initialize monitor
const monitor = new YouTubeChannelMonitor();

// Enhanced message handler with better error handling and new actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const actions = {
    async checkNow() {
      console.log('📱 Manual check requested from popup');
      await monitor.checkAllChannels(true);
      return { success: true, timestamp: Date.now() };
    },
    
    async getStatus() {
      const result = await monitor.getStorage([
        'lastCheck', 'lastCheckSuccess', 'lastCheckDuration', 
        'channelsChecked', 'successfulChannels', 'lastError', 'lastErrorTime'
      ]);
      
      return {
        lastCheck: result.lastCheck,
        lastCheckSuccess: result.lastCheckSuccess !== false,
        lastCheckDuration: result.lastCheckDuration,
        channelsChecked: result.channelsChecked || 0,
        successfulChannels: result.successfulChannels || 0,
        lastError: result.lastError,
        lastErrorTime: result.lastErrorTime,
        stats: monitor.state.stats,
        isInitialized: monitor.state.isInitialized
      };
    },

    async clearCache() {
      console.log('🗑️ Cache clear requested from popup');
      const items = await monitor.getStorage(null);
      const cacheKeys = Object.keys(items).filter(key => key.startsWith('videos_'));
      
      if (cacheKeys.length > 0) {
        await new Promise((resolve, reject) => {
          chrome.storage.local.remove(cacheKeys, () => {
            if (chrome.runtime.lastError) {
              reject(new Error(chrome.runtime.lastError.message));
            } else {
              resolve();
            }
          });
        });
        console.log(`✅ Cleared ${cacheKeys.length} cached channel entries`);
      }
      
      return { success: true, clearedItems: cacheKeys.length };
    },

    async getChannelStats() {
      const results = await monitor.getStorage(['channelResults']);
      const channels = results.channelResults || [];
      
      return {
        success: true,
        totalChannels: channels.length,
        channelsWithErrors: channels.filter(c => c.error).length,
        totalVideos: channels.reduce((sum, c) => sum + (c.totalVideos?.length || 0), 0),
        totalNewVideos: channels.reduce((sum, c) => sum + (c.newVideos?.length || 0), 0)
      };
    },

    async exportSettings() {
      const settings = await monitor.getStorage([
        'checkInterval', 'timeFilter', 'notifications', 'autoOpen'
      ]);
      
      return {
        success: true,
        settings: {
          ...settings,
          exportDate: new Date().toISOString(),
          version: chrome.runtime.getManifest().version
        }
      };
    },

    async importSettings() {
      const { settings } = message;
      if (!settings || typeof settings !== 'object') {
        throw new Error('Invalid settings data');
      }
      
      // Validate settings before import
      const validKeys = ['checkInterval', 'timeFilter', 'notifications', 'autoOpen'];
      const filteredSettings = {};
      
      for (const key of validKeys) {
        if (settings[key] !== undefined) {
          filteredSettings[key] = settings[key];
        }
      }
      
      await monitor.setStorage(filteredSettings);
      console.log('✅ Settings imported successfully');
      
      return { success: true, imported: Object.keys(filteredSettings) };
    },

    // Watch Later actions with enhanced error handling
    async getWatchLater() {
      const list = await monitor.getWatchLaterVideos();
      return { 
        success: true, 
        list,
        count: list.length,
        lastModified: list.length > 0 ? Math.max(...list.map(v => v.addedAt || 0)) : 0
      };
    },

    async addToWatchLater() {
      const { video } = message;
      if (!video) {
        throw new Error('Missing video parameter');
      }
      
      const result = await monitor.addToWatchLater(video);
      return result;
    },

    async removeFromWatchLater() {
      const { videoId } = message;
      if (!videoId) {
        throw new Error('Missing videoId parameter');
      }
      
      const result = await monitor.removeFromWatchLater(videoId);
      return result;
    },

    async clearWatchLater() {
      const result = await monitor.clearWatchLater();
      return result;
    },

    async getWatchLaterStats() {
      const videos = await monitor.getWatchLaterVideos();
      const channels = [...new Set(videos.map(v => v.channelTitle))];
      const oldestVideo = videos.length > 0 ? 
        Math.min(...videos.map(v => v.addedAt || Date.now())) : null;
      
      return {
        success: true,
        totalVideos: videos.length,
        uniqueChannels: channels.length,
        oldestVideoDate: oldestVideo,
        channels: channels.slice(0, 10) // Top 10 channels
      };
    },

    // System health and diagnostics
    async getSystemHealth() {
      try {
        const storage = await monitor.getStorage(null);
        const storageSize = JSON.stringify(storage).length;
        const cacheEntries = Object.keys(storage).filter(k => k.startsWith('videos_')).length;
        
        const alarms = await chrome.alarms.getAll();
        const checkAlarm = alarms.find(a => a.name === 'checkChannels');
        
        return {
          success: true,
          storage: {
            totalSize: storageSize,
            cacheEntries,
            watchLaterCount: (storage.watchLaterVideos || []).length
          },
          alarms: {
            checkScheduled: !!checkAlarm,
            nextCheck: checkAlarm ? checkAlarm.scheduledTime : null
          },
          runtime: {
            initialized: monitor.state.isInitialized,
            activeRequests: monitor.state.activeRequests,
            stats: monitor.state.stats
          }
        };
      } catch (error) {
        return {
          success: false,
          error: error.message,
          basicInfo: {
            initialized: monitor.state.isInitialized,
            timestamp: Date.now()
          }
        };
      }
    },

    // Performance optimization
    async optimizeStorage() {
      console.log('🔧 Storage optimization requested');
      const items = await monitor.getStorage(null);
      let optimized = 0;
      
      // Remove old cache entries
      const cacheKeys = Object.keys(items).filter(key => key.startsWith('videos_'));
      for (const key of cacheKeys) {
        const videos = items[key] || [];
        if (videos.length > 50) {
          // Keep only recent 50 videos
          const trimmed = videos.slice(0, 50);
          await monitor.setStorage({ [key]: trimmed });
          optimized++;
        }
      }
      
      // Clean up old error logs and temporary data
      const keysToClean = Object.keys(items).filter(key => 
        key.startsWith('temp_') || 
        key.startsWith('error_') ||
        (key.includes('timestamp') && items[key] < Date.now() - 7 * 86400000) // 7 days old
      );
      
      if (keysToClean.length > 0) {
        await new Promise(resolve => {
          chrome.storage.local.remove(keysToClean, resolve);
        });
      }
      
      console.log(`✅ Storage optimized: ${optimized} cache entries trimmed, ${keysToClean.length} old entries removed`);
      
      return { 
        success: true, 
        cacheEntriesOptimized: optimized,
        oldEntriesRemoved: keysToClean.length
      };
    }
  };

  // Execute action with comprehensive error handling
  if (actions[message.action]) {
    actions[message.action]()
      .then(result => {
        sendResponse(result || { success: true });
      })
      .catch(error => {
        console.error(`❌ Action '${message.action}' failed:`, error);
        sendResponse({ 
          success: false, 
          error: error.message,
          action: message.action,
          timestamp: Date.now()
        });
      });
    return true; // Keep message channel open for async response
  } else {
    console.warn(`⚠️ Unknown action requested: ${message.action}`);
    sendResponse({ 
      success: false, 
      error: `Unknown action: ${message.action}`,
      availableActions: Object.keys(actions)
    });
  }
});

// Enhanced installation handler with better defaults
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log(`🎉 Extension ${details.reason}:`, details);
  
  if (details.reason === 'install') {
    // First-time installation
    await monitor.setStorage({
      checkInterval: 15,
      timeFilter: '1day',
      notifications: false,
      autoOpen: 'current',
      installDate: Date.now(),
      watchLaterVideos: [],
      showFilter: 'all',
      // Feature flags for future enhancements
      features: {
        enhancedNotifications: true,
        exportImport: true,
        storageOptimization: true
      }
    });
    
    console.log('✅ Initial settings configured');
    
    // Show welcome notification
    setTimeout(() => {
      chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: 'YouTube Channel Monitor Installed!',
        message: 'Create a "Vid" bookmarks folder with YouTube channels to get started.'
      });
    }, 2000);
    
  } else if (details.reason === 'update') {
    // Handle updates
    const previousVersion = details.previousVersion;
    const currentVersion = chrome.runtime.getManifest().version;
    
    console.log(`📈 Updated from ${previousVersion} to ${currentVersion}`);
    
    // Migration logic for different versions can go here
    await monitor.setStorage({
      lastUpdateDate: Date.now(),
      previousVersion,
      currentVersion
    });
    
    // Clear cache on major updates to prevent compatibility issues
    if (previousVersion && previousVersion.split('.')[0] !== currentVersion.split('.')[0]) {
      console.log('🔄 Major version update detected, clearing cache for compatibility');
      const items = await monitor.getStorage(null);
      const cacheKeys = Object.keys(items).filter(key => key.startsWith('videos_'));
      if (cacheKeys.length > 0) {
        await new Promise(resolve => {
          chrome.storage.local.remove(cacheKeys, resolve);
        });
      }
    }
  }
});

// Handle startup
chrome.runtime.onStartup.addListener(async () => {
  console.log('🚀 Extension startup detected');
  await monitor.updateStatus();
});

// Cleanup handler for when extension is disabled/removed
chrome.runtime.onSuspend.addListener(() => {
  console.log('💤 Extension suspending, cleaning up...');
  // Any cleanup code here
});

// Error boundary for uncaught errors
self.addEventListener('error', (event) => {
  console.error('💥 Uncaught error in background script:', event.error);
  monitor.setStorage({
    lastUncaughtError: event.error.message,
    lastUncaughtErrorTime: Date.now()
  }).catch(console.error);
});

// Promise rejection handler
self.addEventListener('unhandledrejection', (event) => {
  console.error('💥 Unhandled promise rejection in background script:', event.reason);
  monitor.setStorage({
    lastUnhandledRejection: event.reason?.message || String(event.reason),
    lastUnhandledRejectionTime: Date.now()
  }).catch(console.error);
});

console.log('🎯 YouTube Channel Monitor background script loaded');