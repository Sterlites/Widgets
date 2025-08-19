document.addEventListener('DOMContentLoaded',()=>{window.popup=new Popup()});
window.addEventListener('beforeunload',()=>window.popup?.destroy());
chrome.storage.onChanged.addListener((c, area)=>{
  if(!window.popup)return;
  // React to data changes
  if(c.channelResults||c.watchedVideos||c.watchLaterVideos)
    requestAnimationFrame(()=>window.popup.refreshData());
  // React to sync pref changes
  if(area==='sync' && (c.hideWatched||c.timeFilter||c.notifications||c.autoOpen||c.mutedChannels||c.checkInterval)){
    requestAnimationFrame(async ()=>{
      await window.popup.loadSettings();
      window.popup.updateUI();
    });
  }
});
// Announcements from background (e.g., toggle-hide-watched)
chrome.runtime.onMessage.addListener((msg)=>{
  if(msg?.type==='announce'&&window.popup){ window.popup.showToast(msg.message,'success'); }
});

class Popup{
constructor(){
this.cacheDOM();
this.settings={};this.channelResults=[];this.filteredResults=[];this.watchLater=[];
this.watchedVideos={};this.watchLaterMap=new Map();this.view='channels';
this.sortBy='activity';this.isChecking=false;this.searchDebounce=null;this.updateScheduled=false;
this.allExpanded=false;this.preserveChannelStates=true; // Key architectural change
this.mutedChannels=new Set();
this.wlSort='added';
this.wlSelection=new Set();
this.wvSort='watched';
this.wvSelection=new Set();
this.init();
}

cacheDOM(){
const D=document,g=id=>D.getElementById(id);
this.D={
res:g('res'),sbar:g('s-bar'),sCh:g('s-ch'),sNew:g('s-new'),sTotal:g('s-total'),
stText:g('st-text'),ind:g('ind'),tabCh:g('tab-ch'),tabWl:g('tab-wl'),tabWv:g('tab-wv'),
btnCheck:g('btn-check'),fTime:g('f-time'),fSort:g('f-sort'),fSearch:g('f-search'),
fHwCb:g('f-hw-cb'),btnCw:g('btn-cw'),setInt:g('set-int'),setNotif:g('set-notif'),
setOpen:g('set-open'),controlSet:[g('filter-controls')],btnSettings:g('btn-settings'),
settingsPanel:g('settings-panel'),btnToggleAll:g('btn-toggle-all')
};
}

async init(){
this.showLoading('Initializing...');
await this.loadSettings();
await this.refreshData(false);
this.setupEventListeners();
this.updateStatus();
this.statusInterval=setInterval(()=>!this.isChecking&&this.updateStatus(),30000);
}

// Store/restore channel collapse states
storeChannelStates(){
if(!this.preserveChannelStates)return{};
const channels=this.D.res.querySelectorAll('.ch');
const states={};
channels.forEach(ch=>{
const titleEl=ch.querySelector('.ch-t');
if(titleEl){
states[titleEl.textContent]=!ch.classList.contains('collapsed');
}
});
return states;
}

restoreChannelStates(states){
if(!this.preserveChannelStates||!states)return;
requestAnimationFrame(()=>{
const channels=this.D.res.querySelectorAll('.ch');
channels.forEach(ch=>{
const titleEl=ch.querySelector('.ch-t');
if(titleEl&&states[titleEl.textContent]!==undefined){
ch.classList.toggle('collapsed',!states[titleEl.textContent]);
}
});
});
}

async refreshData(update=true){
await Promise.all([this.loadWatchedVideos(),this.loadWatchLater(),this.loadChannelResults()]);
if(update){
// Full refresh - don't preserve states
this.preserveChannelStates=false;
this.updateUI();
this.preserveChannelStates=true;
}
}

async loadSettings(){
const r=await chrome.storage.sync.get(['checkInterval','timeFilter','notifications','autoOpen','hideWatched','mutedChannels']);
this.settings={checkInterval:r.checkInterval||15,notifications:!!r.notifications,autoOpen:r.autoOpen||'current'};
this.timeFilter=r.timeFilter||'1day';this.hideWatched=!!r.hideWatched;
this.mutedChannels=new Set(Array.isArray(r.mutedChannels)?r.mutedChannels:[]);
const{setInt,fTime,setNotif,fHwCb,setOpen}=this.D;
setInt.value=this.settings.checkInterval;fTime.value=this.timeFilter;
setNotif.checked=this.settings.notifications;fHwCb.checked=this.hideWatched;
setOpen.value=this.settings.autoOpen;
}

async loadWatchedVideos(){
try{
const r=await chrome.runtime.sendMessage({action:'getWatchedVideos'});
this.watchedVideos=r?.success?r.watchedVideos:(await chrome.storage.local.get('watchedVideos')).watchedVideos||{};
}catch{this.watchedVideos=(await chrome.storage.local.get('watchedVideos')).watchedVideos||{};}
}

async loadWatchLater(){
try{
const r=await chrome.runtime.sendMessage({action:'getWatchLater'});
if(r?.success)this.watchLater=r.list;
}catch{this.watchLater=(await chrome.storage.local.get('watchLaterVideos')).watchLaterVideos||[];}
this.watchLaterMap=new Map(this.watchLater.map(v=>[v.id,v]));
}

async loadChannelResults(){
this.channelResults=(await chrome.storage.local.get('channelResults')).channelResults||[];
this.updateUI();
}

setupEventListeners(){
const{btnCheck,fTime,fSort,fHwCb,fSearch,tabCh,tabWl,tabWv,btnSettings,btnToggleAll,res,btnCw,setInt,setNotif,setOpen}=this.D;
btnCheck.addEventListener('click',()=>this.checkNow());
fTime.addEventListener('change',e=>this.handleFilterChange('timeFilter',e.target.value));
fSort.addEventListener('change',e=>{this.sortBy=e.target.value;this.updateUI();});
fHwCb.addEventListener('change',e=>this.handleFilterChange('hideWatched',e.target.checked));
fSearch.addEventListener('input',e=>{
clearTimeout(this.searchDebounce);
this.searchDebounce=setTimeout(()=>{
this.searchQuery=e.target.value.toLowerCase();this.updateUI();
},150);
});
tabCh.addEventListener('click',()=>this.switchView('channels'));
tabWl.addEventListener('click',()=>this.switchView('watchLater'));
tabWv.addEventListener('click',()=>this.switchView('watched'));
btnSettings.addEventListener('click',()=>this.toggleSettings());
btnToggleAll.addEventListener('click',()=>this.toggleAllChannels());

  res.addEventListener('click',e=>{
  const t=e.target;

  // Toolbar bulk actions (outside list items)
  if(t.closest('.btn.remove-selected')){ this.removeSelectedWatchLater(); return; }
  if(t.closest('.btn.remove-selected-wv')){ this.removeSelectedWatched(); return; }

// Handle watched items
if(t.closest('.wv-item')){
  const wvItem=t.closest('.wv-item');
  if(t.closest('.btn.primary')) this.openVideo(wvItem.dataset.url);
  else if(t.closest('.btn.remove-selected-wv')) this.removeSelectedWatched();
  else if(t.closest('.btn.unmark')) this.unmarkWatched(wvItem.dataset.id,true);
  return;
}

// Handle watch later items
  if(t.closest('.wl-item')){
  const wlItem=t.closest('.wl-item');
   // Selection checkbox handled in change handler
   if(t.closest('.btn.primary'))this.openVideo(wlItem.dataset.url);
   else if(t.closest('.btn.remove'))this.removeFromWatchLater(wlItem.dataset.id,true);
  return;
  }

// Handle video buttons - use selective update instead of full re-render
const vidBtn=t.closest('.vid-btn');
if(vidBtn){
if(vidBtn.classList.contains('wl'))this.toggleWatchLaterSelective(vidBtn);
else if(vidBtn.classList.contains('watched'))this.toggleWatchedSelective(vidBtn);
return;
}

 // Handle channel action buttons
 const ch= t.closest('.ch');
 if(ch){
   const headerBtn=t.closest('.ch-btn');
   if(headerBtn){
     const channelUrl=ch.dataset.channelUrl;
     const channelTitle=ch.querySelector('.ch-t')?.textContent||'';
     if(headerBtn.classList.contains('open')){
       this.openChannel(channelUrl);
     }else if(headerBtn.classList.contains('check')){
       this.checkChannelNow({url:channelUrl,title:channelTitle});
     }else if(headerBtn.classList.contains('mute')){
       this.toggleMuteChannel(channelUrl, headerBtn);
     }
     return;
   }
 }

// Handle video content clicks
const vidEl=t.closest('.vid');
if(vidEl&&!t.closest('.vid-a')){
this.openVideo(vidEl.dataset.url);
return;
}

// Handle channel header clicks
const chHeader=t.closest('.ch-h');
if(chHeader&&!t.closest('.vid')){
chHeader.parentElement.classList.toggle('collapsed');
}
});

btnCw.addEventListener('click',()=>this.clearWatchedVideos());
document.getElementById('set-cd').addEventListener('click',()=>this.clearData());
setInt.addEventListener('change',e=>this.saveSetting('checkInterval',parseInt(e.target.value)));
setNotif.addEventListener('change',e=>this.saveSetting('notifications',e.target.checked));
setOpen.addEventListener('change',e=>this.saveSetting('autoOpen',e.target.value));

// Watch later toolbar interactions
this.D.res.addEventListener('change',(e)=>{
  const t=e.target;
  if(t.classList.contains('wl-select')){
    const id=t.closest('.wl-item')?.dataset.id;
    if(!id)return;
    if(t.checked) this.wlSelection.add(id); else this.wlSelection.delete(id);
    this.updateWatchLaterToolbar();
  }
  if(t.id==='wl-sort'){
    this.wlSort=t.value; this.renderWatchLater();
  }
  if(t.id==='wl-select-all'){
    const all = t.checked;
    this.wlSelection.clear();
    if(all){ this.watchLater.forEach(v=>this.wlSelection.add(v.id)); }
    this.renderWatchLater();
  }
  // Watched list controls
  if(t.classList.contains('wv-select')){
    const id=t.closest('.wv-item')?.dataset.id; if(!id) return;
    if(t.checked) this.wvSelection.add(id); else this.wvSelection.delete(id);
    this.updateWatchedToolbar();
  }
  if(t.id==='wv-sort'){
    this.wvSort=t.value; this.renderWatched();
  }
  if(t.id==='wv-select-all'){
    const all=t.checked; this.wvSelection.clear();
    if(all){ this.getWatchedListItems().forEach(v=>this.wvSelection.add(v.id)); }
    this.renderWatched();
  }
});
}

toggleSettings(){this.D.settingsPanel.classList.toggle('hidden');}

toggleAllChannels(){
const channels=this.D.res.querySelectorAll('.ch');
this.allExpanded=!this.allExpanded;
channels.forEach(ch=>ch.classList.toggle('collapsed',!this.allExpanded));
this.updateToggleAllButton();
}

updateToggleAllButton(){
const btn=this.D.btnToggleAll;
const[expandIcon,collapseIcon]=[
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75h-8.5zm0-1.5A2.25 2.25 0 0 0 2 6.25v8.5A2.25 2.25 0 0 0 4.25 17h8.5A2.25 2.25 0 0 0 15 14.75v-8.5A2.25 2.25 0 0 0 12.75 4h-8.5zM8 6a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 8 6zm4 0a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 12 6z" clip-rule="evenodd"></path></svg> Expand All',
'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75h-8.5zm0-1.5A2.25 2.25 0 0 0 2 6.25v8.5A2.25 2.25 0 0 0 4.25 17h8.5A2.25 2.25 0 0 0 15 14.75v-8.5A2.25 2.25 0 0 0 12.75 4h-8.5zM8 6a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 8 6zm4 0a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 12 6z" clip-rule="evenodd"></path></svg> Collapse All'
];
btn.innerHTML=this.allExpanded?collapseIcon:expandIcon;
}

handleFilterChange(key,value){
this[key]=value;
chrome.storage.sync.set({[key]:value});
this.updateUI();
}

saveSetting(key,value){
this.settings[key]=value;
chrome.storage.sync.set({[key]:value});
}

switchView(viewName){
if(this.view===viewName)return;
this.view=viewName;
const isChannelsView=viewName==='channels';
const isWatchLater=viewName==='watchLater';
const isWatched=viewName==='watched';
this.D.tabCh.classList.toggle('active',isChannelsView);
this.D.tabWl.classList.toggle('active',isWatchLater);
this.D.tabWv.classList.toggle('active',isWatched);
this.D.controlSet.forEach(c=>c.classList.toggle('hidden',!isChannelsView));
this.D.settingsPanel.classList.add('hidden');
this.updateUI();
}

applyFilters(){
const ts=Date.now()-({'1hour':36e5,'6hour':216e5,'12hour':432e5,'1day':864e5,'1week':6048e5,'1month':2592e6}[this.timeFilter]||864e5);
this.filteredResults=this.channelResults.map(ch=>{
if(ch.error)return null;
let vids=(ch.totalVideos||[]).filter(v=>v.publishedTimestamp>=ts);
if(this.hideWatched)vids=vids.filter(v=>!this.watchedVideos[v.id]);
if(this.searchQuery){
  const q=this.searchQuery;
  const channelMatches=(ch.channelTitle||'').toLowerCase().includes(q);
  const titleMatchedVids=vids.filter(v=>(v.title||'').toLowerCase().includes(q));
  if(!channelMatches){
    // Only include channel if some video titles match; then only show matching videos
    vids=titleMatchedVids;
    if(vids.length===0) return null;
  }
}
return{...ch,filteredVideos:vids};
}).filter(ch=>ch&&ch.filteredVideos.length>0);
}

updateUI(){
if(this.updateScheduled)return;
this.updateScheduled=true;
requestAnimationFrame(()=>{
const states=this.storeChannelStates();
  if(this.view==='channels'){
    this.applyFilters();
    this.renderChannels();
    this.restoreChannelStates(states);
    this.updateToggleAllButton();
  }else if(this.view==='watchLater'){
    this.renderWatchLater();
  }else if(this.view==='watched'){
    this.renderWatched();
  }
this.updateStats();
this.updateScheduled=false;
});
}

updateStats(){
const{sCh,sNew,sTotal}=this.D;
sCh.textContent=this.filteredResults.length;
sNew.textContent=this.filteredResults.reduce((s,c)=>s+(c.newVideos?.length||0),0);
sTotal.textContent=this.filteredResults.reduce((s,c)=>s+(c.filteredVideos?.length||0),0);
}

async updateStatus(text=null,type='normal'){
if(text){
this.D.stText.textContent=text;
this.D.ind.className=`indicator ${type}`;
return;
}
try{
const r=await chrome.runtime.sendMessage({action:'getStatus'});
const lastCheck=r.lastCheck?`${Math.floor((Date.now()-r.lastCheck)/6e4)}m ago`:'Never';
this.D.stText.textContent=r.lastCheck?`Last check: ${lastCheck}`:'Never checked';
this.D.ind.className=`indicator ${r.lastCheckSuccess?'':'error'}`;
}catch{
this.D.stText.textContent='Status unknown';
this.D.ind.className='indicator error';
}
}

async checkNow(){
if(this.isChecking)return;
this.isChecking=true;
this.D.btnCheck.disabled=true;
this.updateStatus('Checking...','checking');
try{
await chrome.runtime.sendMessage({action:'checkNow'});
await this.refreshData();
this.showToast('Check complete','success');
}catch(e){
this.showToast('Check failed','error');
}finally{
this.isChecking=false;
this.D.btnCheck.disabled=false;
this.updateStatus();
}
}

renderChannels(){
this.filteredResults.sort((a,b)=>{
if(a.error&&!b.error)return 1;
if(b.error&&!a.error)return -1;
if(this.sortBy==='new')return(b.newVideos?.length||0)-(a.newVideos?.length||0);
if(this.sortBy==='activity')return Math.max(...(b.filteredVideos?.map(v=>v.publishedTimestamp)||[0]))-Math.max(...(a.filteredVideos?.map(v=>v.publishedTimestamp)||[0]));
return a.channelTitle.localeCompare(b.channelTitle);
});

if(!this.filteredResults.length){
this.D.res.innerHTML=this.getEmptyState('channels');
return;
}

this.D.res.innerHTML=this.filteredResults.map(ch=>{
const newCount=ch.newVideos?.length||0;
const chHash=this.hashUrl(ch.channelUrl);
const isMuted=this.mutedChannels.has(chHash);
return`<div class="ch collapsed" data-channel-url="${this.esc(ch.channelUrl)}">
<div class="ch-h">
<div class="ch-t">${this.esc(ch.channelTitle)}</div>
<div class="ch-s">
${newCount>0?`<span class="badge new">${newCount} New</span>`:''}
<span>${ch.filteredVideos?.length||0} Videos</span>
</div>
<div class="ch-a">
  <button class="ch-btn open" title="Open channel">🔗</button>
  <button class="ch-btn check" title="Check now">⟳</button>
  <button class="ch-btn mute ${isMuted?'active':''}" title="${isMuted?'Unmute':'Mute'} notifications">🔕</button>
</div>
<svg class="ch-h-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clip-rule="evenodd"></path></svg>
</div>
<div class="vids">${ch.filteredVideos.slice(0,20).map(v=>this.getVideoHTML(v,ch)).join('')}</div>
</div>`;
}).join('');
}

getVideoHTML(v,ch){
const isNew=(ch.newVideos||[]).some(nv=>nv.id===v.id);
const isWatched=this.watchedVideos[v.id];
const inWl=this.watchLaterMap.has(v.id);
return`<div class="vid ${isNew?'new':''} ${isWatched?'watched':''}" 
data-url="${v.url}" 
data-video-id="${v.id}" 
data-channel-title="${this.esc(ch.channelTitle)}"
data-thumbnail="${this.esc(v.thumbnail||'')}">
<div class="vid-c"><div class="vid-t" title="${this.esc(v.title)}">${this.esc(v.title)}</div><div class="vid-p">${this.esc(v.published)}</div></div>
<div class="vid-a">
<button class="vid-btn wl ${inWl?'active':''}" data-id="${v.id}" title="Watch Later"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5z" clip-rule="evenodd"></path></svg></button>
<button class="vid-btn watched ${isWatched?'active':''}" data-id="${v.id}" title="Mark Watched"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.18l.88-1.473a1.65 1.65 0 0 1 1.52-.906l1.67.001c.497 0 .962.214 1.285.572l.786.812a1.65 1.65 0 0 1 0 2.316l-.786.812a1.65 1.65 0 0 1-1.285.572l-1.67-.001a1.65 1.65 0 0 1-1.52-.906l-.88-1.473ZM17.456 10.59a1.651 1.651 0 0 1 0-1.18l.88-1.473a1.65 1.65 0 0 1 1.52-.906l1.67.001c.497 0 .962.214 1.285.572l.786.812a1.65 1.65 0 0 1 0 2.316l-.786.812a1.65 1.65 0 0 1-1.285.572l-1.67-.001a1.65 1.65 0 0 1-1.52-.906l-.88-1.473z" clip-rule="evenodd"></path></svg></button>
</div>
</div>`;
}

renderWatchLater(){
if(!this.watchLater.length){ this.D.res.innerHTML=this.getEmptyState('wl'); return; }
// Sort
const items=[...this.watchLater];
if(this.wlSort==='added') items.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
else if(this.wlSort==='title') items.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
else if(this.wlSort==='channel') items.sort((a,b)=>(a.channelTitle||'').localeCompare(b.channelTitle||''));

const toolbar=`<div class="wl-toolbar" style="display:flex;align-items:center;gap:8px;margin:8px;">
  <label>Sort: <select id="wl-sort"><option value="added" ${this.wlSort==='added'?'selected':''}>Recently Added</option><option value="title" ${this.wlSort==='title'?'selected':''}>Title</option><option value="channel" ${this.wlSort==='channel'?'selected':''}>Channel</option></select></label>
  <label style="margin-left:auto;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="wl-select-all"> Select All</label>
  <button class="btn remove-selected" ${this.wlSelection.size?'':'disabled'}>Remove Selected</button>
</div>`;

const list=`<div class="wl-list">${items.map(v=>
`<div class="wl-item" data-id="${this.esc(v.id)}" data-url="${this.esc(v.url)}">
<input type="checkbox" class="wl-select" ${this.wlSelection.has(v.id)?'checked':''}>
<img src="${this.esc(v.thumbnail||'')}" class="wl-thumb" loading="lazy" onerror="this.style.display='none'">
<div class="wl-meta">
<div class="wl-t" title="${this.esc(v.title||'')}">${this.esc(v.title||'')}</div>
<div class="wl-ch">${this.esc(v.channelTitle||'')}</div>
</div>
<div class="wl-a">
<button class="btn primary">Open</button>
<button class="btn remove">Remove</button>
</div>
</div>`
).join('')}</div>`;

this.D.res.innerHTML=toolbar+list;
this.updateWatchLaterToolbar();
}

// Build watched items from stored ids, enriching from known data
getWatchedListItems(){
const ids=Object.keys(this.watchedVideos||{});
if(!ids.length) return [];
// Map from channelResults for quick lookup
const map=new Map();
(this.channelResults||[]).forEach(ch=>{
  (ch.totalVideos||[]).forEach(v=>{ if(!map.has(v.id)) map.set(v.id,{...v, channelTitle: ch.channelTitle}); });
});
// Fallback builder
const buildFallback=(id)=>({ id, title: id, url: `https://www.youtube.com/watch?v=${id}`, channelTitle: '', thumbnail: '', watchedAt: this.watchedVideos[id]||0 });
const items = ids.map(id=>{
  const info = map.get(id);
  if(info){ return { id: info.id, title: info.title, url: info.url, channelTitle: info.channelTitle, thumbnail: info.thumbnail||'', watchedAt: this.watchedVideos[id]||0 }; }
  return buildFallback(id);
});
return items;
}

renderWatched(){
const items=this.getWatchedListItems();
if(!items.length){ this.D.res.innerHTML=this.getEmptyState('wl'); return; }
// Sort
const list=[...items];
if(this.wvSort==='watched') list.sort((a,b)=>(b.watchedAt||0)-(a.watchedAt||0));
else if(this.wvSort==='title') list.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
else if(this.wvSort==='channel') list.sort((a,b)=>(a.channelTitle||'').localeCompare(b.channelTitle||''));

const toolbar=`<div class="wl-toolbar" style="display:flex;align-items:center;gap:8px;margin:8px;">
  <label>Sort: <select id="wv-sort"><option value="watched" ${this.wvSort==='watched'?'selected':''}>Recently Watched</option><option value="title" ${this.wvSort==='title'?'selected':''}>Title</option><option value="channel" ${this.wvSort==='channel'?'selected':''}>Channel</option></select></label>
  <label style="margin-left:auto;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="wv-select-all"> Select All</label>
  <button class="btn remove-selected-wv" ${this.wvSelection.size?'':'disabled'}>Unmark Selected</button>
</div>`;

const listHtml=`<div class="wv-list">${list.map(v=>
`<div class="wv-item" data-id="${this.esc(v.id)}" data-url="${this.esc(v.url)}">
<input type="checkbox" class="wv-select" ${this.wvSelection.has(v.id)?'checked':''}>
<img src="${this.esc(v.thumbnail||'')}" class="wv-thumb" loading="lazy" onerror="this.style.display='none'">
<div class="wv-meta">
<div class="wv-t" title="${this.esc(v.title||'')}">${this.esc(v.title||'')}</div>
<div class="wv-ch">${this.esc(v.channelTitle||'')}</div>
</div>
<div class="wv-a">
<button class="btn primary">Open</button>
<button class="btn unmark">Unmark</button>
</div>
</div>`
).join('')}</div>`;

this.D.res.innerHTML=toolbar+listHtml;
this.updateWatchedToolbar();
}

updateWatchedToolbar(){
    const selectAll=this.D.res.querySelector('#wv-select-all');
    const removeSelected=this.D.res.querySelector('.remove-selected-wv');
    const items=this.getWatchedListItems();
    selectAll.checked = items.length>0 && this.wvSelection.size === items.length;
    removeSelected.disabled = !this.wvSelection.size;
  }

async unmarkWatched(id,confirmFirst=false){
if(confirmFirst && !confirm('Unmark as watched?')) return;
try{
if(this.watchedVideos[id]){ delete this.watchedVideos[id]; await chrome.storage.local.set({watchedVideos:this.watchedVideos}); }
this.showToast('Unmarked','success');
await this.refreshData();
}catch(e){ this.showToast('Failed','error'); }
}

async removeSelectedWatched(){
if(!this.wvSelection.size) return;
if(!confirm(`Unmark ${this.wvSelection.size} selected item(s)?`)) return;
try{
for(const id of this.wvSelection){ delete this.watchedVideos[id]; }
this.wvSelection.clear();
await chrome.storage.local.set({watchedVideos:this.watchedVideos});
await this.refreshData();
this.showToast('Selected items unmarked','success');
}catch(e){ this.showToast('Failed','error'); }
}

// Selective update methods - key architectural improvement

async toggleWatchLaterSelective(btn){
const id=btn.dataset.id;
const vidEl=btn.closest('.vid');
const v={
id,
url:vidEl.dataset.url,
title:vidEl.querySelector('.vid-t').textContent,
channelTitle:vidEl.dataset.channelTitle,
published:vidEl.querySelector('.vid-p').textContent,
thumbnail:vidEl.dataset.thumbnail
};
btn.disabled=true;
try{
if(this.watchLaterMap.has(id)){
await this.removeFromWatchLater(id);
btn.classList.remove('active');
this.watchLaterMap.delete(id);
}else{
await chrome.runtime.sendMessage({action:'addToWatchLater',video:v});
btn.classList.add('active');
this.watchLater.push(v);
this.watchLaterMap.set(id,v);
this.showToast('Added to Watch Later','success');
}
// Only update stats, not full UI
this.updateStatsOnly();
}catch(e){
this.showToast('Watch Later failed','error');
}
btn.disabled=false;
}

async toggleWatchedSelective(btn){
const id=btn.dataset.id;
btn.disabled=true;
const vidEl=btn.closest('.vid');
try{
if(this.watchedVideos[id]){
delete this.watchedVideos[id];
vidEl.classList.remove('watched');
btn.classList.remove('active');
}else{
this.watchedVideos[id]=Date.now();
vidEl.classList.add('watched');
btn.classList.add('active');
}
await chrome.storage.local.set({watchedVideos:this.watchedVideos});
if(this.hideWatched){
// If hiding watched, need full update but preserve states
setTimeout(()=>this.updateUI(),200);
}else{
// Just update stats
this.updateStatsOnly();
}
}catch(e){
this.showToast('Watched action failed','error');
}finally{
btn.disabled=false;
}
}

updateStatsOnly(){
// Update only statistics without full re-render
const{sCh,sNew,sTotal}=this.D;
sCh.textContent=this.filteredResults.length;
sNew.textContent=this.filteredResults.reduce((s,c)=>s+(c.newVideos?.length||0),0);
sTotal.textContent=this.filteredResults.reduce((s,c)=>s+(c.filteredVideos?.length||0),0);
}

async removeFromWatchLater(id,confirmFirst=false){
if(confirmFirst&&!confirm('Remove from Watch Later?'))return;
try{
await chrome.runtime.sendMessage({action:'removeFromWatchLater',videoId:id});
this.showToast('Removed from Watch Later','success');
await this.loadWatchLater();
this.updateUI();
}catch(e){
this.showToast('Failed to remove','error');
}
}

async removeSelectedWatchLater(){
  if(!this.wlSelection.size){ return; }
  if(!confirm(`Remove ${this.wlSelection.size} selected item(s)?`)) return;
  try{
    await chrome.runtime.sendMessage({action:'removeManyFromWatchLater', videoIds:[...this.wlSelection]});
    this.wlSelection.clear();
    await this.loadWatchLater();
    this.updateUI();
    this.showToast('Selected items removed','success');
  }catch(e){ this.showToast('Failed','error'); }
}

async clearWatchedVideos(){
if(confirm('Clear all watched flags?')){
try{
await chrome.runtime.sendMessage({action:'clearWatchedVideos'});
this.showToast('Watched flags cleared','success');
this.refreshData();
}catch(e){
this.showToast('Failed','error');
}
}
}

async openVideo(url){
if(this.settings.autoOpen==='current'){
const[currentTab]=await chrome.tabs.query({active:true,currentWindow:true});
if(currentTab)chrome.tabs.update(currentTab.id,{url});
}else{
chrome.tabs.create({url,active:this.settings.autoOpen!=='background'});
}
}

async openChannel(url){
  if(!url) return;
  chrome.tabs.create({url,active:true});
}

async checkChannelNow(channel){
  try{
    await chrome.runtime.sendMessage({action:'checkChannelNow', channel});
    await this.refreshData();
    this.showToast('Channel refreshed','success');
  }catch(e){ this.showToast('Failed to refresh','error'); }
}

async toggleMuteChannel(channelUrl, btn){
  try{
    const hash=this.hashUrl(channelUrl);
    const prefs=await chrome.storage.sync.get(['mutedChannels']);
    const list=Array.isArray(prefs.mutedChannels)?prefs.mutedChannels:[];
    const i=list.indexOf(hash);
    if(i>=0){ list.splice(i,1); btn.classList.remove('active'); this.showToast('Unmuted','success'); this.mutedChannels.delete(hash); }
    else { list.push(hash); btn.classList.add('active'); this.showToast('Muted','success'); this.mutedChannels.add(hash); }
    await chrome.storage.sync.set({mutedChannels:list});
  }catch(e){ this.showToast('Mute toggle failed','error'); }
}

updateWatchLaterToolbar(){
  const selectAll = this.D.res.querySelector('#wl-select-all');
  const removeSelected = this.D.res.querySelector('.remove-selected');
  if(!selectAll || !removeSelected) return; // not on WL view
  selectAll.checked = this.watchLater.length>0 && this.wlSelection.size === this.watchLater.length;
  removeSelected.disabled = !this.wlSelection.size;
}

showToast(msg,type='success'){
document.querySelector('.toast')?.remove();
const t=document.createElement('div');
t.className=`toast ${type}`;
t.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clip-rule="evenodd"></path></svg> ${msg}`;
document.body.appendChild(t);
setTimeout(()=>t.remove(),3000);
}

showLoading(msg){
this.D.res.innerHTML=`<div class="loading"><div class="icon-loader">⳿</div><div>${msg}</div></div>`;
}

esc(s){
const d=document.createElement('div');
d.textContent=s;
return d.innerHTML;
}

getEmptyState(type){
return type==='wl'?
`<div class="empty"><div class="empty-icon">🕰</div><h3>Watch Later is Empty</h3><p>Add videos using the clock icon.</p></div>`:
`<div class="empty"><div class="empty-icon">📺</div><h3>No Videos Found</h3><p>Try adjusting your filters or adding more channels to your "Vid" bookmarks folder.</p></div>`;
}

destroy(){clearInterval(this.statusInterval);}

// Helpers
hashUrl(url){ let h=0; for(let i=0;i<url.length;i++) h=((h<<5)-h)+url.charCodeAt(i), h&=h; return Math.abs(h).toString(); }
}