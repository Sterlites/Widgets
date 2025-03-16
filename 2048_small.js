// AI Script to play 2048 . 1: open https://2048game.com/ 2: Open console (F12) 3: Paste the script and press Enter 4: Click 'Start AI' button on the website to begin playing automatically
(function(){
  const D=false,P={m:0,a:0,t:0,h:0,s:Date.now(),h:[],S:"turbo",d:100,k:{m:0,s:0,a:0,e:0}},S={turbo:0,fast:50,normal:100,slow:200},C={s:false,e:null},G={a:false,t:null,f:null,l:0};
  let g=true,lastGrid=null,s=0,m=0,h=0,M=[],p=0,mw=50,ew=300,Mw=800,cw=30,sw=25,cW=40,md=0;
  // Changed 'r' to 'patterns' to avoid redeclaration
  const patterns={snake:[[15,14,13,12],[8,9,10,11],[7,6,5,4],[0,1,2,3]],corner:[[0,1,2,3],[1,2,3,4],[2,3,4,5],[3,4,5,6]],spiral:[[0,1,2,3],[11,12,13,4],[10,15,14,5],[9,8,7,6]],diagonal:[[15,14,10,6],[13,11,7,3],[9,5,2,1],[4,0,0,0]]};
  let c="snake",t={row:3,col:0};
  
  function gS(){
    if(D)console.log("getGameState(); - Getting game state...");
    const t=document.querySelectorAll(".tile");
    if(!t||t.length===0){if(D)console.error("No tiles found");return null}
    let g=Array(4).fill().map(()=>Array(4).fill(0));
    for(const T of t){
      if(T.classList.contains("tile-merged"))continue;
      const L=Array.from(T.classList),p=L.find(c=>c.startsWith("tile-position-")),v=L.find(c=>c.startsWith("tile-")&&!c.startsWith("tile-position-"));
      if(p&&v){
        const [x,y]=p.replace("tile-position-","").split("-").map(n=>parseInt(n)-1),val=parseInt(v.replace("tile-",""));
        if(!isNaN(x)&&!isNaN(y)&&!isNaN(val)&&x>=0&&x<4&&y>=0&&y<4){g[y][x]=val}
      }
    }
    return g;
  }

  
  function iG(){return document.querySelector(".game-message.game-over")!==null}
  
  function u(){
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowUp",keyCode:38,which:38,code:"ArrowUp",bubbles:true}));
    if(D)console.log("Move: UP");
  }
  
  function d(){
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowDown",keyCode:40,which:40,code:"ArrowDown",bubbles:true}));
    if(D)console.log("Move: DOWN");
  }
  
  function l(){
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowLeft",keyCode:37,which:37,code:"ArrowLeft",bubbles:true}));
    if(D)console.log("Move: LEFT");
  }
  
  function r(){
    document.dispatchEvent(new KeyboardEvent("keydown",{key:"ArrowRight",keyCode:39,which:39,code:"ArrowRight",bubbles:true}));
    if(D)console.log("Move: RIGHT");
  }
  
  function aE(g1,g2){
    if(!g1||!g2)return false;
    if(g1.length!==4||g2.length!==4)return false;
    for(let y=0;y<4;y++){
      if(!g1[y]||!g2[y]||g1[y].length!==4||g2[y].length!==4)return false;
      for(let x=0;x<4;x++)if(g1[y][x]!==g2[y][x])return false;
    }
    return true;
  }
  
  function pT(t){
    let f=t.filter(v=>v!==0);
    for(let i=0;i<f.length-1;i++){
      if(f[i]===f[i+1]){f[i]*=2;f[i+1]=0}
    }
    f=f.filter(v=>v!==0);
    while(f.length<4)f.push(0);
    return f;
  }
  
  function sM(g,d){
    if(!g)return{g:null,m:false,s:0};
    const C=JSON.parse(JSON.stringify(g));
    let m=false,s=0;
    try{
      if(d==="up"){
        for(let c=0;c<4;c++){
          const col=[C[0][c],C[1][c],C[2][c],C[3][c]],oc=[...col],nc=pT(col);
          for(let r=0;r<4;r++){
            if(C[r][c]!==nc[r]){
              m=true;
              if(nc[r]>oc[r]&&nc[r]!==0)s+=nc[r];
            }
            C[r][c]=nc[r];
          }
        }
      }else if(d==="down"){
        for(let c=0;c<4;c++){
          const col=[C[3][c],C[2][c],C[1][c],C[0][c]],oc=[...col],nc=pT(col);
          for(let r=0;r<4;r++){
            if(C[3-r][c]!==nc[r]){
              m=true;
              if(nc[r]>oc[r]&&nc[r]!==0)s+=nc[r];
            }
            C[3-r][c]=nc[r];
          }
        }
      }else if(d==="left"){
        for(let r=0;r<4;r++){
          const or=[...C[r]];
          C[r]=pT(C[r]);
          for(let c=0;c<4;c++){
            if(or[c]!==C[r][c]){
              m=true;
              if(C[r][c]>or[c]&&C[r][c]!==0)s+=C[r][c];
            }
          }
        }
      }else if(d==="right"){
        for(let r=0;r<4;r++){
          const rr=[...C[r]].reverse(),or=[...rr],nr=pT(rr).reverse();
          for(let c=0;c<4;c++){
            if(C[r][c]!==nr[c]){
              m=true;
              if(nr[c]>C[r][c]&&nr[c]!==0)s+=nr[c];
            }
            C[r][c]=nr[c];
          }
        }
      }
    }catch(e){
      if(D)console.error("Error in simulateMove:",e);
      return{g:g,m:false,s:0};
    }
    return{g:C,m:m,s:s};
  }
  
  function gH(g){
    let M=0,P={row:-1,col:-1};
    for(let r=0;r<4;r++){
      for(let c=0;c<4;c++){
        if(g[r][c]>M){M=g[r][c];P={row:r,col:c}}
      }
    }
    return{value:M,position:P};
  }
  
  function dB(g){
    const h=gH(g);
    const{row,col}=h.position;
    if((row===0||row===3)&&(col===0||col===3))return{row,col};
    return{row:3,col:0};
  }
  
  function iC(r,c){return(r===0||r===3)&&(c===0||c===3)}
  
  function cP(g,p){
    let s=0;
    for(let row=0;row<4;row++){
      for(let col=0;col<4;col++){
        if(g[row][col]>0){
          const w=p[row][col];
          s+=g[row][col]*Math.pow(2,w/2);
        }
      }
    }
    return s;
  }
  
  function eG(g){
    if(!g)return-Infinity;
    try{
      const e=g.flat().filter(c=>c===0).length;
      let E=e*ew,M=0,P=0,pw=patterns[c];
      for(let r=0;r<4;r++){
        for(let c=0;c<4;c++){
          if(g[r][c]>0){
            P+=g[r][c]*Math.pow(2,pw[r][c]/2);
          }
        }
      }
      const{value:maxT,position:maxP}=gH(g);
      for(let r=0;r<4;r++){
        for(let c=0;c<3;c++){
          if(g[r][c]>0&&g[r][c+1]>0){
            if(c==="snake"){
              if(r%2===0){
                M+=g[r][c]>=g[r][c+1]?g[r][c]:-g[r][c];
              }else{
                M+=g[r][c]<=g[r][c+1]?g[r][c+1]:-g[r][c+1];
              }
            }else{
              const cd=t.col===0?1:-1;
              if((cd===1&&g[r][c]>=g[r][c+1])||(cd===-1&&g[r][c]<=g[r][c+1])){
                M+=Math.max(g[r][c],g[r][c+1]);
              }else{
                M-=Math.min(g[r][c],g[r][c+1]);
              }
            }
          }
        }
      }
      for(let c=0;c<4;c++){
        for(let r=0;r<3;r++){
          if(g[r][c]>0&&g[r+1][c]>0){
            const rd=t.row===0?1:-1;
            if((rd===1&&g[r][c]>=g[r+1][c])||(rd===-1&&g[r][c]<=g[r+1][c])){
              M+=Math.max(g[r][c],g[r+1][c]);
            }else{
              M-=Math.min(g[r][c],g[r+1][c]);
            }
          }
        }
      }
      let S=0;
      for(let r=0;r<4;r++){
        for(let c=0;c<4;c++){
          if(g[r][c]>0){
            if(c<3&&g[r][c+1]>0){
              S-=Math.abs(Math.log2(g[r][c])-Math.log2(g[r][c+1]));
            }
            if(r<3&&g[r+1][c]>0){
              S-=Math.abs(Math.log2(g[r][c])-Math.log2(g[r+1][c]));
            }
          }
        }
      }
      let m=0;
      for(let r=0;r<4;r++){
        for(let c=0;c<3;c++){
          if(g[r][c]>0&&g[r][c]===g[r][c+1])m+=g[r][c]*2;
        }
      }
      for(let c=0;c<4;c++){
        for(let r=0;r<3;r++){
          if(g[r][c]>0&&g[r][c]===g[r+1][c])m+=g[r][c]*2;
        }
      }
      let C=0;
      if(maxP.row===t.row&&maxP.col===t.col){
        C+=maxT*3;
        const rd=t.row===0?1:-1,cd=t.col===0?1:-1;
        let cS=0,pV=maxT;
        for(let c=t.col+cd,s=1;c>=0&&c<4&&s<4;c+=cd,s++){
          if(g[t.row][c]>0){
            if(g[t.row][c]<=pV){
              cS+=g[t.row][c]*(5-s);
              pV=g[t.row][c];
            }else{
              cS-=g[t.row][c];
            }
          }
        }
        pV=maxT;
        for(let r=t.row+rd,s=1;r>=0&&r<4&&s<4;r+=rd,s++){
          if(g[r][t.col]>0){
            if(g[r][t.col]<=pV){
              cS+=g[r][t.col]*(5-s);
              pV=g[r][t.col];
            }else{
              cS-=g[r][t.col];
            }
          }
        }
        C+=(cS*cW)/100;
      }else if(iC(maxP.row,maxP.col)){
        C+=maxT;
      }else{
        C-=maxT/2;
        const d=Math.abs(maxP.row-t.row)+Math.abs(maxP.col-t.col);
        C-=(maxT*d)/10;
      }
      let eS=0;
      const er=t.row===0?[0]:[3],ec=t.col===0?[0]:[3];
      for(const r of er){
        let p=-1,i=true;
        const cR=t.col===0?[0,1,2,3]:[3,2,1,0];
        for(const c of cR){
          if(g[r][c]>0){
            if(p===-1){
              p=g[r][c];
            }else if(g[r][c]>p){
              i=false;
              break;
            }
            p=g[r][c];
            eS+=g[r][c]/2;
          }
        }
        if(i)eS+=p;
      }
      for(const c of ec){
        let p=-1,i=true;
        const rR=t.row===0?[0,1,2,3]:[3,2,1,0];
        for(const r of rR){
            if(g[r][c]>0){
              if(p===-1){
                p=g[r][c];
              }else if(g[r][c]>p){
                i=false;
                break;
              }
              p=g[r][c];
              eS+=g[r][c]/2;
            }
          }
          if(i)eS+=p;
        }
        let risk=0;
        for(let r=1;r<3;r++){
          for(let c=1;c<3;c++){
            if(g[r][c]>0){
              const n=[g[r-1][c],g[r+1][c],g[r][c-1],g[r][c+1]].filter(v=>v>0);
              const aN=n.reduce((s,v)=>s+v,0)/Math.max(1,n.length);
              if(aN>g[r][c]*4)risk-=g[r][c]*2;
            }
          }
        }
        let pM=1.0;
        if(maxT>=1024){
          pM=1.5;
          P*=1.3;
          C*=1.5;
          eS*=1.3;
          E*=0.8;
        }else if(maxT>=512){
          pM=1.2;
          P*=1.2;
          C*=1.3;
        }else if(maxT<=64){
          m*=1.5;
          E*=1.2;
          P*=0.7;
          C*=0.5;
        }
        return P*pM+(M*mw)/100+E+(m*Mw)/100+(C*cw)/10+(eS*cw)/15+(S*sw)/10+risk;
      }catch(e){
        if(D)console.error("Error in evaluateGrid:",e);
        return-Infinity;
      }
    }
    
    function lA(g,d,a,b,mp,od){
      if(!g)return{score:-Infinity,moves:[]};
      if(od-d+1>md){
        md=od-d+1;
        if(D)console.log(`New max depth: ${md}`);
      }
      if(d<=0)return{score:eG(g),moves:[]};
      if(mp){
        const dirs=["up","down","left","right"];
        let bs=-Infinity,bm=[];
        for(const dir of dirs){
          const{g:ng,m}=sM(g,dir);
          if(m){
            const r=lA(ng,d-1,a,b,false,od);
            if(r.score>bs){
              bs=r.score;
              bm=[dir,...r.moves];
            }
            a=Math.max(a,r.score);
            if(b<=a)break;
          }
        }
        return bs===-Infinity?{score:eG(g),moves:[]}:{score:bs,moves:bm};
      }else{
        let ws=Infinity,wm=[];
        const e=[];
        for(let r=0;r<4;r++){
          for(let c=0;c<4;c++){
            if(g[r][c]===0)e.push({row:r,col:c});
          }
        }
        if(e.length===0)return{score:eG(g),moves:[]};
        const ss=d<=2?Math.min(4,e.length):Math.min(2,e.length);
        const sC=[],rC=[...e];
        const hT=gH(g);
        for(const cell of e){
          let st=false;
          const aP=[{row:cell.row-1,col:cell.col},{row:cell.row+1,col:cell.col},{row:cell.row,col:cell.col-1},{row:cell.row,col:cell.col+1}];
          for(const pos of aP){
            if(pos.row>=0&&pos.row<4&&pos.col>=0&&pos.col<4){
              if(g[pos.row][pos.col]>=hT.value/4){
                st=true;
                break;
              }
            }
          }
          if(st){
            sC.push(cell);
            const i=rC.findIndex(c=>c.row===cell.row&&c.col===cell.col);
            if(i!==-1)rC.splice(i,1);
          }
        }
        const saC=[];
        while(saC.length<ss&&(sC.length>0||rC.length>0)){
          if(sC.length>0){
            saC.push(sC.pop());
          }else{
            const ri=Math.floor(Math.random()*rC.length);
            saC.push(rC[ri]);
            rC.splice(ri,1);
          }
        }
        for(const cell of saC){
          const{row,col}=cell;
          const gW2=JSON.parse(JSON.stringify(g));
          gW2[row][col]=2;
          const rW2=lA(gW2,d-1,a,b,true,od);
          const gW4=JSON.parse(JSON.stringify(g));
          gW4[row][col]=4;
          const rW4=lA(gW4,d-1,a,b,true,od);
          const cS=0.9*rW2.score+0.1*rW4.score;
          if(cS<ws){
            ws=cS;
            wm=rW2.score<=rW4.score?rW2.moves:rW4.moves;
          }
          b=Math.min(b,cS);
          if(b<=a)break;
        }
        return ws===Infinity?{score:eG(g),moves:[]}:{score:ws,moves:wm};
      }
    }
    
    function dL(g){
      const e=g.flat().filter(c=>c===0).length;
      if(e>4)return false;
      for(let r=0;r<4;r++){
        for(let c=0;c<4;c++){
          const v=g[r][c];
          if(v===0)continue;
          if(c<3&&g[r][c+1]===v)return false;
          if(r<3&&g[r+1][c]===v)return false;
        }
      }
      return e<=2;
    }
    
    function dN(){
      const g=gS();
      if(!g){
        if(D)console.warn("Could not get game state");
        return null;
      }
      const moves=[{direction:"up",action:u},{direction:"down",action:d},{direction:"left",action:l},{direction:"right",action:r}];
      if(m%20===0||m===0){
        t=dB(g);
        if(D)console.log(`Updated target corner to: row ${t.row}, col ${t.col}`);
        if(t.row===3&&t.col===0){
          c="snake";
        }else if(t.row===3&&t.col===3){
          const mS=JSON.parse(JSON.stringify(patterns.snake));
          for(let row=0;row<4;row++)mS[row].reverse();
          patterns.modified=mS;
          c="modified";
        }else if(t.row===0&&t.col===0){
          c="diagonal";
        }else{
          const mD=JSON.parse(JSON.stringify(patterns.diagonal));
          for(let row=0;row<4;row++)mD[row].reverse();
          patterns.modified=mD;
          c="modified";
        }
      }
      if(lastGrid&&aE(g,lastGrid)){
        s++;
        if(s>2){
          if(D)console.log("Grid hasn't changed - trying pattern-based move");
          if(M.length===0){
            if(t.row===3&&t.col===0){
              M=["up","right","down","right","up","left"];
            }else if(t.row===3&&t.col===3){
              M=["up","left","down","left","up","right"];
            }else if(t.row===0&&t.col===0){
              M=["down","right","up","right","down","left"];
            }else{
              M=["down","left","up","left","down","right"];
            }
            p=0;
          }
          const pD=M[p];
          p=(p+1)%M.length;
          for(const move of moves){
            if(move.direction===pD)return move.action;
          }
          const rI=Math.floor(Math.random()*moves.length);
          return moves[rI].action;
        }
      }else{
        s=0;
        lastGrid=JSON.parse(JSON.stringify(g));
        M=[];
        p=0;
      }
      const mT=Math.max(...g.flat().filter(n=>!isNaN(n)));
      if(mT!==h){
        h=mT;
        if(mT>=1024){
          ew=250;
          Mw=650;
          mw=60;
          cw=40;
          sw=30;
          cW=50;
          if(D)console.log(`Late game weights (highest: ${mT})`);
        }else if(mT>=512){
          ew=270;
          Mw=700;
          mw=55;
          cw=35;
          sw=25;
          cW=45;
          if(D)console.log(`Mid-late game weights (highest: ${mT})`);
        }else if(mT>=256){
          ew=290;
          Mw=750;
          mw=50;
          cw=30;
          sw=20;
          cW=40;
          if(D)console.log(`Mid game weights (highest: ${mT})`);
        }else{
          ew=300;
          Mw=800;
          mw=40;
          cw=20;
          sw=15;
          cW=35;
          if(D)console.log(`Early game weights (highest: ${mT})`);
        }
      }
      const pD=dL(g);
      const eC=g.flat().filter(c=>c===0).length;
      let lD=5;
      if(pD){
        lD=8;
        if(D)console.log("DEADLOCK RISK DETECTED! Increasing search depth.");
      }else if(eC<=2){
        lD=7;
      }else if(eC<=4){
        lD=6;
      }else if(eC>=10){
        lD=4;
      }
      const vM=[];
      let mS=[];
      for(const move of moves){
        const result=sM(g,move.direction);
        if(result.m){
          try{
            const e=lA(result.g,lD,-Infinity,Infinity,false,lD);
            vM.push({...move,score:e.score,moves:[move.direction,...e.moves]});
            if(D&&m%10===0)console.log(`Move ${move.direction}: Score ${e.score}`);
          }catch(e){
            if(D)console.error("Error in evaluation:",e);
            vM.push({...move,score:eG(result.g),moves:[move.direction]});
          }
        }
      }
      if(vM.length===0){
        if(D)console.log("No valid moves found.");
        return null;
      }
      vM.sort((a,b)=>b.score-a.score);
      if(vM.length>1){
        const sD=vM[0].score-vM[1].score;
        const rD=sD/Math.max(1,Math.abs(vM[0].score));
        if(rD<0.05&&s>0){
          if(D)console.log("Choosing second-best move to avoid local optimum");
          mS=vM[1].moves;
          return vM[1].action;
        }
        if(pD&&vM.length>=3){
          const tSD=vM[0].score-vM[2].score;
          const tRD=tSD/Math.max(1,Math.abs(vM[0].score));
          if(tRD<0.15){
            if(D)console.log("DEADLOCK AVOIDANCE: Trying third-best move");
            mS=vM[2].moves;
            return vM[2].action;
          }
        }
        if(Math.random()<0.02&&m>50){
          const rI=Math.floor(Math.random()*Math.min(3,vM.length));
          if(D)console.log("Randomly exploring alternative move");
          mS=vM[rI].moves;
          return vM[rI].action;
        }
      }
      if(D&&m%20===0)console.log("Planned moves:",vM[0].moves.slice(0,3).join(" → "));
      mS=vM[0].moves;
      return vM[0].action;
    }
    
    function cG(){
      if(G.t){
        clearTimeout(G.t);
        G.t=null;
      }
      if(G.f){
        cancelAnimationFrame(G.f);
        G.f=null;
      }
      G.a=false;
      if(D)console.log("Game loop cleared");
    }
    
    function sN(delay=P.d){
      if(!g)return;
      cG();
      G.a=true;
      G.t=setTimeout(()=>{
        G.f=requestAnimationFrame(()=>{
          if(g){
            G.l=performance.now();
            gStep();
          }
        });
      },delay);
      if(D)console.log(`Next step scheduled in ${delay}ms`);
    }
    
    function dLog(m,s=""){
      if(D)console.log(m,s||"color: #3498db");
    }
    
    function rW(){
      mw=47.0;
      ew=270.0;
      Mw=700.0;
      cw=20.0;
      sw=20.0;
      cW=30.0;
      if(D)console.log("Weights reset to defaults");
    }
    
    function rP(){
      P.s=Date.now();
      P.m=0;
      P.h=[];
      P.h=0;
      P.a=0;
      P.t=0;
      P.k={m:0,s:0,a:0,e:0};
      uS();
    }
    
    function cM(mT){
      if(mT>=2048&&mT<4096){
        console.log("%c🎉 REACHED 2048 TILE! 🎉","color: #f39c12; font-weight: bold; font-size: 14px;");
        ew=250;
        Mw=700;
        mw=60;
        cw=40;
        sw=30;
        cW=50;
      }else if(mT>=4096){
        console.log("%c🏆 AMAZING! REACHED 4096 TILE! 🏆","color: #e74c3c; font-weight: bold; font-size: 14px;");
        ew=230;
        Mw=650;
        mw=70;
        cw=50;
        sw=40;
        cW=60;
      }
    }
    
    function uS(){
      if(!C.s)return;
      try{
        const s=document.querySelector(".score-container").textContent.replace(/\+\d+/g,"").trim();
        const b=document.querySelector(".best-container").textContent.trim();
        const es=document.getElementById("ai-stats");
        if(es){
          const t=((Date.now()-P.s)/1000).toFixed(1);
          const mS=P.m>0?Math.round(P.t/P.m):0;
          es.textContent=`Moves: ${P.m} | Score: ${s} | Best: ${b} | Time: ${t}s | Avg: ${mS}ms`;
        }
      }catch(e){
        if(D)console.error("Error updating stats:",e);
      }
    }
    
    function gStep(){
      if(!g)return;
      const n=performance.now();
      const go=iG();
      if(go){
        g=false;
        cG();
        console.log("%cGame over!","color: #e74c3c; font-weight: bold");
        return;
      }
      try{
        const move=dN();
        if(move){
          m++;
          P.m++;
          move();
          const p=performance.now()-n;
          P.t+=p;
          if(D&&m%20===0)console.log(`Move ${m} took ${p.toFixed(2)}ms`);
        }else{
          if(D)console.log("No move available");
        }
      }catch(e){
        console.error("Error in game step:",e);
      }
      uS();
      sN(P.d);
    }
    
    function sSpeed(s){
      P.S=s;
      P.d=S[s];
      if(D)console.log(`Speed set to ${s} (${P.d}ms)`);
    }
    
    function iUI(){
      if(C.s)return;
      try{
        const cc=document.querySelector(".container");
        if(!cc)return;
        const cs=document.createElement("div");
        cs.className="ai-controls";
        cs.style.marginTop="20px";
        cs.style.textAlign="center";
        cs.innerHTML=`
          <div class="ai-buttons">
            <button id="ai-start" style="margin-right:10px">Start AI</button>
            <button id="ai-stop" style="margin-right:10px" disabled>Stop AI</button>
            <button id="ai-step">Step</button>
          </div>
          <div style="margin-top:10px">
            <label for="ai-speed">Speed: </label>
            <select id="ai-speed">
              <option value="turbo">Turbo</option>
              <option value="fast">Fast</option>
              <option value="normal">Normal</option>
              <option value="slow">Slow</option>
            </select>
          </div>
          <div id="ai-stats" style="margin-top:10px;font-size:12px;color:#776e65"></div>
        `;
        cc.appendChild(cs);
        
        const sb=document.getElementById("ai-start");
        const stb=document.getElementById("ai-stop");
        const spb=document.getElementById("ai-step");
        const sps=document.getElementById("ai-speed");
        
        sb.addEventListener("click",()=>{
          g=true;
          sb.disabled=true;
          stb.disabled=false;
          sN();
        });
        
        stb.addEventListener("click",()=>{
          g=false;
          sb.disabled=false;
          stb.disabled=true;
          cG();
        });
        
        spb.addEventListener("click",()=>{
          if(!g){
            const n=performance.now();
            const move=dN();
            if(move){
              m++;
              P.m++;
              move();
              const p=performance.now()-n;
              P.t+=p;
              if(D)console.log(`Single step took ${p.toFixed(2)}ms`);
            }
            uS();
          }
        });
        
        sps.value=P.S;
        sps.addEventListener("change",()=>{
          sSpeed(sps.value);
        });
        
        C.s=true;
        C.e=cs;
        if(D)console.log("UI initialized");
      }catch(e){
        console.error("Error initializing UI:",e);
      }
    }
    
    function init(){
      try{
        iUI();
        console.log("%c2048 AI Script loaded","color: #2ecc71; font-weight: bold");
        console.log("Click 'Start AI' to begin playing automatically");
      }catch(e){
        console.error("Error in initialization:",e);
      }
    }
    
    if(document.readyState==="complete"){
      init();
    }else{
      window.addEventListener("load",init);
    }
})();