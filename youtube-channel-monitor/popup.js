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
    this.isChecking = false; this.searchDebounce = null; this.updateScheduled = false;
    this.init();
  }

  cacheDOM() {
    const D = document;
    this.D = {
      res: D.getElementById('res'), sbar: D.getElementById('s-bar'),
      sCh: D.getElementById('s-ch'), sNew: D.getElementById('s-new'), sTotal: D.getElementById('s-total'),
      sWl: D.getElementById('s-wl'), sWatched: D.getElementById('s-watched'), stText: D.getElementById('st-text'),
      ind: D.getElementById('ind'), tabCh: D.getElementById('tab-ch'), tabWl: D.getElementById('tab-wl'),
      btnCheck: D.getElementById('btn-check'), fTime: D.getElementById('f-time'), fSort: D.getElementById('f-sort'),
      fShow: D.getElementById('f-show'), fSearch: D.getElementById('f-search'), fHw: D.getElementById('f-hw'),
      fHwCb: D.getElementById('f-hw-cb'), btnCw: D.getElementById('btn-cw'), setInt: D.getElementById('set-int'),
      setNotif: D.getElementById('set-notif'), setOpen: D.getElementById('set-open'),
      controlSet: [D.getElementById('f-time'), D.getElementById('f-sort'), D.getElementById('f-show'), D.getElementById('f-search'), D.getElementById('f-hw'), D.getElementById('btn-cw')]
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
    const r = await chrome.storage.local.get(['checkInterval', 'timeFilter', 'notifications', 'autoOpen', 'showFilter', 'hideWatched']);
    this.settings = { checkInterval: r.checkInterval || 15, notifications: r.notifications || false, autoOpen: r.autoOpen || 'current' };
    this.timeFilter = r.timeFilter || '1day'; this.showFilter = r.showFilter || 'all'; this.hideWatched = r.hideWatched || false;
    this.D.setInt.value = this.settings.checkInterval; this.D.fTime.value = this.timeFilter; this.D.fShow.value = this.showFilter;
    this.D.setNotif.checked = this.settings.notifications; this.D.fHwCb.checked = this.hideWatched; this.D.setOpen.value = this.settings.autoOpen;
  }

  async loadWatchedVideos() { try { const r = await chrome.runtime.sendMessage({ action: 'getWatchedVideos' }); this.watchedVideos = r?.success ? r.watchedVideos : (await chrome.storage.local.get('watchedVideos')).watchedVideos || {}; } catch { this.watchedVideos = (await chrome.storage.local.get('watchedVideos')).watchedVideos || {}; } }
  async loadWatchLater() { try { const r = await chrome.runtime.sendMessage({ action: 'getWatchLater' }); if(r?.success) this.watchLater = r.list; } catch { this.watchLater = (await chrome.storage.local.get('watchLaterVideos')).watchLaterVideos || []; } this.watchLaterMap = new Map(this.watchLater.map(v => [v.id, v])); }
  async loadChannelResults() { this.channelResults = (await chrome.storage.local.get('channelResults')).channelResults || []; this.updateUI(); }

  setupEventListeners() {
    const D = this.D;
    D.btnCheck.addEventListener('click', () => this.checkNow());
    D.fTime.addEventListener('change', e => this.handleFilterChange('timeFilter', e.target.value));
    D.fSort.addEventListener('change', e => { this.sortBy = e.target.value; this.updateUI(); });
    D.fShow.addEventListener('change', e => this.handleFilterChange('showFilter', e.target.value));
    D.fHwCb.addEventListener('change', e => this.handleFilterChange('hideWatched', e.target.checked));
    D.fSearch.addEventListener('input', e => { clearTimeout(this.searchDebounce); this.searchDebounce = setTimeout(() => { this.searchQuery = e.target.value.toLowerCase(); this.updateUI(); }, 150); });
    D.tabCh.addEventListener('click', () => this.switchView('channels'));
    D.tabWl.addEventListener('click', () => this.switchView('watchLater'));
    D.res.addEventListener('click', e => {
      const vidEl = e.target.closest('.vid'); const wlItem = e.target.closest('.wl-item');
      if (e.target.closest('.ch-h')) e.currentTarget.querySelector(`[data-ch-id="${e.target.closest('.ch-h').dataset.chId}"]`).classList.toggle('collapsed');
      else if (e.target.closest('.wl-btn')) this.toggleWatchLater(e.target.closest('.wl-btn'));
      else if (e.target.closest('.w-btn')) this.toggleWatched(e.target.closest('.w-btn'));
      else if (vidEl) this.openVideo(vidEl.dataset.url);
      else if (e.target.closest('.wl-open')) this.openVideo(e.target.closest('.wl-open').dataset.url);
      else if (e.target.closest('.wl-remove')) this.removeFromWatchLater(e.target.closest('.wl-remove').dataset.id, true);
    });
    D.btnCw.addEventListener('click', () => this.clearWatchedVideos());
    document.getElementById('set-rw').addEventListener('click', () => this.clearWatchedVideos());
    document.getElementById('set-cd').addEventListener('click', () => this.clearData());
    document.getElementById('set-ex').addEventListener('click', () => this.exportData());
    D.setInt.addEventListener('change', e => this.saveSetting('checkInterval', parseInt(e.target.value)));
    D.setNotif.addEventListener('change', e => this.saveSetting('notifications', e.target.checked));
    D.setOpen.addEventListener('change', e => this.saveSetting('autoOpen', e.target.value));
  }

  handleFilterChange(key, value) { this[key] = value; chrome.storage.local.set({ [key]: value }); this.updateUI(); }
  saveSetting(key, value) { this.settings[key] = value; chrome.storage.local.set({ [key]: value }); }
  
  switchView(viewName) {
    if (this.view === viewName) return; this.view = viewName;
    const isCh = viewName === 'channels';
    this.D.tabCh.classList.toggle('active', isCh); this.D.tabWl.classList.toggle('active', !isCh);
    this.D.controlSet.forEach(c => c.style.display = isCh ? '' : 'none');
    this.updateUI();
  }

  applyFilters() {
    const ts = Date.now() - ({ '1hour': 36e5, '1day': 864e5, '1week': 6048e5, '1month': 2592e6 }[this.timeFilter] || 864e5);
    this.filteredResults = this.channelResults.map(ch => {
      if (ch.error || (this.searchQuery && !ch.channelTitle.toLowerCase().includes(this.searchQuery)) || (this.showFilter === 'newonly' && !ch.newVideos?.length)) return null;
      let fVids = (ch.totalVideos || []).filter(v => v.publishedTimestamp >= ts);
      if (this.hideWatched) fVids = fVids.filter(v => !this.watchedVideos[v.id]);
      return { ...ch, filteredVideos: fVids };
    }).filter(Boolean);
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
    this.D.sWl.textContent = this.watchLater.length;
    this.D.sWatched.textContent = Object.keys(this.watchedVideos).length;
  }

  async updateStatus(text = null, type = 'normal') {
    if (text) { this.D.stText.textContent = text; this.D.ind.className = `ind ${type}`; return; }
    try {
      const r = await chrome.runtime.sendMessage({ action: 'getStatus' });
      const lastCheck = r.lastCheck ? `${Math.floor((Date.now() - r.lastCheck) / 6e4)}m ago` : 'Never';
      this.D.stText.textContent = r.lastCheck ? `Last check: ${lastCheck}` : 'Never checked';
      this.D.ind.className = `ind ${r.lastCheckSuccess ? '' : 'error'}`;
    } catch { this.D.stText.textContent = 'Status unknown'; this.D.ind.className = 'ind error'; }
  }

  async checkNow() {
    if (this.isChecking) return; this.isChecking = true; this.D.btnCheck.disabled = true; this.updateStatus('Checking...', 'checking');
    try { await chrome.runtime.sendMessage({ action: 'checkNow' }); await this.refreshData(); this.showToast('✅ Check complete'); }
    catch (e) { this.showToast('❌ Check failed', 'error'); }
    finally { this.isChecking = false; this.D.btnCheck.disabled = false; this.updateStatus(); }
  }

  renderChannels() {
    this.filteredResults.sort((a, b) => {
      if (a.error && !b.error) return 1; if (b.error && !a.error) return -1;
      if (this.sortBy === 'new') return (b.newVideos?.length || 0) - (a.newVideos?.length || 0);
      if (this.sortBy === 'activity') return Math.max(...(b.filteredVideos?.map(v=>v.publishedTimestamp)||[0])) - Math.max(...(a.filteredVideos?.map(v=>v.publishedTimestamp)||[0]));
      return a.channelTitle.localeCompare(b.channelTitle);
    });
    let html = '';
    if (!this.filteredResults.length) html = this.getEmptyState('channels');
    else {
      html = this.filteredResults.map((ch, i) => {
        const hasVids = ch.filteredVideos?.length > 0;
        return `<div class="ch ${!hasVids ? 'collapsed' : ''}" data-ch-id="${i}">
          <div class="ch-h" data-ch-id="${i}" role="button" tabindex="0"><div class="ch-t">${this.esc(ch.channelTitle)}</div>
            <div class="ch-s">
              ${(ch.newVideos?.length||0)>0?`<span class="badge new">${ch.newVideos.length} new</span>`:''}
              <span class="badge normal">${ch.filteredVideos?.length||0} videos</span>
            </div></div>
          ${hasVids ? `<div class="vids">${ch.filteredVideos.slice(0, 20).map(v => {
            const isNew = (ch.newVideos || []).some(nv => nv.id === v.id);
            const isWatched = this.watchedVideos[v.id];
            const inWl = this.watchLaterMap.has(v.id);
            return `<div class="vid ${isNew ? 'new' : ''} ${isWatched ? 'watched' : ''}" data-url="${v.url}" data-video-id="${v.id}">
                <div class="vid-c"><div class="vid-t" title="${this.esc(v.title)}">${this.esc(v.title)}</div><div class="vid-p">${this.esc(v.published)}</div></div>
                <div class="vid-a"><button class="wl-btn ${inWl ? 'active' : ''}" data-id="${v.id}">${inWl ? '✓' : '⏱'}</button><button class="w-btn ${isWatched ? 'active' : ''}" data-id="${v.id}">${isWatched ? '✓' : '👁️'}</button></div>
              </div>`;
          }).join('')}</div>` : ''}</div>`;
      }).join('');
    } this.D.res.innerHTML = html;
  }

  renderWatchLater() { this.D.res.innerHTML = !this.watchLater.length ? this.getEmptyState('wl') : `<div class="wl-list">${this.watchLater.map(v => `<div class="wl-item" data-id="${this.esc(v.id)}"><img src="${this.esc(v.thumbnail)}" class="wl-thumb" loading="lazy" alt=""><div class="wl-meta"><div class="wl-t" title="${this.esc(v.title)}">${this.esc(v.title)}</div><div class="wl-ch">📺 ${this.esc(v.channelTitle)}</div></div><div class="wl-a"><button class="btn primary wl-open" data-url="${this.esc(v.url)}">▶️</button><button class="btn secondary wl-remove" data-id="${this.esc(v.id)}">🗑️</button></div></div>`).join('')}</div>`; }
  
  async toggleWatchLater(btn) {
    const id = btn.dataset.id; const vidEl = btn.closest('.vid');
    const v = { id, url: vidEl.dataset.url, title: vidEl.querySelector('.vid-t').textContent, channelTitle: vidEl.closest('.ch').querySelector('.ch-t').textContent, published: vidEl.querySelector('.vid-p').textContent };
    btn.disabled = true;
    try {
      if (this.watchLaterMap.has(id)) { await this.removeFromWatchLater(id); } else { await chrome.runtime.sendMessage({ action: 'addToWatchLater', video: v }); this.showToast('✅ Added to Watch Later'); }
      await this.loadWatchLater(); this.updateUI();
    } catch(e) { this.showToast('❌ Watch Later failed', 'error'); }
    btn.disabled = false;
  }
  async toggleWatched(btn) {
    const id = btn.dataset.id;
    btn.disabled = true;
    try {
      if (this.watchedVideos[id]) { delete this.watchedVideos[id]; this.showToast('Unwatched'); } else { this.watchedVideos[id] = Date.now(); this.showToast('Watched'); }
      await chrome.storage.local.set({ watchedVideos: this.watchedVideos });
      if (this.hideWatched) setTimeout(() => this.updateUI(), 100); else this.updateUI();
    } catch(e) { this.showToast('❌ Watched failed', 'error'); }
    btn.disabled = false;
  }

  async removeFromWatchLater(id, confirmFirst = false) {
    if (confirmFirst && !confirm('Remove from Watch Later?')) return;
    try { await chrome.runtime.sendMessage({ action: 'removeFromWatchLater', videoId: id }); this.showToast('✅ Removed from Watch Later'); await this.loadWatchLater(); this.updateUI(); }
    catch(e) { this.showToast('❌ Failed to remove', 'error'); }
  }
  
  async clearWatchedVideos() { if(confirm('Clear all watched flags?')){ try { await chrome.runtime.sendMessage({ action: 'clearWatchedVideos' }); this.showToast('✅ Watched flags cleared'); this.refreshData(); } catch(e){ this.showToast('❌ Failed', 'error'); } } }
  async clearData() { if(confirm('Clear all cached video data?')){ this.showLoading('Clearing...'); try { await chrome.runtime.sendMessage({action:'clearCache'}); this.showToast('✅ Cache cleared'); this.refreshData(); } catch(e){ this.showToast('❌ Failed', 'error'); } } }
  
  openVideo(url) { chrome.tabs.create({ url, active: this.settings.autoOpen !== 'background' }); }
  showToast(msg, type = 'success') {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = `toast ${type}`; t.textContent = msg;
    document.body.appendChild(t); setTimeout(() => t.remove(), 3000);
  }
  showLoading(msg) { this.D.res.innerHTML = `<div class="loading"><div>${msg}</div></div>`; }
  esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }
  getEmptyState(type) { if (type === 'wl') return `<div class="empty"><h3>🕐 Empty</h3><p>Add videos with the ⏱ button.</p></div>`; return `<div class="empty"><h3>📺 No Channels</h3><p>Create a "Vid" bookmark folder with YouTube channels.</p></div>`; }
  destroy() { clearInterval(this.statusInterval); }
}