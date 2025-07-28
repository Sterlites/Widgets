// YouTube Channel Monitor - Enhanced Background Script
class YouTubeChannelMonitor {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.CHECK_INTERVAL = 15; // minutes
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 5000; // 5 seconds
    this.REQUEST_TIMEOUT = 45000; // 45 seconds
    this.MAX_CONCURRENT_REQUESTS = 3;
    this.CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
    
    // Rate limiting
    this.requestQueue = [];
    this.activeRequests = 0;
    this.lastRequestTime = 0;
    this.MIN_REQUEST_INTERVAL = 2000; // 2 seconds between requests
    
    // Performance monitoring
    this.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      totalVideosFound: 0,
      averageResponseTime: 0
    };
    
    this.init();
  }

  async init() {
    try {
      console.log('🚀 YouTube Channel Monitor initializing...');
      
      // Load saved settings
      const result = await this.getStorageData(['checkInterval', 'notifications']);
      const interval = result.checkInterval || this.CHECK_INTERVAL;
      const notifications = result.notifications || false;

      // Set up alarm for periodic checks
      await chrome.alarms.clear('checkChannels');
      await chrome.alarms.create('checkChannels', { periodInMinutes: interval });
      
      // Listen for alarm
      chrome.alarms.onAlarm.addListener((alarm) => {
        if (alarm.name === 'checkChannels') {
          this.checkAllChannels(false);
        }
      });

      // Listen for storage changes to update alarm
      chrome.storage.onChanged.addListener(async (changes) => {
        if (changes.checkInterval) {
          await chrome.alarms.clear('checkChannels');
          await chrome.alarms.create('checkChannels', { 
            periodInMinutes: changes.checkInterval.newValue 
          });
          console.log(`✅ Check interval updated to ${changes.checkInterval.newValue} minutes`);
        }
      });

      // Listen for keyboard commands
      chrome.commands.onCommand.addListener((command) => {
        if (command === 'check-now') {
          this.checkAllChannels(true);
        }
      });

      // Initial check on startup (delayed to avoid conflicts)
      setTimeout(() => {
        this.checkAllChannels(false);
      }, 10000); // 10 second delay

      // Setup periodic cleanup
      this.setupPeriodicCleanup();
      
      console.log('✅ YouTube Channel Monitor initialized successfully');
      
    } catch (error) {
      console.error('❌ Failed to initialize YouTube Channel Monitor:', error);
      await this.updateBadge('!', '#FF6B6B');
    }
  }

  setupPeriodicCleanup() {
    // Clean up old data every 6 hours
    setInterval(() => {
      this.cleanupOldData();
    }, 6 * 60 * 60 * 1000);
  }

  async cleanupOldData() {
    try {
      console.log('🧹 Starting data cleanup...');
      
      const items = await this.getStorageData(null);
      const keysToRemove = [];
      const cutoffTime = Date.now() - (30 * 24 * 60 * 60 * 1000); // 30 days old
      
      Object.keys(items).forEach(key => {
        if (key.startsWith('videos_')) {
          const videos = items[key];
          if (Array.isArray(videos)) {
            // Remove old videos but keep the 50 most recent
            const recentVideos = videos
              .filter(video => video.discoveredAt > cutoffTime)
              .slice(0, 50);
            
            if (recentVideos.length !== videos.length) {
              chrome.storage.local.set({ [key]: recentVideos });
            }
          }
        }
      });
      
      console.log('✅ Data cleanup completed');
      
    } catch (error) {
      console.error('❌ Data cleanup failed:', error);
    }
  }

  async getStorageData(keys) {
    return new Promise((resolve) => {
      chrome.storage.local.get(keys, resolve);
    });
  }

  async setStorageData(data) {
    return new Promise((resolve) => {
      chrome.storage.local.set(data, resolve);
    });
  }

  async findVidFolder() {
    return new Promise((resolve, reject) => {
      chrome.bookmarks.search({ title: this.FOLDER_NAME }, (results) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }
        
        const folder = results.find(item => !item.url); // folders don't have URLs
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
          
          const channelBookmarks = children.filter(bookmark => 
            bookmark.url && 
            (bookmark.url.includes('youtube.com/@') || bookmark.url.includes('youtube.com/c/') || bookmark.url.includes('youtube.com/user/')) && 
            bookmark.url.includes('/videos')
          );
          
          console.log(`📚 Found ${channelBookmarks.length} YouTube channel bookmarks`);
          resolve(channelBookmarks);
        });
      });
    } catch (error) {
      console.error('❌ Failed to get channel bookmarks:', error);
      return [];
    }
  }

  async waitForRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    
    if (timeSinceLastRequest < this.MIN_REQUEST_INTERVAL) {
      const delay = this.MIN_REQUEST_INTERVAL - timeSinceLastRequest;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
    
    this.lastRequestTime = Date.now();
  }

  async fetchChannelVideos(channelUrl, retryCount = 0) {
    const startTime = Date.now();
    
    try {
      // Rate limiting
      await this.waitForRateLimit();
      
      // Check if we have too many concurrent requests
      if (this.activeRequests >= this.MAX_CONCURRENT_REQUESTS) {
        await new Promise(resolve => {
          this.requestQueue.push(resolve);
        });
      }
      
      this.activeRequests++;
      
      console.log(`🔍 Fetching videos from: ${channelUrl} (attempt ${retryCount + 1})`);
      
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.REQUEST_TIMEOUT);

      const response = await fetch(channelUrl, {
        method: 'GET',
        headers: {
          'User-Agent': this.getRandomUserAgent(),
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,image/apng,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1',
          'Sec-Fetch-Dest': 'document',
          'Sec-Fetch-Mode': 'navigate',
          'Sec-Fetch-Site': 'none',
          'Cache-Control': 'no-cache'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      const videos = await this.parseVideosFromHTML(html);
      
      // Update performance stats
      const responseTime = Date.now() - startTime;
      this.updatePerformanceStats(true, responseTime);
      
      console.log(`✅ Found ${videos.length} videos from ${channelUrl} (${responseTime}ms)`);
      return videos;
      
    } catch (error) {
      this.updatePerformanceStats(false, Date.now() - startTime);
      
      console.error(`❌ Failed to fetch ${channelUrl} (attempt ${retryCount + 1}):`, error.message);
      
      if (retryCount < this.MAX_RETRIES && error.name !== 'AbortError') {
        const delay = this.RETRY_DELAY * Math.pow(2, retryCount); // Exponential backoff
        console.log(`⏳ Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return this.fetchChannelVideos(channelUrl, retryCount + 1);
      }
      
      return null;
      
    } finally {
      this.activeRequests--;
      
      // Process next request in queue
      if (this.requestQueue.length > 0) {
        const nextResolve = this.requestQueue.shift();
        nextResolve();
      }
    }
  }

  getRandomUserAgent() {
    const userAgents = [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    ];
    return userAgents[Math.floor(Math.random() * userAgents.length)];
  }

  updatePerformanceStats(success, responseTime) {
    this.stats.totalChecks++;
    if (success) {
      this.stats.successfulChecks++;
    } else {
      this.stats.failedChecks++;
    }
    
    // Update average response time
    this.stats.averageResponseTime = (
      (this.stats.averageResponseTime * (this.stats.totalChecks - 1)) + responseTime
    ) / this.stats.totalChecks;
  }

  async parseVideosFromHTML(html) {
    const videos = [];
    
    try {
      // Method 1: Try to extract from ytInitialData
      let data = this.extractYTInitialData(html);
      
      if (data) {
        const extractedVideos = this.extractVideosFromData(data);
        videos.push(...extractedVideos);
      }

      // Method 2: Fallback - try alternative patterns
      if (videos.length === 0) {
        data = this.extractAlternativeYTData(html);
        if (data) {
          const extractedVideos = this.extractVideosFromData(data);
          videos.push(...extractedVideos);
        }
      }

      // Method 3: Regex fallback for video IDs
      if (videos.length === 0) {
        const regexVideos = this.extractVideosWithRegex(html);
        videos.push(...regexVideos);
      }

      // Sort by published timestamp (newest first) and limit
      return videos
        .sort((a, b) => b.publishedTimestamp - a.publishedTimestamp)
        .slice(0, 50);
        
    } catch (error) {
      console.error('❌ Failed to parse YouTube data:', error);
      return [];
    }
  }

  extractYTInitialData(html) {
    try {
      const patterns = [
        /var ytInitialData = ({.*?});/,
        /window\["ytInitialData"\] = ({.*?});/,
        /ytInitialData":\s*({.*?}),"ytInitialPlayerResponse"/,
        /ytInitialData = ({.*?});/
      ];

      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) {
          return JSON.parse(match[1]);
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to extract ytInitialData:', error);
      return null;
    }
  }

  extractAlternativeYTData(html) {
    try {
      // Try to find data in script tags
      const scriptMatch = html.match(/<script[^>]*>(.*?ytInitialData.*?)<\/script>/s);
      if (scriptMatch) {
        const scriptContent = scriptMatch[1];
        const dataMatch = scriptContent.match(/ytInitialData["\s]*[:=]\s*({.*?}),?\s*["\n]/);
        if (dataMatch) {
          return JSON.parse(dataMatch[1]);
        }
      }
      
      return null;
    } catch (error) {
      console.error('❌ Failed to extract alternative YT data:', error);
      return null;
    }
  }

  extractVideosFromData(data) {
    const videos = [];
    
    try {
      // Navigate through the complex YouTube data structure
      const tabs = data?.contents?.twoColumnBrowseResultsRenderer?.tabs;
      if (!tabs) return videos;

      // Find the videos tab (usually index 1)
      const videosTab = tabs.find(tab => 
        tab?.tabRenderer?.content?.richGridRenderer?.contents
      );
      
      if (!videosTab) return videos;

      const contents = videosTab.tabRenderer.content.richGridRenderer.contents;
      
      contents.forEach(item => {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (videoRenderer) {
          const video = this.parseVideoRenderer(videoRenderer);
          if (video) {
            videos.push(video);
          }
        }
      });
      
    } catch (error) {
      console.error('❌ Failed to extract videos from data:', error);
    }
    
    return videos;
  }

  parseVideoRenderer(videoRenderer) {
    try {
      const videoId = videoRenderer.videoId;
      const title = videoRenderer.title?.runs?.[0]?.text || 
                   videoRenderer.title?.simpleText || 
                   'Untitled Video';
      const publishedText = videoRenderer.publishedTimeText?.simpleText || 
                           videoRenderer.publishedTimeText?.runs?.[0]?.text;
      
      if (!videoId || !publishedText) {
        return null;
      }
      
      const publishedTimestamp = this.parsePublishedTime(publishedText);
      
      // Get thumbnail
      const thumbnail = videoRenderer.thumbnail?.thumbnails?.[0]?.url;
      
      // Get view count
      const viewCountText = videoRenderer.viewCountText?.simpleText || 
                           videoRenderer.shortViewCountText?.simpleText;
      
      // Get duration
      const duration = videoRenderer.lengthText?.simpleText;
      
      return {
        id: videoId,
        title: title.trim(),
        url: `https://www.youtube.com/watch?v=${videoId}`,
        published: publishedText,
        publishedTimestamp: publishedTimestamp,
        discoveredAt: Date.now(),
        thumbnail: thumbnail,
        viewCount: viewCountText,
        duration: duration
      };
      
    } catch (error) {
      console.error('❌ Failed to parse video renderer:', error);
      return null;
    }
  }

  extractVideosWithRegex(html) {
    const videos = [];
    
    try {
      // Extract video IDs using regex
      const videoIdPattern = /"videoId":"([a-zA-Z0-9_-]{11})"/g;
      const titlePattern = /"title":{"runs":\[{"text":"([^"]+)"/g;
      const publishedPattern = /"publishedTimeText":{"simpleText":"([^"]+)"/g;
      
      let videoMatch;
      const videoIds = [];
      
      while ((videoMatch = videoIdPattern.exec(html)) !== null) {
        videoIds.push(videoMatch[1]);
      }
      
      // Take only unique video IDs
      const uniqueVideoIds = [...new Set(videoIds)].slice(0, 20);
      
      uniqueVideoIds.forEach(videoId => {
        videos.push({
          id: videoId,
          title: 'Video Title Not Available',
          url: `https://www.youtube.com/watch?v=${videoId}`,
          published: 'Recently',
          publishedTimestamp: Date.now() - (60 * 60 * 1000), // 1 hour ago as fallback
          discoveredAt: Date.now()
        });
      });
      
    } catch (error) {
      console.error('❌ Regex extraction failed:', error);
    }
    
    return videos;
  }

  parsePublishedTime(publishedText) {
    const now = Date.now();
    const text = publishedText.toLowerCase().trim();
    
    // Handle "Streamed X ago" format
    const streamedMatch = text.match(/streamed\s+(.+)\s+ago/);
    if (streamedMatch) {
      return this.parseTimeAgo(streamedMatch[1], now);
    }
    
    // Handle standard "X ago" format
    const agoMatch = text.match(/(.+)\s+ago/);
    if (agoMatch) {
      return this.parseTimeAgo(agoMatch[1], now);
    }
    
    // Handle special cases
    if (text.includes('yesterday')) {
      return now - (24 * 60 * 60 * 1000);
    }
    
    if (text.includes('today') || text.includes('now')) {
      return now - (60 * 1000); // 1 minute ago
    }
    
    // If we can't parse it, assume it's recent
    return now - (24 * 60 * 60 * 1000); // 1 day ago as fallback
  }

  parseTimeAgo(timeText, now) {
    const timeMatch = timeText.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?/);
    
    if (timeMatch) {
      const amount = parseInt(timeMatch[1]);
      const unit = timeMatch[2];
      
      const multipliers = {
        second: 1000,
        minute: 60 * 1000,
        hour: 60 * 60 * 1000,
        day: 24 * 60 * 60 * 1000,
        week: 7 * 24 * 60 * 60 * 1000,
        month: 30 * 24 * 60 * 60 * 1000,
        year: 365 * 24 * 60 * 60 * 1000
      };
      
      return now - (amount * (multipliers[unit] || multipliers.day));
    }
    
    return now - (24 * 60 * 60 * 1000); // Default to 1 day ago
  }

  async getStoredVideos(channelUrl) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    const result = await this.getStorageData([key]);
    return result[key] || [];
  }

  async storeVideos(channelUrl, videos) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    
    // Keep only last 100 videos to prevent storage bloat
    const videosToStore = videos.slice(0, 100).map(video => ({
      ...video,
      // Add metadata for better tracking
      lastSeen: Date.now(),
      storageVersion: '1.1.0'
    }));
    
    await this.setStorageData({ [key]: videosToStore });
  }

  hashUrl(url) {
    let hash = 0;
    for (let i = 0; i < url.length; i++) {
      const char = url.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString();
  }

  async getTimeFilter() {
    const result = await this.getStorageData(['timeFilter']);
    return result.timeFilter || '1day';
  }

  async getTimeFilterTimestamp(filter) {
    const now = Date.now();
    
    const timeMap = {
      '1hour': 60 * 60 * 1000,
      '1day': 24 * 60 * 60 * 1000,
      '1week': 7 * 24 * 60 * 60 * 1000,
      '1month': 30 * 24 * 60 * 60 * 1000,
      '1year': 365 * 24 * 60 * 60 * 1000
    };
    
    if (filter === 'lastcheck') {
      const result = await this.getStorageData(['lastManualCheck']);
      return result.lastManualCheck || (now - 24 * 60 * 60 * 1000);
    }
    
    return now - (timeMap[filter] || timeMap['1day']);
  }

  async getLastManualCheckTime() {
    const result = await this.getStorageData(['lastManualCheck']);
    return result.lastManualCheck || (Date.now() - 24 * 60 * 60 * 1000);
  }

  async setLastManualCheckTime() {
    await this.setStorageData({ lastManualCheck: Date.now() });
  }

  async showNotification(title, message, videoUrl = '', options = {}) {
    try {
      const settings = await this.getStorageData(['notifications']);
      
      if (!settings.notifications) return;

      // Check notification permission
      if (!('Notification' in self) || Notification.permission !== 'granted') {
        console.log('🔕 Notifications not permitted');
        return;
      }

      const notificationOptions = {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon48.png'),
        title: title,
        message: message,
        priority: options.priority || 1,
        ...options
      };

      // Add action buttons for video notifications
      if (videoUrl) {
        notificationOptions.buttons = [
          { title: '▶️ Watch Now' },
          { title: '🔗 Copy Link' }
        ];
      }

      const notificationId = await chrome.notifications.create(notificationOptions);
      
      console.log(`🔔 Notification shown: ${title}`);

      // Handle notification clicks
      const clickListener = (id, buttonIndex) => {
        if (id === notificationId) {
          if (buttonIndex === 0 && videoUrl) {
            // Watch Now
            chrome.tabs.create({ url: videoUrl });
          } else if (buttonIndex === 1 && videoUrl) {
            // Copy Link
            navigator.clipboard.writeText(videoUrl).catch(console.error);
          }
          chrome.notifications.clear(id);
          chrome.notifications.onButtonClicked.removeListener(clickListener);
        }
      };

      const mainClickListener = (id) => {
        if (id === notificationId && videoUrl) {
          chrome.tabs.create({ url: videoUrl });
          chrome.notifications.clear(id);
          chrome.notifications.onClicked.removeListener(mainClickListener);
        }
      };

      chrome.notifications.onButtonClicked.addListener(clickListener);
      chrome.notifications.onClicked.addListener(mainClickListener);

      // Auto-clear notification after 15 seconds
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
        chrome.notifications.onButtonClicked.removeListener(clickListener);
        chrome.notifications.onClicked.removeListener(mainClickListener);
      }, 15000);

    } catch (error) {
      console.error('❌ Failed to show notification:', error);
    }
  }

  async updateBadge(text, color = '#FF0000') {
    try {
      await chrome.action.setBadgeText({ text: text.toString() });
      await chrome.action.setBadgeBackgroundColor({ color: color });
    } catch (error) {
      console.error('❌ Failed to update badge:', error);
    }
  }

  async checkAllChannels(isManualCheck = false) {
    const checkStartTime = Date.now();
    console.log(`🔍 Starting channel check... (manual: ${isManualCheck})`);
    
    try {
      // Update badge to show checking status
      await this.updateBadge('...', '#FFA500');
      
      const bookmarks = await this.getChannelBookmarks();
      if (bookmarks.length === 0) {
        console.log('📭 No YouTube channel bookmarks found in Vid folder');
        await this.storeChannelResults([], 'none');
        await this.updateBadge('');
        return;
      }

      const timeFilter = await this.getTimeFilter();
      const filterTimestamp = await this.getTimeFilterTimestamp(timeFilter);

      let totalNewVideos = 0;
      const channelResults = [];
      const newVideosForNotification = [];
      const errors = [];

      console.log(`📊 Processing ${bookmarks.length} channels with ${timeFilter} filter`);

      // Process channels with controlled concurrency
      const batchSize = 3;
      for (let i = 0; i < bookmarks.length; i += batchSize) {
        const batch = bookmarks.slice(i, i + batchSize);
        const batchPromises = batch.map(bookmark => this.processChannel(bookmark, filterTimestamp));
        
        const batchResults = await Promise.allSettled(batchPromises);
        
        batchResults.forEach((result, batchIndex) => {
          const bookmark = batch[batchIndex];
          
          if (result.status === 'fulfilled' && result.value) {
            const channelResult = result.value;
            channelResults.push(channelResult);
            
            const newCount = channelResult.newVideos?.length || 0;
            totalNewVideos += newCount;
            
            if (newCount > 0) {
              console.log(`✨ Found ${newCount} new videos for ${bookmark.title}`);
              
              // Collect new videos for notifications
              channelResult.newVideos.forEach(video => {
                newVideosForNotification.push({
                  channelTitle: bookmark.title,
                  videoTitle: video.title,
                  videoUrl: video.url,
                  thumbnail: video.thumbnail
                });
              });
            }
          } else {
            console.error(`❌ Failed to process ${bookmark.title}:`, result.reason);
            errors.push({
              channelTitle: bookmark.title,
              error: result.reason?.message || 'Unknown error'
            });
            
            channelResults.push({
              channelTitle: bookmark.title,
              channelUrl: bookmark.url,
              error: result.reason?.message || 'Failed to fetch videos',
              newVideos: [],
              filteredVideos: [],
              totalVideos: 0
            });
          }
        });
        
        // Small delay between batches to avoid overwhelming the server
        if (i + batchSize < bookmarks.length) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }

      // Store channel results for popup display
      await this.storeChannelResults(channelResults, timeFilter);

      // Update badge and show notifications
      await this.handleCheckResults(totalNewVideos, newVideosForNotification, channelResults);

      // Update last check time
      const checkDuration = Date.now() - checkStartTime;
      await this.setStorageData({ 
        lastCheck: Date.now(),
        lastCheckSuccess: errors.length === 0,
        lastCheckDuration: checkDuration,
        stats: this.stats
      });
      
      if (isManualCheck) {
        await this.setLastManualCheckTime();
      }

      console.log(`✅ Check completed in ${checkDuration}ms. Found ${totalNewVideos} new videos across ${channelResults.length} channels.`);
      
      if (errors.length > 0) {
        console.warn(`⚠️ ${errors.length} channels had errors:`, errors);
      }

    } catch (error) {
      console.error('❌ Channel check failed:', error);
      await this.updateBadge('!', '#FF6B6B');
      await this.setStorageData({ 
        lastCheck: Date.now(),
        lastCheckSuccess: false
      });
    }
  }

  async processChannel(bookmark, filterTimestamp) {
    try {
      console.log(`🔍 Processing ${bookmark.title}...`);
      
      const currentVideos = await this.fetchChannelVideos(bookmark.url);
      if (!currentVideos) {
        throw new Error('Failed to fetch videos - check if channel exists and is public');
      }

      const storedVideos = await this.getStoredVideos(bookmark.url);
      const storedIds = new Set(storedVideos.map(v => v.id));
      
      // Find truly new videos (not in stored data)
      const newVideos = currentVideos.filter(video => !storedIds.has(video.id));
      
      // Find videos within time filter (including both new and existing)
      const filteredVideos = currentVideos.filter(video => 
        video.publishedTimestamp >= filterTimestamp
      );

      // Sort videos by published timestamp (newest first)
      filteredVideos.sort((a, b) => b.publishedTimestamp - a.publishedTimestamp);

      // Update stored videos if there are new ones
      if (newVideos.length > 0) {
        await this.storeVideos(bookmark.url, currentVideos);
        this.stats.totalVideosFound += newVideos.length;
      }

      return {
        channelTitle: bookmark.title,
        channelUrl: bookmark.url,
        newVideos: newVideos,
        filteredVideos: filteredVideos,
        totalVideos: currentVideos.length,
        lastChecked: Date.now()
      };

    } catch (error) {
      throw error;
    }
  }

  async handleCheckResults(totalNewVideos, newVideosForNotification, channelResults) {
    if (totalNewVideos > 0) {
      // Update badge
      const badgeText = totalNewVideos > 99 ? '99+' : totalNewVideos.toString();
      await this.updateBadge(badgeText, '#00C851');

      // Show notifications
      if (newVideosForNotification.length === 1) {
        const video = newVideosForNotification[0];
        await this.showNotification(
          `New video from ${video.channelTitle}`,
          video.videoTitle,
          video.videoUrl,
          { 
            priority: 2,
            iconUrl: video.thumbnail || chrome.runtime.getURL('icons/icon48.png')
          }
        );
      } else if (newVideosForNotification.length > 1) {
        const activeChannels = channelResults.filter(ch => ch.newVideos.length > 0).length;
        await this.showNotification(
          `${totalNewVideos} new videos found!`,
          `From ${activeChannels} channel${activeChannels > 1 ? 's' : ''}`,
          '',
          { priority: 1 }
        );
      }
    } else {
      await this.updateBadge('');
    }
  }

  async storeChannelResults(results, timeFilter) {
    await this.setStorageData({ 
      channelResults: results,
      lastTimeFilter: timeFilter,
      lastResultsUpdate: Date.now()
    });
  }
}

// Initialize the monitor
const monitor = new YouTubeChannelMonitor();

// Enhanced message listener for popup communication
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('📨 Received message:', message.action);
  
  if (message.action === 'checkNow') {
    monitor.checkAllChannels(true)
      .then(() => {
        console.log('✅ Manual check completed successfully');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('❌ Manual check failed:', error);
        sendResponse({ 
          success: false, 
          error: error.message || 'Check failed' 
        });
      });
    return true; // Will respond asynchronously
  }
  
  if (message.action === 'getStatus') {
    monitor.getStorageData(['lastCheck', 'lastCheckSuccess', 'stats', 'lastCheckDuration'])
      .then((result) => {
        sendResponse({
          lastCheck: result.lastCheck,
          lastCheckSuccess: result.lastCheckSuccess !== false,
          stats: result.stats || monitor.stats,
          lastCheckDuration: result.lastCheckDuration
        });
      })
      .catch((error) => {
        console.error('❌ Failed to get status:', error);
        sendResponse({
          lastCheck: null,
          lastCheckSuccess: false,
          error: error.message
        });
      });
    return true;
  }

  if (message.action === 'getPerformanceStats') {
    sendResponse({
      stats: monitor.stats,
      activeRequests: monitor.activeRequests,
      queueLength: monitor.requestQueue.length
    });
    return true;
  }

  if (message.action === 'clearCache') {
    monitor.getStorageData(null)
      .then((items) => {
        const cacheKeys = Object.keys(items).filter(key => key.startsWith('videos_'));
        if (cacheKeys.length > 0) {
          return new Promise((resolve) => {
            chrome.storage.local.remove(cacheKeys, resolve);
          });
        }
      })
      .then(() => {
        console.log('🧹 Cache cleared');
        sendResponse({ success: true });
      })
      .catch((error) => {
        console.error('❌ Failed to clear cache:', error);
        sendResponse({ success: false, error: error.message });
      });
    return true;
  }
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  console.log(`🚀 YouTube Channel Monitor ${details.reason}`);
  
  if (details.reason === 'install') {
    console.log('🎉 YouTube Channel Monitor installed');
    
    // Set default settings
    monitor.setStorageData({
      checkInterval: 15,
      timeFilter: '1day',
      notifications: false,
      autoOpen: 'current',
      viewMode: 'list',
      darkMode: false,
      installDate: Date.now(),
      version: '1.1.0'
    });
    
    // Show welcome notification
    setTimeout(() => {
      monitor.showNotification(
        'YouTube Channel Monitor Installed!',
        'Create a "Vid" bookmarks folder and add YouTube channels to get started.',
        '',
        { priority: 2 }
      );
    }, 2000);
    
  } else if (details.reason === 'update') {
    console.log(`🔄 YouTube Channel Monitor updated from ${details.previousVersion}`);
    
    // Perform any necessary migration
    // monitor.performMigration(details.previousVersion);
  }
});

// Handle startup
chrome.runtime.onStartup.addListener(() => {
  console.log('🌅 Browser startup detected, initializing monitor...');
  monitor.stats = {
    totalChecks: 0,
    successfulChecks: 0,
    failedChecks: 0,
    totalVideosFound: 0,
    averageResponseTime: 0
  };
});

// Add periodic health check
setInterval(() => {
  console.log('🏥 Health check:', {
    activeRequests: monitor.activeRequests,
    queueLength: monitor.requestQueue.length,
    stats: monitor.stats
  });
  
  // Reset stats if they get too large
  if (monitor.stats.totalChecks > 10000) {
    monitor.stats = {
      totalChecks: 0,
      successfulChecks: 0,
      failedChecks: 0,
      totalVideosFound: 0,
      averageResponseTime: 0
    };
    console.log('📊 Stats reset due to high count');
  }
}, 300000); // Every 5 minutes

// Handle extension suspension/resume
chrome.runtime.onSuspend.addListener(() => {
  console.log('😴 Extension suspending...');
});

chrome.runtime.onSuspendCanceled.addListener(() => {
  console.log('😊 Extension suspension canceled');
});

// Export monitor instance for debugging
if (typeof globalThis !== 'undefined') {
  globalThis.monitor = monitor;
}