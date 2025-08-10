class PopupController {
  constructor() {
    this.settings = {};
    this.channelResults = [];
    this.filteredResults = [];
    this.searchQuery = '';
    this.sortBy = 'activity'; // Changed from 'name' to 'activity'
    this.timeFilter = '1day'; // This remains the same (Last 24 hours)
    this.isChecking = false;

    // Watch Later state
    this.watchLater = [];
    this.watchLaterMap = new Map();

    // View state: 'channels' or 'watchLater'
    this.view = 'channels';

    this.init();
  }

  async init() {
    try {
      await this.loadSettings();
      await this.loadWatchLater();
      await this.loadChannelResults();
      this.setupEventListeners();
      this.updateStatus();
      this.applyFilters();
      this.updateUI();
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showError('Failed to initialize popup');
    }
  }

  async loadSettings() {
    const result = await chrome.storage.local.get(['checkInterval', 'timeFilter', 'notifications', 'autoOpen']);
    this.settings = {
      checkInterval: result.checkInterval || 15,
      notifications: result.notifications || false,
      autoOpen: result.autoOpen || 'current'
    };

    // Set timeFilter from storage or default
    this.timeFilter = result.timeFilter || '1day';

    document.getElementById('checkInterval').value = this.settings.checkInterval;
    document.getElementById('timeFilter').value = this.timeFilter;
    document.getElementById('sortBy').value = 'activity'; // Set default sort to Activity
    document.getElementById('notifications').checked = this.settings.notifications;
  }

  async saveSettings() {
    await chrome.storage.local.set(this.settings);
  }

  async saveTimeFilter() {
    await chrome.storage.local.set({ timeFilter: this.timeFilter });
  }

  async loadChannelResults() {
    const result = await chrome.storage.local.get(['channelResults']);
    this.channelResults = result.channelResults || [];
  }

  async loadWatchLater() {
    try {
      const result = await chrome.runtime.sendMessage({ action: 'getWatchLater' });
      if (result && result.success) {
        this.watchLater = result.list || [];
        this.watchLaterMap = new Map(this.watchLater.map(v => [v.id, v]));
      } else {
        // Fallback to direct storage read if runtime message fails
        const res = await chrome.storage.local.get(['watchLaterVideos']);
        this.watchLater = res.watchLaterVideos || [];
        this.watchLaterMap = new Map(this.watchLater.map(v => [v.id, v]));
      }
    } catch (error) {
      console.error('Failed to load Watch Later:', error);
      const res = await chrome.storage.local.get(['watchLaterVideos']);
      this.watchLater = res.watchLaterVideos || [];
      this.watchLaterMap = new Map(this.watchLater.map(v => [v.id, v]));
    }
  }

  setupEventListeners() {
    document.getElementById('checkNow').addEventListener('click', () => this.checkNow());
    document.getElementById('timeFilter').addEventListener('change', (e) => {
      this.timeFilter = e.target.value;
      this.saveTimeFilter();
      this.applyFilters();
      this.updateUI();
    });
    document.getElementById('sortBy').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.updateChannelDisplay();
    });
    document.getElementById('showFilter').addEventListener('change', (e) => {
      this.showFilter = e.target.value;
      this.applyFilters();
      this.updateUI();
    });
    document.getElementById('search').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.applyFilters();
      this.updateUI();
    });
    document.getElementById('checkInterval').addEventListener('change', (e) => {
      this.settings.checkInterval = parseInt(e.target.value);
      this.saveSettings();
    });
    document.getElementById('notifications').addEventListener('change', (e) => {
      this.settings.notifications = e.target.checked;
      this.saveSettings();
    });
    document.getElementById('clearData').addEventListener('click', () => this.clearData());

    // Tab buttons
    document.getElementById('tabChannels').addEventListener('click', () => this.switchView('channels'));
    document.getElementById('tabWatchLater').addEventListener('click', () => this.switchView('watchLater'));
  }

  switchView(viewName) {
    if (this.view === viewName) return;
    this.view = viewName;

    // update tab styles
    document.getElementById('tabChannels').classList.toggle('active', viewName === 'channels');
    document.getElementById('tabChannels').setAttribute('aria-selected', viewName === 'channels' ? 'true' : 'false');
    document.getElementById('tabWatchLater').classList.toggle('active', viewName === 'watchLater');
    document.getElementById('tabWatchLater').setAttribute('aria-selected', viewName === 'watchLater' ? 'true' : 'false');

    this.updateUI();
  }

  getTimeFilterTimestamp() {
    const now = Date.now();
    const timeMap = {
      '1hour': 3600000,    // 1 hour in milliseconds
      '1day': 86400000,    // 24 hours in milliseconds
      '1week': 604800000,  // 1 week in milliseconds
      '1month': 2592000000 // 30 days in milliseconds
    };
    
    return now - (timeMap[this.timeFilter] || timeMap['1day']);
  }

  applyFilters() {
    const filterTimestamp = this.getTimeFilterTimestamp();
    
    // Apply time filter and search filter
    this.filteredResults = this.channelResults.map(channel => {
      if (channel.error) {
        return channel; // Keep error channels as-is
      }

      // Get all videos from the channel (stored videos, not just new ones)
      const allVideos = channel.totalVideos || [];
      
      // Apply time filter
      const timeFilteredVideos = allVideos.filter(video => 
        video.publishedTimestamp >= filterTimestamp
      );

      // Apply search filter on channel name
      const matchesSearch = !this.searchQuery || 
        channel.channelTitle.toLowerCase().includes(this.searchQuery);

      if (!matchesSearch) {
        return null; // Exclude this channel from results
      }

      return {
        ...channel,
        filteredVideos: timeFilteredVideos
      };
    }).filter(channel => channel !== null); // Remove null entries
  }

  async checkNow() {
    if (this.isChecking) return;
    this.isChecking = true;
    this.updateStatus('Checking...', 'checking');
    
    try {
      await chrome.runtime.sendMessage({ action: 'checkNow' });
      await this.loadChannelResults();
      this.applyFilters();
      this.updateUI();
      this.showToast('Check completed');
    } catch (error) {
      console.error('Check failed:', error);
      this.showError('Check failed');
    } finally {
      this.isChecking = false;
      setTimeout(() => this.updateStatus(), 2000);
    }
  }

  async clearData() {
    if (!confirm('Clear all cached video data?')) return;
    
    try {
      await chrome.runtime.sendMessage({ action: 'clearCache' });
      await this.loadChannelResults();
      this.applyFilters();
      this.updateUI();
      this.showToast('Data cleared successfully');
    } catch (error) {
      console.error('Clear failed:', error);
      this.showError('Failed to clear data');
    }
  }

  sortChannels(channels) {
    return channels.sort((a, b) => {
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      
      switch (this.sortBy) {
        case 'new': 
          // Use appropriate new count based on time filter
          const aNewCount = this.timeFilter === 'sincelastvisit' ? 
            (a.trulyNewVideos?.length || 0) : (a.newVideos?.length || 0);
          const bNewCount = this.timeFilter === 'sincelastvisit' ? 
            (b.trulyNewVideos?.length || 0) : (b.newVideos?.length || 0);
          return bNewCount - aNewCount;
        case 'activity':
          const aTime = Math.max(...(a.filteredVideos?.map(v => v.publishedTimestamp) || [0]));
          const bTime = Math.max(...(b.filteredVideos?.map(v => v.publishedTimestamp) || [0]));
          return bTime - aTime;
        default: return a.channelTitle.localeCompare(b.channelTitle);
      }
    });
  }

  updateChannelDisplay() {
    const resultsContainer = document.getElementById('results');
    const sortedChannels = this.sortChannels([...this.filteredResults]);
    
    if (sortedChannels.length === 0) {
      resultsContainer.innerHTML = this.getEmptyState();
      return;
    }

    resultsContainer.innerHTML = sortedChannels.map((ch, i) => this.generateChannelHtml(ch, i)).join('');
    this.setupChannelEventListeners();
  }

  generateChannelHtml(channel, index) {
    if (channel.error) {
      return `
        <div class="channel">
          <div class="channel-header">
            <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
            <span class="badge error">Error</span>
          </div>
          <div class="error">${this.escapeHtml(channel.error)}</div>
        </div>`;
    }

    const originalNewCount = channel.newVideos?.length || 0;
    const trulyNewCount = channel.trulyNewVideos?.length || 0;
    const filteredCount = channel.filteredVideos?.length || 0;
    const hasVideos = filteredCount > 0;

    // Determine which "new" count to show based on time filter
    const displayNewCount = this.timeFilter === 'sincelastvisit' ? trulyNewCount : originalNewCount;

    return `
      <div class="channel ${!hasVideos ? 'collapsed' : ''}" data-index="${index}">
        <div class="channel-header" data-toggle="${index}">
          <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
          <div class="channel-stats">
            ${displayNewCount > 0 ? `<span class="badge new" title="${this.timeFilter === 'sincelastvisit' ? 'New since last visit' : 'New since last check'}">${displayNewCount} new</span>` : ''}
            <span class="badge normal">${filteredCount} videos</span>
          </div>
        </div>
        ${hasVideos ? `<div class="videos">${this.generateVideosHtml(channel.filteredVideos, channel.newVideos, channel.trulyNewVideos, channel.channelTitle)}</div>` : ''}
      </div>`;
  }

  generateVideosHtml(videos, newVideos, trulyNewVideos, channelTitle = '') {
    const newVideoIds = new Set((newVideos || []).map(v => v.id));
    const trulyNewVideoIds = new Set((trulyNewVideos || []).map(v => v.id));
    
    return videos.map(v => {
      // Determine if video should be marked as new based on current context
      const isNew = this.timeFilter === 'sincelastvisit' ? 
        trulyNewVideoIds.has(v.id) : newVideoIds.has(v.id);
      
      const newTitle = this.timeFilter === 'sincelastvisit' && trulyNewVideoIds.has(v.id) ? 
        'New since your last visit' : 'New since last check';

      const inWatchLater = this.watchLaterMap.has(v.id);
        
      return `
        <div class="video ${isNew ? 'new' : ''}" data-url="${v.url}" data-video-id="${v.id}">
          <div style="display:flex; gap:8px; align-items:flex-start; width:100%;">
            <div class="video-title">${this.escapeHtml(v.title)}</div>
            <div class="video-published">${this.escapeHtml(v.published)}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center;">
            <button class="watch-later-btn ${inWatchLater ? 'watch-later-active' : ''}" aria-pressed="${inWatchLater ? 'true' : 'false'}" data-id="${v.id}" title="${inWatchLater ? 'Remove from Watch Later' : 'Add to Watch Later'}">
              ${inWatchLater ? '✓' : '⏱'}
            </button>
          </div>
        </div>`; 
    }).join('');
  }

  setupChannelEventListeners() {
    // Handle channel header clicks (toggle collapse/expand)
    document.querySelectorAll('[data-toggle]').forEach(header => {
      header.addEventListener('click', (e) => {
        const index = e.currentTarget.getAttribute('data-toggle');
        const channel = document.querySelector(`[data-index="${index}"]`);
        channel.classList.toggle('collapsed');
      });
    });
    
    // Handle video clicks (open video)
    document.querySelectorAll('.video[data-url]').forEach(video => {
      video.addEventListener('click', (e) => {
        // If user clicked the watch-later button, that handler will stopPropagation
        const url = e.currentTarget.getAttribute('data-url');
        this.openVideo(url);
      });
    });

    // Handle watch later button clicks (add/remove)
    document.querySelectorAll('.watch-later-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const vid = btn.dataset.id;
        const videoEl = btn.closest('.video');
        // Build minimal video object
        const videoObj = {
          id: vid,
          url: videoEl.getAttribute('data-url'),
          title: videoEl.querySelector('.video-title')?.textContent || '',
          published: videoEl.querySelector('.video-published')?.textContent || '',
          channelTitle: btn.closest('.channel')?.querySelector('.channel-title')?.textContent || ''
        };

        try {
          // toggle
          if (this.watchLaterMap.has(vid)) {
            await this.removeFromWatchLater(vid);
            btn.classList.remove('watch-later-active');
            btn.setAttribute('aria-pressed', 'false');
            btn.title = 'Add to Watch Later';
            btn.textContent = '⏱';
          } else {
            await this.addToWatchLater(videoObj);
            btn.classList.add('watch-later-active');
            btn.setAttribute('aria-pressed', 'true');
            btn.title = 'Remove from Watch Later';
            btn.textContent = '✓';
          }
        } catch (error) {
          console.error('Watch Later operation failed:', error);
          this.showError('Failed to update Watch Later');
        }
      });
    });
  }

  async openVideo(url) {
    try {
      console.log('Opening video in current tab:', url);
      
      // Get the current active tab
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      
      if (currentTab) {
        // Navigate the current tab to the video URL
        await chrome.tabs.update(currentTab.id, { url: url });
        console.log('Video opened in current tab');
      } else {
        // Fallback: create new tab if no current tab found
        await chrome.tabs.create({ url: url, active: true });
        console.log('Created new tab as fallback');
      }
      
    } catch (error) {
      console.error('Failed to open video:', error);
      this.showError('Failed to open video');
    }
  }

  updateUI() {
    this.updateStats();

    if (this.view === 'watchLater') {
      this.renderWatchLaterView();
    } else {
      this.updateChannelDisplay();
    }
  }

  updateStats() {
    const totalChannels = this.filteredResults.length;
    const totalNew = this.filteredResults.reduce((sum, ch) => sum + (ch.newVideos?.length || 0), 0);
    const totalVideos = this.filteredResults.reduce((sum, ch) => sum + (ch.filteredVideos?.length || 0), 0);
    
    document.getElementById('channelCount').textContent = totalChannels;
    document.getElementById('newCount').textContent = totalNew;
    document.getElementById('totalCount').textContent = totalVideos;
    document.getElementById('watchLaterCount').textContent = (this.watchLater || []).length;
  }

  async updateStatus(text = null, type = 'normal') {
    const statusText = document.getElementById('statusText');
    const indicator = document.getElementById('indicator');
    
    if (text) {
      statusText.textContent = text;
      indicator.className = `indicator ${type}`;
      return;
    }

    try {
      const result = await chrome.runtime.sendMessage({ action: 'getStatus' });
      
      if (result.lastCheck) {
        const diffMinutes = Math.floor((Date.now() - result.lastCheck) / 60000);
        statusText.textContent = diffMinutes < 1 ? 'Just checked' : 
          diffMinutes < 60 ? `Last check: ${diffMinutes}m ago` : 
          `Last check: ${Math.floor(diffMinutes / 60)}h ago`;
        indicator.className = result.lastCheckSuccess ? 'indicator' : 'indicator error';
      } else {
        statusText.textContent = 'Never checked';
        indicator.className = 'indicator error';
      }
    } catch (error) {
      console.error('Failed to get status:', error);
      statusText.textContent = 'Status unknown';
      indicator.className = 'indicator error';
    }
  }

  getEmptyState() {
    return this.searchQuery ? 
      `<div class="empty"><p>No channels found matching "${this.escapeHtml(this.searchQuery)}"</p></div>` :
      `<div class="empty">
        <h3>📺 No Channels Found</h3>
        <p>Create a "Vid" bookmarks folder and add YouTube channel /videos pages, then click "Check Now" to get started.</p>
      </div>`;
  }

  getEmptyWatchLaterState() {
    return `<div class="empty"><h3>🕒 Watch Later is empty</h3><p>Add videos to Watch Later by clicking the ⏱ button next to videos.</p></div>`;
  }

  showError(message) {
    document.getElementById('results').innerHTML = `<div class="error">⚠️ ${this.escapeHtml(message)}</div>`;
  }

  showToast(message) {
    const toast = document.createElement('div');
    toast.textContent = message;
    toast.style.cssText = "position: fixed; top: 20px; right: 20px; background: #4ade80; color: white; padding: 8px 16px; border-radius: 6px; font-size: 12px; z-index: 1000; animation: fadeIn 0.3s ease;";
    document.body.appendChild(toast);
    setTimeout(() => {
      toast.style.animation = 'fadeOut 0.3s ease';
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 2000);
  }

  escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /* ----------------------------
     Watch Later: UI + actions
     ---------------------------- */
  renderWatchLaterView() {
    const resultsContainer = document.getElementById('results');

    if (!this.watchLater || this.watchLater.length === 0) {
      resultsContainer.innerHTML = this.getEmptyWatchLaterState();
      return;
    }

    const html = this.watchLater.map(v => `
      <div class="watch-later-item" data-id="${this.escapeHtml(v.id)}">
        ${v.thumbnail ? `<img src="${this.escapeHtml(v.thumbnail)}" class="watch-later-thumb" alt="">` : `<div class="watch-later-thumb" aria-hidden="true"></div>`}
        <div class="watch-later-meta">
          <div class="watch-later-title">${this.escapeHtml(v.title)}</div>
          <div class="watch-later-channel">${this.escapeHtml(v.channelTitle)} • ${this.escapeHtml(v.published)}</div>
        </div>
        <div style="display:flex; gap:8px; align-items:center;">
          <button class="btn secondary watch-later-open" data-url="${this.escapeHtml(v.url)}">Open</button>
          <button class="btn watch-later-remove" data-id="${this.escapeHtml(v.id)}">Remove</button>
        </div>
      </div>
    `).join('');

    resultsContainer.innerHTML = `<div class="watch-later-list">${html}</div>`;

    // Attach listeners
    document.querySelectorAll('.watch-later-open').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const url = e.currentTarget.dataset.url;
        this.openVideo(url);
      });
    });

    document.querySelectorAll('.watch-later-remove').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const id = e.currentTarget.dataset.id;
        try {
          await this.removeFromWatchLater(id);
          await this.loadWatchLater();
          this.updateUI();
          this.showToast('Removed from Watch Later');
        } catch (error) {
          console.error('Failed to remove from watch later', error);
          this.showError('Failed to remove video');
        }
      });
    });
  }

  async addToWatchLater(video) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'addToWatchLater', video });
      if (!response || !response.success) throw new Error(response?.error || 'Failed to add');
      // reload local list
      await this.loadWatchLater();
      this.updateStats();
      this.showToast('Added to Watch Later');
    } catch (error) {
      console.error('addToWatchLater failed:', error);
      throw error;
    }
  }

  async removeFromWatchLater(videoId) {
    try {
      const response = await chrome.runtime.sendMessage({ action: 'removeFromWatchLater', videoId });
      if (!response || !response.success) throw new Error(response?.error || 'Failed to remove');
      await this.loadWatchLater();
      this.updateStats();
      return true;
    } catch (error) {
      console.error('removeFromWatchLater failed:', error);
      throw error;
    }
  }
}

/* Add animations */
const style = document.createElement('style');
style.textContent = `
  @keyframes fadeIn { from { opacity: 0; transform: translateY(-10px); } to { opacity: 1; transform: translateY(0); } }
  @keyframes fadeOut { from { opacity: 1; transform: translateY(0); } to { opacity: 0; transform: translateY(-10px); } }
`;
document.head.appendChild(style);

/* Initialize when DOM is ready */
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.popupController = new PopupController();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    document.body.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc2626;">
      <h3>⚠️ Error</h3>
      <p>Failed to load extension. Please refresh.</p>
      <button onclick="location.reload()" style="margin-top: 10px; padding: 6px 12px; border: none; border-radius: 4px; background: #667eea; color: white; cursor: pointer;">Reload</button>
    </div>`;
  }
});

/* Listen for storage changes */
chrome.storage.onChanged.addListener((changes) => {
  if (!window.popupController) return;

  if (changes.channelResults) {
    window.popupController.loadChannelResults().then(() => {
      window.popupController.applyFilters();
      window.popupController.updateUI();
    });
  }

  if (changes.watchLaterVideos) {
    window.popupController.loadWatchLater().then(() => {
      window.popupController.updateUI();
    });
  }
});
