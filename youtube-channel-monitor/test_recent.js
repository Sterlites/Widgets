const monitor = {
    parsePT: (tx) => {
      if(!tx)return Date.now()-864e5;
      const now=Date.now();
      const m=tx.toLowerCase().trim().match(/(?:streamed|premiered)?\s*(\d+)\s*(second|sec|minute|min|hour|hr|day|d|week|wk|month|mo|year|yr)s?\s+ago/);
      if(m){
          const[,amt,u]=m;
          const mul={second:1e3,sec:1e3,minute:6e4,min:6e4,hour:36e5,hr:36e5,day:864e5,d:864e5,week:6048e5,wk:6048e5,month:2592e6,mo:2592e6,year:31536e6,yr:31536e6};
          return now-parseInt(amt)*(mul[u]||864e5);
      }
      return null;
    },
    parseVR: function(v) {
        try{
            if(v?.lockupViewModel){
                const lvm=v.lockupViewModel;
                if(lvm.contentType!=='LOCKUP_CONTENT_TYPE_VIDEO')return null;
                const id=lvm.contentId;
                const parts=lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts||[];
                let pt='';
                if(parts.length>=2){pt=parts[1]?.text?.content||'';}
                else if(parts.length===1){pt=parts[0]?.text?.content||'';}
                return{id,published:pt||'Recently',pubTS:this.parsePT(pt)};
            }
            return null;
        }catch{return null;}
    },
    parseHTML: function(h) {
        try{
            let d=null;
            for(const p of[/var ytInitialData = ({.*?});/s,/window\["ytInitialData"\] = ({.*?});/s]){
                const m=h.match(p);
                if(m)try{d=JSON.parse(m[1]);break;}catch{continue;}
            }
            if(!d)return [];
            const tabs=d?.contents?.twoColumnBrowseResultsRenderer?.tabs||[];
            let vt=tabs.find(t=>t?.tabRenderer?.content?.richGridRenderer?.contents||t?.tabRenderer?.content?.sectionListRenderer);
            if(!vt)return [];
            let cnts=[];
            const tc=vt.tabRenderer.content;
            if(tc.richGridRenderer?.contents)cnts=tc.richGridRenderer.contents;
            return cnts.map(i=>this.parseVR(i?.richItemRenderer?.content||i)).filter(Boolean);
        }catch(e){return[];}
    }
};

async function test(url) {
    const res = await fetch(url, {headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}});
    const html = await res.text();
    const vids = monitor.parseHTML(html);
    if(vids.length > 0) {
        const v = vids[0];
        const ageHours = (Date.now() - v.pubTS) / 36e5;
        console.log(url, v.published, ageHours < 24 ? "NEW!" : "old");
    } else {
        console.log(url, "No videos");
    }
}

async function run() {
    await test('https://www.youtube.com/@TheInfographicsShow/videos');
    await test('https://www.youtube.com/@AIDailyBrief/videos');
    await test('https://www.youtube.com/@lexfridman/videos');
    await test('https://www.youtube.com/@bigthink/videos');
    await test('https://www.youtube.com/@KevinStratvert/videos');
}
run();
