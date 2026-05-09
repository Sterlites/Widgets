document.addEventListener('DOMContentLoaded',()=>{window.popup=new Popup()});
window.addEventListener('beforeunload',()=>window.popup?.destroy());
chrome.storage.onChanged.addListener((c,area)=>{
if(!window.popup)return;
if(c.channelResults||c.watchedVideos||c.watchLaterVideos)requestAnimationFrame(()=>window.popup.refreshData());
if(area==='sync'&&(c.hideWatched||c.timeFilter||c.notifications||c.autoOpen||c.mutedChannels||c.checkInterval)){
requestAnimationFrame(async()=>{await window.popup.loadSettings();window.popup.updateUI();});
}});
chrome.runtime.onMessage.addListener((msg)=>{if(msg?.type==='announce'&&window.popup)window.popup.toast(msg.message,'success');});

class Popup{
constructor(){
this.uiLogs=[];
this.addUiLog=(lvl,msg,det={})=>{this.uiLogs.push({t:new Date().toISOString(),lvl,msg,det});if(this.uiLogs.length>1000)this.uiLogs.shift();};
this.cacheDOM();
this.set={};this.chRes=[];this.fltRes=[];this.wl=[];this.wv={};this.wlMap=new Map();this.view='channels';
this.sort='activity';this.checking=false;this.srchDeb=null;this.updSched=false;this.allExp=false;this.presStates=true;
this.mutedCh=new Set();this.wlSort='added';this.wlSel=new Set();this.wvSort='watched';this.wvSel=new Set();
this.init();
}
cacheDOM(){
const D=document,g=id=>D.getElementById(id);
this.D={res:g('res'),sbar:g('s-bar'),sCh:g('s-ch'),sNew:g('s-new'),sTotal:g('s-total'),stText:g('st-text'),
ind:g('ind'),tabCh:g('tab-ch'),tabWl:g('tab-wl'),tabWv:g('tab-wv'),btnCheck:g('btn-check'),fTime:g('f-time'),
fSort:g('f-sort'),fSearch:g('f-search'),fHwCb:g('f-hw-cb'),btnCw:g('btn-cw'),setInt:g('set-int'),
setNotif:g('set-notif'),setOpen:g('set-open'),controlSet:[g('filter-controls')],btnSettings:g('btn-settings'),
settingsPanel:g('settings-panel'),btnToggleAll:g('btn-toggle-all'),btnDlLog:g('btn-dl-log')};
}
async init(){
this.addUiLog('INFO','Popup init started');
this.loading('Initializing...');
await this.loadSettings();
await this.refreshData(false);
this.setupEvt();
this.addUiLog('INFO','Popup init complete');
this.updStatus();
this.statInt=setInterval(()=>!this.checking&&this.updStatus(),3e4);
}
storeStates(){
if(!this.presStates)return{};
const chs=this.D.res.querySelectorAll('.ch');
const sts={};
chs.forEach(ch=>{const tEl=ch.querySelector('.ch-t');if(tEl)sts[tEl.textContent]=!ch.classList.contains('collapsed');});
return sts;
}
restoreStates(sts){
if(!this.presStates||!sts)return;
requestAnimationFrame(()=>{
const chs=this.D.res.querySelectorAll('.ch');
chs.forEach(ch=>{const tEl=ch.querySelector('.ch-t');if(tEl&&sts[tEl.textContent]!==undefined)ch.classList.toggle('collapsed',!sts[tEl.textContent]);});
});
}
async refreshData(upd=true){
await Promise.all([this.loadWV(),this.loadWL(),this.loadChRes()]);
if(upd){this.presStates=false;this.updateUI();this.presStates=true;}
}
async loadSettings(){
const r=await chrome.storage.sync.get(['checkInterval','timeFilter','notifications','autoOpen','hideWatched','mutedChannels']);
this.set={checkInterval:r.checkInterval||15,notifications:!!r.notifications,autoOpen:r.autoOpen||'current'};
this.tf=r.timeFilter||'1day';this.hideW=!!r.hideWatched;
this.mutedCh=new Set(Array.isArray(r.mutedChannels)?r.mutedChannels:[]);
const{setInt,fTime,setNotif,fHwCb,setOpen}=this.D;
setInt.value=this.set.checkInterval;fTime.value=this.tf;setNotif.checked=this.set.notifications;
fHwCb.checked=this.hideW;setOpen.value=this.set.autoOpen;
}
async loadWV(){
try{const r=await chrome.runtime.sendMessage({action:'getWatchedVideos'});this.wv=r?.success?r.watchedVideos:(await chrome.storage.local.get('watchedVideos')).watchedVideos||{};}
catch{this.wv=(await chrome.storage.local.get('watchedVideos')).watchedVideos||{};}
}
async loadWL(){
try{const r=await chrome.runtime.sendMessage({action:'getWatchLater'});if(r?.success)this.wl=r.list;}
catch{this.wl=(await chrome.storage.local.get('watchLaterVideos')).watchLaterVideos||[];}
this.wlMap=new Map(this.wl.map(v=>[v.id,v]));
}
async loadChRes(){this.chRes=(await chrome.storage.local.get('channelResults')).channelResults||[];this.updateUI();}
setupEvt(){
const{btnCheck,fTime,fSort,fHwCb,fSearch,tabCh,tabWl,tabWv,btnSettings,btnToggleAll,res,btnCw,setInt,setNotif,setOpen}=this.D;
btnCheck.addEventListener('click',()=>this.checkNow());
fTime.addEventListener('change',e=>this.handleFilt('timeFilter',e.target.value));
fSort.addEventListener('change',e=>{this.sort=e.target.value;this.updateUI();});
fHwCb.addEventListener('change',e=>this.handleFilt('hideWatched',e.target.checked));
fSearch.addEventListener('input',e=>{clearTimeout(this.srchDeb);this.srchDeb=setTimeout(()=>{this.srchQ=e.target.value.toLowerCase();this.updateUI();},150);});
tabCh.addEventListener('click',()=>this.switchView('channels'));
tabWl.addEventListener('click',()=>this.switchView('watchLater'));
tabWv.addEventListener('click',()=>this.switchView('watched'));
btnSettings.addEventListener('click',()=>this.toggleSettings());
btnToggleAll.addEventListener('click',()=>this.toggleAll());
res.addEventListener('click',e=>{
const t=e.target;
if(t.closest('.btn.remove-selected')){this.rmSelWL();return;}
if(t.closest('.btn.remove-selected-wv')){this.rmSelWV();return;}
if(t.closest('.wv-item')){
const wvItem=t.closest('.wv-item');
if(t.closest('.btn.primary'))this.openVid(wvItem.dataset.url);
else if(t.closest('.btn.unmark'))this.unmarkW(wvItem.dataset.id,true);
return;
}
if(t.closest('.wl-item')){
const wlItem=t.closest('.wl-item');
if(t.closest('.btn.primary'))this.openVid(wlItem.dataset.url);
else if(t.closest('.btn.remove'))this.rmWL(wlItem.dataset.id,true);
return;
}
const vidBtn=t.closest('.vid-btn');
if(vidBtn){
if(vidBtn.classList.contains('wl'))this.toggleWLSel(vidBtn);
else if(vidBtn.classList.contains('watched'))this.toggleWSel(vidBtn);
return;
}
const ch=t.closest('.ch');
if(ch){
const hBtn=t.closest('.ch-btn');
if(hBtn){
const url=ch.dataset.channelUrl;
const title=ch.querySelector('.ch-t')?.textContent||'';
if(hBtn.classList.contains('open'))this.openCh(url);
else if(hBtn.classList.contains('check'))this.checkChNow({url,title});
else if(hBtn.classList.contains('mute'))this.toggleMute(url,hBtn);
return;
}
}
const vidEl=t.closest('.vid');
if(vidEl&&!t.closest('.vid-a')){this.openVid(vidEl.dataset.url);return;}
const chH=t.closest('.ch-h');
if(chH&&!t.closest('.vid'))chH.parentElement.classList.toggle('collapsed');
});
btnCw.addEventListener('click',()=>this.clearWV());
document.getElementById('set-cd').addEventListener('click',()=>this.clearData());
if(this.D.btnDlLog)this.D.btnDlLog.addEventListener('click',()=>this.downloadScanLog());
setInt.addEventListener('change',e=>this.saveSetting('checkInterval',parseInt(e.target.value)));
setNotif.addEventListener('change',e=>this.saveSetting('notifications',e.target.checked));
setOpen.addEventListener('change',e=>this.saveSetting('autoOpen',e.target.value));
document.getElementById('btn-dl-uilog').addEventListener('click',()=>{
this.addUiLog('INFO','Downloading UI log');
const blob=new Blob([JSON.stringify(this.uiLogs,null,2)],{type:'application/json'});
const url=URL.createObjectURL(blob);
chrome.downloads.download({url,filename:`yt-monitor-ui-log-${new Date().toISOString().replace(/[:.]/g,'-')}.json`});
});
this.D.res.addEventListener('change',(e)=>{
const t=e.target;
if(t.classList.contains('wl-select')){
const id=t.closest('.wl-item')?.dataset.id;if(!id)return;
if(t.checked)this.wlSel.add(id);else this.wlSel.delete(id);
this.updWLTool();
}
if(t.id==='wl-sort'){this.wlSort=t.value;this.renderWL();}
if(t.id==='wl-select-all'){
const all=t.checked;this.wlSel.clear();
if(all)this.wl.forEach(v=>this.wlSel.add(v.id));
this.renderWL();
}
if(t.classList.contains('wv-select')){
const id=t.closest('.wv-item')?.dataset.id;if(!id)return;
if(t.checked)this.wvSel.add(id);else this.wvSel.delete(id);
this.updWVTool();
}
if(t.id==='wv-sort'){this.wvSort=t.value;this.renderWV();}
if(t.id==='wv-select-all'){
const all=t.checked;this.wvSel.clear();
if(all)this.getWVList().forEach(v=>this.wvSel.add(v.id));
this.renderWV();
}});
this.D.res.addEventListener('error',(e)=>{if(e.target.tagName==='IMG')e.target.style.display='none';},true);
}
toggleSettings(){this.D.settingsPanel.classList.toggle('hidden');}
toggleAll(){
const chs=this.D.res.querySelectorAll('.ch');
this.allExp=!this.allExp;
chs.forEach(ch=>ch.classList.toggle('collapsed',!this.allExp));
this.updToggleBtn();
}
updToggleBtn(){
const btn=this.D.btnToggleAll;
const[expI,colI]=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75h-8.5zm0-1.5A2.25 2.25 0 0 0 2 6.25v8.5A2.25 2.25 0 0 0 4.25 17h8.5A2.25 2.25 0 0 0 15 14.75v-8.5A2.25 2.25 0 0 0 12.75 4h-8.5zM8 6a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 8 6zm4 0a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 12 6z" clip-rule="evenodd"></path></svg> Expand All','<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="16" height="16"><path fill-rule="evenodd" d="M4.25 5.5a.75.75 0 0 0-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 0 0 .75-.75v-8.5a.75.75 0 0 0-.75-.75h-8.5zm0-1.5A2.25 2.25 0 0 0 2 6.25v8.5A2.25 2.25 0 0 0 4.25 17h8.5A2.25 2.25 0 0 0 15 14.75v-8.5A2.25 2.25 0 0 0 12.75 4h-8.5zM8 6a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 8 6zm4 0a.75.75 0 0 1 .75.75v4.5a.75.75 0 0 1-1.5 0v-4.5A.75.75 0 0 1 12 6z" clip-rule="evenodd"></path></svg> Collapse All'];
btn.innerHTML=this.allExp?colI:expI;
}
handleFilt(key,val){this[key]=val;if(key==='timeFilter')this.tf=val;chrome.storage.sync.set({[key]:val});this.updateUI();}
saveSetting(key,val){this.set[key]=val;chrome.storage.sync.set({[key]:val});}
switchView(vw){
if(this.view===vw)return;
this.view=vw;
const isCh=vw==='channels',isWL=vw==='watchLater',isWV=vw==='watched';
this.D.tabCh.classList.toggle('active',isCh);
this.D.tabWl.classList.toggle('active',isWL);
this.D.tabWv.classList.toggle('active',isWV);
this.D.controlSet.forEach(c=>c.classList.toggle('hidden',!isCh));
this.D.settingsPanel.classList.add('hidden');
this.updateUI();
}
applyFilt(){
let ts=Date.now()-864e5;
if(this.tf==='sincelastvisit')ts=this.lastManual||(Date.now()-864e5);
else ts=Date.now()-({'1hour':36e5,'6hour':216e5,'12hour':432e5,'1day':864e5,'1week':6048e5,'1month':2592e6}[this.tf]||864e5);
this.addUiLog('DEBUG',`applyFilt start. tf=${this.tf}, ts=${ts}, chRes=${this.chRes.length}, hideW=${this.hideW}`);
this.fltRes=this.chRes.map(ch=>{
if(ch.error)return null;
let vids=(ch.totalVideos||[]).filter(v=>{
const match=v.pubTS>=ts;
return match;
});
if(this.hideW)vids=vids.filter(v=>!this.wv[v.id]);
if(this.srchQ){
const q=this.srchQ;
const chMatch=(ch.channelTitle||'').toLowerCase().includes(q);
const tMatchVids=vids.filter(v=>(v.title||'').toLowerCase().includes(q));
if(!chMatch){vids=tMatchVids;if(vids.length===0)return null;}
}
if(vids.length>0 && this.uiLogs.length < 500){
this.addUiLog('DEBUG',`Channel ${ch.channelTitle}: ${vids.length}/${ch.totalVideos?.length} vids pass filter. First v.pubTS=${vids[0].pubTS}`);
}
return{...ch,filteredVideos:vids};
}).filter(ch=>ch&&ch.filteredVideos.length>0);
this.addUiLog('INFO',`applyFilt end. fltRes=${this.fltRes.length} channels`);
}
updateUI(){
if(this.updSched)return;
this.updSched=true;
requestAnimationFrame(()=>{
const sts=this.storeStates();
if(this.view==='channels'){this.applyFilt();this.renderCh();this.restoreStates(sts);this.updToggleBtn();}
else if(this.view==='watchLater')this.renderWL();
else if(this.view==='watched')this.renderWV();
this.updStats();
this.updSched=false;
});
}
updStats(){
const{sCh,sNew,sTotal}=this.D;
sCh.textContent=this.fltRes.length;
sNew.textContent=this.fltRes.reduce((s,c)=>s+(c.newVideos?.length||0),0);
sTotal.textContent=this.fltRes.reduce((s,c)=>s+(c.filteredVideos?.length||0),0);
}
async updStatus(txt=null,typ='normal'){
if(txt){this.D.stText.textContent=txt;this.D.ind.className=`indicator ${typ}`;return;}
try{
const r=await chrome.runtime.sendMessage({action:'getStatus'});
const lc=r.lastCheck?`${Math.floor((Date.now()-r.lastCheck)/6e4)}m ago`:'Never';
this.D.stText.textContent=r.lastCheck?`Last check: ${lc}`:'Never checked';
this.D.ind.className=`indicator ${r.lastCheckSuccess?'':'error'}`;
}catch{this.D.stText.textContent='Status unknown';this.D.ind.className='indicator error';}
}
async checkNow(){
if(this.checking)return;
this.checking=true;
this.D.btnCheck.disabled=true;
this.updStatus('Checking...','checking');
try{
await chrome.runtime.sendMessage({action:'checkNow'});
await this.refreshData();
this.toast('Check complete','success');
}catch(e){this.toast('Check failed','error');}
finally{this.checking=false;this.D.btnCheck.disabled=false;this.updStatus();}
}
renderCh(){
this.fltRes.sort((a,b)=>{
if(a.error&&!b.error)return 1;
if(b.error&&!a.error)return-1;
if(this.sort==='new')return(b.newVideos?.length||0)-(a.newVideos?.length||0);
if(this.sort==='activity')return Math.max(...(b.filteredVideos?.map(v=>v.pubTS)||[0]))-Math.max(...(a.filteredVideos?.map(v=>v.pubTS)||[0]));
return a.channelTitle.localeCompare(b.channelTitle);
});
if(!this.fltRes.length){this.D.res.innerHTML=this.emptyState('channels');return;}
this.D.res.innerHTML=this.fltRes.map(ch=>{
const nCnt=ch.newVideos?.length||0;
const chH=this.hash(ch.channelUrl);
const isMuted=this.mutedCh.has(chH);
return`<div class="ch collapsed" data-channel-url="${this.esc(ch.channelUrl)}">
<div class="ch-h">
<div class="ch-t">${this.esc(ch.channelTitle)}</div>
<div class="ch-s">${nCnt>0?`<span class="badge new">${nCnt} New</span>`:''}
<span>${ch.filteredVideos?.length||0} Videos</span></div>
<div class="ch-a">
<button class="ch-btn open" title="Open channel">🔗</button>
<button class="ch-btn check" title="Check now">⟳</button>
<button class="ch-btn mute ${isMuted?'active':''}" title="${isMuted?'Unmute':'Mute'} notifications">🔕</button>
</div>
<svg class="ch-h-arrow" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="20"><path fill-rule="evenodd" d="M5.22 8.22a.75.75 0 0 1 1.06 0L10 11.94l3.72-3.72a.75.75 0 1 1 1.06 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L5.22 9.28a.75.75 0 0 1 0-1.06z" clip-rule="evenodd"></path></svg>
</div>
<div class="vids">${ch.filteredVideos.slice(0,20).map(v=>this.vidHTML(v,ch)).join('')}</div>
</div>`;
}).join('');
}
vidHTML(v,ch){
const isNew=(ch.newVideos||[]).some(nv=>nv.id===v.id);
const isW=this.wv[v.id];
const inWl=this.wlMap.has(v.id);
return`<div class="vid ${isNew?'new':''} ${isW?'watched':''}" data-url="${v.url}" data-video-id="${v.id}" data-channel-title="${this.esc(ch.channelTitle)}" data-thumbnail="${this.esc(v.thumbnail||'')}">
<div class="vid-c"><div class="vid-t" title="${this.esc(v.title)}">${this.esc(v.title)}</div><div class="vid-p">${this.esc(v.published)}</div></div>
<div class="vid-a">
<button class="vid-btn wl ${inWl?'active':''}" data-id="${v.id}" title="Watch Later"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm.75-13a.75.75 0 0 0-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 0 0 0-1.5h-3.25V5z" clip-rule="evenodd"></path></svg></button>
<button class="vid-btn watched ${isW?'active':''}" data-id="${v.id}" title="Mark Watched"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" width="18"><path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z"></path><path fill-rule="evenodd" d="M.664 10.59a1.651 1.651 0 0 1 0-1.18l.88-1.473a1.65 1.65 0 0 1 1.52-.906l1.67.001c.497 0 .962.214 1.285.572l.786.812a1.65 1.65 0 0 1 0 2.316l-.786.812a1.65 1.65 0 0 1-1.285.572l-1.67-.001a1.65 1.65 0 0 1-1.52-.906l-.88-1.473ZM17.456 10.59a1.651 1.651 0 0 1 0-1.18l.88-1.473a1.65 1.65 0 0 1 1.52-.906l1.67.001c.497 0 .962.214 1.285.572l.786.812a1.65 1.65 0 0 1 0 2.316l-.786.812a1.65 1.65 0 0 1-1.285.572l-1.67-.001a1.65 1.65 0 0 1-1.52-.906l-.88-1.473z" clip-rule="evenodd"></path></svg></button>
</div></div>`;
}
renderWL(){
if(!this.wl.length){this.D.res.innerHTML=this.emptyState('wl');return;}
const itms=[...this.wl];
if(this.wlSort==='added')itms.sort((a,b)=>(b.addedAt||0)-(a.addedAt||0));
else if(this.wlSort==='title')itms.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
else if(this.wlSort==='channel')itms.sort((a,b)=>(a.channelTitle||'').localeCompare(b.channelTitle||''));
const tool=`<div class="wl-toolbar" style="display:flex;align-items:center;gap:8px;margin:8px;">
<label>Sort: <select id="wl-sort"><option value="added" ${this.wlSort==='added'?'selected':''}>Recently Added</option><option value="title" ${this.wlSort==='title'?'selected':''}>Title</option><option value="channel" ${this.wlSort==='channel'?'selected':''}>Channel</option></select></label>
<label style="margin-left:auto;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="wl-select-all"> Select All</label>
<button class="btn remove-selected" ${this.wlSel.size?'':'disabled'}>Remove Selected</button></div>`;
const lst=`<div class="wl-list">${itms.map(v=>
`<div class="wl-item" data-id="${this.esc(v.id)}" data-url="${this.esc(v.url)}">
<input type="checkbox" class="wl-select" ${this.wlSel.has(v.id)?'checked':''}>
<img src="${this.esc(v.thumbnail||'')}" class="wl-thumb" loading="lazy">
<div class="wl-meta"><div class="wl-t" title="${this.esc(v.title||'')}">${this.esc(v.title||'')}</div>
<div class="wl-ch">${this.esc(v.channelTitle||'')}</div></div>
<div class="wl-a"><button class="btn primary">Open</button><button class="btn remove">Remove</button></div></div>`
).join('')}</div>`;
this.D.res.innerHTML=tool+lst;
this.updWLTool();
}
getWVList(){
const ids=Object.keys(this.wv||{});
if(!ids.length)return[];
const mp=new Map();
(this.chRes||[]).forEach(ch=>{(ch.totalVideos||[]).forEach(v=>{if(!mp.has(v.id))mp.set(v.id,{...v,channelTitle:ch.channelTitle});});});
const bldFb=(id)=>({id,title:id,url:`https://www.youtube.com/watch?v=${id}`,channelTitle:'',thumbnail:'',watchedAt:this.wv[id]||0});
const itms=ids.map(id=>{const inf=mp.get(id);if(inf)return{id:inf.id,title:inf.title,url:inf.url,channelTitle:inf.channelTitle,thumbnail:inf.thumbnail||'',watchedAt:this.wv[id]||0};return bldFb(id);});
return itms;
}
renderWV(){
const itms=this.getWVList();
if(!itms.length){this.D.res.innerHTML=this.emptyState('wl');return;}
const lst=[...itms];
if(this.wvSort==='watched')lst.sort((a,b)=>(b.watchedAt||0)-(a.watchedAt||0));
else if(this.wvSort==='title')lst.sort((a,b)=>(a.title||'').localeCompare(b.title||''));
else if(this.wvSort==='channel')lst.sort((a,b)=>(a.channelTitle||'').localeCompare(b.channelTitle||''));
const tool=`<div class="wl-toolbar" style="display:flex;align-items:center;gap:8px;margin:8px;">
<label>Sort: <select id="wv-sort"><option value="watched" ${this.wvSort==='watched'?'selected':''}>Recently Watched</option><option value="title" ${this.wvSort==='title'?'selected':''}>Title</option><option value="channel" ${this.wvSort==='channel'?'selected':''}>Channel</option></select></label>
<label style="margin-left:auto;display:flex;align-items:center;gap:6px;"><input type="checkbox" id="wv-select-all"> Select All</label>
<button class="btn remove-selected-wv" ${this.wvSel.size?'':'disabled'}>Unmark Selected</button></div>`;
const lstH=`<div class="wv-list">${lst.map(v=>
`<div class="wv-item" data-id="${this.esc(v.id)}" data-url="${this.esc(v.url)}">
<input type="checkbox" class="wv-select" ${this.wvSel.has(v.id)?'checked':''}>
<img src="${this.esc(v.thumbnail||'')}" class="wv-thumb" loading="lazy">
<div class="wv-meta"><div class="wv-t" title="${this.esc(v.title||'')}">${this.esc(v.title||'')}</div>
<div class="wv-ch">${this.esc(v.channelTitle||'')}</div></div>
<div class="wv-a"><button class="btn primary">Open</button><button class="btn unmark">Unmark</button></div></div>`
).join('')}</div>`;
this.D.res.innerHTML=tool+lstH;
this.updWVTool();
}
updWVTool(){
const selAll=this.D.res.querySelector('#wv-select-all');
const rmSel=this.D.res.querySelector('.remove-selected-wv');
const itms=this.getWVList();
selAll.checked=itms.length>0&&this.wvSel.size===itms.length;
rmSel.disabled=!this.wvSel.size;
}
async unmarkW(id,conf=false){
if(conf&&!confirm('Unmark as watched?'))return;
try{
if(this.wv[id]){delete this.wv[id];await chrome.storage.local.set({watchedVideos:this.wv});}
this.toast('Unmarked','success');
await this.refreshData();
}catch(e){this.toast('Failed','error');}
}
async rmSelWV(){
if(!this.wvSel.size)return;
if(!confirm(`Unmark ${this.wvSel.size} selected item(s)?`))return;
try{
for(const id of this.wvSel)delete this.wv[id];
this.wvSel.clear();
await chrome.storage.local.set({watchedVideos:this.wv});
await this.refreshData();
this.toast('Selected items unmarked','success');
}catch(e){this.toast('Failed','error');}
}
async toggleWLSel(btn){
const id=btn.dataset.id;
const vidEl=btn.closest('.vid');
const v={id,url:vidEl.dataset.url,title:vidEl.querySelector('.vid-t').textContent,channelTitle:vidEl.dataset.channelTitle,published:vidEl.querySelector('.vid-p').textContent,thumbnail:vidEl.dataset.thumbnail};
btn.disabled=true;
try{
if(this.wlMap.has(id)){
await this.rmWL(id);
btn.classList.remove('active');
this.wlMap.delete(id);
}else{
await chrome.runtime.sendMessage({action:'addToWatchLater',video:v});
btn.classList.add('active');
this.wl.push(v);
this.wlMap.set(id,v);
this.toast('Added to Watch Later','success');
}
this.updStatsOnly();
}catch(e){this.toast('Watch Later failed','error');}
btn.disabled=false;
}
async toggleWSel(btn){
const id=btn.dataset.id;
btn.disabled=true;
const vidEl=btn.closest('.vid');
try{
if(this.wv[id]){
delete this.wv[id];
vidEl.classList.remove('watched');
btn.classList.remove('active');
}else{
this.wv[id]=Date.now();
vidEl.classList.add('watched');
btn.classList.add('active');
}
await chrome.storage.local.set({watchedVideos:this.wv});
if(this.hideW)setTimeout(()=>this.updateUI(),200);
else this.updStatsOnly();
}catch(e){this.toast('Watched action failed','error');}
finally{btn.disabled=false;}
}
updStatsOnly(){
const{sCh,sNew,sTotal}=this.D;
sCh.textContent=this.fltRes.length;
sNew.textContent=this.fltRes.reduce((s,c)=>s+(c.newVideos?.length||0),0);
sTotal.textContent=this.fltRes.reduce((s,c)=>s+(c.filteredVideos?.length||0),0);
}
async rmWL(id,conf=false){
if(conf&&!confirm('Remove from Watch Later?'))return;
try{
await chrome.runtime.sendMessage({action:'removeFromWatchLater',videoId:id});
this.toast('Removed from Watch Later','success');
await this.loadWL();
this.updateUI();
}catch(e){this.toast('Failed to remove','error');}
}
async rmSelWL(){
if(!this.wlSel.size)return;
if(!confirm(`Remove ${this.wlSel.size} selected item(s)?`))return;
try{
await chrome.runtime.sendMessage({action:'removeManyFromWatchLater',videoIds:[...this.wlSel]});
this.wlSel.clear();
await this.loadWL();
this.updateUI();
this.toast('Selected items removed','success');
}catch(e){this.toast('Failed','error');}
}
async clearWV(){
if(confirm('Clear all watched flags?')){
try{
await chrome.runtime.sendMessage({action:'clearWatchedVideos'});
this.toast('Watched flags cleared','success');
this.refreshData();
}catch(e){this.toast('Failed','error');}
}
}
async clearData(){
if(confirm('Clear video cache?')){
try{
await chrome.runtime.sendMessage({action:'clearCache'});
this.toast('Cache cleared','success');
}catch(e){this.toast('Failed','error');}
}
}
async downloadScanLog(){
try{
const r=await chrome.runtime.sendMessage({action:'getScanLogs'});
if(r?.success&&r.logs?.length){
const blob=new Blob([JSON.stringify(r.logs,null,2)],{type:'application/json'});
const url=URL.createObjectURL(blob);
const a=document.createElement('a');
a.href=url;a.download=`yt-monitor-scan-log-${new Date().toISOString().replace(/[:.]/g,'-')}.json`;
a.click();URL.revokeObjectURL(url);
this.toast('Log downloaded','success');
}else this.toast('No logs available','warning');
}catch(e){this.toast('Failed to get log','error');}
}
async openVid(url){
if(this.set.autoOpen==='current'){
const[curTab]=await chrome.tabs.query({active:true,currentWindow:true});
if(curTab)chrome.tabs.update(curTab.id,{url});
}else chrome.tabs.create({url,active:this.set.autoOpen!=='background'});
}
async openCh(url){if(!url)return;chrome.tabs.create({url,active:true});}
async checkChNow(ch){
try{
await chrome.runtime.sendMessage({action:'checkChannelNow',channel:ch});
await this.refreshData();
this.toast('Channel refreshed','success');
}catch(e){this.toast('Failed to refresh','error');}
}
async toggleMute(url,btn){
try{
const h=this.hash(url);
const prefs=await chrome.storage.sync.get(['mutedChannels']);
const lst=Array.isArray(prefs.mutedChannels)?prefs.mutedChannels:[];
const i=lst.indexOf(h);
if(i>=0){lst.splice(i,1);btn.classList.remove('active');this.toast('Unmuted','success');this.mutedCh.delete(h);}
else{lst.push(h);btn.classList.add('active');this.toast('Muted','success');this.mutedCh.add(h);}
await chrome.storage.sync.set({mutedChannels:lst});
}catch(e){this.toast('Mute toggle failed','error');}
}
updWLTool(){
const selAll=this.D.res.querySelector('#wl-select-all');
const rmSel=this.D.res.querySelector('.remove-selected');
if(!selAll||!rmSel)return;
selAll.checked=this.wl.length>0&&this.wlSel.size===this.wl.length;
rmSel.disabled=!this.wlSel.size;
}
toast(msg,typ='success'){
document.querySelector('.toast')?.remove();
const t=document.createElement('div');
t.className=`toast ${typ}`;
t.innerHTML=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path fill-rule="evenodd" d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5z" clip-rule="evenodd"></path></svg> ${msg}`;
document.body.appendChild(t);
setTimeout(()=>t.remove(),3e3);
}
loading(msg){this.D.res.innerHTML=`<div class="loading"><div class="icon-loader">⟳</div><div>${msg}</div></div>`;}
esc(s){const d=document.createElement('div');d.textContent=s;return d.innerHTML;}
emptyState(typ){
return typ==='wl'?
`<div class="empty"><div class="empty-icon">🕰</div><h3>Watch Later is Empty</h3><p>Add videos using the clock icon.</p></div>`:
`<div class="empty"><div class="empty-icon">📺</div><h3>No Videos Found</h3><p>Try adjusting your filters or adding more channels to your "Vid" bookmarks folder.</p></div>`;
}
destroy(){clearInterval(this.statInt);}
hash(url){let h=0;for(let i=0;i<url.length;i++)h=((h<<5)-h)+url.charCodeAt(i),h&=h;return Math.abs(h).toString();}
}