class YouTubeChannelMonitor{
constructor(){
this.cfg={FOLDER:'Vid',CHK_INT:15,RETRIES:2,TIMEOUT:3e4,CONC:2,NOTIF_TO:5e3,CACHE:100};
this.st={actReq:0,lastReq:0,stats:{tot:0,ok:0,fail:0},init:false};
this.scanLogs=[];
this.init();
}
addLog(lvl,msg,det=null){
const t=new Date().toISOString();
const e={t,lvl,msg};if(det)e.det=det;
this.scanLogs.push(e);
if(this.scanLogs.length>5000)this.scanLogs.shift();
console.log(`[${lvl}] ${msg}`,det||'');
}
async init(){
try{
const{checkInterval:ci=this.cfg.CHK_INT}=await this.gSync(['checkInterval']);
await chrome.alarms.clear('checkChannels');
await chrome.alarms.create('checkChannels',{periodInMinutes:ci});
this.setupListen();
setTimeout(()=>this.chkAll(false),5e3);
this.st.init=true;
await this.badge('','#22c55e');
}catch(e){await this.badge('!','#ef4444');await this.sLoc({lastError:e.message,lastErrorTime:Date.now()});}
}
setupListen(){
chrome.alarms.onAlarm.addListener(a=>a.name==='checkChannels'&&this.chkAll(false));
chrome.storage.onChanged.addListener(async(c,a)=>{
if(a==='sync'&&c.checkInterval){
const v=c.checkInterval.newValue;
if(typeof v==='number'&&v>0){await chrome.alarms.clear('checkChannels');await chrome.alarms.create('checkChannels',{periodInMinutes:v});}
}});
chrome.commands.onCommand.addListener(async(cmd)=>{
if(cmd==='check-now')this.chkAll(true);
else if(cmd==='toggle-hide-watched'){
const{hideWatched:hw=false}=await this.gSync(['hideWatched']);
const nv=!hw;
await this.sSync({hideWatched:nv});
try{chrome.runtime.sendMessage({type:'announce',message:`Hide watched: ${nv?'On':'Off'}`});}catch{}
}});
chrome.runtime.onStartup.addListener(()=>this.updStat());
}
gLoc(k){return new Promise(r=>chrome.storage.local.get(k,res=>r(res)));}
sLoc(d){return new Promise(r=>chrome.storage.local.set(d,()=>r()));}
gSync(k){return new Promise(r=>chrome.storage.sync.get(k,res=>r(res)));}
sSync(d){return new Promise(r=>chrome.storage.sync.set(d,()=>r()));}
async findVid(){return new Promise(r=>chrome.bookmarks.search({title:this.cfg.FOLDER},res=>r(res.find(i=>!i.url))));}
async getChBm(){
try{
this.addLog('DEBUG',`Searching for bookmark folder: '${this.cfg.FOLDER}'`);
const f=await this.findVid();
if(!f){this.addLog('WARN',`Bookmark folder '${this.cfg.FOLDER}' not found!`);return[];}
this.addLog('DEBUG',`Bookmark folder found. ID: ${f.id}`);
return new Promise(r=>chrome.bookmarks.getChildren(f.id,ch=>{
const valid=ch.filter(b=>b.url&&b.url.includes('youtube.com')&&(b.url.includes('/videos')||b.url.includes('/channel/')||b.url.includes('/@')));
this.addLog('DEBUG',`Found ${ch.length} items in folder, ${valid.length} valid youtube links.`);
r(valid);
}));
}catch(e){this.addLog('ERROR',`Error getting bookmarks`,{error:e.message});return[];}
}
async fetchVids(url,rt=0){
try{
while(this.st.actReq>=this.cfg.CONC){this.addLog('DEBUG',`Throttling fetch, active requests: ${this.st.actReq}`);await new Promise(r=>setTimeout(r,1e3));}
this.st.actReq++;
let u=url;
if(!u.includes('/videos')&&!u.includes('/streams')){
if(u.includes('/@')||u.includes('/channel/'))u=u.replace(/\/$/,'')+'/videos';
}
this.addLog('DEBUG',`Fetching URL (retry ${rt}): ${u}`);
const ctrl=new AbortController();
const tid=setTimeout(()=>ctrl.abort(),this.cfg.TIMEOUT);
const res=await fetch(u,{headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'},signal:ctrl.signal});
clearTimeout(tid);
if(!res.ok){this.addLog('ERROR',`HTTP Error ${res.status} for URL: ${u}`);throw new Error(`HTTP ${res.status}`);}
this.addLog('DEBUG',`Response OK for URL: ${u}, reading text...`);
const html=await res.text();
this.addLog('DEBUG',`Read ${html.length} bytes for URL: ${u}, parsing HTML...`);
return this.parseHTML(html);
}catch(e){
this.addLog('WARN',`Fetch error for URL ${url} (retry ${rt}): ${e.message}`);
if(rt<this.cfg.RETRIES&&!e.message.includes('aborted')){
await new Promise(r=>setTimeout(r,1e3*2**rt));
return this.fetchVids(url,rt+1);
}
this.addLog('ERROR',`Fetch completely failed for URL ${url} after ${rt} retries`,{error:e.message});
return null;
}finally{this.st.actReq--;}
}
parseHTML(h){
try{
let d=null;
let mtd='none';
for(const p of[/var ytInitialData = ({.*?});/s,/window\["ytInitialData"\] = ({.*?});/s,/ytInitialData":\s*({.*?}),\s*"ytInitialPlayerResponse"/s]){
const m=h.match(p);
if(m)try{d=JSON.parse(m[1]);mtd=p.toString();break;}catch{continue;}
}
if(!d){this.addLog('WARN',`Could not extract ytInitialData from HTML`);return[];}
this.addLog('DEBUG',`Extracted ytInitialData via ${mtd}`);
const tabs=d?.contents?.twoColumnBrowseResultsRenderer?.tabs||d?.contents?.singleColumnBrowseResultsRenderer?.tabs||[];
if(!tabs.length){this.addLog('WARN',`No tabs found in ytInitialData`);return[];}
let vt=tabs.find(t=>t?.tabRenderer?.content?.richGridRenderer?.contents||t?.tabRenderer?.content?.sectionListRenderer);
if(!vt){this.addLog('WARN',`No video tab contents found in ytInitialData`);return[];}
let cnts=[];
const tc=vt.tabRenderer.content;
if(tc.richGridRenderer?.contents)cnts=tc.richGridRenderer.contents;
else if(tc.sectionListRenderer?.contents){
for(const s of tc.sectionListRenderer.contents){if(s.itemSectionRenderer?.contents)cnts.push(...s.itemSectionRenderer.contents);}
}
this.addLog('DEBUG',`Parsed ${cnts.length} content items`);
const vids=cnts.map(i=>this.parseVR(i?.richItemRenderer?.content||i)).filter(Boolean).sort((a,b)=>b.pubTS-a.pubTS).slice(0,50);
this.addLog('DEBUG',`Successfully extracted ${vids.length} videos`);
return vids;
}catch(e){this.addLog('ERROR',`HTML Parsing exception`,{error:e.message});return[];}
}
parseVR(v){
try{
if(v?.lockupViewModel){
const lvm=v.lockupViewModel;
if(lvm.contentType!=='LOCKUP_CONTENT_TYPE_VIDEO')return null;
const id=lvm.contentId;
const t=lvm.metadata?.lockupMetadataViewModel?.title?.content||'Untitled';
const parts=lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts||[];
let pt='',views='';
if(parts.length>=2){views=parts[0]?.text?.content||'';pt=parts[1]?.text?.content||'';}
else if(parts.length===1){pt=parts[0]?.text?.content||'';}
const th=lvm.contentImage?.thumbnailViewModel?.image?.sources||[];
return{id,title:t.trim(),url:`https://www.youtube.com/watch?v=${id}`,published:pt||'Recently',pubTS:this.parsePT(pt),discoveredAt:Date.now(),thumbnail:th[th.length-1]?.url||'',views};
}
const vr=v?.videoRenderer||v;
if(!vr?.videoId)return null;
const t=vr.title?.runs?.[0]?.text||vr.title?.simpleText||'Untitled';
const pt=vr.publishedTimeText?.simpleText||vr.publishedTimeText?.runs?.[0]?.text;
const th=vr.thumbnail?.thumbnails||[];
return{id:vr.videoId,title:t.trim(),url:`https://www.youtube.com/watch?v=${vr.videoId}`,published:pt||'Recently',pubTS:this.parsePT(pt),discoveredAt:Date.now(),thumbnail:th[th.length-1]?.url||'',views:vr.viewCountText?.simpleText||vr.shortViewCountText?.simpleText||''};
}catch{return null;}
}
parsePT(tx){
if(!tx||tx.toLowerCase().includes('recently')||tx.toLowerCase().includes('just now'))return Date.now();
const now=Date.now();
const m=tx.toLowerCase().trim().match(/(?:streamed|premiered)?\s*(\d+)\s*(second|sec|s|minute|min|m|hour|hr|h|day|d|week|wk|w|month|mo|year|yr)s?\s+ago/);
if(m){
const[,amt,u]=m;
const mul={second:1e3,sec:1e3,s:1e3,minute:6e4,min:6e4,m:6e4,hour:36e5,hr:36e5,h:36e5,day:864e5,d:864e5,week:6048e5,wk:6048e5,w:6048e5,month:2592e6,mo:2592e6,year:31536e6,yr:31536e6};
return now-parseInt(amt)*(mul[u]||864e5);
}
return now-864e6; // Fallback to 10 days ago if totally unknown to avoid false positives in hourly filters
}
async getStVids(url){const k=`videos_${this.hash(url)}`;try{const r=await this.gLoc([k]);return r[k]||[];}catch{return[];}}
async stVids(url,vids){const k=`videos_${this.hash(url)}`;try{await this.sLoc({[k]:vids.slice(0,this.cfg.CACHE)});}catch{}}
hash(u){let h=0;for(let i=0;i<u.length;i++)h=((h<<5)-h)+u.charCodeAt(i),h&=h;return Math.abs(h).toString();}
async getTF(){try{const r=await this.gSync(['timeFilter']);return r.timeFilter||'1day';}catch{return'1day';}}
async getTFTS(f){
const now=Date.now();
if(f==='sincelastvisit'||f==='lastcheck'){try{const r=await this.gLoc(['lastManualCheck']);return r.lastManualCheck||(now-864e5);}catch{return now-864e5;}}
const mp={'1hour':36e5,'6hour':216e5,'12hour':432e5,'1day':864e5,'1week':6048e5,'1month':2592e6,'1year':31536e6};
return now-(mp[f]||mp['1day']);
}
async badge(txt,col='#ef4444'){try{await chrome.action.setBadgeText({text:txt.toString()});await chrome.action.setBadgeBackgroundColor({color:col});}catch{}}
async notif(title,msg,chRes){
try{
const s=await this.gSync(['notifications','mutedChannels']);
if(!s.notifications)return;
const totNew=chRes.reduce((sm,c)=>sm+(c.newVideos?.length||0),0);
const mutSet=new Set(s.mutedChannels||[]);
const chNew=chRes.filter(c=>c.newVideos?.length>0&&!mutSet.has(this.hash(c.channelUrl)));
let nm=msg;
if(chNew.length>0){nm=`${chNew[0].newVideos[0].title} - ${chNew[0].channelTitle}`;if(totNew>1)nm+=` (+${totNew-1} more)`;}
const nid=await chrome.notifications.create({type:'basic',iconUrl:'icons/icon48.png',title,message:nm});
setTimeout(()=>chrome.notifications.clear(nid),this.cfg.NOTIF_TO);
}catch{}
}
async getWV(){try{const r=await this.gLoc(['watchedVideos']);return r.watchedVideos||{};}catch{return{};}}
async markW(vid){try{const w=await this.getWV();w[vid]=Date.now();await this.sLoc({watchedVideos:w});return{success:true};}catch(e){throw e;}}
async clrW(){try{await this.sLoc({watchedVideos:{}});return{success:true};}catch(e){throw e;}}
async chkAll(manual=false){
const st=Date.now();
this.addLog('INFO',`Starting scan (manual: ${manual})`);
try{
await this.badge('...','#f59e0b');
this.st.stats.tot++;
if(manual)await this.clrW();
const bm=await this.getChBm();
this.addLog('INFO',`Found ${bm.length} channel bookmarks in folder '${this.cfg.FOLDER}'`);
if(!bm.length){this.addLog('WARN',`No bookmarks found, aborting scan.`);await this.stChRes([]);await this.badge('');return;}
const tf=await this.getTF();
const fts=await this.getTFTS(tf);
this.addLog('INFO',`Time filter: ${tf}, from timestamp: ${fts}`);
const{mutedChannels:mc=[]}=await this.gSync(['mutedChannels']);
const wv=await this.getWV();
let totNew=0,okCh=0;
const chRes=await Promise.all(bm.map(async b=>{
try{
this.addLog('DEBUG',`Processing channel: ${b.title}`,{url:b.url});
const res=await this.procCh(b,fts,wv,manual);
if(res){totNew+=res.newVideos?.length||0;okCh++;this.addLog('DEBUG',`Channel success: ${b.title}`,{new:res.newVideos?.length,filtered:res.filteredVideos?.length,total:res.totalVideos?.length});}
return res;
}catch(e){this.addLog('ERROR',`Channel failed: ${b.title}`,{url:b.url,error:e.message});return{channelTitle:b.title,channelUrl:b.url,error:e.message,newVideos:[],filteredVideos:[],totalVideos:[]};}
}));
this.addLog('INFO',`Saving channel results...`);
await this.stChRes(chRes.filter(Boolean),tf);
if(totNew>0){
await this.badge(totNew>99?'99+':totNew.toString(),'#22c55e');
if(manual||totNew>=3)await this.notif('New Videos Found!',`Found ${totNew} new videos`,chRes.filter(c=>c.newVideos?.length>0));
}else{await this.badge('');}
const dur=Date.now()-st;
this.addLog('INFO',`Scan completed successfully in ${dur}ms`,{channelsChecked:bm.length,successfulChannels:okCh,newVideos:totNew});
await this.sLoc({lastCheck:Date.now(),lastCheckSuccess:true,lastCheckDuration:dur,channelsChecked:bm.length,successfulChannels:okCh});
if(manual)await this.sLoc({lastManualCheck:Date.now()});
this.st.stats.ok++;
}catch(e){
this.addLog('ERROR',`Scan aborted with error`,{error:e.message,stack:e.stack});
await this.badge('!','#ef4444');
await this.sLoc({lastCheck:Date.now(),lastCheckSuccess:false,lastError:e.message,lastErrorTime:Date.now()});
this.st.stats.fail++;
}
}
async procCh(bm,fts,wv={},manual=false){
const cur=await this.fetchVids(bm.url);
if(!cur)throw new Error('Failed to fetch videos');
const st=await this.getStVids(bm.url);
const stIds=new Set(st.map(v=>v.id));
let nw=cur.filter(v=>!stIds.has(v.id));
let flt=cur.filter(v=>v.pubTS>=fts);
if(!manual){nw=nw.filter(v=>!wv[v.id]);flt=flt.filter(v=>!wv[v.id]);}
if(nw.length>0){
this.addLog('DEBUG',`Saving ${cur.length} videos to local cache for ${bm.title}`);
await this.stVids(bm.url,cur);
}
return{channelTitle:bm.title,channelUrl:bm.url,newVideos:nw,filteredVideos:flt,totalVideos:cur,lastChecked:Date.now(),videoCount:cur.length};
}
async stChRes(res,tf){
try{
const str=JSON.stringify(res);
this.addLog('INFO',`Storing channelResults. Size: ${str.length} chars. Channels: ${res.length}`);
await this.sLoc({channelResults:res,lastTimeFilter:tf,lastResultsUpdate:Date.now()});
}catch(e){this.addLog('ERROR',`stChRes failed`,{error:e.message});}
}
async updStat(){try{await this.gLoc(['lastCheck','lastCheckSuccess','lastError']);}catch{}}
async getWL(){try{const r=await this.gLoc(['watchLaterVideos']);return r.watchLaterVideos||[];}catch{return[];}}
async addWL(v){
try{
if(!v?.id||!v.url)throw new Error('Invalid video object');
const ex=await this.getWL();
if(ex.find(vd=>vd.id===v.id))return{success:true,alreadyExists:true};
const itm={id:v.id,title:v.title||'Untitled',url:v.url,channelTitle:v.channelTitle||'Unknown',published:v.published||'Unknown',addedAt:Date.now(),thumbnail:v.thumbnail||''};
ex.unshift(itm);
if(ex.length>1000)ex.length=1000;
await this.sLoc({watchLaterVideos:ex});
return{success:true,item:itm};
}catch(e){throw e;}
}
async rmWL(vid){try{if(!vid)throw new Error('Missing videoId');const ex=await this.getWL();const flt=ex.filter(v=>v.id!==vid);if(flt.length===ex.length)return{success:true,notFound:true};await this.sLoc({watchLaterVideos:flt});return{success:true};}catch(e){throw e;}}
async clrWL(){try{await this.sLoc({watchLaterVideos:[]});return{success:true};}catch(e){throw e;}}
}
const mon=new YouTubeChannelMonitor();
chrome.runtime.onMessage.addListener((msg,sender,sendRes)=>{
const acts={
checkNow:()=>mon.chkAll(true).then(()=>({success:true})),
getStatus:()=>mon.gLoc(['lastCheck','lastCheckSuccess','lastCheckDuration','channelsChecked','successfulChannels','lastError','lastErrorTime']).then(r=>({...r,stats:mon.st.stats,isInitialized:mon.st.init})),
clearCache:async()=>{const itms=await mon.gLoc(null);const ks=Object.keys(itms).filter(k=>k.startsWith('videos_'));if(ks.length)await chrome.storage.local.remove(ks);return{success:true,clearedItems:ks.length};},
markVideoWatched:()=>mon.markW(msg.videoId),
getWatchedVideos:()=>mon.getWV().then(w=>({success:true,watchedVideos:w})),
clearWatchedVideos:()=>mon.clrW(),
getWatchLater:()=>mon.getWL().then(lst=>({success:true,list:lst,count:lst.length})),
addToWatchLater:()=>mon.addWL(msg.video),
removeFromWatchLater:()=>mon.rmWL(msg.videoId),
clearWatchLater:()=>mon.clrWL(),
getScanLogs:()=>Promise.resolve({success:true,logs:mon.scanLogs}),
removeManyFromWatchLater:async()=>{try{const ids=msg.videoIds||[];if(!Array.isArray(ids)||!ids.length)return{success:true,removed:0};const ex=await mon.getWL();const idSet=new Set(ids);const flt=ex.filter(v=>!idSet.has(v.id));await mon.sLoc({watchLaterVideos:flt});return{success:true,removed:ex.length-flt.length};}catch(e){return{success:false,error:e.message};}},
checkChannelNow:async()=>{try{const{url,title}=msg.channel||{};if(!url)throw new Error('Missing channel url');const tf=await mon.getTF();const fts=await mon.getTFTS(tf);const wv=await mon.getWV();const res=await mon.procCh({url,title},fts,wv,false);const d=await mon.gLoc(['channelResults']);let lst=d.channelResults||[];const idx=lst.findIndex(c=>c.channelUrl===url);if(idx>=0)lst[idx]=res;else lst.unshift(res);await mon.stChRes(lst,tf);return{success:true,result:res};}catch(e){return{success:false,error:e.message};}}
};
const act=acts[msg.action];
if(act){act().then(sendRes).catch(err=>sendRes({success:false,error:err.message}));return true;}
});
chrome.runtime.onInstalled.addListener(async(det)=>{
if(det.reason==='install'){
await mon.sSync({checkInterval:15,timeFilter:'1day',notifications:false,autoOpen:'current',hideWatched:false,mutedChannels:[]});
await mon.sLoc({installDate:Date.now(),watchLaterVideos:[],watchedVideos:{},features:{watchedVideoTracking:true}});
setTimeout(()=>chrome.notifications.create({type:'basic',iconUrl:'icons/icon48.png',title:'YouTube Channel Monitor Installed!',message:'Create a "Vid" bookmarks folder with YouTube channels to get started.'}),2e3);
}else if(det.reason==='update'){
const ex=await mon.gLoc(['watchedVideos']);
if(!ex.watchedVideos)await mon.sLoc({watchedVideos:{}});
const prf=await mon.gSync(['hideWatched','checkInterval','timeFilter','notifications','autoOpen','mutedChannels']);
const toSet={};
if(prf.hideWatched===undefined)toSet.hideWatched=false;
if(prf.checkInterval===undefined)toSet.checkInterval=15;
if(prf.timeFilter===undefined)toSet.timeFilter='1day';
if(prf.notifications===undefined)toSet.notifications=false;
if(prf.autoOpen===undefined)toSet.autoOpen='current';
if(!Array.isArray(prf.mutedChannels))toSet.mutedChannels=[];
if(Object.keys(toSet).length)await mon.sSync(toSet);
}
});