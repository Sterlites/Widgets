class PopupController {
  constructor() {
    this.FOLDER_NAME = 'Vid';
    this.init();
  }

  async init() {
    await this.loadSettings();
    await this.updateChannelResults();
    await this.updateStatus();
    this.setupEventListeners();
  }

  setupEventListeners() {
    document.getElementById('checkInterval').addEventListener('change', (e) => {
      this.saveCheckInterval(parseInt(e.target.value));
    });

    document.getElementById('timeFilter').addEventListener('change', (e) => {
      this.saveTimeFilter(e.target.value);
      this.updateChannelResults();
    });

    document.getElementById('checkNow').addEventListener('click', () => {
      this.checkNow();
    });

    document.getElementById('clearData').addEventListener('click', () => {
      this.clearAllData();
    });
  }

  async loadSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['checkInterval', 'timeFilter'], (result) => {
        const interval = result.checkInterval || 15;
        const timeFilter = result.timeFilter || '1day';
        
        document.getElementById('checkInterval').value = interval;
        document.getElementById('timeFilter').value = timeFilter;
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

  async saveTimeFilter(filter) {
    chrome.storage.local.set({ timeFilter: filter });
  }

  async checkNow() {
    const button = document.getElementById('checkNow');
    const originalText = button.textContent;
    button.textContent = 'Checking...';
    button.disabled = true;

    try {
      // Send message to background script for manual check
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

      // Wait for background script to process
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      await this.updateChannelResults();
      await this.updateStatus();
      
    } catch (error) {
      console.error('Check now failed:', error);
      // Show error in UI
      const status = document.getElementById('status');
      const originalStatus = status.textContent;
      status.textContent = `Error: ${error.message}`;
      setTimeout(() => {
        status.textContent = originalStatus;
      }, 3000);
    } finally {
      button.textContent = originalText;
      button.disabled = false;
    }
  }

  async clearAllData() {
    const confirmed = confirm('This will clear all stored video data and notifications. Continue?');
    if (!confirmed) return;

    try {
      // Get all stored keys to clear video data
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
      chrome.action.setBadgeText({ text: '' });
      
      // Update display
      setTimeout(() => {
        this.updateChannelResults();
      }, 500);
    } catch (error) {
      console.error('Clear data failed:', error);
    }
  }

  async updateChannelResults() {
    const resultsContainer = document.getElementById('channelResults');
    
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['channelResults', 'lastTimeFilter', 'timeFilter'], resolve);
      });
      
      const channelResults = result.channelResults || [];
      const currentTimeFilter = result.timeFilter || '1day';
      
      if (channelResults.length === 0) {
        resultsContainer.innerHTML = `
          <div class="loading">
            No channel data available. Create a "Vid" bookmarks folder with YouTube channel /videos pages and click "Check Now".
          </div>
        `;
        return;
      }

      // Add time filter info
      const timeFilterText = this.getTimeFilterText(currentTimeFilter);
      let html = `<div class="time-filter-info">Showing videos from: ${timeFilterText}</div>`;

      // Process each channel
      html += channelResults.map(channel => {
        if (channel.error) {
          return `
            <div class="channel-item">
              <div class="channel-header">
                <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
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
        
        let channelHtml = `
          <div class="channel-item">
            <div class="channel-header">
              <div class="channel-title">${this.escapeHtml(channel.channelTitle)}</div>
              <div class="channel-stats">
                ${newCount > 0 ? `<span class="stat-badge new">${newCount} new</span>` : ''}
                <span class="stat-badge filtered">${filteredCount} in timeframe</span>
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
                     onclick="window.open('${video.url}', '_blank')">
                  <div class="video-title">${this.escapeHtml(video.title)}</div>
                  <div class="video-meta">
                    <span class="video-published">${this.escapeHtml(video.published)}</span>
                    ${newVideoIds.has(video.id) ? '<span class="new-indicator">NEW</span>' : ''}
                  </div>
                </div>
              `).join('')}
            </div>
          `;
        }

        channelHtml += `</div>`;
        return channelHtml;
      }).join('');

      resultsContainer.innerHTML = html;
    } catch (error) {
      console.error('Error updating channel results:', error);
      resultsContainer.innerHTML = '<div class="loading">Error loading channel data</div>';
    }
  }

  getTimeFilterText(filter) {
    switch (filter) {
      case '1day': return 'Last 24 hours';
      case '1week': return 'Last week';
      case '1month': return 'Last month';
      case '1year': return 'Last year';
      case 'lastcheck': return 'Since last manual check';
      default: return 'Last 24 hours';
    }
  }

  async updateStatus() {
    const status = document.getElementById('status');
    
    try {
      const result = await new Promise((resolve) => {
        chrome.storage.local.get(['lastCheck', 'lastManualCheck'], resolve);
      });
      
      let statusText = '';
      
      if (result.lastCheck) {
        const lastCheck = new Date(result.lastCheck);
        statusText = `Last auto-check: ${lastCheck.toLocaleTimeString()}`;
      }
      
      if (result.lastManualCheck) {
        const lastManualCheck = new Date(result.lastManualCheck);
        if (statusText) statusText += ' | ';
        statusText += `Last manual check: ${lastManualCheck.toLocaleTimeString()}`;
      }
      
      if (!statusText) {
        statusText = 'Never checked';
      }
      
      status.textContent = statusText;
    } catch (error) {
      status.textContent = 'Status unknown';
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