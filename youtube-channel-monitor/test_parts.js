async function run() {
    const res = await fetch('https://www.youtube.com/@TheInfographicsShow/videos', {headers:{'User-Agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'}});
    const html = await res.text();
    let d=null;
    for(const p of[/var ytInitialData = ({.*?});/s,/window\["ytInitialData"\] = ({.*?});/s]) {
        const m=html.match(p);
        if(m)try{d=JSON.parse(m[1]);break;}catch{}
    }
    const tabs=d?.contents?.twoColumnBrowseResultsRenderer?.tabs||[];
    let vt=tabs.find(t=>t?.tabRenderer?.content?.richGridRenderer?.contents);
    const cnts=vt.tabRenderer.content.richGridRenderer.contents;
    cnts.slice(0, 5).forEach(i => {
        const v = i?.richItemRenderer?.content?.lockupViewModel;
        if(v) {
            const parts=v.metadata?.lockupMetadataViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts||[];
            console.log('parts:', parts.map(p => p.text?.content));
        }
    });
}
run();
