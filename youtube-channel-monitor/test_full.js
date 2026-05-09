const fs = require('fs');
async function run() {
  const res = await fetch('https://www.youtube.com/@BetterThanYesterday/videos', {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
  });
  const html = await res.text();
  
  const monitor = {
    addLog: (...args) => console.log('LOG:', ...args),
    parsePT: (tx) => {
      if(!tx)return Date.now()-864e5;
      const now=Date.now();
      const m=tx.toLowerCase().trim().match(/(?:streamed|premiered)?\s*(\d+)\s*(second|minute|hour|day|week|month|year)s?\s+ago/);
      if(m){
      const[,amt,u]=m;
      const mul={second:1e3,minute:6e4,hour:36e5,day:864e5,week:6048e5,month:2592e6,year:31536e6};
      return now-parseInt(amt)*(mul[u]||864e5);
      }
      return now-864e5;
    },
    parseVR: function(v) {
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
    },
    parseHTML: function(h) {
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
  };
  
  const vids = monitor.parseHTML(html);
  console.log("Vids count:", vids.length);
  if (vids.length > 0) {
      console.log(vids[0]);
  }
}
run();
