// YouTube Channel Monitor - Enhanced Background Script
class YouTubeChannelMonitor {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.CHECK_INTERVAL = 15; // minutes
    this.MAX_RETRIES = 3;
    this.RETRY_DELAY = 5000; // 5 seconds
    this.init();
  }

  async init() {
    // Get saved settings
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['checkInterval', 'notifications'], resolve);
    });
    
    const interval = result.checkInterval || this.CHECK_INTERVAL;
    const notifications = result.notifications || false;

    // Set up alarm for periodic checks
    chrome.alarms.create('checkChannels', { periodInMinutes: interval });
    
    // Listen for alarm
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkChannels') {
        this.checkAllChannels(false);
      }
    });

    // Listen for storage changes to update alarm
    chrome.storage.onChanged.addListener((changes) => {
      if (changes.checkInterval) {
        chrome.alarms.clear('checkChannels');
        chrome.alarms.create('checkChannels', { 
          periodInMinutes: changes.checkInterval.newValue 
        });
      }
    });

    // Initial check on startup (delayed to avoid conflicts)
    setTimeout(() => this.checkAllChannels(false), 5000);
  }

  async findVidFolder() {
    return new Promise((resolve) => {
      chrome.bookmarks.search({ title: this.FOLDER_NAME }, (results) => {
        const folder = results.find(item => !item.url); // folders don't have URLs
        resolve(folder);
      });
    });
  }

  async getChannelBookmarks() {
    const folder = await this.findVidFolder();
    if (!folder) return [];

    return new Promise((resolve) => {
      chrome.bookmarks.getChildren(folder.id, (children) => {
        const channelBookmarks = children.filter(bookmark => 
          bookmark.url && 
          bookmark.url.includes('youtube.com/@') && 
          bookmark.url.includes('/videos')
        );
        resolve(channelBookmarks);
      });
    });
  }

  async fetchChannelVideos(channelUrl, retryCount = 0) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout

      const response = await fetch(channelUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.5',
          'Accept-Encoding': 'gzip, deflate, br',
          'DNT': '1',
          'Connection': 'keep-alive',
          'Upgrade-Insecure-Requests': '1'
        },
        signal: controller.signal
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const html = await response.text();
      return this.parseVideosFromHTML(html);
    } catch (error) {
      console.error(`Failed to fetch ${channelUrl} (attempt ${retryCount + 1}):`, error);
      
      if (retryCount < this.MAX_RETRIES && !error.name === 'AbortError') {
        console.log(`Retrying in ${this.RETRY_DELAY}ms...`);
        await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY));
        return this.fetchChannelVideos(channelUrl, retryCount + 1);
      }
      
      return null;
    }
  }

  parseVideosFromHTML(html) {
    const videos = [];
    
    try {
      // Method 1: Try to extract from ytInitialData
      const scriptMatch = html.match(/var ytInitialData = ({.*?});/);
      if (scriptMatch) {
        const data = JSON.parse(scriptMatch[1]);
        const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[1]?.tabRenderer?.content?.richGridRenderer?.contents;
        
        if (contents) {
          contents.forEach(item => {
            const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
            if (videoRenderer) {
              const videoId = videoRenderer.videoId;
              const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText;
              const publishedText = videoRenderer.publishedTimeText?.simpleText;
              
              if (videoId && title && publishedText) {
                const publishedTimestamp = this.parsePublishedTime(publishedText);
                
                videos.push({
                  id: videoId,
                  title: title,
                  url: `https://www.youtube.com/watch?v=${videoId}`,
                  published: publishedText,
                  publishedTimestamp: publishedTimestamp,
                  discoveredAt: Date.now()
                });
              }
            }
          });
        }
      }

      // Method 2: Fallback - try to extract from alternative patterns
      if (videos.length === 0) {
        const altScriptMatch = html.match(/window\["ytInitialData"\] = ({.*?});/);
        if (altScriptMatch) {
          const data = JSON.parse(altScriptMatch[1]);
          // Similar parsing logic as above
          const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[1]?.tabRenderer?.content?.richGridRenderer?.contents;
          
          if (contents) {
            contents.forEach(item => {
              const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
              if (videoRenderer) {
                const videoId = videoRenderer.videoId;
                const title = videoRenderer.title?.runs?.[0]?.text || videoRenderer.title?.simpleText;
                const publishedText = videoRenderer.publishedTimeText?.simpleText;
                
                if (videoId && title && publishedText) {
                  const publishedTimestamp = this.parsePublishedTime(publishedText);
                  
                  videos.push({
                    id: videoId,
                    title: title,
                    url: `https://www.youtube.com/watch?v=${videoId}`,
                    published: publishedText,
                    publishedTimestamp: publishedTimestamp,
                    discoveredAt: Date.now()
                  });
                }
              }
            });
          }
        }
      }

    } catch (error) {
      console.error('Failed to parse YouTube data:', error);
    }

    return videos.slice(0, 50); // Limit to 50 most recent videos
  }

  parsePublishedTime(publishedText) {
    const now = Date.now();
    const text = publishedText.toLowerCase().trim();
    
    // Handle different time formats
    const timeMatch = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)s?\s*ago/);
    
    if (timeMatch) {
      const amount = parseInt(timeMatch[1]);
      const unit = timeMatch[2];
      
      switch (unit) {
        case 'second':
          return now - (amount * 1000);
        case 'minute':
          return now - (amount * 60 * 1000);
        case 'hour':
          return now - (amount * 60 * 60 * 1000);
        case 'day':
          return now - (amount * 24 * 60 * 60 * 1000);
        case 'week':
          return now - (amount * 7 * 24 * 60 * 60 * 1000);
        case 'month':
          return now - (amount * 30 * 24 * 60 * 60 * 1000);
        case 'year':
          return now - (amount * 365 * 24 * 60 * 60 * 1000);
      }
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

  async getStoredVideos(channelUrl) {
    return new Promise((resolve) => {
      const key = `videos_${this.hashUrl(channelUrl)}`;
      chrome.storage.local.get([key], (result) => {
        resolve(result[key] || []);
      });
    });
  }

  async storeVideos(channelUrl, videos) {
    const key = `videos_${this.hashUrl(channelUrl)}`;
    
    // Keep only last 100 videos to prevent storage bloat
    const videosToStore = videos.slice(0, 100);
    
    chrome.storage.local.set({ [key]: videosToStore });
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
    return new Promise((resolve) => {
      chrome.storage.local.get(['timeFilter'], (result) => {
        resolve(result.timeFilter || '1day');
      });
    });
  }

  async getTimeFilterTimestamp(filter) {
    const now = Date.now();
    
    switch (filter) {
      case '1hour':
        return now - (60 * 60 * 1000);
      case '1day':
        return now - (24 * 60 * 60 * 1000);
      case '1week':
        return now - (7 * 24 * 60 * 60 * 1000);
      case '1month':
        return now - (30 * 24 * 60 * 60 * 1000);
      case '1year':
        return now - (365 * 24 * 60 * 60 * 1000);
      case 'lastcheck':
        return await this.getLastManualCheckTime();
      default:
        return now - (24 * 60 * 60 * 1000);
    }
  }

  async getLastManualCheckTime() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['lastManualCheck'], (result) => {
        resolve(result.lastManualCheck || (Date.now() - 24 * 60 * 60 * 1000));
      });
    });
  }

  async setLastManualCheckTime() {
    chrome.storage.local.set({ lastManualCheck: Date.now() });
  }

  async showNotification(title, message, videoUrl = '') {
    const settings = await new Promise((resolve) => {
      chrome.storage.local.get(['notifications'], resolve);
    });
    
    if (!settings.notifications) return;

    try {
      const notificationId = await chrome.notifications.create({
        type: 'basic',
        iconUrl: 'icons/icon48.png',
        title: title,
        message: message,
        buttons: videoUrl ? [{ title: 'Watch Now' }] : undefined
      });

      if (videoUrl) {
        chrome.notifications.onButtonClicked.addListener((id, buttonIndex) => {
          if (id === notificationId && buttonIndex === 0) {
            chrome.tabs.create({ url: videoUrl });
            chrome.notifications.clear(id);
          }
        });
      }

      // Auto-clear notification after 10 seconds
      setTimeout(() => {
        chrome.notifications.clear(notificationId);
      }, 10000);
    } catch (error) {
      console.error('Failed to show notification:', error);
    }
  }

  async checkAllChannels(isManualCheck = false) {
    console.log('Checking channels for new videos...');
    
    const bookmarks = await this.getChannelBookmarks();
    if (bookmarks.length === 0) {
      console.log('No YouTube channel bookmarks found in Vid folder');
      await this.storeChannelResults([], 'none');
      return;
    }

    const timeFilter = await this.getTimeFilter();
    const filterTimestamp = await this.getTimeFilterTimestamp(timeFilter);

    let totalNewVideos = 0;
    const channelResults = [];
    const newVideosForNotification = [];

    for (const bookmark of bookmarks) {
      try {
        console.log(`Checking ${bookmark.title}...`);
        
        const currentVideos = await this.fetchChannelVideos(bookmark.url);
        if (!currentVideos) {
          channelResults.push({
            channelTitle: bookmark.title,
            channelUrl: bookmark.url,
            error: 'Failed to fetch videos - check if channel exists and is public',
            newVideos: [],
            filteredVideos: [],
            totalVideos: 0
          });
          continue;
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

        channelResults.push({
          channelTitle: bookmark.title,
          channelUrl: bookmark.url,
          newVideos: newVideos,
          filteredVideos: filteredVideos,
          totalVideos: currentVideos.length
        });
        
        if (newVideos.length > 0) {
          console.log(`Found ${newVideos.length} new videos for ${bookmark.title}`);
          totalNewVideos += newVideos.length;
          
          // Collect new videos for notifications
          newVideos.forEach(video => {
            newVideosForNotification.push({
              channelTitle: bookmark.title,
              videoTitle: video.title,
              videoUrl: video.url
            });
          });
          
          // Update stored videos with rate limiting
          await this.storeVideos(bookmark.url, currentVideos);
          
          // Small delay to avoid overwhelming the system
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Error checking ${bookmark.title}:`, error);
        channelResults.push({
          channelTitle: bookmark.title,
          channelUrl: bookmark.url,
          error: error.message,
          newVideos: [],
          filteredVideos: [],
          totalVideos: 0
        });
      }
    }

    // Store channel results for popup display
    await this.storeChannelResults(channelResults, timeFilter);

    // Update badge and show notifications
    if (totalNewVideos > 0) {
      // Update badge
      const badgeText = totalNewVideos > 99 ? '99+' : totalNewVideos.toString();
      chrome.action.setBadgeText({ text: badgeText });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });

      // Show notification for new videos
      if (newVideosForNotification.length === 1) {
        const video = newVideosForNotification[0];
        await this.showNotification(
          `New video from ${video.channelTitle}`,
          video.videoTitle,
          video.videoUrl
        );
      } else if (newVideosForNotification.length > 1) {
        await this.showNotification(
          `${totalNewVideos} new videos found`,
          `From ${channelResults.filter(ch => ch.newVideos.length > 0).length} channels`
        );
      }
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    // Update last check time
    chrome.storage.local.set({ 
      lastCheck: Date.now(),
      lastCheckSuccess: totalNewVideos >= 0 // Consider it success if we got any result
    });
    
    if (isManualCheck) {
      await this.setLastManualCheckTime();
    }

    console.log(`Check completed. Found ${totalNewVideos} new videos across ${channelResults.length} channels.`);
  }

  async storeChannelResults(results, timeFilter) {
    chrome.storage.local.set({ 
      channelResults: results,
      lastTimeFilter: timeFilter,
      lastResultsUpdate: Date.now()
    });
  }
}

// Initialize the monitor
const monitor = new YouTubeChannelMonitor();

// Add message listener for manual checks and other actions
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'checkNow') {
    monitor.checkAllChannels(true).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      console.error('Manual check failed:', error);
      sendResponse({ success: false, error: error.message });
    });
    return true; // Will respond asynchronously
  }
  
  if (message.action === 'getStatus') {
    chrome.storage.local.get(['lastCheck', 'lastCheckSuccess'], (result) => {
      sendResponse({
        lastCheck: result.lastCheck,
        lastCheckSuccess: result.lastCheckSuccess !== false
      });
    });
    return true;
  }
});

// Handle extension installation/update
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    console.log('YouTube Channel Monitor installed');
    // Set default settings
    chrome.storage.local.set({
      checkInterval: 15,
      timeFilter: '1day',
      notifications: false,
      autoOpen: 'current',
      viewMode: 'list'
    });
  } else if (details.reason === 'update') {
    console.log('YouTube Channel Monitor updated');
    // Perform any necessary migration here
  }
});