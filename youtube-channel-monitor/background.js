// YouTube Channel Monitor - Background Script
class YouTubeChannelMonitor {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.CHECK_INTERVAL = 15; // minutes
    this.init();
  }

  async init() {
    // Set up alarm for periodic checks
    chrome.alarms.create('checkChannels', { periodInMinutes: this.CHECK_INTERVAL });
    
    // Listen for alarm
    chrome.alarms.onAlarm.addListener((alarm) => {
      if (alarm.name === 'checkChannels') {
        this.checkAllChannels();
      }
    });

    // Initial check on startup
    setTimeout(() => this.checkAllChannels(), 2000);
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
          
          if (videoId && title) {
            videos.push({
              id: videoId,
              title: title,
              url: `https://www.youtube.com/watch?v=${videoId}`,
              published: publishedText || 'Unknown',
              timestamp: Date.now()
            });
          }
        }
      });
    } catch (error) {
      console.error('Failed to parse YouTube data:', error);
    }

    return videos;
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

  async checkAllChannels() {
    console.log('Checking channels for new videos...');
    
    const bookmarks = await this.getChannelBookmarks();
    if (bookmarks.length === 0) {
      console.log('No YouTube channel bookmarks found in Vid folder');
      return;
    }

    let totalNewVideos = 0;

    for (const bookmark of bookmarks) {
      try {
        const currentVideos = await this.fetchChannelVideos(bookmark.url);
        if (!currentVideos) continue;

        const storedVideos = await this.getStoredVideos(bookmark.url);
        const storedIds = new Set(storedVideos.map(v => v.id));
        
        const newVideos = currentVideos.filter(video => !storedIds.has(video.id));
        
        if (newVideos.length > 0) {
          console.log(`Found ${newVideos.length} new videos for ${bookmark.title}`);
          totalNewVideos += newVideos.length;
          
          // Store notification data
          await this.storeNewVideoNotification(bookmark, newVideos);
          
          // Update stored videos
          await this.storeVideos(bookmark.url, currentVideos);
        }
      } catch (error) {
        console.error(`Error checking ${bookmark.title}:`, error);
      }
    }

    if (totalNewVideos > 0) {
      // Update badge
      chrome.action.setBadgeText({ text: totalNewVideos.toString() });
      chrome.action.setBadgeBackgroundColor({ color: '#FF0000' });
    }

    // Update last check time
    chrome.storage.local.set({ lastCheck: Date.now() });
  }

  async storeNewVideoNotification(bookmark, newVideos) {
    const notifications = await this.getStoredNotifications();
    const channelKey = this.hashUrl(bookmark.url);
    
    notifications[channelKey] = {
      channelTitle: bookmark.title,
      channelUrl: bookmark.url,
      newVideos: newVideos,
      timestamp: Date.now()
    };
    
    chrome.storage.local.set({ notifications: notifications });
  }

  async getStoredNotifications() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['notifications'], (result) => {
        resolve(result.notifications || {});
      });
    });
  }
}

// Initialize the monitor
const monitor = new YouTubeChannelMonitor();