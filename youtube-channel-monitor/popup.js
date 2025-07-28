class PopupController {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.sortBy = 'name';
    this.viewMode = 'list';
    this.expandedChannels = new Set();
    this.searchQuery = '';
    this.settings = {
      notifications: false,
      autoOpen: 'current',
      checkInterval: 15,
      timeFilter: '1day'
    };
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.updateChannelResults();
    await this.updateStatus();
    this.setupEventListeners();
    this.setupKeyboardShortcuts();
    
    // Auto-collapse instructions and settings on startup
    this.toggleSection('instructions');
    this.toggleSection('settings');
    
    // Show keyboard hints briefly
    setTimeout(() => this.showKeyboardHints(), 1000);
  }

  setupEventListeners() {
    // Settings
    document.getElementById('checkInterval').addEventListener('change', (e) => {
      const value = parseInt(e.target.value);
      this.settings.checkInterval = value;
      this.saveSettings();
      this.saveCheckInterval(value);
    });

    document.getElementById('timeFilter').addEventListener('change', (e) => {
      this.settings.timeFilter = e.target.value;
      this.saveSettings();
      this.saveTimeFilter(e.target.value);
      this.updateChannelResults();
    });

    document.getElementById('notifications').addEventListener('change', (e) => {
      this.settings.notifications = e.target.checked;
      this.saveSettings();
      if (e.target.checked) {
        this.requestNotificationPermission();
      }
    });

    document.getElementById('autoOpen').addEventListener('change', (e) => {
      this.settings.autoOpen = e.target.value;
      this.saveSettings();
    });

    // View controls
    document.getElementById('sortBy').addEventListener('change', (e) => {
      this.sortBy = e.target.value;
      this.updateChannelResults();
    });

    document.getElementById('gridView').addEventListener('click', () => {
      this.setViewMode('grid');
    });

    document.getElementById('listView').addEventListener('click', () => {
      this.setViewMode('list');
    });

    document.getElementById('compactView').addEventListener('click', () => {
      this.setViewMode('compact');
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

    document.getElementById('refreshData').addEventListener('click', () => {
      this.updateChannelResults();
    });

    document.getElementById('expandAll').addEventListener('click', () => {
      this.expandAllChannels();
    });

    document.getElementById('collapseAll').addEventListener('click', () => {
      this.collapseAllChannels();
    });

    // Search
    document.getElementById('searchChannels').addEventListener('input', (e) => {
      this.searchQuery = e.target.value.toLowerCase();
      this.filterChannels();
    });

    document.getElementById('clearSearch').addEventListener('click', () => {
      document.getElementById('searchChannels').value = '';
      this.searchQuery = '';
      this.filterChannels();
    });

    // Collapsible sections
    document.querySelectorAll('.collapsible-header').forEach(header => {
      header.addEventListener('click', (e) => {
        const target = header.getAttribute('data-target');
        if (target) {
          this.toggleSection(target);
        }
      });
    });

    // Auto-refresh every 30 seconds
    setInterval(() => {
      this.updateStatus();
    }, 30000);
  }

  setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
      // Don't interfere with input fields
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') {
        if (e.key === 'Escape') {
          e.target.blur();
          this.clearSearch();
        }
        return;
      }

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
      }
    });
  }

  showKeyboardHints() {
    const hints = document.getElementById('keyboardHints');
    hints.classList.add('show');
    setTimeout(() => {
      hints.classList.remove('show');
    }, 3000);
  }

  setViewMode(mode) {
    this.viewMode = mode;
    document.body.className = `view-${mode}`;
    
    // Update active button
    document.querySelectorAll('.btn-view').forEach(btn => btn.classList.remove('active'));
    document.getElementById(`${mode}View`).classList.add('active');
    
    // Save preference
    chrome.storage.local.set({ viewMode: mode });
  }

  filterChannels() {
    const channelItems = document.querySelectorAll('.channel-item');
    channelItems.forEach(item => {
      const title = item.querySelector('.channel-title')?.textContent.toLowerCase() || '';
      const url = item.querySelector('.channel-url')?.textContent.toLowerCase() || '';
      
      if (this.searchQuery === '' || title.includes(this.searchQuery) || url.includes(this.searchQuery)) {
        item.classList.remove('filtered');
      } else {
        item.classList.add('filtered');
      }
    });
  }

  async requestNotificationPermission() {
    if ('Notification' in window) {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') {
        this.settings.notifications = false;
        document.getElementById('notifications').checked = false;
        this.saveSettings();
        this.showToast('Notification permission denied', 'error');
      }
    }
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10);
    setTimeout(() => {
      toast.classList.remove('show');
      setTimeout(() => document.body.removeChild(toast), 300);
    }, 3000);
  }

  toggleSection(sectionId) {
    const content = document.getElementById(sectionId);
    const header = content.previousElementSibling;
    const icon = header.querySelector('.collapse-icon');
    
    if (content.classList.contains('collapsed')) {
      content.classList.remove('collapsed');
      icon.textContent = '▼';
    } else {
      content.classList.add('collapsed');
      icon.textContent = '▶';
    }
  }

  expandAllChannels() {
    const channelItems = document.querySelectorAll('.channel-item');
    channelItems.forEach(item => {
      item.classList.remove('collapsed');
      const toggle = item.querySelector('.collapse-toggle');
      if (toggle) toggle.textContent = '▼';
    });
  }

  collapseAllChannels() {
    const channelItems = document.querySelectorAll('.channel-item');
    channelItems.forEach(item => {
      item.classList.add('collapsed');
      const toggle = item.querySelector('.collapse-toggle');
      if (toggle) toggle.textContent = '▶';
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get([
        'checkInterval', 'timeFilter', 'sortBy', 'viewMode', 'notifications', 'autoOpen'
      ], (result) => {
        this.settings.checkInterval = result.checkInterval || 15;
        this.settings.timeFilter = result.timeFilter || '1day';
        this.settings.notifications = result.notifications || false;
        this.settings.autoOpen = result.autoOpen || 'current';
        this.sortBy = result.sortBy || 'name';
        this.viewMode = result.viewMode || 'list';
        
        // Update UI
        document.getElementById('checkInterval').value = this.settings.checkInterval;
        document.getElementById('timeFilter').value = this.settings.timeFilter;
        document.getElementById('sortBy').value = this.sortBy;
        document.getElementById('notifications').checked = this.settings.notifications;
        document.getElementById('autoOpen').value = this.settings.autoOpen;
        
        this.setViewMode(this.viewMode);
        resolve();
      });
    });
  }

  async saveSettings() {
    chrome.storage.local.set(this.settings);
  }

  async saveCheckInterval(minutes) {
    chrome.storage.local.set({ checkInterval: minutes });
    chrome.alarms.clear('checkChannels');
    chrome.alarms.create('checkChannels', { periodInMinutes: minutes });
  }

  async saveTimeFilter(filter) {
    chrome.storage.local.set({ timeFilter: filter });
  }

  async checkNow() {
    const button = document.getElementById('checkNow');
    const icon = document.getElementById('checkNowIcon');
    const text = document.getElementById('checkNowText');
    const spinner = document.getElementById('loadingSpinner');
    const statusIndicator = document.getElementById('statusIndicator');
    
    const originalIcon = icon.textContent;
    const originalText = text.textContent;
    
    // Update UI state
    icon.textContent = '⏳';
    text.textContent = 'Checking...';
    button.disabled = true;
    spinner.classList.add('active');
    statusIndicator.classList.add('checking');

    try {
      const response = await new Promise((resolve, reject) => {
        chrome.runtime.sendMessage({ action: 'checkNow' }, (response) => {
          if (chrome.runtime.lastError) {
            reject(new Error(chrome.runtime.lastError.message));
          } else {
            resolve(response);
          }
        });
      });

      if (!response || !response.success) {
        throw new Error(response?.error || 'Check failed');
      }

      // Success feedback
      icon.textContent = '✅';
      text.textContent = 'Updated!';
      statusIndicator.classList.remove('checking');
      this.showToast('Channels updated successfully', 'success');
      
      setTimeout(async () => {
        await this.updateChannelResults();
        await this.updateStatus();
        icon.textContent = originalIcon;
        text.textContent = originalText;
        button.disabled = false;
        spinner.classList.remove('active');
      }, 2000);
      
    } catch (error) {
      console.error('Check now failed:', error);
      icon.textContent = '❌';
      text.textContent = 'Error';
      statusIndicator.classList.remove('checking');
      statusIndicator.classList.add('error');
      this.showToast(`Error: ${error.message}`, 'error');
      
      setTimeout(() => {
        icon.textContent = originalIcon;
        text.textContent = originalText;
        button.disabled = false;
        spinner.classList.remove('active');
        statusIndicator.classList.remove('error');
      }, 3000);
    }
  }

  async clearAllData() {
    const confirmed = confirm('This will clear all stored video data and notifications. Continue?');
    if (!confirmed) return;

    try {
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

      chrome.action.setBadgeText({ text: '' });
      this.showToast('Data cleared successfully', 'success');
      
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
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['channelResults'], resolve);
      });
      
      const data = {
        exportDate: new Date().toISOString(),
        version: '1.1.0',
        channelResults: result.channelResults || []
      };
      
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `youtube-monitor-export-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      this.showToast('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export failed:', error);
      this.showToast('Failed to export data', 'error');
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
        this.updateQuickStats(0, 0);
        return;
      }

      // Sort channels
      channelResults = this.sortChannels(channelResults);

      // Calculate summary stats
      let totalChannels = channelResults.length;
      let totalNewVideos = channelResults.reduce((sum, ch) => sum + (ch.newVideos?.length || 0), 0);
      let totalFiltered = channelResults.reduce((sum, ch) => sum + (ch.filteredVideos?.length || 0), 0);
      let totalVideos = channelResults.reduce((sum, ch) => sum + (ch.totalVideos || 0), 0);
      
      this.updateSummaryStats(totalChannels, totalNewVideos, totalFiltered, totalVideos);
      this.updateQuickStats(totalNewVideos, totalChannels);

      // Generate channel HTML
      const channelsHtml = channelResults.map((channel, index) => 
        this.generateChannelHtml(channel, index)
      ).join('');

      resultsContainer.innerHTML = channelsHtml;
      resultsContainer.classList.add('fade-in');

      // Add event listeners after DOM is updated
      this.setupChannelListeners();
      
      // Apply search filter if active
      if (this.searchQuery) {
        this.filterChannels();
      }

    } catch (error) {
      console.error('Error updating channel results:', error);
      resultsContainer.innerHTML = '<div class="loading">Error loading channel data</div>';
    }
  }

  updateSummaryStats(channels, newVideos, filtered, total) {
    const statsContainer = document.getElementById('summaryStats');
    statsContainer.innerHTML = `
      <div class="stat-item">
        <span class="stat-number">${channels}</span>
        <span class="stat-label">Channels</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${newVideos}</span>
        <span class="stat-label">New Videos</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${filtered}</span>
        <span class="stat-label">In Timeframe</span>
      </div>
      <div class="stat-item">
        <span class="stat-number">${total}</span>
        <span class="stat-label">Total Videos</span>
      </div>
    `;
  }

  updateQuickStats(newVideos, channels) {
    document.getElementById('quickNewCount').textContent = newVideos;
    document.getElementById('quickChannelCount').textContent = channels;
  }

  generateChannelHtml(channel, index) {
    if (channel.error) {
      return `
        <div class="channel-item fade-in" data-channel="${index}">
          <div class="channel-header">
            <div class="channel-info">
              <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
              <div class="channel-url">${this.escapeHtml(channel.channelUrl)}</div>
            </div>
            <div class="channel-stats">
              <span class="stat-badge error">Error</span>
            </div>
          </div>
          <div class="error-message">${this.escapeHtml(channel.error)}</div>
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
      <div class="${channelClasses.join(' ')}" data-channel="${index}">
        <div class="channel-header" data-toggle-channel="${index}">
          <div class="channel-info">
            <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
            <div class="channel-url">${this.escapeHtml(channel.channelUrl)}</div>
          </div>
          <div class="channel-stats">
${newCount > 0 ? `<span class="stat-badge new">${newCount} new</span>` : ''}
           <span class="stat-badge ${filteredCount === 0 ? 'zero' : 'filtered'}">
             ${filteredCount} in timeframe
           </span>
           <span class="collapse-toggle">${collapseIcon}</span>
         </div>
       </div>
   `;

   if (filteredCount === 0) {
     channelHtml += `<div class="no-videos">No videos found in selected timeframe</div>`;
   } else {
     const newVideoIds = new Set((channel.newVideos || []).map(v => v.id));
     
     channelHtml += `
       <div class="videos-list">
         ${(channel.filteredVideos || []).map(video => `
           <div class="video-item ${newVideoIds.has(video.id) ? 'new' : ''}" 
                data-video-url="${video.url}">
             <div class="video-content">
               <div class="video-title">${this.escapeHtml(video.title)}</div>
               <div class="video-published">${this.escapeHtml(video.published)}</div>
             </div>
             <div class="video-badges">
               ${newVideoIds.has(video.id) ? '<span class="new-indicator">NEW</span>' : ''}
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
   });

   // Add click listeners for video items
   document.querySelectorAll('[data-video-url]').forEach(videoItem => {
     videoItem.addEventListener('click', (e) => {
       const videoUrl = videoItem.getAttribute('data-video-url');
       this.openVideo(videoUrl);
     });
   });
 }

 toggleChannel(index) {
   const channelItem = document.querySelector(`[data-channel="${index}"]`);
   const toggle = channelItem.querySelector('.collapse-toggle');
   
   if (channelItem.classList.contains('collapsed')) {
     channelItem.classList.remove('collapsed');
     toggle.textContent = '▼';
   } else {
     channelItem.classList.add('collapsed');
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
     } else {
       await chrome.tabs.create({ url: videoUrl });
     }
     
     window.close();
   } catch (error) {
     console.error('Failed to open video:', error);
     this.showToast('Failed to open video', 'error');
   }
 }

 clearSearch() {
   document.getElementById('searchChannels').value = '';
   this.searchQuery = '';
   this.filterChannels();
 }

 getEmptyState() {
   return `
     <div class="empty-state fade-in">
       <div class="empty-state-icon">📺</div>
       <h4>No Channels Found</h4>
       <p>Create a "Vid" bookmarks folder and add YouTube channel /videos pages, then click "Check Now" to get started.</p>
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
   
   try {
     const result = await new Promise((resolve) => {
       chrome.storage.local.get(['lastCheck', 'lastManualCheck'], resolve);
     });
     
     let mainStatus = '';
     let updateTime = '';
     
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
           mainStatus = `Last check: ${lastCheck.toLocaleDateString()}`;
         }
       }
     }
     
     if (result.lastManualCheck) {
       const lastManualCheck = new Date(result.lastManualCheck);
       updateTime = `Manual: ${lastManualCheck.toLocaleTimeString()}`;
     }
     
     if (!mainStatus) {
       mainStatus = 'Never checked - Click "Check Now" to start';
     }
     
     statusText.textContent = mainStatus;
     lastUpdate.textContent = updateTime || 'Never updated manually';
   } catch (error) {
     statusText.textContent = 'Status unknown';
     lastUpdate.textContent = 'Update time unknown';
   }
 }

 escapeHtml(text) {
   if (!text) return '';
   const div = document.createElement('div');
   div.textContent = text;
   return div.innerHTML;
 }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
 new PopupController();
});