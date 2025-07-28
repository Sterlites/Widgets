class PopupController {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.sortBy = 'name';
    this.viewMode = 'list';
    this.expandedChannels = new Set();
    this.searchQuery = '';
    this.isChecking = false;
    this.searchDebounceTimer = null;
    this.toastQueue = [];
    this.activeToasts = new Set();
    
    this.settings = {
      notifications: false,
      autoOpen: 'current',
      checkInterval: 15,
      timeFilter: '1day',
      darkMode: false
    };
    
    this.init();
  }

  async init() {
    try {
      await this.loadSettings();
      await this.updateChannelResults();
      await this.updateStatus();
      this.setupEventListeners();
      this.setupKeyboardShortcuts();
      this.setupAccessibility();
      
      // Auto-collapse sections on startup
      this.toggleSection('instructions');
      this.toggleSection('settings');
      
      // Show keyboard hints after a delay
      setTimeout(() => this.showKeyboardHints(), 2000);
      
      // Setup auto-refresh
      this.setupAutoRefresh();
      
      // Expose controller instance globally for debugging
      window.popupController = this;
      
    } catch (error) {
      console.error('Initialization failed:', error);
      this.showToast('Failed to initialize extension', 'error');
    }
  }

  setupEventListeners() {
    // Settings
    document.getElementById('checkInterval').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      this.settings.checkInterval = value;
      this.saveSettings();
      this.saveCheckInterval(value);
      this.showToast(`Check interval updated to ${value} minutes`, 'success');
    });

    document.getElementById('timeFilter').addEventListener('change', (e) => {
      this.settings.timeFilter = e.target.value;
      this.saveSettings();
      this.saveTimeFilter(e.target.value);
      this.updateChannelResults();
      this.showToast('Time filter updated', 'success');
    });

    document.getElementById('notifications').addEventListener('change', (e) => {
      this.settings.notifications = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        this.requestNotificationPermission();
      } else {
        this.showToast('Notifications disabled', 'info');
      }
    });

    document.getElementById('autoOpen').addEventListener('change', (e) => {
      this.settings.autoOpen = e.target.value;
      this.saveSettings();
      this.showToast('Link opening preference updated', 'info');
    });

    document.getElementById('darkMode').addEventListener('change', (e) => {
      this.settings.darkMode = e.target.checked;
      this.saveSettings();
      this.toggleDarkMode(e.target.checked);
    });

    // View controls
    document.getElementById('sortBy').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.updateChannelResults();
      chrome.storage.local.set({ sortBy: this.sortBy });
    });

    // View mode buttons
    ['listView', 'gridView', 'compactView'].forEach(id => {
      document.getElementById(id).addEventListener('click', (e) => {
        const mode = id.replace('View', '');
        this.setViewMode(mode);
      });
    });

    // Actions
    document.getElementById('checkNow').addEventListener('click', () => {
      this.checkNow();
    });

    document.getElementById('clearData').addEventListener('click', () => {
      this.clearAllData();
    });

    document.getElementById('exportData').addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('importData').addEventListener('click', () => {
      this.importData();
    });

    document.getElementById('refreshData').addEventListener('click', () => {
      this.updateChannelResults();
      this.updateStatus();
    });

    document.getElementById('expandAll').addEventListener('click', () => {
      this.expandAllChannels();
    });

    document.getElementById('collapseAll').addEventListener('click', () => {
      this.collapseAllChannels();
    });

    // Search with debouncing
    document.getElementById('searchChannels').addEventListener('input', (e) => {
      clearTimeout(this.searchDebounceTimer);
      this.searchDebounceTimer = setTimeout(() => {
        this.searchQuery = e.target.value.toLowerCase();
        this.filterChannels();
      }, 300);
    });

    document.getElementById('clearSearch').addEventListener('click', () => {
      this.clearSearch();
    });

    // Collapsible sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const target = header.getAttribute('data-target');
        if (target) {
          this.toggleSection(target);
        }
      });

      // Keyboard support for collapsible headers
      header.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const target = header.getAttribute('data-target');
          if (target) {
            this.toggleSection(target);
          }
        }
      });
    });

    // Help links
    document.getElementById('helpLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.showHelpModal();
    });

    document.getElementById('feedbackLink').addEventListener('click', (e) => {
      e.preventDefault();
      this.showFeedbackModal();
    });

    // Toggle switches keyboard support
    document.querySelectorAll('.toggle-switch').forEach(toggle => {
      toggle.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          const input = toggle.querySelector('input');
          input.checked = !input.checked;
          input.dispatchEvent(new Event('change'));
        }
      });
    });
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't interfere with input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT' || e.target.tagName === 'TEXTAREA') {
        if (e.key === 'Escape') {
          e.target.blur();
          this.clearSearch();
        }
        return;
      }

      // Handle shortcuts
      switch (e.key.toLowerCase()) {
        case 'r':
          e.preventDefault();
          this.checkNow();
          break;
        case 's':
          e.preventDefault();
          document.getElementById('searchChannels').focus();
          break;
        case 'escape':
          this.clearSearch();
          this.hideKeyboardHints();
          break;
        case 'e':
          e.preventDefault();
          this.expandAllChannels();
          break;
        case 'c':
          e.preventDefault();
          this.collapseAllChannels();
          break;
        case '1':
          e.preventDefault();
          this.setViewMode('list');
          break;
        case '2':
          e.preventDefault();
          this.setViewMode('grid');
          break;
        case '3':
          e.preventDefault();
          this.setViewMode('compact');
          break;
        case '?':
        case '/':
          e.preventDefault();
          this.showKeyboardHints();
          break;
        case 'h':
          e.preventDefault();
          this.showHelpModal();
          break;
      }
    });
  }

  setupAccessibility() {
    // Setup focus management
    this.setupFocusManagement();
    
    // Setup screen reader announcements
    this.setupScreenReaderSupport();
    
    // Setup reduced motion support
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      document.body.classList.add('reduced-motion');
    }
  }

  setupFocusManagement() {
    // Ensure proper tab order and focus indicators
    const focusableElements = document.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    
    focusableElements.forEach(element => {
      element.addEventListener('focus', () => {
        element.classList.add('focus-visible');
      });
      
      element.addEventListener('blur', () => {
        element.classList.remove('focus-visible');
      });
    });
  }

  setupScreenReaderSupport() {
    // Create live region for dynamic announcements
    if (!document.getElementById('ariaLiveRegion')) {
      const liveRegion = document.createElement('div');
      liveRegion.id = 'ariaLiveRegion';
      liveRegion.setAttribute('aria-live', 'polite');
      liveRegion.setAttribute('aria-atomic', 'true');
      liveRegion.className = 'sr-only';
      document.body.appendChild(liveRegion);
    }
  }

  announceToScreenReader(message) {
    const liveRegion = document.getElementById('ariaLiveRegion');
    if (liveRegion) {
      liveRegion.textContent = message;
      setTimeout(() => {
        liveRegion.textContent = '';
      }, 1000);
    }
  }

  setupAutoRefresh() {
    // Auto-refresh status every 30 seconds
    setInterval(() => {
      if (!this.isChecking) {
        this.updateStatus();
      }
    }, 30000);
  }

  toggleDarkMode(enabled) {
    document.documentElement.setAttribute('data-theme', enabled ? 'dark' : 'light');
    this.showToast(`${enabled ? 'Dark' : 'Light'} mode enabled`, 'info');
  }

  showKeyboardHints() {
    const hints = document.getElementById('keyboardHints');
    hints.classList.add('show');
    
    setTimeout(() => {
      this.hideKeyboardHints();
    }, 5000);
  }

  hideKeyboardHints() {
    const hints = document.getElementById('keyboardHints');
    hints.classList.remove('show');
  }

  setViewMode(mode) {
    this.viewMode = mode;
    document.body.className = `view-${mode}`;
    
    // Update active button and ARIA states
    document.querySelectorAll('.btn-view').forEach(btn => {
      btn.classList.remove('active');
      btn.setAttribute('aria-pressed', 'false');
    });
    
    const activeBtn = document.getElementById(`${mode}View`);
    activeBtn.classList.add('active');
    activeBtn.setAttribute('aria-pressed', 'true');
    
    // Save preference
    chrome.storage.local.set({ viewMode: mode });
    this.announceToScreenReader(`View mode changed to ${mode}`);
  }

  filterChannels() {
    const channelItems = document.querySelectorAll('.channel-item');
    let visibleCount = 0;
    
    channelItems.forEach(item => {
      const title = item.querySelector('.channel-title')?.textContent.toLowerCase() || '';
      const url = item.querySelector('.channel-url')?.textContent.toLowerCase() || '';
      
      if (this.searchQuery === '' || title.includes(this.searchQuery) || url.includes(this.searchQuery)) {
        item.classList.remove('filtered');
        item.style.display = '';
        visibleCount++;
      } else {
        item.classList.add('filtered');
        item.style.display = 'none';
      }
    });
    
    // Update search results announcement
    if (this.searchQuery) {
      this.announceToScreenReader(`${visibleCount} channels found for "${this.searchQuery}"`);
    }
    
    // Show/hide clear button
    const clearBtn = document.getElementById('clearSearch');
    clearBtn.style.display = this.searchQuery ? 'flex' : 'none';
  }

  async requestNotificationPermission() {
    if ('Notification' in window) {
      try {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          this.showToast('Notifications enabled successfully', 'success');
        } else {
          this.settings.notifications = false;
          document.getElementById('notifications').checked = false;
          this.saveSettings();
          this.showToast('Notification permission denied', 'warning');
        }
      } catch (error) {
        console.error('Notification permission error:', error);
        this.showToast('Failed to enable notifications', 'error');
      }
    } else {
      this.showToast('Notifications not supported in this browser', 'warning');
    }
  }

  showToast(message, type = 'info') {
    // Prevent duplicate toasts
    const toastId = `${type}-${message}`;
    if (this.activeToasts.has(toastId)) {
      return;
    }

    const container = document.getElementById('toastContainer');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'assertive');
    
    container.appendChild(toast);
    this.activeToasts.add(toastId);
    
    // Show toast with animation
    requestAnimationFrame(() => {
      toast.classList.add('show');
    });
    
    // Auto-remove toast
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => {
        if (container.contains(toast)) {
          container.removeChild(toast);
        }
        this.activeToasts.delete(toastId);
      }, 300);
    }, 4000);
  }

  toggleSection(sectionId) {
    const content = document.getElementById(sectionId);
    const header = content.previousElementSibling;
    const icon = header.querySelector('.collapse-icon');
    const isCollapsed = content.classList.contains('collapsed');
    
    if (isCollapsed) {
      content.classList.remove('collapsed');
      header.setAttribute('aria-expanded', 'true');
      icon.textContent = '▼';
      this.announceToScreenReader(`${sectionId} section expanded`);
    } else {
      content.classList.add('collapsed');
      header.setAttribute('aria-expanded', 'false');
      icon.textContent = '▶';
      this.announceToScreenReader(`${sectionId} section collapsed`);
    }
  }

  expandAllChannels() {
    const channelItems = document.querySelectorAll('.channel-item');
    let expandedCount = 0;
    
    channelItems.forEach(item => {
      if (item.classList.contains('collapsed')) {
        item.classList.remove('collapsed');
        const toggle = item.querySelector('.collapse-toggle');
        if (toggle) toggle.textContent = '▼';
        expandedCount++;
      }
    });
    
    if (expandedCount > 0) {
      this.showToast(`Expanded ${expandedCount} channels`, 'info');
      this.announceToScreenReader(`${expandedCount} channels expanded`);
    }
  }

  collapseAllChannels() {
    const channelItems = document.querySelectorAll('.channel-item');
    let collapsedCount = 0;
    
    channelItems.forEach(item => {
      if (!item.classList.contains('collapsed')) {
        item.classList.add('collapsed');
        const toggle = item.querySelector('.collapse-toggle');
        if (toggle) toggle.textContent = '▶';
        collapsedCount++;
      }
    });
    
    if (collapsedCount > 0) {
      this.showToast(`Collapsed ${collapsedCount} channels`, 'info');
      this.announceToScreenReader(`${collapsedCount} channels collapsed`);
    }
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'checkInterval', 'timeFilter', 'sortBy', 'viewMode', 
        'notifications', 'autoOpen', 'darkMode'
      ], (result) => {
        this.settings.checkInterval = result.checkInterval || 15;
        this.settings.timeFilter = result.timeFilter || '1day';
        this.settings.notifications = result.notifications || false;
        this.settings.autoOpen = result.autoOpen || 'current';
        this.settings.darkMode = result.darkMode || false;
        this.sortBy = result.sortBy || 'name';
        this.viewMode = result.viewMode || 'list';
        
        // Update UI elements
        this.updateSettingsUI();
        this.setViewMode(this.viewMode);
        this.toggleDarkMode(this.settings.darkMode);
        
        resolve();
      });
    });
  }

  updateSettingsUI() {
    document.getElementById('checkInterval').value = this.settings.checkInterval;
    document.getElementById('timeFilter').value = this.settings.timeFilter;
    document.getElementById('sortBy').value = this.sortBy;
    document.getElementById('notifications').checked = this.settings.notifications;
    document.getElementById('autoOpen').value = this.settings.autoOpen;
    document.getElementById('darkMode').checked = this.settings.darkMode;
  }

  async saveSettings() {
    try {
      await chrome.storage.local.set(this.settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      this.showToast('Failed to save settings', 'error');
    }
  }

  async saveCheckInterval(minutes) {
    try {
      await chrome.storage.local.set({ checkInterval: minutes });
      await chrome.alarms.clear('checkChannels');
      await chrome.alarms.create('checkChannels', { periodInMinutes: minutes });
    } catch (error) {
      console.error('Failed to save check interval:', error);
      this.showToast('Failed to update check interval', 'error');
    }
  }

  async saveTimeFilter(filter) {
    try {
      await chrome.storage.local.set({ timeFilter: filter });
    } catch (error) {
      console.error('Failed to save time filter:', error);
      this.showToast('Failed to update time filter', 'error');
    }
  }

  async checkNow() {
    if (this.isChecking) {
      this.showToast('Check already in progress', 'warning');
      return;
    }

    const button = document.getElementById('checkNow');
    const icon = document.getElementById('checkNowIcon');
    const text = document.getElementById('checkNowText');
    const spinner = document.getElementById('loadingSpinner');
    const statusIndicator = document.getElementById('statusIndicator');
    const progressBar = document.getElementById('progressBar');
    const headerProgress = document.getElementById('headerProgress');
    
    const originalIcon = icon.textContent;
    const originalText = text.textContent;
    
    // Update UI state
    this.isChecking = true;
    icon.textContent = '⏳';
    text.textContent = 'Checking...';
    button.disabled = true;
    button.setAttribute('aria-busy', 'true');
    spinner.classList.add('active');
    statusIndicator.classList.add('checking');
    headerProgress.classList.add('active');
    progressBar.classList.add('active');

    try {
      this.announceToScreenReader('Starting channel check');
      
      const response = await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          reject(new Error('Check timeout - please try again'));
        }, 60000); // 60 second timeout

        chrome.runtime.sendMessage({ action: 'checkNow' }, (response) => {
          clearTimeout(timeout);
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Check failed - please try again');
      }

      // Success feedback
      icon.textContent = '✅';
      text.textContent = 'Updated!';
      statusIndicator.classList.remove('checking');
      this.showToast('Channels updated successfully', 'success');
      this.announceToScreenReader('Channel check completed successfully');
      
      setTimeout(async () => {
        await this.updateChannelResults();
        await this.updateStatus();
        this.resetCheckButton(button, icon, text, spinner, headerProgress, progressBar, originalIcon, originalText);
      }, 2000);
      
    } catch (error) {
      console.error('Check now failed:', error);
      icon.textContent = '❌';
      text.textContent = 'Error';
      statusIndicator.classList.remove('checking');
      statusIndicator.classList.add('error');
      this.showToast(`Error: ${error.message}`, 'error');
      this.announceToScreenReader(`Channel check failed: ${error.message}`);
      
      setTimeout(() => {
        this.resetCheckButton(button, icon, text, spinner, headerProgress, progressBar, originalIcon, originalText);
        statusIndicator.classList.remove('error');
      }, 3000);
    }
  }

  resetCheckButton(button, icon, text, spinner, headerProgress, progressBar, originalIcon, originalText) {
    this.isChecking = false;
    icon.textContent = originalIcon;
    text.textContent = originalText;
    button.disabled = false;
    button.setAttribute('aria-busy', 'false');
    spinner.classList.remove('active');
    headerProgress.classList.remove('active');
    progressBar.classList.remove('active');
  }

  async clearAllData() {
    const confirmed = confirm(
      'This will clear all stored video data and reset your monitoring history. ' +
      'Your settings will be preserved. Continue?'
    );
    
    if (!confirmed) return;

    try {
      this.showToast('Clearing data...', 'info');
      
      const items = await new Promise((resolve) => {
        chrome.storage.local.get(null, resolve);
      });

      const keysToRemove = Object.keys(items).filter(key => 
        key.startsWith('videos_') || 
        key === 'channelResults' || 
        key === 'lastManualCheck' ||
        key === 'lastResultsUpdate' ||
        key === 'lastTimeFilter'
      );
      
      if (keysToRemove.length > 0) {
        await new Promise((resolve) => {
          chrome.storage.local.remove(keysToRemove, resolve);
        });
      }

      // Clear badge
      await chrome.action.setBadgeText({ text: '' });
      
      this.showToast('Data cleared successfully', 'success');
      this.announceToScreenReader('All monitoring data has been cleared');
      
      setTimeout(() => {
        this.updateChannelResults();
      }, 500);
      
    } catch (error) {
      console.error('Clear data failed:', error);
      this.showToast('Failed to clear data', 'error');
    }
  }

  async exportData() {
    try {
      this.showToast('Preparing export...', 'info');
      
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['channelResults', 'settings'], resolve);
      });
      
      const data = {
        exportDate: new Date().toISOString(),
        version: '1.1.0',
        channelResults: result.channelResults || [],
        settings: this.settings,
        metadata: {
          totalChannels: (result.channelResults || []).length,
          exportedBy: 'YouTube Channel Monitor Extension'
        }
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { 
        type: 'application/json' 
      });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `youtube-monitor-export-${new Date().toISOString().split('T')[0]}.json`;
      a.style.display = 'none';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast('Data exported successfully', 'success');
      this.announceToScreenReader('Data export completed');
      
    } catch (error) {
      console.error('Export failed:', error);
      this.showToast('Failed to export data', 'error');
    }
  }

  async importData() {
    try {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.json';
      input.style.display = 'none';
      
      input.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        
        try {
          this.showToast('Importing data...', 'info');
          
          const text = await file.text();
          const data = JSON.parse(text);
          
          // Validate import data
          if (!data.channelResults || !Array.isArray(data.channelResults)) {
            throw new Error('Invalid import file format');
          }
          
          // Import data
          await chrome.storage.local.set({
            channelResults: data.channelResults,
            lastResultsUpdate: Date.now()
          });
          
          // Optionally import settings
          if (data.settings && confirm('Import settings as well?')) {
            Object.assign(this.settings, data.settings);
            await this.saveSettings();
            this.updateSettingsUI();
          }
          
          this.showToast(`Imported ${data.channelResults.length} channels`, 'success');
          this.announceToScreenReader(`Import completed with ${data.channelResults.length} channels`);
          
          setTimeout(() => {
            this.updateChannelResults();
          }, 500);
          
        } catch (error) {
          console.error('Import failed:', error);
          this.showToast('Failed to import data - invalid file format', 'error');
        }
        
        document.body.removeChild(input);
      };
      
      document.body.appendChild(input);
      input.click();
      
    } catch (error) {
      console.error('Import setup failed:', error);
      this.showToast('Failed to setup import', 'error');
    }
  }

  sortChannels(channels) {
    return channels.sort((a, b) => {
      // Always put error channels at the bottom
      if (a.error && !b.error) return 1;
      if (!a.error && b.error) return -1;
      if (a.error && b.error) return a.channelTitle.localeCompare(b.channelTitle);

      // Then sort channels with no activity to bottom
      const aHasActivity = (a.filteredVideos?.length || 0) > 0;
      const bHasActivity = (b.filteredVideos?.length || 0) > 0;
      
      if (!aHasActivity && bHasActivity) return 1;
      if (aHasActivity && !bHasActivity) return -1;

      // Then sort by selected criteria
      switch (this.sortBy) {
        case 'new':
          const aNew = a.newVideos?.length || 0;
          const bNew = b.newVideos?.length || 0;
          if (aNew !== bNew) return bNew - aNew;
          break;
        case 'filtered':
          const aFiltered = a.filteredVideos?.length || 0;
          const bFiltered = b.filteredVideos?.length || 0;
          if (aFiltered !== bFiltered) return bFiltered - aFiltered;
          break;
        case 'activity':
          const aActivity = Math.max(...(a.filteredVideos?.map(v => v.publishedTimestamp) || [0]));
          const bActivity = Math.max(...(b.filteredVideos?.map(v => v.publishedTimestamp) || [0]));
          if (aActivity !== bActivity) return bActivity - aActivity;
          break;
        default: // name
          return a.channelTitle.localeCompare(b.channelTitle);
      }
      
      // Fallback to name sort
      return a.channelTitle.localeCompare(b.channelTitle);
    });
  }

  async updateChannelResults() {
    const resultsContainer = document.getElementById('channelResults');
    
    try {
      this.showLoadingSkeleton(resultsContainer);
      
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['channelResults', 'lastTimeFilter', 'timeFilter'], resolve);
      });
      
      let channelResults = result.channelResults || [];
      const currentTimeFilter = result.timeFilter || '1day';
      
      // Update time filter info
      const timeFilterText = this.getTimeFilterText(currentTimeFilter);
      document.getElementById('timeFilterInfo').textContent = `Showing videos from: ${timeFilterText}`;
      
      if (channelResults.length === 0) {
        resultsContainer.innerHTML = this.getEmptyState();
        this.updateSummaryStats(0, 0, 0, 0);
        this.updateQuickStats(0, 0, 0);
        return;
      }

      // Sort channels
      channelResults = this.sortChannels(channelResults);

      // Calculate summary stats
      let totalChannels = channelResults.length;
      let totalNewVideos = channelResults.reduce((sum, ch) => sum + (ch.newVideos?.length || 0), 0);
      let totalFiltered = channelResults.reduce((sum, ch) => sum + (ch.filteredVideos?.length || 0), 0);
      let totalVideos = channelResults.reduce((sum, ch) => sum + (ch.totalVideos || 0), 0);
      let activeChannels = channelResults.filter(ch => (ch.filteredVideos?.length || 0) > 0).length;
      
      this.updateSummaryStats(totalChannels, totalNewVideos, totalFiltered, totalVideos);
      this.updateQuickStats(totalNewVideos, totalChannels, activeChannels);

      // Generate channel HTML with staggered animation
      const channelsHtml = channelResults.map((channel, index) => 
        this.generateChannelHtml(channel, index)
      ).join('');

      resultsContainer.innerHTML = channelsHtml;
      
      // Add staggered fade-in animation
      const channelItems = resultsContainer.querySelectorAll('.channel-item');
      channelItems.forEach((item, index) => {
        item.style.animationDelay = `${index * 50}ms`;
        item.classList.add('fade-in');
      });

      // Add event listeners after DOM is updated
      this.setupChannelListeners();
      
      // Apply search filter if active
      if (this.searchQuery) {
        this.filterChannels();
      }

// Announce update to screen readers
     this.announceToScreenReader(
       `Channel results updated. ${totalChannels} channels, ${totalNewVideos} new videos`
     );

   } catch (error) {
     console.error('Error updating channel results:', error);
     resultsContainer.innerHTML = this.getErrorState('Failed to load channel data');
     this.showToast('Failed to load channel data', 'error');
   }
 }

 showLoadingSkeleton(container) {
   container.innerHTML = `
     <div class="loading">
       <div class="loading-animation" role="img" aria-label="Loading"></div>
       <span>Loading channels...</span>
     </div>
   `;
 }

 updateSummaryStats(channels, newVideos, filtered, total) {
   const statsContainer = document.getElementById('summaryStats');
   const stats = [
     { number: channels, label: 'Channels', ariaLabel: 'Total channels monitored' },
     { number: newVideos, label: 'New Videos', ariaLabel: 'New videos found' },
     { number: filtered, label: 'In Timeframe', ariaLabel: 'Videos in current timeframe' },
     { number: total, label: 'Total Videos', ariaLabel: 'Total videos across all channels' }
   ];

   statsContainer.innerHTML = stats.map(stat => `
     <div class="stat-item" role="img" aria-label="${stat.ariaLabel}: ${stat.number}">
       <span class="stat-number">${this.formatNumber(stat.number)}</span>
       <span class="stat-label">${stat.label}</span>
     </div>
   `).join('');
 }

 updateQuickStats(newVideos, channels, active) {
   document.getElementById('quickNewCount').textContent = this.formatNumber(newVideos);
   document.getElementById('quickChannelCount').textContent = this.formatNumber(channels);
   document.getElementById('quickStatusCount').textContent = this.formatNumber(active);
 }

 formatNumber(num) {
   if (num >= 1000000) {
     return (num / 1000000).toFixed(1) + 'M';
   } else if (num >= 1000) {
     return (num / 1000).toFixed(1) + 'K';
   }
   return num.toString();
 }

 generateChannelHtml(channel, index) {
   if (channel.error) {
     return `
       <div class="channel-item fade-in" data-channel="${index}" role="article" aria-labelledby="channel-${index}-title">
         <div class="channel-header">
           <div class="channel-info">
             <div id="channel-${index}-title" class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
             <div class="channel-url">${this.escapeHtml(channel.channelUrl)}</div>
           </div>
           <div class="channel-stats">
             <span class="stat-badge error" role="alert">Error</span>
           </div>
         </div>
         <div class="error-message" role="alert">${this.escapeHtml(channel.error)}</div>
       </div>
     `;
   }

   const newCount = channel.newVideos?.length || 0;
   const filteredCount = channel.filteredVideos?.length || 0;
   const totalCount = channel.totalVideos || 0;
   const hasActivity = filteredCount > 0;
   const hasNew = newCount > 0;

   // Auto-collapse channels with no activity
   const isCollapsed = !hasActivity;
   const collapseClass = isCollapsed ? 'collapsed' : '';
   const collapseIcon = isCollapsed ? '▶' : '▼';

   let channelClasses = ['channel-item', 'fade-in'];
   if (hasNew) channelClasses.push('has-new');
   if (!hasActivity) channelClasses.push('no-activity');
   if (isCollapsed) channelClasses.push('collapsed');

   let channelHtml = `
     <div class="${channelClasses.join(' ')}" data-channel="${index}" role="article" aria-labelledby="channel-${index}-title">
       <div class="channel-header" data-toggle-channel="${index}" role="button" tabindex="0" 
            aria-expanded="${!isCollapsed}" aria-controls="videos-${index}">
         <div class="channel-info">
           <div id="channel-${index}-title" class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
           <div class="channel-url">${this.escapeHtml(channel.channelUrl)}</div>
         </div>
         <div class="channel-stats">
           ${newCount > 0 ? `<span class="stat-badge new" role="status">${newCount} new</span>` : ''}
           <span class="stat-badge ${filteredCount === 0 ? 'zero' : 'filtered'}">
             ${filteredCount} in timeframe
           </span>
           <span class="collapse-toggle" aria-hidden="true">${collapseIcon}</span>
         </div>
       </div>
   `;

   if (filteredCount === 0) {
     channelHtml += `<div class="no-videos">No videos found in selected timeframe</div>`;
   } else {
     const newVideoIds = new Set((channel.newVideos || []).map(v => v.id));
     
     channelHtml += `
       <div id="videos-${index}" class="videos-list" role="region" aria-labelledby="channel-${index}-title">
         ${(channel.filteredVideos || []).map((video, videoIndex) => `
           <div class="video-item ${newVideoIds.has(video.id) ? 'new' : ''}" 
                data-video-url="${video.url}" role="button" tabindex="0"
                aria-describedby="video-${index}-${videoIndex}-published">
             <div class="video-content">
               <div class="video-title">${this.escapeHtml(video.title)}</div>
               <div id="video-${index}-${videoIndex}-published" class="video-published">${this.escapeHtml(video.published)}</div>
             </div>
             <div class="video-badges">
               ${newVideoIds.has(video.id) ? '<span class="new-indicator" role="status" aria-label="New video">NEW</span>' : ''}
             </div>
           </div>
         `).join('')}
       </div>
     `;
   }

   channelHtml += `</div>`;
   return channelHtml;
 }

 setupChannelListeners() {
   // Add click listeners for channel headers
   document.querySelectorAll('[data-toggle-channel]').forEach(header => {
     header.addEventListener('click', (e) => {
       const index = header.getAttribute('data-toggle-channel');
       this.toggleChannel(parseInt(index));
     });

     // Keyboard support
     header.addEventListener('keydown', (e) => {
       if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         const index = header.getAttribute('data-toggle-channel');
         this.toggleChannel(parseInt(index));
       }
     });
   });

   // Add click listeners for video items
   document.querySelectorAll('[data-video-url]').forEach(videoItem => {
     videoItem.addEventListener('click', (e) => {
       const videoUrl = videoItem.getAttribute('data-video-url');
       this.openVideo(videoUrl);
     });

     // Keyboard support
     videoItem.addEventListener('keydown', (e) => {
       if (e.key === 'Enter' || e.key === ' ') {
         e.preventDefault();
         const videoUrl = videoItem.getAttribute('data-video-url');
         this.openVideo(videoUrl);
       }
     });
   });
 }

 toggleChannel(index) {
   const channelItem = document.querySelector(`[data-channel="${index}"]`);
   const header = channelItem.querySelector('[data-toggle-channel]');
   const toggle = channelItem.querySelector('.collapse-toggle');
   const isCollapsed = channelItem.classList.contains('collapsed');
   
   if (isCollapsed) {
     channelItem.classList.remove('collapsed');
     header.setAttribute('aria-expanded', 'true');
     toggle.textContent = '▼';
   } else {
     channelItem.classList.add('collapsed');
     header.setAttribute('aria-expanded', 'false');
     toggle.textContent = '▶';
   }
 }

 async openVideo(videoUrl) {
   try {
     const openMode = this.settings.autoOpen;
     
     if (openMode === 'current') {
       const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
       if (tab) {
         await chrome.tabs.update(tab.id, { url: videoUrl });
       } else {
         await chrome.tabs.create({ url: videoUrl });
       }
     } else if (openMode === 'background') {
       await chrome.tabs.create({ url: videoUrl, active: false });
       this.showToast('Video opened in background tab', 'info');
     } else {
       await chrome.tabs.create({ url: videoUrl });
     }
     
     // Don't close popup immediately in background mode
     if (openMode !== 'background') {
       window.close();
     }
     
   } catch (error) {
     console.error('Failed to open video:', error);
     this.showToast('Failed to open video', 'error');
   }
 }

 clearSearch() {
   const searchInput = document.getElementById('searchChannels');
   searchInput.value = '';
   this.searchQuery = '';
   this.filterChannels();
   this.announceToScreenReader('Search cleared');
 }

 getEmptyState() {
   return `
     <div class="empty-state fade-in" role="img" aria-label="No channels found">
       <div class="empty-state-icon">📺</div>
       <h4>No Channels Found</h4>
       <p>
         Create a "Vid" bookmarks folder and add YouTube channel /videos pages, 
         then click "Check Now" to get started.
       </p>
     </div>
   `;
 }

 getErrorState(message) {
   return `
     <div class="empty-state fade-in" role="alert">
       <div class="empty-state-icon">⚠️</div>
       <h4>Error Loading Data</h4>
       <p>${this.escapeHtml(message)}</p>
     </div>
   `;
 }

 getTimeFilterText(filter) {
   switch (filter) {
     case '1hour': return 'Last hour';
     case '1day': return 'Last 24 hours';
     case '1week': return 'Last week';
     case '1month': return 'Last month';
     case '1year': return 'Last year';
     case 'lastcheck': return 'Since last manual check';
     default: return 'Last 24 hours';
   }
 }

 async updateStatus() {
   const statusText = document.getElementById('statusText');
   const lastUpdate = document.getElementById('lastUpdate');
   const statusIndicator = document.getElementById('statusIndicator');
   
   try {
     const result = await new Promise((resolve) => {
       chrome.storage.local.get(['lastCheck', 'lastManualCheck', 'lastCheckSuccess'], resolve);
     });
     
     let mainStatus = '';
     let updateTime = '';
     
     // Update status indicator
     if (result.lastCheckSuccess !== false) {
       statusIndicator.classList.remove('error');
     } else {
       statusIndicator.classList.add('error');
     }
     
     if (result.lastCheck) {
       const lastCheck = new Date(result.lastCheck);
       const now = new Date();
       const diffMinutes = Math.floor((now - lastCheck) / (1000 * 60));
       
       if (diffMinutes < 1) {
         mainStatus = 'Just checked';
       } else if (diffMinutes < 60) {
         mainStatus = `Last check: ${diffMinutes}m ago`;
       } else {
         const diffHours = Math.floor(diffMinutes / 60);
         if (diffHours < 24) {
           mainStatus = `Last check: ${diffHours}h ago`;
         } else {
           const diffDays = Math.floor(diffHours / 24);
           mainStatus = `Last check: ${diffDays}d ago`;
         }
       }
     }
     
     if (result.lastManualCheck) {
       const lastManualCheck = new Date(result.lastManualCheck);
       updateTime = `Manual: ${lastManualCheck.toLocaleTimeString()}`;
     }
     
     if (!mainStatus) {
       mainStatus = 'Never checked - Click "Check Now" to start';
       statusIndicator.classList.add('error');
     }
     
     statusText.textContent = mainStatus;
     lastUpdate.textContent = updateTime || 'Never updated manually';
     
   } catch (error) {
     console.error('Failed to update status:', error);
     statusText.textContent = 'Status unknown';
     lastUpdate.textContent = 'Update time unknown';
     statusIndicator.classList.add('error');
   }
 }

 showHelpModal() {
   this.showToast('Opening help documentation...', 'info');
   // In a real implementation, you might open a help page or modal
   console.log('Help modal would open here');
 }

 showFeedbackModal() {
   this.showToast('Opening feedback form...', 'info');
   // In a real implementation, you might open a feedback form
   console.log('Feedback modal would open here');
 }

 escapeHtml(text) {
   if (!text) return '';
   const div = document.createElement('div');
   div.textContent = text;
   return div.innerHTML;
 }

 // Utility method for smooth scrolling
 smoothScrollToElement(element) {
   element.scrollIntoView({
     behavior: 'smooth',
     block: 'nearest',
     inline: 'start'
   });
 }

 // Method to handle window resize
 handleWindowResize() {
   // Update layout based on new dimensions
   const width = window.innerWidth;
   
   if (width < 500) {
     document.body.classList.add('mobile');
   } else {
     document.body.classList.remove('mobile');
   }
 }

 // Method to handle connection status
 updateConnectionStatus(isOnline) {
   if (!isOnline) {
     this.showToast('You are offline. Some features may not work.', 'warning');
   }
 }

 // Method to cleanup resources
 cleanup() {
   // Clear any pending timers
   if (this.searchDebounceTimer) {
     clearTimeout(this.searchDebounceTimer);
   }
   
   // Clear any active toasts
   this.activeToasts.clear();
 }
}

// Enhanced error handling
window.addEventListener('error', (event) => {
 console.error('Global error:', event.error);
});

window.addEventListener('unhandledrejection', (event) => {
 console.error('Unhandled promise rejection:', event.reason);
});

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
 try {
   new PopupController();
 } catch (error) {
   console.error('Failed to initialize popup:', error);
   
   // Show basic error message if initialization fails
   document.body.innerHTML = `
     <div style="padding: 20px; text-align: center; color: #dc2626;">
       <h3>🚫 Initialization Error</h3>
       <p>Failed to load the extension. Please try:</p>
       <ul style="text-align: left; max-width: 300px; margin: 16px auto;">
         <li>Refreshing the extension</li>
         <li>Restarting your browser</li>
         <li>Reinstalling the extension</li>
       </ul>
       <button onclick="window.location.reload()" 
               style="padding: 8px 16px; margin-top: 16px; border: none; 
                      border-radius: 6px; background: #667eea; color: white; 
                      cursor: pointer;">
         Retry
       </button>
     </div>
   `;
 }
});

// Handle page visibility changes
document.addEventListener('visibilitychange', () => {
 if (!document.hidden) {
   // Page is visible again, refresh status
   const controller = window.popupController;
   if (controller && !controller.isChecking) {
     controller.updateStatus();
   }
 }
});

// Handle window resize
window.addEventListener('resize', () => {
 const controller = window.popupController;
 if (controller) {
   controller.handleWindowResize();
 }
});

// Handle online/offline status
window.addEventListener('online', () => {
 const controller = window.popupController;
 if (controller) {
   controller.updateConnectionStatus(true);
 }
});

window.addEventListener('offline', () => {
 const controller = window.popupController;
 if (controller) {
   controller.updateConnectionStatus(false);
 }
});

// Expose controller instance for debugging
window.addEventListener('load', () => {
 setTimeout(() => {
   if (window.popupController) {
     window.popupController = window.popupController;
   }
 }, 100);
});