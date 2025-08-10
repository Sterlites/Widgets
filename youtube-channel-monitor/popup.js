// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  try {
    window.popupController = new PopupController();
  } catch (error) {
    console.error('Failed to initialize popup:', error);
    document.body.innerHTML = `
      <div style="padding: 20px; text-align: center; color: #dc2626; min-height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <h3>⚠️ Error</h3>
        <p>Failed to load extension. Please refresh.</p>
        <button onclick="location.reload()" style="margin-top: 10px; padding: 8px 16px; border: none; border-radius: 6px; background: #667eea; color: white; cursor: pointer; font-size: 12px; height: 32px;">🔄 Reload</button>
      </div>`;
  }
});

// Cleanup when popup is about to close
window.addEventListener('beforeunload', () => {
  if (window.popupController) {
    window.popupController.destroy();
  }
});

// Listen for storage changes to keep UI in sync
chrome.storage.onChanged.addListener((changes) => {
  if (!window.popupController) return;

  if (changes.channelResults) {
    // Use requestAnimationFrame to prevent layout thrashing
    requestAnimationFrame(() => {
      window.popupController.loadChannelResults().then(() => {
        window.popupController.applyFilters();
        window.popupController.updateUI();
      }).catch(console.error);
    });
  }

  if (changes.watchLaterVideos) {
    requestAnimationFrame(() => {
      window.popupController.loadWatchLater().then(() => {
        window.popupController.updateUI();
      }).catch(console.error);
    });
  }

  // Handle settings changes
  if (changes.checkInterval || changes.timeFilter || changes.notifications || changes.autoOpen) {
    window.popupController.loadSettings().catch(console.error);
  }
});

// Handle runtime message errors gracefully
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // This helps catch any communication issues between popup and background
  if (message.error && window.popupController) {
    window.popupController.showToast(`❌ ${message.error}`, 'error');
  }
});

// Add global error handler for unhandled errors
window.addEventListener('error', (event) => {
  console.error('Unhandled error in popup:', event.error);
  if (window.popupController) {
    window.popupController.showToast('❌ An unexpected error occurred', 'error');
  }
});

// Add global promise rejection handler
window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection in popup:', event.reason);
  if (window.popupController) {
    window.popupController.showToast('❌ An unexpected error occurred', 'error');
  }
  event.preventDefault(); // Prevent console spam
});

class PopupController {
  constructor() {
    this.settings = {};
    this.channelResults = [];
    this.filteredResults = [];
    this.searchQuery = '';
    this.sortBy = 'activity';
    this.timeFilter = '1day';
    this.showFilter = 'all';
    this.isChecking = false;

    // Watch Later state
    this.watchLater = [];
    this.watchLaterMap = new Map();

    // View state: 'channels' or 'watchLater'
    this.view = 'channels';

    // Debounce search
    this.searchDebounce = null;

    // Cache for better performance
    this.statusUpdateInterval = null;

    // FIXED: Batch DOM updates to prevent layout thrashing
    this.pendingUpdates = new Set();
    this.updateScheduled = false;

    // Initialize with stable layout first
    this.initializeLayout();
    this.init();
  }

  // FIXED: Pre-initialize layout to prevent shaking with exact dimensions
initializeLayout() {
  // FIXED: Force immediate layout stability
  const body = document.body;
  
  // Set initial dimensions before any content loads
  body.style.width = '617px'; // 600px + 17px scrollbar
  body.style.minWidth = '617px';
  body.style.maxWidth = '617px';
  body.style.height = '700px';
  body.style.minHeight = '700px';
  body.style.maxHeight = '700px';
  body.style.overflow = 'hidden';
  body.style.scrollbarGutter = 'stable';

    // FIXED: Pre-allocate scrollbar space
  const results = document.getElementById('results');
  if (results) {
    results.style.scrollbarGutter = 'stable';
    results.style.overflowY = 'scroll';
    results.style.width = '600px';
  }
    
    // Set initial stats to prevent layout shifts with exact text
    const updates = [
      ['channelCount', '0'],
      ['newCount', '0'], 
      ['totalCount', '0'],
      ['watchLaterCount', '0'],
      ['statusText', 'Initializing...']
    ];
    
    // FIXED: Batch all DOM updates in a single frame
    requestAnimationFrame(() => {
      updates.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
          element.textContent = value;
        }
      });
      
      document.getElementById('indicator').className = 'indicator checking';
      
      // Show initial loading state with consistent height
      this.showLoading('Loading extension...');
      
      // Pre-set form values to prevent layout shifts
      document.getElementById('checkInterval').value = '15';
      document.getElementById('timeFilter').value = '1day';
      document.getElementById('sortBy').value = 'activity';
      document.getElementById('showFilter').value = 'all';
      document.getElementById('notifications').checked = false;
      
      const autoOpenElement = document.getElementById('autoOpen');
      if (autoOpenElement) {
        autoOpenElement.value = 'current';
      }
    });
  }

  async init() {
    try {
      // FIXED: Use double requestAnimationFrame to ensure DOM is completely stable
      await new Promise(resolve => {
        requestAnimationFrame(() => {
          requestAnimationFrame(resolve);
        });
      });
      
      await this.loadSettings();
      await this.loadWatchLater();
      await this.loadChannelResults();
      
      // Setup listeners after data is loaded
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      
      // FIXED: Update UI in sequence to prevent layout thrashing
      await this.updateStatus();
      this.applyFilters();
      
      // FIXED: Use triple requestAnimationFrame for ultra-smooth UI update
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.updateUI();
            this.startStatusUpdates();
          });
        });
      });
      
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showError('Failed to initialize popup');
    }
  }

  showLoading(message = 'Loading...') {
    // FIXED: Use consistent structure with fixed dimensions to prevent layout shifts
    const loadingHtml = `
      <div class="loading" style="min-height: 200px; height: 200px; display: flex; flex-direction: column; align-items: center; justify-content: center;">
        <div style="height: 20px; line-height: 1.2;">${this.escapeHtml(message)}</div>
      </div>`;
    
    // FIXED: Use requestAnimationFrame for smooth DOM update
    requestAnimationFrame(() => {
      document.getElementById('results').innerHTML = loadingHtml;
    });
  }

  async loadSettings() {
    const result = await chrome.storage.local.get([
      'checkInterval', 'timeFilter', 'notifications', 'autoOpen', 'lastCheck', 'showFilter'
    ]);
    
    this.settings = {
      checkInterval: result.checkInterval || 15,
      notifications: result.notifications || false,
      autoOpen: result.autoOpen || 'current'
    };

    this.timeFilter = result.timeFilter || '1day';
    this.showFilter = result.showFilter || 'all';

    // FIXED: Update UI elements with batch DOM updates to prevent layout thrashing
    const updates = [
      ['checkInterval', this.settings.checkInterval],
      ['timeFilter', this.timeFilter],
      ['sortBy', 'activity'],
      ['showFilter', this.showFilter],
      ['notifications', this.settings.notifications], // checkbox
    ];

    // FIXED: Batch DOM updates in single frame
    requestAnimationFrame(() => {
      updates.forEach(([id, value]) => {
        const element = document.getElementById(id);
        if (element) {
          if (element.type === 'checkbox') {
            if (element.checked !== value) {
              element.checked = value;
            }
          } else {
            if (element.value !== value.toString()) {
              element.value = value;
            }
          }
        }
      });
      
      const autoOpenElement = document.getElementById('autoOpen');
      if (autoOpenElement && autoOpenElement.value !== this.settings.autoOpen) {
        autoOpenElement.value = this.settings.autoOpen;
      }
    });
  }

  async saveSettings() {
    await chrome.storage.local.set(this.settings);
  }

  async saveTimeFilter() {
    await chrome.storage.local.set({ timeFilter: this.timeFilter });
  }

  async saveShowFilter() {
    await chrome.storage.local.set({ showFilter: this.showFilter });
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
    // Header refresh button
    document.getElementById('headerRefresh').addEventListener('click', () => this.updateStatus());

    // Main action buttons
    document.getElementById('checkNow').addEventListener('click', () => this.checkNow());
    
    // FIXED: Filter controls with enhanced debouncing to prevent rapid DOM changes
    document.getElementById('timeFilter').addEventListener('change', (e) => {
      this.timeFilter = e.target.value;
      this.saveTimeFilter();
      this.debouncedFilterUpdate();
    });
    
    document.getElementById('sortBy').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.debouncedDisplayUpdate();
    });
    
    document.getElementById('showFilter').addEventListener('change', (e) => {
      this.showFilter = e.target.value;
      this.saveShowFilter();
      this.debouncedFilterUpdate();
    });
    
    // FIXED: Search with enhanced debouncing and smooth updates
    document.getElementById('search').addEventListener('input', (e) => {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => {
        this.searchQuery = e.target.value.toLowerCase();
        this.debouncedFilterUpdate();
      }, 150); // Reduced debounce time for better responsiveness
    });

    // Settings with immediate feedback but debounced saves
    document.getElementById('checkInterval').addEventListener('change', (e) => {
      this.settings.checkInterval = parseInt(e.target.value);
      this.debouncedSaveSettings();
      this.showToast('Check interval updated');
    });
    
    document.getElementById('notifications').addEventListener('change', (e) => {
      this.settings.notifications = e.target.checked;
      this.debouncedSaveSettings();
      this.showToast(e.target.checked ? 'Notifications enabled' : 'Notifications disabled');
    });

    const autoOpenElement = document.getElementById('autoOpen');
    if (autoOpenElement) {
      autoOpenElement.addEventListener('change', (e) => {
        this.settings.autoOpen = e.target.value;
        this.debouncedSaveSettings();
        this.showToast('Video opening preference updated');
      });
    }

    document.getElementById('clearData').addEventListener('click', () => this.clearData());
    
    const exportButton = document.getElementById('exportData');
    if (exportButton) {
      exportButton.addEventListener('click', () => this.exportWatchLater());
    }

    // FIXED: Tab buttons with smooth immediate visual feedback
    document.getElementById('tabChannels').addEventListener('click', () => this.switchView('channels'));
    document.getElementById('tabWatchLater').addEventListener('click', () => this.switchView('watchLater'));

    // Settings panel
    const settings = document.getElementById('settings');
    if (settings) {
      settings.addEventListener('toggle', (e) => {
        if (e.target.open) {
          this.showToast('Settings expanded');
        }
      });
    }
  }

  // FIXED: Enhanced debounced methods to prevent rapid UI updates
  debouncedFilterUpdate() {
    clearTimeout(this._filterUpdateTimeout);
    this._filterUpdateTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        this.applyFilters();
        this.updateUI();
      });
    }, 50); // Faster response time
  }

  debouncedDisplayUpdate() {
    clearTimeout(this._displayUpdateTimeout);
    this._displayUpdateTimeout = setTimeout(() => {
      requestAnimationFrame(() => {
        this.updateChannelDisplay();
      });
    }, 50);
  }

  debouncedSaveSettings() {
    clearTimeout(this._saveSettingsTimeout);
    this._saveSettingsTimeout = setTimeout(() => {
      this.saveSettings();
    }, 300); // Faster save
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Only handle shortcuts if not focused on input elements
      if (e.target.matches('input, select, textarea')) return;

      // Ctrl/Cmd + K for search focus
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        document.getElementById('search').focus();
      }
      
      // Escape to clear search
      if (e.key === 'Escape') {
        const search = document.getElementById('search');
        if (document.activeElement === search && search.value) {
          search.value = '';
          this.searchQuery = '';
          this.debouncedFilterUpdate();
        }
      }
      
      // Tab navigation (1, 2)
      if (e.key === '1') {
        e.preventDefault();
        this.switchView('channels');
      }
      if (e.key === '2') {
        e.preventDefault();
        this.switchView('watchLater');
      }
      
      // R for refresh
      if (e.key === 'r') {
        e.preventDefault();
        this.checkNow();
      }
    });
  }

  startStatusUpdates() {
    // Update status every 30 seconds, but only if not checking
    this.statusUpdateInterval = setInterval(() => {
      if (!this.isChecking) {
        this.updateStatus();
      }
    }, 30000);
  }

  switchView(viewName) {
    if (this.view === viewName) return;
    this.view = viewName;

    // FIXED: Batch DOM updates for ultra-smooth transition
    requestAnimationFrame(() => {
      const isChannels = viewName === 'channels';
      
      // Update tab styles with batch operations
      const channelTab = document.getElementById('tabChannels');
      const watchLaterTab = document.getElementById('tabWatchLater');
      
      channelTab.classList.toggle('active', isChannels);
      channelTab.setAttribute('aria-selected', isChannels ? 'true' : 'false');
      watchLaterTab.classList.toggle('active', !isChannels);
      watchLaterTab.setAttribute('aria-selected', !isChannels ? 'true' : 'false');

      // Show appropriate controls with batch style updates
      const controls = document.querySelectorAll('#timeFilter, #sortBy, #showFilter, #search');
      const displayStyle = isChannels ? '' : 'none';
      controls.forEach(control => {
        if (control.style.display !== displayStyle) {
          control.style.display = displayStyle;
        }
      });

      // FIXED: Use requestAnimationFrame for UI update to prevent layout shift
      requestAnimationFrame(() => {
        this.updateUI();
      });
      
      this.showToast(`Switched to ${isChannels ? 'Channels' : 'Watch Later'} view`);
    });
  }

  getTimeFilterTimestamp() {
    const now = Date.now();
    const timeMap = {
      '1hour': 3600000,
      '1day': 86400000,
      '1week': 604800000,
      '1month': 2592000000
    };
    
    return now - (timeMap[this.timeFilter] || timeMap['1day']);
  }

  applyFilters() {
    const filterTimestamp = this.getTimeFilterTimestamp();
    
    this.filteredResults = this.channelResults.map(channel => {
      if (channel.error) {
        return channel;
      }

      const allVideos = channel.totalVideos || [];
      const timeFilteredVideos = allVideos.filter(video => 
        video.publishedTimestamp >= filterTimestamp
      );

      // Apply search filter
      const matchesSearch = !this.searchQuery || 
        channel.channelTitle.toLowerCase().includes(this.searchQuery);

      if (!matchesSearch) {
        return null;
      }

      // Apply show filter
      if (this.showFilter === 'newonly' && (!channel.newVideos || channel.newVideos.length === 0)) {
        return null;
      }

      return {
        ...channel,
        filteredVideos: timeFilteredVideos
      };
    }).filter(channel => channel !== null);
  }

  async checkNow() {
    if (this.isChecking) return;
    
    this.isChecking = true;
    const checkButton = document.getElementById('checkNow');
    const checkIcon = document.getElementById('checkNowIcon');
    
    // FIXED: Update button state with smooth transition in single frame
    requestAnimationFrame(() => {
      checkButton.disabled = true;
      checkIcon.textContent = '⏳';
      checkButton.style.opacity = '0.7';
    });
    
    this.updateStatus('Checking for new videos...', 'checking');
    
    try {
      await chrome.runtime.sendMessage({ action: 'checkNow' });
      await this.loadChannelResults();
      await this.loadWatchLater(); // Refresh watch later in case of changes
      this.applyFilters();
      
      // FIXED: Use requestAnimationFrame for smooth UI updates
      requestAnimationFrame(() => {
        this.updateUI();
      });
      
      this.showToast('✅ Check completed successfully');
    } catch (error) {
      console.error('Check failed:', error);
      this.showToast('❌ Check failed', 'error');
      this.showError('Check failed: ' + error.message);
    } finally {
      this.isChecking = false;
      
      // FIXED: Restore button state smoothly in single frame
      requestAnimationFrame(() => {
        checkButton.disabled = false;
        checkIcon.textContent = '🔍';
        checkButton.style.opacity = '';
      });
      
      setTimeout(() => this.updateStatus(), 2000);
    }
  }

  async clearData() {
    if (!confirm('⚠️ This will clear all cached video data. Are you sure?')) return;
    
    try {
      this.showLoading('Clearing cache...');
      await chrome.runtime.sendMessage({ action: 'clearCache' });
      await this.loadChannelResults();
      this.applyFilters();
      
      requestAnimationFrame(() => {
        this.updateUI();
      });
      
      this.showToast('✅ Cache cleared successfully');
    } catch (error) {
      console.error('Clear failed:', error);
      this.showToast('❌ Failed to clear cache', 'error');
      this.showError('Failed to clear data');
    }
  }

  async exportWatchLater() {
    try {
      if (!this.watchLater || this.watchLater.length === 0) {
        this.showToast('📝 Watch Later list is empty', 'error');
        return;
      }

      const exportData = {
        exportDate: new Date().toISOString(),
        totalVideos: this.watchLater.length,
        videos: this.watchLater.map(v => ({
          title: v.title,
          url: v.url,
          channel: v.channelTitle,
          published: v.published,
          addedAt: new Date(v.addedAt).toISOString()
        }))
      };

      const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `youtube-watch-later-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast('✅ Watch Later exported successfully');
    } catch (error) {
      console.error('Export failed:', error);
      this.showToast('❌ Export failed', 'error');
    }
  }

  sortChannels(channels) {
    return channels.sort((a, b) => {
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      
      switch (this.sortBy) {
        case 'new': 
          const aNewCount = this.timeFilter === 'sincelastvisit' ? 
            (a.trulyNewVideos?.length || 0) : (a.newVideos?.length || 0);
          const bNewCount = this.timeFilter === 'sincelastvisit' ? 
            (b.trulyNewVideos?.length || 0) : (b.newVideos?.length || 0);
          return bNewCount - aNewCount;
        case 'activity':
          const aTime = Math.max(...(a.filteredVideos?.map(v => v.publishedTimestamp) || [0]));
          const bTime = Math.max(...(b.filteredVideos?.map(v => v.publishedTimestamp) || [0]));
          return bTime - aTime;
        default: 
          return a.channelTitle.localeCompare(b.channelTitle);
      }
    });
  }

  updateChannelDisplay() {
    const resultsContainer = document.getElementById('results');
    const sortedChannels = this.sortChannels([...this.filteredResults]);
    
    if (sortedChannels.length === 0) {
      // FIXED: Use requestAnimationFrame for smooth transition
      requestAnimationFrame(() => {
        resultsContainer.innerHTML = this.getEmptyState();
      });
      return;
    }

    // FIXED: Use DocumentFragment for efficient DOM manipulation with stable dimensions
    const fragment = document.createDocumentFragment();
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = sortedChannels.map((ch, i) => this.generateChannelHtml(ch, i)).join('');
    
    while (tempDiv.firstChild) {
      fragment.appendChild(tempDiv.firstChild);
    }
    
    // FIXED: Single DOM update in animation frame
    requestAnimationFrame(() => {
      resultsContainer.innerHTML = '';
      resultsContainer.appendChild(fragment);
      
      // FIXED: Setup event listeners after DOM update in next frame
      requestAnimationFrame(() => {
        this.setupChannelEventListeners();
      });
    });
  }

  generateChannelHtml(channel, index) {
    if (channel.error) {
      return `
        <div class="channel" style="min-height: 60px;">
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

    const displayNewCount = this.timeFilter === 'sincelastvisit' ? trulyNewCount : originalNewCount;

    return `
      <div class="channel ${!hasVideos ? 'collapsed' : ''}" data-index="${index}" style="min-height: 60px;">
        <div class="channel-header" data-toggle="${index}" role="button" tabindex="0" aria-expanded="${hasVideos ? 'true' : 'false'}">
          <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
          <div class="channel-stats">
            ${displayNewCount > 0 ? `<span class="badge new" title="${this.timeFilter === 'sincelastvisit' ? 'New since last visit' : 'New since last check'}">${displayNewCount} new</span>` : ''}
            <span class="badge normal" title="Videos in current time filter">${filteredCount} videos</span>
          </div>
        </div>
        ${hasVideos ? `<div class="videos">${this.generateVideosHtml(channel.filteredVideos, channel.newVideos, channel.trulyNewVideos, channel.channelTitle)}</div>` : ''}
      </div>`;
  }

  generateVideosHtml(videos, newVideos, trulyNewVideos, channelTitle = '') {
    const newVideoIds = new Set((newVideos || []).map(v => v.id));
    const trulyNewVideoIds = new Set((trulyNewVideos || []).map(v => v.id));
    
    return videos.slice(0, 20).map(v => { // Limit to 20 videos for performance
      const isNew = this.timeFilter === 'sincelastvisit' ? 
        trulyNewVideoIds.has(v.id) : newVideoIds.has(v.id);
      
      const inWatchLater = this.watchLaterMap.has(v.id);
        
      return `
        <div class="video ${isNew ? 'new' : ''}" data-url="${v.url}" data-video-id="${v.id}" role="button" tabindex="0" style="min-height: 50px;">
          <div class="video-content">
            <div class="video-title" title="${this.escapeHtml(v.title)}">${this.escapeHtml(this.truncateText(v.title, 80))}</div>
            <div class="video-published" title="Published ${this.escapeHtml(v.published)}">${this.escapeHtml(v.published)}</div>
          </div>
          <div style="display:flex; gap:8px; align-items:center; height: 30px;">
            <button class="watch-later-btn ${inWatchLater ? 'watch-later-active' : ''}" 
                    aria-pressed="${inWatchLater ? 'true' : 'false'}" 
                    data-id="${v.id}" 
                    title="${inWatchLater ? 'Remove from Watch Later' : 'Add to Watch Later'}"
                    tabindex="0">
              ${inWatchLater ? '✓' : '⏱'}
            </button>
          </div>
        </div>`; 
    }).join('');
  }

  truncateText(text, maxLength) {
    if (!text || text.length <= maxLength) return text;
    return text.substring(0, maxLength - 3) + '...';
  }

setupChannelEventListeners() {
  // Handle channel header clicks and keyboard
  document.querySelectorAll('[data-toggle]').forEach(header => {
    const handleToggle = (e) => {
      const index = e.currentTarget.getAttribute('data-toggle');
      const channel = document.querySelector(`[data-index="${index}"]`);
      if (!channel) return;
      
      const wasCollapsed = channel.classList.contains('collapsed');
      // FIXED: Store reference to currentTarget before requestAnimationFrame
      const headerElement = e.currentTarget;
      
      // FIXED: Use requestAnimationFrame for smooth toggle animation
      requestAnimationFrame(() => {
        channel.classList.toggle('collapsed');
        // FIXED: Use stored reference instead of e.currentTarget
        if (headerElement) {
          headerElement.setAttribute('aria-expanded', wasCollapsed ? 'true' : 'false');
        }
      });
    };

    header.addEventListener('click', handleToggle);
    header.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleToggle(e);
      }
    });
  });
  
  // Handle video clicks
  document.querySelectorAll('.video[data-url]').forEach(video => {
    const handleVideoOpen = (e) => {
      if (e.target.closest('.watch-later-btn')) return; // Don't open if clicking watch later button
      const url = e.currentTarget.getAttribute('data-url');
      this.openVideo(url);
    };

    video.addEventListener('click', handleVideoOpen);
    video.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleVideoOpen(e);
      }
    });
  });

  // Handle watch later buttons
  document.querySelectorAll('.watch-later-btn').forEach(btn => {
    const handleWatchLater = async (e) => {
      e.stopPropagation();
      const vid = btn.dataset.id;
      const videoEl = btn.closest('.video');
      if (!videoEl) return;
      
      const videoObj = {
        id: vid,
        url: videoEl.getAttribute('data-url'),
        title: videoEl.querySelector('.video-title')?.textContent || '',
        published: videoEl.querySelector('.video-published')?.textContent || '',
        channelTitle: btn.closest('.channel')?.querySelector('.channel-title')?.textContent || ''
      };

      try {
        btn.disabled = true;
        
        // FIXED: Use requestAnimationFrame for smooth button state updates
        if (this.watchLaterMap.has(vid)) {
          await this.removeFromWatchLater(vid);
          requestAnimationFrame(() => {
            btn.classList.remove('watch-later-active');
            btn.setAttribute('aria-pressed', 'false');
            btn.title = 'Add to Watch Later';
            btn.textContent = '⏱';
          });
        } else {
          await this.addToWatchLater(videoObj);
          requestAnimationFrame(() => {
            btn.classList.add('watch-later-active');
            btn.setAttribute('aria-pressed', 'true');
            btn.title = 'Remove from Watch Later';
            btn.title = 'Remove from Watch Later';
            btn.textContent = '✓';
          });
        }
      } catch (error) {
        console.error('Watch Later operation failed:', error);
        this.showToast('❌ Failed to update Watch Later', 'error');
      } finally {
        btn.disabled = false;
      }
    };

    btn.addEventListener('click', handleWatchLater);
    btn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        handleWatchLater(e);
      }
    });
  });
}

 async openVideo(url) {
   try {
     const openMode = this.settings.autoOpen || 'current';
     
     if (openMode === 'current') {
       const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
       if (currentTab) {
         await chrome.tabs.update(currentTab.id, { url: url });
       } else {
         await chrome.tabs.create({ url: url, active: true });
       }
     } else if (openMode === 'new') {
       await chrome.tabs.create({ url: url, active: true });
     } else if (openMode === 'background') {
       await chrome.tabs.create({ url: url, active: false });
     }
     
     this.showToast('🎥 Video opened');
   } catch (error) {
     console.error('Failed to open video:', error);
     this.showToast('❌ Failed to open video', 'error');
   }
 }

 updateUI() {
   // FIXED: Batch UI updates in single animation frame to prevent layout thrashing
   if (this.updateScheduled) return;
   this.updateScheduled = true;
   
   requestAnimationFrame(() => {
     this.updateStats();

     if (this.view === 'watchLater') {
       this.renderWatchLaterView();
     } else {
       this.updateChannelDisplay();
     }
     
     this.updateScheduled = false;
   });
 }

 updateStats() {
   const totalChannels = this.filteredResults.length;
   const totalNew = this.filteredResults.reduce((sum, ch) => sum + (ch.newVideos?.length || 0), 0);
   const totalVideos = this.filteredResults.reduce((sum, ch) => sum + (ch.filteredVideos?.length || 0), 0);
   
   // FIXED: Batch DOM updates and only update if values changed
   const updates = [
     ['channelCount', totalChannels],
     ['newCount', totalNew],
     ['totalCount', totalVideos],
     ['watchLaterCount', (this.watchLater || []).length]
   ];

   let needsUpdate = false;
   updates.forEach(([id, value]) => {
     const element = document.getElementById(id);
     if (element && element.textContent !== value.toString()) {
       needsUpdate = true;
     }
   });

   if (needsUpdate) {
     requestAnimationFrame(() => {
       updates.forEach(([id, value]) => {
         const element = document.getElementById(id);
         if (element && element.textContent !== value.toString()) {
           element.textContent = value;
         }
       });
     });
   }
 }

 async updateStatus(text = null, type = 'normal') {
   const statusText = document.getElementById('statusText');
   const indicator = document.getElementById('indicator');
   
   if (text) {
     // FIXED: Only update if text actually changed
     if (statusText.textContent !== text) {
       requestAnimationFrame(() => {
         statusText.textContent = text;
       });
     }
     
     const newClass = `indicator ${type}`;
     if (indicator.className !== newClass) {
       requestAnimationFrame(() => {
         indicator.className = newClass;
       });
     }
     return;
   }

   try {
     const result = await chrome.runtime.sendMessage({ action: 'getStatus' });
     
     let newStatusText = 'Status unknown';
     let newIndicatorClass = 'indicator error';
     
     if (result.lastCheck) {
       const diffMinutes = Math.floor((Date.now() - result.lastCheck) / 60000);
       if (diffMinutes < 1) {
         newStatusText = 'Just checked';
       } else if (diffMinutes < 60) {
         newStatusText = `Last check: ${diffMinutes}m ago`;
       } else {
         const hours = Math.floor(diffMinutes / 60);
         newStatusText = `Last check: ${hours}h ago`;
       }
       newIndicatorClass = result.lastCheckSuccess ? 'indicator' : 'indicator error';
     } else {
       newStatusText = 'Never checked';
       newIndicatorClass = 'indicator error';
     }
     
     // FIXED: Only update if changed to prevent unnecessary reflows
     let needsUpdate = false;
     if (statusText.textContent !== newStatusText) {
       needsUpdate = true;
     }
     if (indicator.className !== newIndicatorClass) {
       needsUpdate = true;
     }
     
     if (needsUpdate) {
       requestAnimationFrame(() => {
         if (statusText.textContent !== newStatusText) {
           statusText.textContent = newStatusText;
         }
         if (indicator.className !== newIndicatorClass) {
           indicator.className = newIndicatorClass;
         }
       });
     }
   } catch (error) {
     console.error('Failed to get status:', error);
     
     const fallbackText = 'Status unknown';
     const fallbackClass = 'indicator error';
     
     if (statusText.textContent !== fallbackText || indicator.className !== fallbackClass) {
       requestAnimationFrame(() => {
         statusText.textContent = fallbackText;
         indicator.className = fallbackClass;
       });
     }
   }
 }

 getEmptyState() {
   if (this.searchQuery) {
     return `<div class="empty" style="min-height: 200px; height: 200px;">
       <h3 style="height: 20px; margin-bottom: 8px;">🔍 No Results</h3>
       <p style="margin-bottom: 16px;">No channels found matching "<strong>${this.escapeHtml(this.searchQuery)}</strong>"</p>
       <p>Try a different search term or clear the search.</p>
     </div>`;
   }

   if (this.showFilter === 'newonly') {
     return `<div class="empty" style="min-height: 200px; height: 200px;">
       <h3 style="height: 20px; margin-bottom: 8px;">✨ No New Videos</h3>
       <p style="margin-bottom: 16px;">No channels have new videos in the selected time range.</p>
       <p>Try changing the time filter or check for updates.</p>
     </div>`;
   }

   return `<div class="empty" style="min-height: 200px; height: 200px;">
     <h3 style="height: 20px; margin-bottom: 8px;">📺 No Channels Found</h3>
     <p style="margin-bottom: 16px;">Create a "Vid" bookmarks folder and add YouTube channel /videos pages.</p>
     <p>Then click "Check Now" to get started!</p>
   </div>`;
 }

 getEmptyWatchLaterState() {
   return `<div class="empty" style="min-height: 200px; height: 200px;">
     <h3 style="height: 20px; margin-bottom: 8px;">🕒 Watch Later is Empty</h3>
     <p style="margin-bottom: 16px;">Add videos to Watch Later by clicking the ⏱ button next to videos.</p>
     <p>Your saved videos will appear here for easy access.</p>
   </div>`;
 }

 showError(message) {
   const errorHtml = `<div class="error" style="min-height: 200px; height: 200px; display: flex; align-items: center; justify-content: center;">
     ${this.escapeHtml(message)}
   </div>`;
   
   requestAnimationFrame(() => {
     document.getElementById('results').innerHTML = errorHtml;
   });
 }

 showToast(message, type = 'success') {
   // FIXED: Remove existing toast to prevent stacking and layout shifts
   const existingToast = document.querySelector('.toast');
   if (existingToast) {
     existingToast.remove();
   }

   const toast = document.createElement('div');
   toast.className = `toast ${type === 'error' ? 'error' : ''}`;
   toast.textContent = message;
   toast.style.animation = 'slideIn 0.3s ease';
   
   // FIXED: Add toast in animation frame to prevent layout shift
   requestAnimationFrame(() => {
     document.body.appendChild(toast);
   });
   
   setTimeout(() => {
     if (toast.parentNode) {
       toast.style.animation = 'slideOut 0.3s ease';
       setTimeout(() => {
         if (toast.parentNode) {
           toast.parentNode.removeChild(toast);
         }
       }, 300);
     }
   }, 3000);
 }

 escapeHtml(text) {
   if (!text) return '';
   const div = document.createElement('div');
   div.textContent = text;
   return div.innerHTML;
 }

 renderWatchLaterView() {
   const resultsContainer = document.getElementById('results');

   if (!this.watchLater || this.watchLater.length === 0) {
     requestAnimationFrame(() => {
       resultsContainer.innerHTML = this.getEmptyWatchLaterState();
     });
     return;
   }

   // FIXED: Use DocumentFragment for efficient rendering with stable dimensions
   const fragment = document.createDocumentFragment();
   const tempDiv = document.createElement('div');
   
   const html = this.watchLater.map(v => `
     <div class="watch-later-item" data-id="${this.escapeHtml(v.id)}" style="min-height: 74px; height: auto;">
       ${v.thumbnail ? 
         `<img src="${this.escapeHtml(v.thumbnail)}" class="watch-later-thumb" alt="Video thumbnail" loading="lazy" style="width: 88px; height: 50px;">` : 
         `<div class="watch-later-thumb" aria-hidden="true" style="width: 88px; height: 50px;"></div>`
       }
       <div class="watch-later-meta">
         <div class="watch-later-title" title="${this.escapeHtml(v.title)}">${this.escapeHtml(v.title)}</div>
         <div class="watch-later-channel" title="Channel: ${this.escapeHtml(v.channelTitle)}">
           📺 ${this.escapeHtml(v.channelTitle)} • ⏰ ${this.escapeHtml(v.published)}
         </div>
       </div>
       <div class="watch-later-actions">
         <button class="btn primary watch-later-open" data-url="${this.escapeHtml(v.url)}" title="Open video" style="height: 32px;">
           ▶️ Open
         </button>
         <button class="btn secondary watch-later-remove" data-id="${this.escapeHtml(v.id)}" title="Remove from Watch Later" style="height: 32px; width: 32px;">
           🗑️
         </button>
       </div>
     </div>
   `).join('');

   tempDiv.innerHTML = `<div class="watch-later-list">${html}</div>`;
   
   while (tempDiv.firstChild) {
     fragment.appendChild(tempDiv.firstChild);
   }
   
   // FIXED: Single DOM update in animation frame
   requestAnimationFrame(() => {
     resultsContainer.innerHTML = '';
     resultsContainer.appendChild(fragment);

     // FIXED: Attach event listeners after DOM update in next frame
     requestAnimationFrame(() => {
       this.setupWatchLaterEventListeners();
     });
   });
 }

 setupWatchLaterEventListeners() {
   document.querySelectorAll('.watch-later-open').forEach(btn => {
     btn.addEventListener('click', (e) => {
       const url = e.currentTarget.dataset.url;
       this.openVideo(url);
     });
   });

   document.querySelectorAll('.watch-later-remove').forEach(btn => {
     btn.addEventListener('click', async (e) => {
       const id = e.currentTarget.dataset.id;
       const item = e.currentTarget.closest('.watch-later-item');
       const title = item?.querySelector('.watch-later-title')?.textContent || 'this video';
       
       if (!confirm(`Remove "${title}" from Watch Later?`)) return;
       
       try {
         // FIXED: Smooth button state update
         requestAnimationFrame(() => {
           btn.disabled = true;
         });
         
         await this.removeFromWatchLater(id);
         await this.loadWatchLater();
         
         // FIXED: Use requestAnimationFrame for smooth update
         requestAnimationFrame(() => {
           this.updateUI();
         });
         
         this.showToast('✅ Removed from Watch Later');
       } catch (error) {
         console.error('Failed to remove from watch later', error);
         this.showToast('❌ Failed to remove video', 'error');
       } finally {
         requestAnimationFrame(() => {
           btn.disabled = false;
         });
       }
     });
   });
 }

 async addToWatchLater(video) {
   try {
     const response = await chrome.runtime.sendMessage({ action: 'addToWatchLater', video });
     if (!response || !response.success) throw new Error(response?.error || 'Failed to add');
     await this.loadWatchLater();
     
     // FIXED: Update stats immediately without full UI refresh using animation frame
     requestAnimationFrame(() => {
       this.updateStats();
     });
     
     this.showToast('✅ Added to Watch Later');
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
     
     // FIXED: Update stats immediately without full UI refresh using animation frame
     requestAnimationFrame(() => {
       this.updateStats();
     });
     
     return true;
   } catch (error) {
     console.error('removeFromWatchLater failed:', error);
     throw error;
   }
 }

 // FIXED: Enhanced cleanup when popup closes
 destroy() {
   // Clear all timeouts to prevent memory leaks
   if (this.statusUpdateInterval) {
     clearInterval(this.statusUpdateInterval);
     this.statusUpdateInterval = null;
   }
   if (this.searchDebounce) {
     clearTimeout(this.searchDebounce);
     this.searchDebounce = null;
   }
   if (this._filterUpdateTimeout) {
     clearTimeout(this._filterUpdateTimeout);
     this._filterUpdateTimeout = null;
   }
   if (this._displayUpdateTimeout) {
     clearTimeout(this._displayUpdateTimeout);
     this._displayUpdateTimeout = null;
   }
   if (this._saveSettingsTimeout) {
     clearTimeout(this._saveSettingsTimeout);
     this._saveSettingsTimeout = null;
   }
   
   // Remove any remaining toasts
   const existingToast = document.querySelector('.toast');
   if (existingToast) {
     existingToast.remove();
   }
   
   // Clear any pending updates
   this.updateScheduled = false;
   this.pendingUpdates.clear();
   
   console.log('PopupController destroyed and cleaned up');
 }
}