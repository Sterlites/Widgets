// YouTube Channel Monitor - Background Script
class YouTubeChannelMonitor {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.CHECK_INTERVAL = 15; // minutes
    this.init();
  }

  async init() {
    // Get saved check interval
    const result = await new Promise((resolve) => {
      chrome.storage.local.get(['checkInterval'], resolve);
    });
    const interval = result.checkInterval || this.CHECK_INTERVAL;

    // Set up alarm for periodic checks
    chrome.alarms.create('checkChannels', { periodInMinutes: interval });
    
    // Listen for alarm
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkChannels') {
        this.checkAllChannels(false);
      }
    });

    // Initial check on startup
    setTimeout(() => this.checkAllChannels(false), 2000);
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
          bookmark.url && bookmark.url.includes('youtube.com/@') && bookmark.url.includes('/videos')
        );
        resolve(channelBookmarks);
      });
    });
  }

  async fetchChannelVideos(channelUrl) {
    try {
      const response = await fetch(channelUrl, {
        method: 'GET',
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const html = await response.text();
      return this.parseVideosFromHTML(html);
    } catch (error) {
      console.error(`Failed to fetch ${channelUrl}:`, error);
      return null;
    }
  }

  parseVideosFromHTML(html) {
    const videos = [];
    
    // Extract video data from YouTube's initial data
    const scriptMatch = html.match(/var ytInitialData = ({.*?});/);
    if (!scriptMatch) return videos;

    try {
      const data = JSON.parse(scriptMatch[1]);
      const contents = data?.contents?.twoColumnBrowseResultsRenderer?.tabs?.[1]?.tabRenderer?.content?.richGridRenderer?.contents;
      
      if (!contents) return videos;

      contents.forEach(item => {
        const videoRenderer = item?.richItemRenderer?.content?.videoRenderer;
        if (videoRenderer) {
          const videoId = videoRenderer.videoId;
          const title = videoRenderer.title?.runs?.[0]?.text;
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
    } catch (error) {
      console.error('Failed to parse YouTube data:', error);
    }

    return videos;
  }

  parsePublishedTime(publishedText) {
    const now = Date.now();
    const text = publishedText.toLowerCase();
    
    // Handle different time formats
    if (text.includes('minute')) {
      const minutes = parseInt(text.match(/\d+/)?.[0] || 0);
      return now - (minutes * 60 * 1000);
    } else if (text.includes('hour')) {
      const hours = parseInt(text.match(/\d+/)?.[0] || 0);
      return now - (hours * 60 * 60 * 1000);
    } else if (text.includes('day')) {
      const days = parseInt(text.match(/\d+/)?.[0] || 0);
      return now - (days * 24 * 60 * 60 * 1000);
    } else if (text.includes('week')) {
      const weeks = parseInt(text.match(/\d+/)?.[0] || 0);
      return now - (weeks * 7 * 24 * 60 * 60 * 1000);
    } else if (text.includes('month')) {
      const months = parseInt(text.match(/\d+/)?.[0] || 0);
      return now - (months * 30 * 24 * 60 * 60 * 1000);
    } else if (text.includes('year')) {
      const years = parseInt(text.match(/\d+/)?.[0] || 0);
      return now - (years * 365 * 24 * 60 * 60 * 1000);
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
    chrome.storage.local.set({ [key]: videos });
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

    for (const bookmark of bookmarks) {
      try {
        const currentVideos = await this.fetchChannelVideos(bookmark.url);
        if (!currentVideos) {
          channelResults.push({
            channelTitle: bookmark.title,
            channelUrl: bookmark.url,
            error: 'Failed to fetch videos',
            newVideos: [],
            filteredVideos: []
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
          
          // Update stored videos
          await this.storeVideos(bookmark.url, currentVideos);
        }
      } catch (error) {
        console.error(`Error checking ${bookmark.title}:`, error);
        channelResults.push({
          channelTitle: bookmark.title,
          channelUrl: bookmark.url,
          error: error.message,
          newVideos: [],
          filteredVideos: []
        });
      }
    }

    // Store channel results for popup display
    await this.storeChannelResults(channelResults, timeFilter);

    if (totalNewVideos > 0) {
      // Update badge
      chrome.action.setBadgeText({ text: totalNewVideos.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    } else {
      chrome.action.setBadgeText({ text: '' });
    }

    // Update last check time
    chrome.storage.local.set({ lastCheck: Date.now() });
    
    if (isManualCheck) {
      await this.setLastManualCheckTime();
    }
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

// Add message listener for manual checks
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
});