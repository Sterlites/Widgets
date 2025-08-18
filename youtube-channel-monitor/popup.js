document.addEventListener('DOMContentLoaded', () => { window.popup = new Popup(); });
window.addEventListener('beforeunload', () => window.popup?.destroy());

chrome.storage.onChanged.addListener((changes) => {
  if (!window.popup) return;
  if (changes.channelResults || changes.watchedVideos || changes.watchLaterVideos) {
    requestAnimationFrame(() => window.popup.refreshData());
  }
});

class Popup {
  constructor() {
    this.cacheDOM();
    this.settings = {}; this.channelResults = []; this.filteredResults = []; this.watchLater = [];
    this.watchedVideos = {}; this.watchLaterMap = new Map(); this.view = 'channels';
    this.sortBy = 'activity'; this.isChecking = false; this.searchDebounce = null; this.updateScheduled = false;
    this.init();
  }

  cacheDOM() {
    const D = document;
    this.D = {
      res: D.getElementById('res'), sbar: D.getElementById('s-bar'),
      sCh: D.getElementById('s-ch'), sNew: D.getElementById('s-new'), sTotal: D.getElementById('s-total'),
      stText: D.getElementById('st-text'), ind: D.getElementById('ind'),
      tabCh: D.getElementById('tab-ch'), tabWl: D.getElementById('tab-wl'),
      btnCheck: D.getElementById('btn-check'), fTime: D.getElementById('f-time'), fSort: D.getElementById('f-sort'),
      fSearch: D.getElementById('f-search'), fHwCb: D.getElementById('f-hw-cb'),
      btnCw: D.getElementById('btn-cw'), setInt: D.getElementById('set-int'),
      setNotif: D.getElementById('set-notif'), setOpen: D.getElementById('set-open'),
      controlSet: [D.getElementById('filter-controls')],
      btnSettings: D.getElementById('btn-settings'), settingsPanel: D.getElementById('settings-panel')
    };
  }
  
  async init() {
    this.showLoading('Initializing...');
    await this.loadSettings();
    await this.refreshData(false);
    this.setupEventListeners();
    this.updateStatus();
    this.statusInterval = setInterval(() => !this.isChecking && this.updateStatus(), 30000);
  }

  async refreshData(update = true) {
    await Promise.all([this.loadWatchedVideos(), this.loadWatchLater(), this.loadChannelResults()]);
    if (update) this.updateUI();
  }

  async loadSettings() {
    const r = await chrome.storage.local.get(['checkInterval', 'timeFilter', 'notifications', 'autoOpen', 'hideWatched']);
    this.settings = { checkInterval: r.checkInterval || 15, notifications: r.notifications || false, autoOpen: r.autoOpen || 'current' };
    this.timeFilter = r.timeFilter || '1day'; this.hideWatched = r.hideWatched || false;
    this.D.setInt.value = this.settings.checkInterval; 
    this.D.fTime.value = this.timeFilter;
    this.D.setNotif.checked = this.settings.notifications; 
    this.D.fHwCb.checked = this.hideWatched; 
    this.D.setOpen.value = this.settings.autoOpen;
  }

  async loadWatchedVideos() { try { const r = await chrome.runtime.sendMessage({ action: 'getWatchedVideos' }); this.watchedVideos = r?.success ? r.watchedVideos : (await chrome.storage.local.get('watchedVideos')).watchedVideos || {}; } catch { this.watchedVideos = (await chrome.storage.local.get('watchedVideos')).watchedVideos || {}; } }
  async loadWatchLater() { try { const r = await chrome.runtime.sendMessage({ action: 'getWatchLater' }); if(r?.success) this.watchLater = r.list; } catch { this.watchLater = (await chrome.storage.local.get('watchLaterVideos')).watchLaterVideos || []; } this.watchLaterMap = new Map(this.watchLater.map(v => [v.id, v])); }
  async loadChannelResults() { this.channelResults = (await chrome.storage.local.get('channelResults')).channelResults || []; this.updateUI(); }

  setupEventListeners() {
    const D = this.D;
    D.btnCheck.addEventListener('click', () => this.checkNow());
    D.fTime.addEventListener('change', e => this.handleFilterChange('timeFilter', e.target.value));
    D.fSort.addEventListener('change', e => { this.sortBy = e.target.value; this.updateUI(); });
    D.fHwCb.addEventListener('change', e => this.handleFilterChange('hideWatched', e.target.checked));
    D.fSearch.addEventListener('input', e => { clearTimeout(this.searchDebounce); this.searchDebounce = setTimeout(() => { this.searchQuery = e.target.value.toLowerCase(); this.updateUI(); }, 150); });
    D.tabCh.addEventListener('click', () => this.switchView('channels'));
    D.tabWl.addEventListener('click', () => this.switchView('watchLater'));
    D.btnSettings.addEventListener('click', () => this.toggleSettings());

    D.res.addEventListener('click', e => {
      const target = e.target;
      const vidBtn = target.closest('.vid-btn');
      const vidEl = target.closest('.vid');
      const chHeader = target.closest('.ch-h');
      const wlItem = target.closest('.wl-item');

      if (vidBtn) {
        if (vidBtn.classList.contains('wl')) this.toggleWatchLater(vidBtn);
        else if (vidBtn.classList.contains('watched')) this.toggleWatched(vidBtn);
        return; 
      }
      
      if (chHeader) {
        chHeader.parentElement.classList.toggle('collapsed');
      } else if (vidEl) {
        this.openVideo(vidEl.dataset.url);
      } else if (wlItem) {
        if (target.closest('.btn.primary')) {
          this.openVideo(wlItem.dataset.url);
        } else if (target.closest('.btn:not(.primary)')) {
          this.removeFromWatchLater(wlItem.dataset.id, true);
        }
      }
    });

    D.btnCw.addEventListener('click', () => this.clearWatchedVideos());
    document.getElementById('set-cd').addEventListener('click', () => this.clearData());
    D.setInt.addEventListener('change', e => this.saveSetting('checkInterval', parseInt(e.target.value)));
    D.setNotif.addEventListener('change', e => this.saveSetting('notifications', e.target.checked));
    D.setOpen.addEventListener('change', e => this.saveSetting('autoOpen', e.target.value));
  }
  
  toggleSettings() {
    this.D.settingsPanel.classList.toggle('hidden');
  }

  handleFilterChange(key, value) { this[key] = value; chrome.storage.local.set({ [key]: value }); this.updateUI(); }
  saveSetting(key, value) { this.settings[key] = value; chrome.storage.local.set({ [key]: value }); }
  
  switchView(viewName) {
    if (this.view === viewName) return;
    this.view = viewName;
    const isChannelsView = viewName === 'channels';

    this.D.tabCh.classList.toggle('active', isChannelsView);
    this.D.tabWl.classList.toggle('active', !isChannelsView);

    this.D.controlSet.forEach(c => c.classList.toggle('hidden', !isChannelsView));

    this.D.settingsPanel.classList.add('hidden');

    this.updateUI();
  }

  applyFilters() {
    const ts = Date.now() - ({ '1hour': 36e5, '1day': 864e5, '1week': 6048e5, '1month': 2592e6 }[this.timeFilter] || 864e5);
    
    this.filteredResults = this.channelResults.map(ch => {
      if (ch.error || (this.searchQuery && !ch.channelTitle.toLowerCase().includes(this.searchQuery))) {
        return null;
      }
      let fVids = (ch.totalVideos || []).filter(v => v.publishedTimestamp >= ts);
      if (this.hideWatched) {
        fVids = fVids.filter(v => !this.watchedVideos[v.id]);
      }
      return { ...ch, filteredVideos: fVids };
    }).filter(ch => ch && ch.filteredVideos.length > 0);
  }

  updateUI() {
    if (this.updateScheduled) return; this.updateScheduled = true;
    requestAnimationFrame(() => {
      if (this.view === 'channels') { this.applyFilters(); this.renderChannels(); } else { this.renderWatchLater(); }
      this.updateStats(); this.updateScheduled = false;
    });
  }
  
  updateStats() {
    this.D.sCh.textContent = this.filteredResults.length;
    this.D.sNew.textContent = this.filteredResults.reduce((s, c) => s + (c.newVideos?.length || 0), 0);
    this.D.sTotal.textContent = this.filteredResults.reduce((s, c) => s + (c.filteredVideos?.length || 0), 0);
  }

  async updateStatus(text = null, type = 'normal') {
    if (text) { this.D.stText.textContent = text; this.D.ind.className = `indicator ${type}`; return; }
    try {
      const r = await chrome.runtime.sendMessage({ action: 'getStatus' });
      const lastCheck = r.lastCheck ? `${Math.floor((Date.now() - r.lastCheck) / 6e4)}m ago` : 'Never';
      this.D.stText.textContent = r.lastCheck ? `Last check: ${lastCheck}` : 'Never checked';
      this.D.ind.className = `indicator ${r.lastCheckSuccess ? '' : 'error'}`;
    } catch { this.D.stText.textContent = 'Status unknown'; this.D.ind.className = 'indicator error'; }
  }

  async checkNow() {
    if (this.isChecking) return; this.isChecking = true; this.D.btnCheck.disabled = true; this.updateStatus('Checking...', 'checking');
    try { await chrome.runtime.sendMessage({ action: 'checkNow' }); await this.refreshData(); this.showToast('Check complete', 'success'); }
    catch (e) { this.showToast('Check failed', 'error'); }
    finally { this.isChecking = false; this.D.btnCheck.disabled = false; this.updateStatus(); }
  }

  renderChannels() {
    this.filteredResults.sort((a, b) => {
      if (a.error && !b.error) return 1; if (b.error && !a.error) return -1;
      if (this.sortBy === 'new') return (b.newVideos?.length || 0) - (a.newVideos?.length || 0);
      if (this.sortBy === 'activity') return Math.max(...(b.filteredVideos?.map(v=>v.publishedTimestamp)||[0])) - Math.max(...(a.filteredVideos?.map(v=>v.publishedTimestamp)||[0]));
      return a.channelTitle.localeCompare(b.channelTitle);
    });
    
    if (!this.filteredResults.length) {
      this.D.res.innerHTML = this.getEmptyState('channels');
      return;
    }

    this.D.res.innerHTML = this.filteredResults.map(ch => {
        const newCount = ch.newVideos?.length || 0;
        return `<div class="ch collapsed">
          <div class="ch-h">
            <div class="ch-t">${this.esc(ch.channelTitle)}</div>
            <div class="ch-s">
              ${newCount > 0 ? `<span class="badge new">${newCount} New</span>` : ''}
              <span>${ch.filteredVideos?.length || 0} Videos</span>
            </div>
            <svg class="ch-h-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clip-rule="evenodd"></path></svg>
          </div>
          <div class="vids">${ch.filteredVideos.slice(0, 20).map(v => this.getVideoHTML(v, ch)).join('')}</div>
        </div>`;
    }).join('');
  }

  getVideoHTML(v, ch) {
    const isNew = (ch.newVideos || []).some(nv => nv.id === v.id);
    const isWatched = this.watchedVideos[v.id];
    const inWl = this.watchLaterMap.has(v.id);
    return `<div class="vid ${isNew ? 'new' : ''} ${isWatched ? 'watched' : ''}" 
                 data-url="${v.url}" 
                 data-video-id="${v.id}" 
                 data-channel-title="${this.esc(ch.channelTitle)}"
                 data-thumbnail="${this.esc(v.thumbnail || '')}">
      <div class="vid-c"><div class="vid-t" title="${this.esc(v.title)}">${this.esc(v.title)}</div><div class="vid-p">${this.esc(v.published)}</div></div>
      <div class="vid-a">
        <button class="vid-btn wl ${inWl ? 'active' : ''}" data-id="${v.id}" title="Watch Later"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5z" clip-rule="evenodd"></path></svg></button>
        <button class="vid-btn watched ${isWatched ? 'active' : ''}" data-id="${v.id}" title="Mark Watched"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.18l.88-1.473a1.65 1.65 0 0 1 1.52-.906l1.67.001c.497 0 .962.214 1.285.572l.786.812a1.65 1.65 0 0 1 0 2.316l-.786.812a1.65 1.65 0 0 1-1.285.572l-1.67-.001a1.65 1.65 0 0 1-1.52-.906l-.88-1.473ZM17.456 10.59a1.651 1.651 0 0 1 0-1.18l.88-1.473a1.65 1.65 0 0 1 1.52-.906l1.67.001c.497 0 .962.214 1.285.572l.786.812a1.65 1.65 0 0 1 0 2.316l-.786.812a1.65 1.65 0 0 1-1.285.572l-1.67-.001a1.65 1.65 0 0 1-1.52-.906l-.88-1.473z" clip-rule="evenodd"></path></svg></button>
      </div>
    </div>`;
  }
  
  renderWatchLater() { this.D.res.innerHTML = !this.watchLater.length ? this.getEmptyState('wl') : `<div class="wl-list">${this.watchLater.map(v => `<div class="wl-item" data-id="${this.esc(v.id)}" data-url="${this.esc(v.url)}"><img src="${this.esc(v.thumbnail)}" class="wl-thumb" loading="lazy" onerror="this.style.display='none'"><div class="wl-meta"><div class="wl-t" title="${this.esc(v.title)}">${this.esc(v.title)}</div><div class="wl-ch">${this.esc(v.channelTitle)}</div></div><div class="wl-a"><button class="btn primary">Open</button><button class="btn">Remove</button></div></div>`).join('')}</div>`; }
  
  async toggleWatchLater(btn) {
    const id = btn.dataset.id;
    const vidEl = btn.closest('.vid');
    const v = {
      id,
      url: vidEl.dataset.url,
      title: vidEl.querySelector('.vid-t').textContent,
      channelTitle: vidEl.dataset.channelTitle,
      published: vidEl.querySelector('.vid-p').textContent,
      thumbnail: vidEl.dataset.thumbnail
    };
    btn.disabled = true;
    try {
      if (this.watchLaterMap.has(id)) {
        await this.removeFromWatchLater(id);
      } else {
        await chrome.runtime.sendMessage({ action: 'addToWatchLater', video: v });
        this.showToast('Added to Watch Later', 'success');
      }
      await this.loadWatchLater();
      this.updateUI();
    } catch(e) {
      this.showToast('Watch Later failed', 'error');
    }
    btn.disabled = false;
  }

  async toggleWatched(btn) {
    const id = btn.dataset.id;
    btn.disabled = true;
    const vidEl = btn.closest('.vid');
    try {
      if (this.watchedVideos[id]) { 
        delete this.watchedVideos[id]; 
        vidEl.classList.remove('watched');
        btn.classList.remove('active');
      } else { 
        this.watchedVideos[id] = Date.now(); 
        vidEl.classList.add('watched');
        btn.classList.add('active');
      }
      await chrome.storage.local.set({ watchedVideos: this.watchedVideos });
      if (this.hideWatched) {
        setTimeout(() => this.updateUI(), 200);
      }
    } catch(e) { this.showToast('Watched action failed', 'error'); } finally { btn.disabled = false; }
  }

  async removeFromWatchLater(id, confirmFirst = false) {
    if (confirmFirst && !confirm('Remove from Watch Later?')) return;
    try { await chrome.runtime.sendMessage({ action: 'removeFromWatchLater', videoId: id }); this.showToast('Removed from Watch Later', 'success'); await this.loadWatchLater(); this.updateUI(); }
    catch(e) { this.showToast('Failed to remove', 'error'); }
  }
  
  async clearWatchedVideos() { if(confirm('Clear all watched flags?')){ try { await chrome.runtime.sendMessage({ action: 'clearWatchedVideos' }); this.showToast('Watched flags cleared', 'success'); this.refreshData(); } catch(e){ this.showToast('Failed', 'error'); } } }
  async clearData() { if(confirm('Clear all cached video data?')){ this.showLoading('Clearing...'); try { await chrome.runtime.sendMessage({action:'clearCache'}); this.showToast('Cache cleared', 'success'); this.refreshData(); } catch(e){ this.showToast('Failed', 'error'); } } }
  
  async openVideo(url) {
    if (this.settings.autoOpen === 'current') {
      const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (currentTab) {
        chrome.tabs.update(currentTab.id, { url });
      }
    } else {
      chrome.tabs.create({ url, active: this.settings.autoOpen !== 'background' });
    }
  }
  
  showToast(msg, type = 'success') {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clip-rule="evenodd"></path></svg> ${msg}`;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
  }
  
  showLoading(msg) { this.D.res.innerHTML = `<div class="loading"><div class="icon-loader">⏳</div><div>${msg}</div></div>`; }
  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  getEmptyState(type) { if (type === 'wl') return `<div class="empty"><div class="empty-icon">🕐</div><h3>Watch Later is Empty</h3><p>Add videos using the clock icon.</p></div>`; return `<div class="empty"><div class="empty-icon">📺</div><h3>No Videos Found</h3><p>Try adjusting your filters or adding more channels to your "Vid" bookmarks folder.</p></div>`; }
  destroy() { clearInterval(this.statusInterval); }
}