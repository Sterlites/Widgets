const monitor = {
    addLog: (...args) => {},
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
                const t=lvm.metadata?.lockupMetadataViewModel?.title?.content||'Untitled';
                const parts=lvm.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts||[];
                let pt='',views='';
                if(parts.length>=2){views=parts[0]?.text?.content||'';pt=parts[1]?.text?.content||'';}
                else if(parts.length===1){pt=parts[0]?.text?.content||'';}
                const th=lvm.contentImage?.thumbnailViewModel?.image?.sources||[];
                return{id,title:t.trim(),published:pt||'Recently',pubTS:this.parsePT(pt),views};
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
    console.log(url, vids.slice(0, 3).map(v => ({pub: v.published, views: v.views, parsedOk: v.pubTS !== null})));
}

Promise.all([
    test('https://www.youtube.com/@NetworkChuck/videos'),
    test('https://www.youtube.com/@theogcrewofficial/videos'),
    test('https://www.youtube.com/@DoctorMike/videos')
]);
