class PopupController {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.updateChannelsList();
    await this.updateNotificationsList();
    await this.updateStatus();
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('checkInterval').addEventListener('change', (e) => {
      this.saveCheckInterval(parseInt(e.target.value));
    });

    document.getElementById('checkNow').addEventListener('click', () => {
      this.checkNow();
    });

    document.getElementById('clearNotifications').addEventListener('click', () => {
      this.clearNotifications();
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['checkInterval'], (result) => {
        const interval = result.checkInterval || 15;
        document.getElementById('checkInterval').value = interval;
        resolve();
      });
    });
  }

  async saveCheckInterval(minutes) {
    chrome.storage.local.set({ checkInterval: minutes });
    
    // Update the alarm
    chrome.alarms.clear('checkChannels');
    chrome.alarms.create('checkChannels', { periodInMinutes: minutes });
  }

  async checkNow() {
    const button = document.getElementById('checkNow');
    button.textContent = 'Checking...';
    button.disabled = true;

    // Send message to background script
    chrome.runtime.sendMessage({ action: 'checkNow' });

    setTimeout(async () => {
      await this.updateNotificationsList();
      await this.updateStatus();
      button.textContent = 'Check Now';
      button.disabled = false;
    }, 3000);
  }

  async clearNotifications() {
    chrome.storage.local.set({ notifications: {} });
    chrome.action.setBadgeText({ text: '' });
    await this.updateNotificationsList();
  }

  async updateChannelsList() {
    const channelsList = document.getElementById('channelsList');
    
    try {
      const channels = await this.getChannelBookmarks();
      
      if (channels.length === 0) {
        channelsList.innerHTML = `
          <div class="loading">
            No channels found. Create a "Vid" bookmarks folder and add YouTube channel /videos pages.
          </div>
        `;
        return;
      }

      channelsList.innerHTML = channels.map(channel => `
        <div class="channel-item">
          <div class="channel-title">${this.escapeHtml(channel.title)}</div>
          <div class="channel-url">${this.escapeHtml(channel.url)}</div>
        </div>
      `).join('');
    } catch (error) {
      channelsList.innerHTML = '<div class="loading">Error loading channels</div>';
    }
  }

  async updateNotificationsList() {
    const notificationsList = document.getElementById('notificationsList');
    
    try {
      const notifications = await this.getStoredNotifications();
      const notificationEntries = Object.entries(notifications);
      
      if (notificationEntries.length === 0) {
        notificationsList.innerHTML = '<div class="loading">No new videos</div>';
        return;
      }

      notificationsList.innerHTML = notificationEntries.map(([key, notification]) => `
        <div class="notification-item">
          <div class="channel-title">
            ${this.escapeHtml(notification.channelTitle)}
            <span class="new-badge">${notification.newVideos.length} new</span>
          </div>
          ${notification.newVideos.map(video => `
            <div class="video-item">
              <div class="video-title" onclick="window.open('${video.url}', '_blank')">
                ${this.escapeHtml(video.title)}
              </div>
              <div class="video-published">${this.escapeHtml(video.published)}</div>
            </div>
          `).join('')}
        </div>
      `).join('');
    } catch (error) {
      notificationsList.innerHTML = '<div class="loading">Error loading notifications</div>';
    }
  }

  async updateStatus() {
    const status = document.getElementById('status');
    
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['lastCheck'], resolve);
      });
      
      if (result.lastCheck) {
        const lastCheck = new Date(result.lastCheck);
        status.textContent = `Last checked: ${lastCheck.toLocaleTimeString()}`;
      } else {
        status.textContent = 'Never checked';
      }
    } catch (error) {
      status.textContent = 'Status unknown';
    }
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

  async findVidFolder() {
    return new Promise((resolve) => {
      chrome.bookmarks.search({ title: this.FOLDER_NAME }, (results) => {
        const folder = results.find(item => !item.url);
        resolve(folder);
      });
    });
  }

  async getStoredNotifications() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['notifications'], (result) => {
        resolve(result.notifications || {});
      });
    });
  }

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupController();
});