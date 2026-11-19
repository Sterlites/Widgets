/**
 * YouTube Channel Monitor — Intelligent Home Feed (v1.5.0)
 * Modern YouTube-style aggregator with multi-density views,
 * moving WebP previews, in-feed Document PiP player, and on-device AI summaries.
 */

const AVATAR_COLORS = [
  '#c00','#d93025','#e8710a','#f9ab00','#188038',
  '#1a73e8','#5f6368','#9334e6','#e91e63','#00897b',
  '#5c6bc0','#f4511e','#0097a7','#7cb342','#c2185b'
];

const PAGE_SIZE = 24;

const TIME_MS = {
  '1hour': 36e5 + 3e5,       // 65 mins
  '6hour': 216e5 + 18e5,     // 6.5 hours
  '12hour': 432e5 + 36e5,    // 13 hours
  '1day': 864e5 + 432e5,     // 36 hours (covers yesterday)
  '1week': 6048e5 + 864e5,   // 8 days
  '1month': 2592e6 + 2592e5, // 33 days
  '1year': 31536e6,
};

class FeedApp {
  constructor() {
    this.view = 'channels'; // 'channels' | 'watchLater' | 'watched'
    this.viewMode = 'grid'; // 'grid' | 'compact' | 'swimlane'
    this.channelResults = [];
    this.allChannelVideos = [];
    this.filteredVideos = [];
    this.displayedCount = 0;

    // Filters
    this.timeFilter = '1month';
    this.contentFilter = 'all'; // 'all' | 'no-shorts' | 'shorts' | 'quick' | 'standard' | 'long' | 'live'
    this.sortMode = 'activity';
    this.searchQuery = '';
    this.hideWatched = false;
    this.activeChannelChip = 'all';

    // State & Cache
    this.bookmarkFolder = 'Vid';
    this.watchedVideos = {};
    this.watchLaterList = [];
    this.watchLaterMap = new Map();
    this.channelColors = new Map();
    this.lastManualCheck = 0;
    this.checking = false;
    this.searchDebounce = null;
    this.observer = null;

    // Active modals state
    this.currentPlayingVideo = null;
    this.currentAIVideo = null;

    this.init();
  }

  // ─── Initialization ────────────────────────────────────────

  async init() {
    this.cacheDOM();
    this.showSkeletons();
    await this.loadSettings();
    await this.loadData();
    this.setupEvents();
    this.setupInfiniteScroll();
    this.setupKeyboard();
    this.setupStorageListener();
    this.populateFolderSuggestions();
    this.updateUI();
    this.updateStatus();
  }

  cacheDOM() {
    const $ = id => document.getElementById(id);
    this.D = {
      feed: $('feed'),
      chipScroll: $('chip-scroll'),
      search: $('f-search'),
      fTime: $('f-time'),
      fContent: $('f-content'),
      fSort: $('f-sort'),
      btnHw: $('btn-hw'),
      btnCheck: $('btn-check'),
      btnSettings: $('btn-settings'),

      // View Switcher Buttons
      viewGrid: $('view-grid'),
      viewCompact: $('view-compact'),
      viewSwimlane: $('view-swimlane'),

      // Tabs
      tabCh: $('tab-ch'),
      tabWl: $('tab-wl'),
      tabWv: $('tab-wv'),
      wlBadge: $('wl-badge'),
      wvBadge: $('wv-badge'),

      // Stats
      sCh: $('s-ch'),
      sNew: $('s-new'),
      sTotal: $('s-total'),
      stText: $('st-text'),
      ind: $('ind'),

      // Settings Modal
      settingsOverlay: $('settings-overlay'),
      settingsBackdrop: $('settings-backdrop'),
      closeSettings: $('close-settings'),
      setFolder: $('set-folder'),
      folderSuggestions: $('folder-suggestions'),
      setInt: $('set-int'),
      setOpen: $('set-open'),
      setHw: $('set-hw'),
      setNotif: $('set-notif'),
      btnCw: $('btn-cw'),
      btnCd: $('btn-cd'),

      // Player Modal
      playerModal: $('player-modal'),
      playerBackdrop: $('player-backdrop'),
      closePlayer: $('close-player'),
      playerTitle: $('player-title'),
      playerIframe: $('player-iframe'),
      playerPip: $('player-pip'),
      playerOpenTab: $('player-open-tab'),

      // AI Summary Modal
      aiModal: $('ai-modal'),
      aiBackdrop: $('ai-backdrop'),
      closeAi: $('close-ai'),
      aiVideoPreview: $('ai-video-preview'),
      aiLoader: $('ai-loader'),
      aiResult: $('ai-result'),
      aiCoreTakeaway: $('ai-core-takeaway'),
      aiBullets: $('ai-bullets'),
      aiCopyBtn: $('ai-copy-btn'),
      aiPlayBtn: $('ai-play-btn'),

      sentinel: $('scroll-sentinel'),
    };
  }

  // ─── Data Loading ──────────────────────────────────────────

  async loadSettings() {
    const r = await chrome.storage.sync.get([
      'timeFilter', 'contentFilter', 'hideWatched', 'checkInterval',
      'autoOpen', 'notifications', 'feedSort', 'feedViewMode', 'bookmarkFolder'
    ]);
    this.timeFilter = r.timeFilter || '1month';
    this.contentFilter = r.contentFilter || 'all';
    this.hideWatched = !!r.hideWatched;
    this.sortMode = r.feedSort || 'activity';
    this.viewMode = r.feedViewMode || 'grid';
    this.bookmarkFolder = r.bookmarkFolder || 'Vid';

    this.set = {
      checkInterval: r.checkInterval || 15,
      autoOpen: r.autoOpen || 'current',
      notifications: !!r.notifications,
    };

    // Update DOM inputs
    this.D.fTime.value = this.timeFilter;
    if (this.D.fContent) this.D.fContent.value = this.contentFilter;
    this.D.fSort.value = this.sortMode;
    this.D.btnHw.classList.toggle('active', this.hideWatched);
    this.D.setInt.value = this.set.checkInterval;
    this.D.setOpen.value = this.set.autoOpen;
    this.D.setHw.checked = this.hideWatched;
    this.D.setNotif.checked = this.set.notifications;
    if (this.D.setFolder) this.D.setFolder.value = this.bookmarkFolder;

    this.updateViewModeButtons();
  }

  async loadData() {
    const [local, wlRes, wvRes] = await Promise.all([
      chrome.storage.local.get(['channelResults', 'lastManualCheck', 'watchedVideos', 'watchLaterVideos']),
      chrome.runtime.sendMessage({ action: 'getWatchLater' }).catch(() => null),
      chrome.runtime.sendMessage({ action: 'getWatchedVideos' }).catch(() => null),
    ]);

    this.channelResults = local.channelResults || [];
    this.lastManualCheck = local.lastManualCheck || (Date.now() - 864e5);
    this.watchLaterList = wlRes?.success ? wlRes.list : (local.watchLaterVideos || []);
    this.watchLaterMap = new Map(this.watchLaterList.map(v => [v.id, v]));
    this.watchedVideos = wvRes?.success ? wvRes.watchedVideos : (local.watchedVideos || {});

    this.aggregateChannelVideos();

    this.D.wlBadge.textContent = this.watchLaterList.length;
    this.D.wvBadge.textContent = Object.keys(this.watchedVideos).length;
  }

  aggregateChannelVideos() {
    const videoMap = new Map();
    for (const ch of this.channelResults) {
      if (ch.error) continue;
      const channelTitle = ch.channelTitle || 'Unknown';
      const channelUrl = ch.channelUrl || '';
      this.assignColor(channelTitle);

      for (const v of (ch.totalVideos || [])) {
        if (!videoMap.has(v.id)) {
          const accurateTS = v.published ? this.parsePT(v.published, v.discoveredAt || Date.now()) : v.pubTS;
          videoMap.set(v.id, {
            ...v,
            pubTS: accurateTS || v.pubTS,
            channelTitle,
            channelUrl,
            isNew: (ch.newVideos || []).some(nv => nv.id === v.id),
          });
        }
      }
    }
    this.allChannelVideos = [...videoMap.values()];
  }

  assignColor(name) {
    if (!this.channelColors.has(name)) {
      let h = 0;
      for (let i = 0; i < name.length; i++) h = ((h << 5) - h) + name.charCodeAt(i), h &= h;
      this.channelColors.set(name, AVATAR_COLORS[Math.abs(h) % AVATAR_COLORS.length]);
    }
  }

  parsePT(tx, baseTime = Date.now()) {
    if (!tx) return baseTime - 864e5;
    const s = tx.toLowerCase().trim();
    if (s.includes('now') || s.includes('moment') || s.includes('live')) return baseTime;
    if (s.includes('yesterday')) return baseTime - 864e5;
    const m = s.match(/(\d+)\s*(second|sec|minute|min|hour|hr|day|d|week|wk|month|mo|year|yr)s?\b/i);
    if (m) {
      const amt = parseInt(m[1], 10);
      const u = m[2].toLowerCase();
      let mult = 864e5;
      if (u.startsWith('sec')) mult = 1e3;
      else if (u.startsWith('min')) mult = 6e4;
      else if (u.startsWith('h')) mult = 36e5;
      else if (u === 'd' || u.startsWith('day')) mult = 864e5;
      else if (u.startsWith('w')) mult = 6048e5;
      else if (u.startsWith('m')) mult = 2592e6;
      else if (u.startsWith('y')) mult = 31536e6;
      return baseTime - amt * mult;
    }
    return baseTime - 864e5;
  }

  parseDurationSeconds(durStr) {
    if (!durStr) return 0;
    const parts = durStr.trim().split(':').map(Number);
    if (parts.some(isNaN)) return 0;
    if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2];
    if (parts.length === 2) return parts[0] * 60 + parts[1];
    return parts[0] || 0;
  }

  // ─── Filtering & Sorting ──────────────────────────────────

  getTimeCutoff() {
    if (this.timeFilter === 'all') return 0;
    if (this.timeFilter === 'sincelastvisit') return this.lastManualCheck;
    return Date.now() - (TIME_MS[this.timeFilter] || TIME_MS['1month']);
  }

  applyFilters() {
    if (this.view === 'watchLater') {
      let list = [...this.watchLaterList];
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        list = list.filter(v => (v.title || '').toLowerCase().includes(q) || (v.channelTitle || '').toLowerCase().includes(q));
      }
      this.filteredVideos = list;
      return;
    }

    if (this.view === 'watched') {
      const ids = Object.keys(this.watchedVideos);
      const vMap = new Map(this.allChannelVideos.map(v => [v.id, v]));
      let list = ids.map(id => {
        const item = vMap.get(id);
        if (item) return { ...item, watchedAt: this.watchedVideos[id] };
        return {
          id,
          title: id,
          url: `https://www.youtube.com/watch?v=${id}`,
          channelTitle: '',
          thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
          watchedAt: this.watchedVideos[id] || 0
        };
      });
      if (this.searchQuery) {
        const q = this.searchQuery.toLowerCase();
        list = list.filter(v => (v.title || '').toLowerCase().includes(q) || (v.channelTitle || '').toLowerCase().includes(q));
      }
      list.sort((a, b) => (b.watchedAt || 0) - (a.watchedAt || 0));
      this.filteredVideos = list;
      return;
    }

    // Default: 'channels' feed view
    const cutoff = this.getTimeCutoff();
    let vids = this.allChannelVideos.filter(v => v.pubTS >= cutoff);

    // Hide watched
    if (this.hideWatched) {
      vids = vids.filter(v => !this.watchedVideos[v.id]);
    }

    // Format / Duration Filter
    if (this.contentFilter !== 'all') {
      vids = vids.filter(v => {
        const durSec = this.parseDurationSeconds(v.duration);
        const isShort = v.isShort || (durSec > 0 && durSec < 60 && !v.duration.includes(':'));
        switch (this.contentFilter) {
          case 'no-shorts':
            return !v.isShort && durSec >= 60;
          case 'shorts':
            return isShort;
          case 'quick':
            return durSec > 0 && durSec < 300;
          case 'standard':
            return durSec >= 300 && durSec <= 1200;
          case 'long':
            return durSec > 1200;
          case 'live':
            return !!v.isLive;
          default:
            return true;
        }
      });
    }

    // Channel chip filter
    if (this.activeChannelChip === 'new') {
      vids = vids.filter(v => v.isNew);
    } else if (this.activeChannelChip !== 'all') {
      vids = vids.filter(v => v.channelTitle === this.activeChannelChip);
    }

    // Search query
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      vids = vids.filter(v =>
        (v.title || '').toLowerCase().includes(q) ||
        (v.channelTitle || '').toLowerCase().includes(q)
      );
    }

    // Sort
    switch (this.sortMode) {
      case 'activity':
        vids.sort((a, b) => b.pubTS - a.pubTS);
        break;
      case 'new':
        vids.sort((a, b) => (b.isNew ? 1 : 0) - (a.isNew ? 1 : 0) || b.pubTS - a.pubTS);
        break;
      case 'views':
        vids.sort((a, b) => (b.viewCountNum || 0) - (a.viewCountNum || 0));
        break;
      case 'name':
        vids.sort((a, b) => a.channelTitle.localeCompare(b.channelTitle) || b.pubTS - a.pubTS);
        break;
    }

    this.filteredVideos = vids;
  }

  // ─── Rendering ────────────────────────────────────────────

  updateUI() {
    this.applyFilters();
    this.buildChannelChips();
    this.displayedCount = 0;
    this.D.feed.innerHTML = '';
    this.D.feed.className = `feed view-${this.viewMode}`;

    if (this.viewMode === 'swimlane' && this.view === 'channels') {
      this.renderSwimlanes();
    } else {
      this.renderMore();
    }

    this.updateStats();
  }

  updateViewModeButtons() {
    this.D.viewGrid?.classList.toggle('active', this.viewMode === 'grid');
    this.D.viewCompact?.classList.toggle('active', this.viewMode === 'compact');
    this.D.viewSwimlane?.classList.toggle('active', this.viewMode === 'swimlane');
  }

  switchViewMode(mode) {
    if (this.viewMode === mode) return;
    this.viewMode = mode;
    chrome.storage.sync.set({ feedViewMode: mode });
    this.updateViewModeButtons();
    this.updateUI();
  }

  buildChannelChips() {
    if (this.view !== 'channels') {
      this.D.chipScroll.parentElement.style.display = 'none';
      return;
    }
    this.D.chipScroll.parentElement.style.display = 'block';

    const cutoff = this.getTimeCutoff();
    const channelCounts = new Map();
    let newCount = 0;
    for (const v of this.allChannelVideos) {
      if (v.pubTS >= cutoff) {
        if (!this.hideWatched || !this.watchedVideos[v.id]) {
          channelCounts.set(v.channelTitle, (channelCounts.get(v.channelTitle) || 0) + 1);
          if (v.isNew) newCount++;
        }
      }
    }

    const sortedChannels = [...channelCounts.keys()].sort();
    const totalTimeMatching = [...channelCounts.values()].reduce((a, b) => a + b, 0);

    let html = `<button class="chip ${this.activeChannelChip === 'all' ? 'active' : ''}" data-chip="all">All (${totalTimeMatching})</button>`;
    if (newCount > 0) {
      html += `<button class="chip ${this.activeChannelChip === 'new' ? 'active' : ''}" data-chip="new">✨ New (${newCount})</button>`;
    }

    for (const ch of sortedChannels) {
      const count = channelCounts.get(ch) || 0;
      const isAct = this.activeChannelChip === ch;
      html += `<button class="chip ${isAct ? 'active' : ''}" data-chip="${this.esc(ch)}">${this.esc(ch)} (${count})</button>`;
    }

    this.D.chipScroll.innerHTML = html;
  }

  renderMore() {
    const start = this.displayedCount;
    const end = Math.min(start + PAGE_SIZE, this.filteredVideos.length);

    if (start >= this.filteredVideos.length) {
      if (this.filteredVideos.length === 0 && start === 0) {
        this.showEmpty();
      }
      return;
    }

    const batch = this.filteredVideos.slice(start, end);
    const fragment = document.createDocumentFragment();

    for (let i = 0; i < batch.length; i++) {
      const v = batch[i];
      const card = this.createCard(v, start + i);
      fragment.appendChild(card);
    }

    this.D.feed.appendChild(fragment);
    this.displayedCount = end;
  }

  renderSwimlanes() {
    if (this.filteredVideos.length === 0) {
      this.showEmpty();
      return;
    }

    // Group by channel
    const groups = new Map();
    for (const v of this.filteredVideos) {
      if (!groups.has(v.channelTitle)) groups.set(v.channelTitle, []);
      groups.get(v.channelTitle).push(v);
    }

    const fragment = document.createDocumentFragment();

    for (const [channelTitle, vids] of groups.entries()) {
      const groupEl = document.createElement('section');
      groupEl.className = 'swimlane-group';

      const color = this.channelColors.get(channelTitle) || '#555';
      const initial = (channelTitle || '?')[0];

      groupEl.innerHTML = `
        <div class="swimlane-header">
          <div class="swimlane-title-wrap">
            <div class="card-avatar" style="background:${color};width:28px;height:28px;font-size:12px;">${this.esc(initial)}</div>
            <h2 class="swimlane-title" data-channel="${this.esc(channelTitle)}">${this.esc(channelTitle)}</h2>
            <span class="swimlane-count">${vids.length}</span>
          </div>
        </div>
        <div class="swimlane-row"></div>
      `;

      const rowEl = groupEl.querySelector('.swimlane-row');
      for (let i = 0; i < vids.length; i++) {
        const card = this.createCard(vids[i], i);
        rowEl.appendChild(card);
      }

      fragment.appendChild(groupEl);
    }

    this.D.feed.appendChild(fragment);
    this.displayedCount = this.filteredVideos.length;
  }

  createCard(v, index) {
    const isWatched = !!this.watchedVideos[v.id];
    const inWL = this.watchLaterMap.has(v.id);
    const color = this.channelColors.get(v.channelTitle) || '#555';
    const initial = (v.channelTitle || '?')[0];

    const card = document.createElement('div');
    card.className = `card${isWatched ? ' watched-card' : ''}`;
    card.dataset.id = v.id;
    card.dataset.url = v.url;
    card.dataset.channelUrl = v.channelUrl || '';
    card.dataset.channelTitle = v.channelTitle || '';
    card.tabIndex = 0;
    card.style.animationDelay = `${(index % PAGE_SIZE) * 20}ms`;

    const thumb = v.thumbnail || `https://i.ytimg.com/vi/${v.id}/hqdefault.jpg`;
    const duration = v.duration || '';
    const viewsText = v.views || '';
    const published = v.published || '';
    const stats = [viewsText, published].filter(Boolean).join(' · ');

    card.innerHTML = `
      <div class="card-thumb">
        <img src="${this.esc(thumb)}" data-static-src="${this.esc(thumb)}" alt="" loading="lazy">
        ${duration ? `<span class="card-duration">${this.esc(duration)}</span>` : ''}
        ${v.isLive ? `<span class="card-badge live">LIVE</span>` : ''}
        ${v.isNew ? `<span class="card-badge new-badge">NEW</span>` : ''}
        <div class="card-actions">
          <button class="card-action play-action" title="Play Video in In-Feed Modal" data-id="${v.id}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
          </button>
          <button class="card-action ai-action" title="On-Device AI Video Summary" data-id="${v.id}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M9.5 2l1.6 4.9L16 8.5l-4.9 1.6L9.5 15l-1.6-4.9L3 8.5l4.9-1.6L9.5 2zm8 10l.9 2.7 2.7.9-2.7.9-.9 2.7-.9-2.7L13.8 15.6l2.7-.9.9-2.7z"/></svg>
          </button>
          <button class="card-action wl-action${inWL ? ' is-active' : ''}" title="${inWL ? 'Remove from' : 'Add to'} Watch Later" data-id="${v.id}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/></svg>
          </button>
          <button class="card-action watched-action${isWatched ? ' is-active' : ''}" title="${isWatched ? 'Unmark' : 'Mark'} Watched" data-id="${v.id}">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 4.5C7 4.5 2.73 7.61 1 12c1.73 4.39 6 7.5 11 7.5s9.27-3.11 11-7.5c-1.73-4.39-6-7.5-11-7.5zM12 17c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5zm0-8c-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3-1.34-3-3-3z"/></svg>
          </button>
        </div>
      </div>
      <div class="card-meta">
        <div class="card-avatar" style="background:${color}">${this.esc(initial)}</div>
        <div class="card-info">
          <h3 class="card-title" title="${this.esc(v.title)}">${this.esc(v.title)}</h3>
          <span class="card-channel" data-channel-url="${this.esc(v.channelUrl || '')}">${this.esc(v.channelTitle)}</span>
          <span class="card-stats">${this.esc(stats)}</span>
        </div>
      </div>`;

    this.attachHoverPreview(card, v.id);
    return card;
  }

  attachHoverPreview(card, videoId) {
    const img = card.querySelector('.card-thumb img');
    if (!img) return;

    let timer = null;
    const animatedSrc = `https://i.ytimg.com/an_webp/${videoId}/mqdefault_6s.webp?du=6000&p=0`;

    card.addEventListener('mouseenter', () => {
      timer = setTimeout(() => {
        img.src = animatedSrc;
      }, 250);
    });

    card.addEventListener('mouseleave', () => {
      clearTimeout(timer);
      const staticSrc = img.dataset.staticSrc;
      if (staticSrc && img.src !== staticSrc) {
        img.src = staticSrc;
      }
    });
  }

  showSkeletons() {
    let html = '';
    for (let i = 0; i < 12; i++) {
      html += `<div class="card skeleton"><div class="skel-thumb"></div>
        <div class="skel-meta"><div class="skel-avatar"></div>
        <div class="skel-lines"><div class="skel-line"></div><div class="skel-line"></div><div class="skel-line"></div></div></div></div>`;
    }
    this.D.feed.innerHTML = html;
  }

  showEmpty() {
    if (this.allChannelVideos.length === 0 && this.view === 'channels') {
      this.D.feed.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">📺</div>
          <h2>No Videos Stored Yet</h2>
          <p>Make sure your YouTube channels are inside your configured bookmark folder (<strong>"${this.esc(this.bookmarkFolder)}"</strong>), then click Check Now to scan.</p>
          <button class="btn primary scan-now-btn" style="margin-top:16px;">⟳ Check Now</button>
        </div>`;
      return;
    }

    if (this.view === 'watchLater') {
      this.D.feed.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🕰</div>
          <h2>Watch Later is Empty</h2>
          <p>Add videos by clicking the clock icon on any video card.</p>
        </div>`;
      return;
    }

    if (this.view === 'watched') {
      this.D.feed.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">👁️</div>
          <h2>No Watched Videos</h2>
          <p>Videos you mark as watched (or finish watching on YouTube) appear here.</p>
        </div>`;
      return;
    }

    this.D.feed.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">🔍</div>
        <h2>No Videos Match Current Filters</h2>
        <p>Try switching format to <strong>All Formats</strong>, time to <strong>All time</strong>, or clear your search.</p>
        <button class="btn primary clear-filters-btn" style="margin-top:16px;">Reset All Filters</button>
      </div>`;
  }

  updateStats() {
    const cutoff = this.getTimeCutoff();
    const matchingChannels = new Set();
    let newCount = 0;

    for (const v of this.allChannelVideos) {
      if (v.pubTS >= cutoff) {
        if (!this.hideWatched || !this.watchedVideos[v.id]) {
          matchingChannels.add(v.channelTitle);
          if (v.isNew) newCount++;
        }
      }
    }

    this.D.sCh.textContent = matchingChannels.size;
    this.D.sNew.textContent = newCount;
    this.D.sTotal.textContent = this.filteredVideos.length;
  }

  async populateFolderSuggestions() {
    try {
      const res = await chrome.runtime.sendMessage({ action: 'getBookmarkFolders' });
      if (res?.success && Array.isArray(res.folders) && this.D.folderSuggestions) {
        this.D.folderSuggestions.innerHTML = res.folders
          .map(f => `<option value="${this.esc(f.title)}"></option>`)
          .join('');
      }
    } catch {}
  }

  // ─── Events ───────────────────────────────────────────────

  setupEvents() {
    // Tab switching
    this.D.tabCh.addEventListener('click', () => this.switchView('channels'));
    this.D.tabWl.addEventListener('click', () => this.switchView('watchLater'));
    this.D.tabWv.addEventListener('click', () => this.switchView('watched'));

    // View Switcher
    this.D.viewGrid?.addEventListener('click', () => this.switchViewMode('grid'));
    this.D.viewCompact?.addEventListener('click', () => this.switchViewMode('compact'));
    this.D.viewSwimlane?.addEventListener('click', () => this.switchViewMode('swimlane'));

    // Time filter dropdown
    this.D.fTime.addEventListener('change', e => {
      this.timeFilter = e.target.value;
      chrome.storage.sync.set({ timeFilter: e.target.value });
      this.updateUI();
    });

    // Content filter dropdown
    this.D.fContent?.addEventListener('change', e => {
      this.contentFilter = e.target.value;
      chrome.storage.sync.set({ contentFilter: e.target.value });
      this.updateUI();
    });

    // Sort dropdown
    this.D.fSort.addEventListener('change', e => {
      this.sortMode = e.target.value;
      chrome.storage.sync.set({ feedSort: e.target.value });
      this.updateUI();
    });

    // Hide watched toggle
    this.D.btnHw.addEventListener('click', () => {
      this.hideWatched = !this.hideWatched;
      this.D.btnHw.classList.toggle('active', this.hideWatched);
      this.D.setHw.checked = this.hideWatched;
      chrome.storage.sync.set({ hideWatched: this.hideWatched });
      this.updateUI();
    });

    // Search input
    this.D.search.addEventListener('input', e => {
      clearTimeout(this.searchDebounce);
      this.searchDebounce = setTimeout(() => {
        this.searchQuery = e.target.value.trim();
        this.updateUI();
      }, 150);
    });

    // Refresh / Check Now
    this.D.btnCheck.addEventListener('click', () => this.checkNow());

    // Settings Modal
    this.D.btnSettings.addEventListener('click', () => this.toggleSettings(true));
    this.D.closeSettings.addEventListener('click', () => this.toggleSettings(false));
    this.D.settingsBackdrop.addEventListener('click', () => this.toggleSettings(false));

    this.D.setFolder?.addEventListener('change', e => {
      const val = e.target.value.trim() || 'Vid';
      this.bookmarkFolder = val;
      chrome.storage.sync.set({ bookmarkFolder: val });
      this.toast(`Monitoring folder: ${val}`, 'info');
      this.checkNow();
    });

    this.D.setInt.addEventListener('change', e => {
      this.set.checkInterval = parseInt(e.target.value);
      chrome.storage.sync.set({ checkInterval: this.set.checkInterval });
    });
    this.D.setOpen.addEventListener('change', e => {
      this.set.autoOpen = e.target.value;
      chrome.storage.sync.set({ autoOpen: this.set.autoOpen });
    });
    this.D.setHw.addEventListener('change', e => {
      this.hideWatched = e.target.checked;
      this.D.btnHw.classList.toggle('active', this.hideWatched);
      chrome.storage.sync.set({ hideWatched: this.hideWatched });
      this.updateUI();
    });
    this.D.setNotif.addEventListener('change', e => {
      this.set.notifications = e.target.checked;
      chrome.storage.sync.set({ notifications: this.set.notifications });
    });

    this.D.btnCw.addEventListener('click', () => this.clearWatched());
    this.D.btnCd.addEventListener('click', () => this.clearCache());

    // Player Modal Controls
    this.D.closePlayer?.addEventListener('click', () => this.closePlayerModal());
    this.D.playerBackdrop?.addEventListener('click', () => this.closePlayerModal());
    this.D.playerPip?.addEventListener('click', () => this.openInDocumentPiP());
    this.D.playerOpenTab?.addEventListener('click', () => {
      if (this.currentPlayingVideo?.url) {
        chrome.tabs.create({ url: this.currentPlayingVideo.url, active: true });
        this.closePlayerModal();
      }
    });

    // AI Modal Controls
    this.D.closeAi?.addEventListener('click', () => this.toggleAIModal(false));
    this.D.aiBackdrop?.addEventListener('click', () => this.toggleAIModal(false));
    this.D.aiCopyBtn?.addEventListener('click', () => this.copyAISummary());
    this.D.aiPlayBtn?.addEventListener('click', () => {
      if (this.currentAIVideo) {
        this.toggleAIModal(false);
        this.openPlayerModal(this.currentAIVideo);
      }
    });

    // Channel chips click
    this.D.chipScroll.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;
      this.activeChannelChip = chip.dataset.chip;
      this.D.chipScroll.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      this.updateUI();
    });

    // Image fallback
    this.D.feed.addEventListener('error', e => {
      if (e.target && e.target.tagName === 'IMG') {
        e.target.src = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 9"><rect fill="%23272727" width="16" height="9"/></svg>';
      }
    }, true);

    // Delegated Feed clicks
    this.D.feed.addEventListener('click', e => {
      const target = e.target;

      if (target.closest('.clear-filters-btn')) {
        this.timeFilter = 'all';
        this.contentFilter = 'all';
        this.D.fTime.value = 'all';
        if (this.D.fContent) this.D.fContent.value = 'all';
        chrome.storage.sync.set({ timeFilter: 'all', contentFilter: 'all' });
        this.activeChannelChip = 'all';
        this.searchQuery = '';
        this.D.search.value = '';
        this.updateUI();
        return;
      }

      if (target.closest('.scan-now-btn')) {
        this.checkNow();
        return;
      }

      const playBtn = target.closest('.play-action');
      if (playBtn) {
        e.stopPropagation();
        const card = playBtn.closest('.card');
        this.openPlayerModal({
          id: playBtn.dataset.id,
          url: card?.dataset.url,
          title: card?.querySelector('.card-title')?.textContent || 'Playing Video',
        });
        return;
      }

      const aiBtn = target.closest('.ai-action');
      if (aiBtn) {
        e.stopPropagation();
        const card = aiBtn.closest('.card');
        this.openAISummary({
          id: aiBtn.dataset.id,
          url: card?.dataset.url,
          title: card?.querySelector('.card-title')?.textContent || 'Video',
          channelTitle: card?.dataset.channelTitle || '',
          thumbnail: card?.querySelector('.card-thumb img')?.dataset.staticSrc || card?.querySelector('.card-thumb img')?.src || '',
        });
        return;
      }

      const wlBtn = target.closest('.wl-action');
      if (wlBtn) {
        e.stopPropagation();
        this.toggleWatchLater(wlBtn);
        return;
      }

      const watchedBtn = target.closest('.watched-action');
      if (watchedBtn) {
        e.stopPropagation();
        this.toggleWatched(watchedBtn);
        return;
      }

      const chLink = target.closest('.card-channel') || target.closest('.swimlane-title');
      if (chLink) {
        e.stopPropagation();
        const url = chLink.dataset.channelUrl;
        if (url) {
          chrome.tabs.create({ url, active: true });
        } else if (chLink.dataset.channel) {
          this.activeChannelChip = chLink.dataset.channel;
          this.updateUI();
        }
        return;
      }

      const card = target.closest('.card');
      if (card && card.dataset.url) {
        if (this.set.autoOpen === 'modal') {
          this.openPlayerModal({
            id: card.dataset.id,
            url: card.dataset.url,
            title: card.querySelector('.card-title')?.textContent || 'Playing Video'
          });
        } else {
          this.openVideo(card.dataset.url, card.dataset.id);
        }
      }
    });
  }

  switchView(vw) {
    if (this.view === vw) return;
    this.view = vw;
    this.D.tabCh.classList.toggle('active', vw === 'channels');
    this.D.tabWl.classList.toggle('active', vw === 'watchLater');
    this.D.tabWv.classList.toggle('active', vw === 'watched');

    // Controls visibility
    const isCh = vw === 'channels';
    this.D.fTime.style.display = isCh ? 'inline-block' : 'none';
    if (this.D.fContent) this.D.fContent.style.display = isCh ? 'inline-block' : 'none';
    this.D.btnHw.style.display = isCh ? 'inline-flex' : 'none';
    this.D.viewSwimlane.style.display = isCh ? 'inline-flex' : 'none';

    if (this.viewMode === 'swimlane' && !isCh) {
      this.viewMode = 'grid';
      this.updateViewModeButtons();
    }

    this.updateUI();
  }

  setupInfiniteScroll() {
    this.observer = new IntersectionObserver(entries => {
      if (entries[0].isIntersecting && this.viewMode !== 'swimlane' && this.displayedCount < this.filteredVideos.length) {
        this.renderMore();
      }
    }, { rootMargin: '400px' });
    this.observer.observe(this.D.sentinel);
  }

  setupKeyboard() {
    document.addEventListener('keydown', e => {
      if (!this.D.settingsOverlay.classList.contains('hidden')) {
        if (e.key === 'Escape') this.toggleSettings(false);
        return;
      }
      if (!this.D.playerModal.classList.contains('hidden')) {
        if (e.key === 'Escape') this.closePlayerModal();
        return;
      }
      if (!this.D.aiModal.classList.contains('hidden')) {
        if (e.key === 'Escape') this.toggleAIModal(false);
        return;
      }

      const isInput = document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'SELECT';

      switch (e.key) {
        case '/':
          if (!isInput) {
            e.preventDefault();
            this.D.search.focus();
          }
          break;
        case 'Escape':
          if (isInput) {
            this.D.search.blur();
            this.D.search.value = '';
            this.searchQuery = '';
            this.updateUI();
          }
          break;
        case 'j':
        case 'ArrowDown':
          if (!isInput) { e.preventDefault(); this.moveFocus(1); }
          break;
        case 'k':
        case 'ArrowUp':
          if (!isInput) { e.preventDefault(); this.moveFocus(-1); }
          break;
        case 'Enter':
          if (!isInput) {
            const focused = this.getFocusedCard();
            if (focused?.dataset.url) this.openVideo(focused.dataset.url, focused.dataset.id);
          }
          break;
        case 'p':
          if (!isInput) {
            const focused = this.getFocusedCard();
            if (focused?.dataset.id) {
              this.openPlayerModal({
                id: focused.dataset.id,
                url: focused.dataset.url,
                title: focused.querySelector('.card-title')?.textContent || 'Video'
              });
            }
          }
          break;
        case 's':
          if (!isInput) {
            const focused = this.getFocusedCard();
            if (focused?.dataset.id) {
              this.openAISummary({
                id: focused.dataset.id,
                url: focused.dataset.url,
                title: focused.querySelector('.card-title')?.textContent || 'Video',
                channelTitle: focused.dataset.channelTitle || '',
                thumbnail: focused.querySelector('.card-thumb img')?.dataset.staticSrc || ''
              });
            }
          }
          break;
        case 'w':
          if (!isInput) {
            const focused = this.getFocusedCard();
            const btn = focused?.querySelector('.wl-action');
            if (btn) this.toggleWatchLater(btn);
          }
          break;
        case 'm':
          if (!isInput) {
            const focused = this.getFocusedCard();
            const btn = focused?.querySelector('.watched-action');
            if (btn) this.toggleWatched(btn);
          }
          break;
        case 'r':
          if (!isInput) { e.preventDefault(); this.checkNow(); }
          break;
      }
    });
  }

  setupStorageListener() {
    chrome.storage.onChanged.addListener(async (changes, area) => {
      if (changes.channelResults || changes.watchedVideos || changes.watchLaterVideos) {
        await this.loadData();
        this.updateUI();
        this.updateStatus();
      }
      if (area === 'sync') {
        if (changes.timeFilter) {
          this.timeFilter = changes.timeFilter.newValue;
          this.D.fTime.value = this.timeFilter;
          this.updateUI();
        }
        if (changes.contentFilter && this.D.fContent) {
          this.contentFilter = changes.contentFilter.newValue;
          this.D.fContent.value = this.contentFilter;
          this.updateUI();
        }
        if (changes.hideWatched) {
          this.hideWatched = !!changes.hideWatched.newValue;
          this.D.btnHw.classList.toggle('active', this.hideWatched);
          this.D.setHw.checked = this.hideWatched;
          this.updateUI();
        }
        if (changes.feedSort) {
          this.sortMode = changes.feedSort.newValue;
          this.D.fSort.value = this.sortMode;
          this.updateUI();
        }
        if (changes.feedViewMode) {
          this.viewMode = changes.feedViewMode.newValue;
          this.updateViewModeButtons();
          this.updateUI();
        }
        if (changes.bookmarkFolder) {
          this.bookmarkFolder = changes.bookmarkFolder.newValue || 'Vid';
          if (this.D.setFolder) this.D.setFolder.value = this.bookmarkFolder;
        }
      }
    });
  }

  // ─── Card Focus Navigation ────────────────────────────────

  getFocusedCard() {
    return this.D.feed.querySelector('.card:focus');
  }

  moveFocus(dir) {
    const cards = [...this.D.feed.querySelectorAll('.card:not(.skeleton)')];
    if (!cards.length) return;
    const current = cards.indexOf(this.getFocusedCard());
    const next = Math.max(0, Math.min(cards.length - 1, current + dir));
    cards[next]?.focus();
    cards[next]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  // ─── Video Actions ────────────────────────────────────────

  async openVideo(url, videoId) {
    if (videoId && !this.watchedVideos[videoId]) {
      this.watchedVideos[videoId] = Date.now();
      chrome.runtime.sendMessage({ action: 'markVideoWatched', videoId }).catch(() => {});
      const card = this.D.feed.querySelector(`.card[data-id="${videoId}"]`);
      if (card) {
        card.classList.add('watched-card');
        card.querySelector('.watched-action')?.classList.add('is-active');
      }
      this.D.wvBadge.textContent = Object.keys(this.watchedVideos).length;
    }

    if (this.set.autoOpen === 'current') {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab) chrome.tabs.update(tab.id, { url });
    } else {
      chrome.tabs.create({ url, active: this.set.autoOpen !== 'background' });
    }
  }

  openPlayerModal(video) {
    this.currentPlayingVideo = video;
    this.D.playerTitle.textContent = video.title || 'Playing Video';
    this.D.playerIframe.src = `https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`;
    this.D.playerModal.classList.remove('hidden');

    // Auto mark watched
    if (video.id && !this.watchedVideos[video.id]) {
      this.watchedVideos[video.id] = Date.now();
      chrome.runtime.sendMessage({ action: 'markVideoWatched', videoId: video.id }).catch(() => {});
      const card = this.D.feed.querySelector(`.card[data-id="${video.id}"]`);
      if (card) {
        card.classList.add('watched-card');
        card.querySelector('.watched-action')?.classList.add('is-active');
      }
      this.D.wvBadge.textContent = Object.keys(this.watchedVideos).length;
    }
  }

  closePlayerModal() {
    this.D.playerIframe.src = '';
    this.D.playerModal.classList.add('hidden');
    this.currentPlayingVideo = null;
  }

  async openInDocumentPiP() {
    if (!this.currentPlayingVideo) return;
    const { id, title } = this.currentPlayingVideo;

    if ('documentPictureInPicture' in window) {
      try {
        const pipWindow = await window.documentPictureInPicture.requestWindow({
          width: 560,
          height: 315,
        });

        pipWindow.document.body.innerHTML = `
          <style>
            body { margin: 0; background: #000; overflow: hidden; display: flex; align-items: center; justify-content: center; height: 100vh; font-family: sans-serif; }
            iframe { width: 100%; height: 100%; border: none; }
          </style>
          <iframe src="https://www.youtube-nocookie.com/embed/${id}?autoplay=1" allow="autoplay; encrypted-media; picture-in-picture" allowfullscreen></iframe>
        `;
        this.closePlayerModal();
        this.toast('Playing in Document PiP window', 'info');
        return;
      } catch (e) {
        console.warn('PiP request failed:', e);
      }
    }

    // Fallback: open background or tab
    chrome.tabs.create({ url: `https://www.youtube.com/watch?v=${id}`, active: false });
    this.toast('Opened in background tab', 'info');
  }

  // ─── On-Device AI Summarizer ──────────────────────────────

  async openAISummary(video) {
    this.currentAIVideo = video;
    this.toggleAIModal(true);

    this.D.aiVideoPreview.innerHTML = `
      <img src="${this.esc(video.thumbnail)}" alt="">
      <div class="ai-preview-meta">
        <h3>${this.esc(video.title)}</h3>
        <span>${this.esc(video.channelTitle)}</span>
      </div>
    `;

    this.D.aiLoader.classList.remove('hidden');
    this.D.aiResult.classList.add('hidden');
    this.D.aiCopyBtn.style.display = 'none';

    try {
      const resp = await chrome.runtime.sendMessage({
        action: 'getVideoTranscript',
        videoId: video.id
      });

      const transcript = resp?.success ? resp.transcript : null;
      let coreSummary = '';
      let bullets = [];

      // Attempt Chrome Built-in AI (Prompt API / Gemini Nano)
      if (window.ai?.languageModel) {
        try {
          const session = await window.ai.languageModel.create({
            systemPrompt: "You are a concise video analyst. For the provided YouTube transcript or metadata, produce a 1-sentence Core Thesis and exactly 3 Key Takeaways."
          });

          const promptText = transcript
            ? `Transcript excerpt: "${transcript.slice(0, 3500)}". Summarize in 1 core sentence and 3 bullet points.`
            : `Title: "${video.title}", Channel: "${video.channelTitle}". Summarize key expectations in 1 sentence and 3 bullet points.`;

          const aiText = await session.prompt(promptText);
          const lines = aiText.split('\n').filter(l => l.trim().length > 0);

          coreSummary = lines[0]?.replace(/^core thesis:?/i, '').replace(/^summary:?/i, '').trim();
          bullets = lines.slice(1).map(l => l.replace(/^[-*•\d.]+\s*/, '').trim()).filter(Boolean).slice(0, 3);
        } catch (aiErr) {
          console.warn('Chrome AI Prompt API encountered error, falling back:', aiErr);
        }
      }

      // Smart heuristic fallback if AI not enabled or transcript limited
      if (!coreSummary) {
        if (transcript) {
          const sentences = transcript.split('. ').filter(s => s.trim().length > 25);
          coreSummary = sentences[0] ? sentences[0].trim() + '.' : `Summary for "${video.title}".`;
          bullets = [
            sentences[1] ? sentences[1].trim() + '.' : 'Comprehensive discussion of core concepts.',
            sentences[2] ? sentences[2].trim() + '.' : 'Practical demonstrations and walkthroughs.',
            sentences[3] ? sentences[3].trim() + '.' : 'Key takeaways, conclusions, and next steps.'
          ];
        } else {
          coreSummary = `Direct captions are disabled for this upload.`;
          bullets = [
            `Creator: ${video.channelTitle}`,
            `Video Title: "${video.title}"`,
            `💡 Enable Chrome Gemini Nano via chrome://flags/#prompt-api-for-gemini-nano for on-device summaries.`
          ];
        }
      }

      this.D.aiCoreTakeaway.textContent = coreSummary;
      this.D.aiBullets.innerHTML = bullets.map(b => `<li>${this.esc(b)}</li>`).join('');

      this.D.aiLoader.classList.add('hidden');
      this.D.aiResult.classList.remove('hidden');
      this.D.aiCopyBtn.style.display = 'inline-flex';
    } catch (e) {
      this.D.aiLoader.innerHTML = `<p style="color:var(--accent-danger)">Failed to generate summary: ${this.esc(e.message)}</p>`;
    }
  }

  toggleAIModal(show) {
    this.D.aiModal.classList.toggle('hidden', !show);
    if (!show) this.currentAIVideo = null;
  }

  copyAISummary() {
    const title = this.currentAIVideo?.title || 'YouTube Video';
    const core = this.D.aiCoreTakeaway.textContent;
    const bullets = Array.from(this.D.aiBullets.querySelectorAll('li')).map(li => `• ${li.textContent}`).join('\n');
    const text = `**${title}**\n\n${core}\n\n${bullets}`;

    navigator.clipboard.writeText(text).then(() => {
      this.toast('Summary copied to clipboard!', 'success');
    }).catch(() => {
      this.toast('Copy failed', 'error');
    });
  }

  // ─── Watch Later & Watched Toggles ────────────────────────

  async toggleWatchLater(btn) {
    const id = btn.dataset.id;
    btn.disabled = true;
    try {
      if (this.watchLaterMap.has(id)) {
        await chrome.runtime.sendMessage({ action: 'removeFromWatchLater', videoId: id });
        this.watchLaterMap.delete(id);
        this.watchLaterList = this.watchLaterList.filter(v => v.id !== id);
        btn.classList.remove('is-active');
        this.toast('Removed from Watch Later', 'info');
      } else {
        const card = btn.closest('.card');
        const video = {
          id,
          url: card.dataset.url,
          title: card.querySelector('.card-title')?.textContent || '',
          channelTitle: card.dataset.channelTitle || '',
          published: card.querySelector('.card-stats')?.textContent || '',
          thumbnail: card.querySelector('.card-thumb img')?.dataset.staticSrc || card.querySelector('.card-thumb img')?.src || '',
        };
        await chrome.runtime.sendMessage({ action: 'addToWatchLater', video });
        this.watchLaterMap.set(id, video);
        this.watchLaterList.unshift(video);
        btn.classList.add('is-active');
        this.toast('Added to Watch Later', 'success');
      }
      this.D.wlBadge.textContent = this.watchLaterList.length;
      if (this.view === 'watchLater') this.updateUI();
    } catch { this.toast('Action failed', 'error'); }
    btn.disabled = false;
  }

  async toggleWatched(btn) {
    const id = btn.dataset.id;
    const card = btn.closest('.card');
    btn.disabled = true;
    try {
      if (this.watchedVideos[id]) {
        delete this.watchedVideos[id];
        card?.classList.remove('watched-card');
        btn.classList.remove('is-active');
        await chrome.storage.local.set({ watchedVideos: this.watchedVideos });
      } else {
        this.watchedVideos[id] = Date.now();
        card?.classList.add('watched-card');
        btn.classList.add('is-active');
        await chrome.storage.local.set({ watchedVideos: this.watchedVideos });
        if (this.hideWatched) setTimeout(() => this.updateUI(), 300);
      }
      this.D.wvBadge.textContent = Object.keys(this.watchedVideos).length;
      if (this.view === 'watched') this.updateUI();
    } catch { this.toast('Action failed', 'error'); }
    btn.disabled = false;
  }

  async checkNow() {
    if (this.checking) return;
    this.checking = true;
    this.D.btnCheck.classList.add('checking');
    this.D.btnCheck.disabled = true;
    this.updateStatus('Checking...', 'checking');

    try {
      await chrome.runtime.sendMessage({ action: 'checkNow' });
      await this.loadData();
      this.updateUI();
      this.toast('Feed refreshed!', 'success');
    } catch {
      this.toast('Check failed', 'error');
    } finally {
      this.checking = false;
      this.D.btnCheck.classList.remove('checking');
      this.D.btnCheck.disabled = false;
      this.updateStatus();
    }
  }

  toggleSettings(show) {
    this.D.settingsOverlay.classList.toggle('hidden', !show);
  }

  async clearWatched() {
    if (!confirm('Clear all watched history?')) return;
    try {
      await chrome.runtime.sendMessage({ action: 'clearWatchedVideos' });
      this.watchedVideos = {};
      this.D.wvBadge.textContent = '0';
      this.updateUI();
      this.toast('Watched history cleared', 'success');
    } catch { this.toast('Failed', 'error'); }
  }

  async clearCache() {
    if (!confirm('Clear video cache? Data will refresh on next check.')) return;
    try {
      await chrome.runtime.sendMessage({ action: 'clearCache' });
      this.toast('Cache cleared', 'success');
    } catch { this.toast('Failed', 'error'); }
  }

  async updateStatus(txt = null, type = 'normal') {
    if (txt) {
      this.D.stText.textContent = txt;
      this.D.ind.className = `indicator ${type}`;
      return;
    }
    try {
      const r = await chrome.runtime.sendMessage({ action: 'getStatus' });
      if (r.lastCheck) {
        const ago = Math.floor((Date.now() - r.lastCheck) / 60000);
        this.D.stText.textContent = `Last check: ${ago < 1 ? 'just now' : ago + 'm ago'}`;
        this.D.ind.className = `indicator ${r.lastCheckSuccess ? '' : 'error'}`;
      } else {
        this.D.stText.textContent = 'Never checked';
        this.D.ind.className = 'indicator';
      }
    } catch {
      this.D.stText.textContent = 'Status unknown';
      this.D.ind.className = 'indicator error';
    }
  }

  esc(s) {
    if (!s) return '';
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  toast(msg, type = 'success') {
    document.querySelector('.toast')?.remove();
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }
}

document.addEventListener('DOMContentLoaded', () => { window.feedApp = new FeedApp(); });
