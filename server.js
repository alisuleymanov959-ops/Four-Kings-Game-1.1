// FOUR KINGS - authoritative server. All rules, gold, AP, timers and fog are enforced here.
const http=require('http'),fs=require('fs'),path=require('path');
const {WebSocketServer}=require('ws');
const N=50,RMS=180000,REC=300000,D4=[[1,0],[-1,0],[0,1],[0,-1]];
const KN=['Blue & White Kingdom','Purple Kingdom','Yellow & Red Kingdom','Orange & Black Kingdom'];
const U={Swordsman:{hp:9,dmg:4,rng:1,cost:2,vis:3,lvl:1},Archer:{hp:4,dmg:5,rng:4,cost:3,vis:4,lvl:1},
 Horseman:{hp:13,dmg:5,rng:1,cost:5,vis:5,lvl:1,mv:5},Spearman:{hp:11,dmg:5,rng:1,cost:4,vis:3,lvl:2},
 Crossbowman:{hp:4,dmg:7,rng:5,cost:6,vis:4,lvl:2},AxeKnight:{hp:16,dmg:5,rng:1,cost:6,vis:3,lvl:2},
 Giant:{hp:26,dmg:10,rng:1,cost:12,vis:3,lvl:3,ap:2},
 Cannon:{hp:10,dmg:10,rng:5,cost:9,vis:4,lvl:1,mv:0,aa:2,w:1},Ram:{hp:35,dmg:35,rng:1,cost:18,vis:2,lvl:2,ap:2,aa:3,w:1,bo:1},
 Catapult:{hp:20,dmg:25,rng:14,cost:25,vis:5,lvl:2,ap:2,aa:4,w:1},
 Healer:{hp:3,dmg:0,rng:2,cost:7,vis:3,lvl:3},Mage:{hp:5,dmg:9,rng:3,cost:11,vis:4,lvl:3}};
const UP={Swordsman:[3,2,1,0],Archer:[4,1,2,0],Crossbowman:[4,0,1,1],AxeKnight:[2,4,1,0],Ram:[4,5,20,0]}; // cost,hp,dmg,range
const BH={TownHall:250,Barracks:25,Workshop:40,GoldMine:12,House:6,TrainingYard:22,Wall:60,Gate:40,Tower:10};
const L={TownHall:[[4,4]],Barracks:[[2,5],[5,2]],Workshop:[[3,1]],GoldMine:[[3,3]],TrainingYard:[[1,1]],
 House:[[0,0],[2,0],[0,2],[0,4],[4,0],[0,6],[6,0],[1,7],[7,1],[2,2]]};
// walls: ring on the two map-facing sides (local x==9 / y==9), 2 gates, 3 towers
L.Wall=[];L.Gate=[];L.Tower=[];
for(let i=0;i<=9;i++)for(const[x,y]of i<9?[[9,i],[i,9]]:[[9,9]]){const t=(x==9&&y==4)||(x==4&&y==9)?'Gate':[[9,9],[9,1],[1,9]].some(c=>c[0]==x&&c[1]==y)?'Tower':'Wall';L[t].push([x,y])}
const CP=[[24,6],[24,42],[6,24],[42,24]];
const rooms={};
const html=()=>fs.readFileSync(path.join(__dirname,'index.html'));
const server=http.createServer((q,r)=>{r.writeHead(200,{'Content-Type':'text/html'});r.end(html())});
const wss=new WebSocketServer({server});
const send=(w,o)=>w&&w.readyState===1&&w.send(JSON.stringify(o));
const rnd=s=>()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296};
const bAt=(G,x,y)=>G.b.find(b=>b.x==x&&b.y==y),uAt=(G,x,y)=>G.u.find(u=>u.x==x&&u.y==y);
const blocked=(G,x,y,self)=>{if(x<0||y<0||x>=N||y>=N||G.terr[y*N+x])return true;const b=bAt(G,x,y);
 if(b){const s=b.t=='Gate'&&G.u.find(u=>u.id==self);if(!s||s.o!=b.o)return true} // only the owner passes through its gates
 const u=uAt(G,x,y);return !!u&&u.id!=self};
function los(G,x0,y0,x1,y1){const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let i=1;i<n;i++){const x=Math.round(x0+(x1-x0)*i/n),y=Math.round(y0+(y1-y0)*i/n);
 if(G.terr[y*N+x]==1)return false;const b=bAt(G,x,y);if(b&&(b.t=='Wall'||b.t=='Gate'||b.t=='Tower'))return false}return true}
const wspot=(G,k,b)=>{const w=G.b.filter(w=>w.o==k&&w.t=='Wall'&&!uAt(G,w.x,w.y)).sort((a,c)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)-Math.abs(c.x-b.x)-Math.abs(c.y-b.y))[0];return w&&[w.x,w.y]};
function bfs(G,sx,sy,mv,self){const d=new Map([[sy*N+sx,0]]),q=[[sx,sy]];
 while(q.length){const[x,y]=q.shift(),dd=d.get(y*N+x);if(dd>=mv)continue;
  for(const[dx,dy]of D4){const X=x+dx,Y=y+dy,i=Y*N+X;if(X<0||Y<0||X>=N||Y>=N||d.has(i)||blocked(G,X,Y,self))continue;d.set(i,dd+1);q.push([X,Y])}}return d}
function free(G,x,y){for(let r=1;r<4;r++)for(let dx=-r;dx<=r;dx++)for(const dy of[r-Math.abs(dx),-(r-Math.abs(dx))])if(!blocked(G,x+dx,y+dy,0))return[x+dx,y+dy];return null}
function mk(G,k,t,x,y){const d=U[t];G.u.push({id:G.n++,o:k,t,x,y,hp:d.hp,mh:d.hp,dmg:d.dmg,rng:d.rng,mv:d.mv??2,ap:d.ap||1,aa:d.aa||d.ap||1,bo:d.bo||0,vis:d.vis,up:0})}
function gen(r){const t=new Uint8Array(N*N),dep=new Set();
 const set=(x,y,v)=>{for(const[X,Y]of[[x,y],[49-x,y],[x,49-y],[49-x,49-y]])t[Y*N+X]=v};
 for(let i=0;i<130;i++){const x=r()*25|0,y=r()*25|0;if(x>11||y>11)set(x,y,1)}
 for(let i=0;i<14;i++){const x=r()*23|0,y=r()*23|0;if(x>11||y>11)for(const[a,b]of[[0,0],[1,0],[0,1],[1,1]])set(x+a,y+b,2)}
 for(let i=0;i<30;i++){const x=r()*25|0,y=r()*25|0;if((x>11||y>11)&&!t[y*N+x])for(const[X,Y]of[[x,y],[49-x,y],[x,49-y],[49-x,49-y]])dep.add(Y*N+X)}
 for(const[cx,cy]of CP)for(let a=0;a<2;a++)for(let b=0;b<2;b++){t[(cy+b)*N+cx+a]=0;dep.delete((cy+b)*N+cx+a)}
 return{t,dep}}
function start(R){const m=gen(rnd(Date.now())),G=R.g={round:0,terr:m.t,dep:m.dep,b:[],u:[],n:1,pl:[],win:-1,cp:CP.map(([x,y])=>({x,y,o:-1}))};
 for(let k=0;k<4;k++)G.pl[k]={k,name:'-',gold:0,ap:0,apMax:0,done:true,orders:[],alive:false,na:1,fu:0,au:0,log:[],fx:[]}; // unused kingdoms (2-player games)
 for(const p of R.players){const k=p.k;G.pl[k]={k,name:p.name,gold:10,ap:6,apMax:6,done:false,orders:[],alive:true,fu:0,au:0,log:[],fx:[]};
  const c=R.size==2?R.players.indexOf(p)*2:k,cx=c==1||c==2,cy=c>=2; // 2 players start in opposite corners
  for(const t in L)for(const[lx,ly]of L[t])G.b.push({id:G.n++,o:k,t,x:cx?49-lx:lx,y:cy?49-ly:ly,hp:BH[t],mh:BH[t],lv:1})}
 for(const b of G.b.filter(b=>b.t=='TownHall'))for(const t of['Swordsman','Archer']){const f=free(G,b.x,b.y);mk(G,b.o,t,f[0],f[1])}
 newRound(G)}
function newRound(G){G.round++;G.dl=Date.now()+RMS;for(const P of G.pl)if(P.alive){P.ap=P.apMax;P.done=false;P.orders=[]}}
function vis(G,k){const V=new Uint8Array(N*N);if(!G.pl[k].alive)return V.fill(1);
 const add=(x,y,r)=>{for(let dx=-r;dx<=r;dx++)for(let dy=-(r-Math.abs(dx));dy<=r-Math.abs(dx);dy++){const X=x+dx,Y=y+dy;if(X>=0&&Y>=0&&X<N&&Y<N)V[Y*N+X]=1}};
 G.u.forEach(u=>u.o==k&&add(u.x,u.y,u.vis));G.b.forEach(b=>b.o==k&&add(b.x,b.y,b.t=='TownHall'||b.t=='Tower'?6:3));return V}
function act(R,p,o){const G=R.g,P=G.pl[p.k];if(G.over||!P.alive||P.done)return'You cannot act now';
 let ap=1,cost=0;o.x|=0;o.y|=0;
 const mine=id=>G.u.find(u=>u.id==id&&u.o==p.k),mb=id=>G.b.find(b=>b.id==id&&b.o==p.k);
 if(o.k=='move'||o.k=='atk'){const u=mine(o.id);if(!u)return'Unit not found';ap=o.k=='atk'?u.aa:u.ap;let x=u.x,y=u.y;
  for(const q of P.orders)if(q.k=='move'&&q.id==u.id){x=q.x;y=q.y}
  if(o.k=='move'){if((o.x==x&&o.y==y)||!bfs(G,x,y,u.mv,u.id).has(o.y*N+o.x))return'Cannot move there'}
  else{const t=(o.tt=='u'?G.u:G.b).find(v=>v.id==o.tid);if(!t||t.o==p.k||!vis(G,p.k)[t.y*N+t.x])return'Invalid target';if(u.bo&&o.tt=='u')return'Rams can only attack buildings';if(u.t=='Mage'||u.t=='Healer')return'Use the special action instead';if(Math.abs(t.x-x)+Math.abs(t.y-y)>u.rng)return'Target out of range';if(u.rng>1&&!U[u.t].w&&!los(G,x,y,t.x,t.y))return'Line of sight blocked by terrain or a wall'}}
 else if(o.k=='heal'||o.k=='mage'){const u=mine(o.id);if(!u||u.t!=(o.k=='heal'?'Healer':'Mage'))return'Invalid unit';ap=u.aa;let x=u.x,y=u.y;
  for(const q of P.orders)if(q.k=='move'&&q.id==u.id){x=q.x;y=q.y}
  if(o.k=='heal'){const t=mine(o.tid);if(!t||t.id==u.id)return'Invalid heal target';if(Math.abs(t.x-x)>2||Math.abs(t.y-y)>2)return'Target is outside the 5x5 healing area';
   if(t.hp>=t.mh)return'Already at full health';if(P.orders.some(q=>q.k=='heal'&&q.id==u.id&&q.tid==o.tid))return'Heal already queued'}
  else{if(Math.abs(o.x-x)+Math.abs(o.y-y)>u.rng)return'Target out of range (3)';if(!los(G,x,y,o.x,o.y))return'Line of sight blocked'}}
 else if(o.k=='rec'){const b=mb(o.bid),d=U[o.t];if(!b||!d||(b.t!='Barracks'&&b.t!='Workshop')||!!d.w!=(b.t=='Workshop'))return'Wrong building for this unit';if(d.lvl>b.lv)return'Barracks level too low';cost=d.cost}
 else if(o.k=='up'){const b=mb(o.bid);if(!b)return'Invalid building';if(P.orders.some(q=>q.k=='up'&&q.bid==b.id))return'Upgrade already queued';
  cost=b.t=='TownHall'&&b.lv<2?8:b.t=='GoldMine'&&b.lv<2?5:b.t=='Barracks'&&b.lv<3?[0,6,10][b.lv]:b.t=='Workshop'&&b.lv<2?10:b.t=='Wall'&&b.lv<2?1:b.t=='Gate'&&b.lv<2?2:0;if(!cost)return'No upgrade available'}
 else if(o.k=='uup'){const u=mine(o.id),c=UP[u&&u.t];if(!c||u.up)return'No upgrade available';
  if(!G.b.some(b=>b.o==p.k&&b.t=='TrainingYard'))return'Training Yard destroyed';
  if(P.orders.some(q=>q.k=='uup'&&q.id==u.id))return'Upgrade already queued';cost=c[0]}
 else if(o.k=='spell'){if(o.s=='fire'?(G.round<6||P.fu):o.s=='arrows'?(G.round<8||P.au):1)return'Ability not available';if(o.x<0||o.y<0||o.x>=N||o.y>=N)return'Bad target'}
 else return'Bad order';
 if(P.ap<ap)return'Not enough Action Points';if(P.gold<cost)return'Not enough gold';
 if(o.k=='spell')o.s=='fire'?P.fu=1:P.au=1;
 const c={k:o.k,id:o.id,bid:o.bid,t:o.t,tt:o.tt,tid:o.tid,s:o.s,x:o.x,y:o.y,ap,cost};P.ap-=ap;P.gold-=cost;P.orders.push(c);return null}
function cancel(P,i){const o=P.orders[i];if(!o||P.done)return;
 const rm=P.orders.filter((q,j)=>j==i||(j>i&&o.id!==undefined&&q.id==o.id));
 for(const q of rm){P.ap+=q.ap;P.gold+=q.cost;if(q.k=='spell')q.s=='fire'?P.fu=0:P.au=0}P.orders=P.orders.filter(q=>!rm.includes(q))}
function elim(G,k){G.pl[k].alive=false;G.u.forEach(u=>{if(u.o==k)u.hp=0})}
function chk(G){const al=G.pl.filter(P=>P.alive);if(al.length<=1){G.over=1;G.win=al.length?al[0].k:-1}return G.over}
function resolve(R){const G=R.g,ord=[0,1,2,3].map(i=>(i+G.round)%4),ev=[],say=(t,x,y,...ks)=>ev.push({t,x,y,ks});
 // 1. moves (deterministic order rotates every round: first mover wins a contested cell)
 for(const k of ord)for(const o of G.pl[k].orders)if(o.k=='move'){const u=G.u.find(u=>u.id==o.id);if(!u)continue;
  if(!(u.x==o.x&&u.y==o.y)&&bfs(G,u.x,u.y,u.mv,u.id).has(o.y*N+o.x)){u.x=o.x;u.y=o.y;const i=o.y*N+o.x;
   if(G.dep.has(i)){G.dep.delete(i);G.pl[k].gold+=3;say(KN[k]+' collected 3 gold',o.x,o.y,k)}}
  else say(KN[k]+': a move was blocked',u.x,u.y,k)}
 // 2. all attacks computed against the same post-move board, then applied together (simultaneous)
 const hits=[],heals=[];
 for(const k of ord)for(const o of G.pl[k].orders){
  if(o.k=='atk'){const u=G.u.find(u=>u.id==o.id),t=(o.tt=='u'?G.u:G.b).find(v=>v.id==o.tid);
   if(u&&t&&!(u.bo&&o.tt=='u')&&Math.abs(t.x-u.x)+Math.abs(t.y-u.y)<=u.rng&&(u.rng==1||U[u.t].w||los(G,u.x,u.y,t.x,t.y))){hits.push([k,t,u.dmg]);say(KN[k]+(u.rng>1?' shot a ':' struck a ')+t.t,t.x,t.y,k,t.o)}else say(KN[k]+': an attack missed its target',u?u.x:0,u?u.y:0,k)}
  if(o.k=='heal'){const u=G.u.find(u=>u.id==o.id),t=G.u.find(u=>u.id==o.tid);if(u&&t&&Math.abs(t.x-u.x)<=2&&Math.abs(t.y-u.y)<=2)heals.push([u,t])}
  if(o.k=='mage'){const u=G.u.find(u=>u.id==o.id);
   if(u&&Math.abs(o.x-u.x)+Math.abs(o.y-u.y)<=u.rng&&los(G,u.x,u.y,o.x,o.y)){for(const t of[...G.u,...G.b])if(Math.abs(t.x-o.x)<=1&&Math.abs(t.y-o.y)<=1)hits.push([k,t,t.x==o.x&&t.y==o.y?9:8]);say(KN[k]+' mage blasted an area',o.x,o.y,k)}
   else say(KN[k]+': a mage spell fizzled',o.x,o.y,k)}
  if(o.k=='spell'){const f=o.s=='fire',r1=f?1:2,d=f?10:6;
   for(const t of[...G.u,...G.b])if(t.x>=o.x-1&&t.x<=o.x+r1&&t.y>=o.y-1&&t.y<=o.y+r1)hits.push([k,t,d]);
   say(KN[k]+' cast '+(f?'Fireball':'Fire Arrows'),o.x,o.y,k)}}
 for(const[k,t,d]of hits){t.hp-=d;if(t.hp<=0&&t.kb===undefined)t.kb=k}
 for(const[u,t]of heals)if(u.hp>0&&t.hp>0)t.hp=Math.min(t.mh,t.hp+3); // healing applies after damage, cannot revive
 for(const b of G.b.filter(b=>b.hp<=0)){const k=b.kb;if(k==b.o)continue;
  if(b.t=='House')G.pl[k].gold+=4;say(KN[k]+' destroyed a '+b.t,b.x,b.y,k,b.o);
  if(b.t=='TownHall'){G.pl[k].gold+=25;elim(G,b.o);say(KN[b.o]+' was eliminated!',b.x,b.y,0,1,2,3)}}
 for(const u of G.u)if(u.hp<=0&&u.kb!==undefined&&u.kb!=u.o){G.pl[u.kb].gold+=1;say(KN[u.kb]+' destroyed a '+u.t,u.x,u.y,u.kb,u.o)}
 G.u=G.u.filter(u=>u.hp>0);G.b=G.b.filter(b=>b.hp>0);
 // 3. recruits and upgrades
 for(const k of ord){const P=G.pl[k];if(!P.alive)continue;for(const o of P.orders){
  if(o.k=='rec'){const b=G.b.find(b=>b.id==o.bid),f=b&&(o.t=='Cannon'?wspot(G,k,b):free(G,b.x,b.y));if(f){mk(G,k,o.t,f[0],f[1]);say(KN[k]+' recruited a '+o.t,f[0],f[1],k)}else P.gold+=o.cost}
  if(o.k=='up'){const b=G.b.find(b=>b.id==o.bid);if(b){b.lv++;if(b.t=='TownHall')P.apMax=8;if(b.t=='Wall'||b.t=='Gate'){const n=b.t=='Wall'?100:80;b.hp+=n-b.mh;b.mh=n}say(KN[k]+' upgraded its '+b.t,b.x,b.y,k)}else P.gold+=o.cost}
  if(o.k=='uup'){const u=G.u.find(u=>u.id==o.id),c=UP[u&&u.t];if(u){u.up=1;u.hp+=c[1];u.mh+=c[1];u.dmg+=c[2];u.rng+=c[3];say(KN[k]+' upgraded a '+u.t,u.x,u.y,k)}else P.gold+=o.cost}}}
 // 4. control points (2x2): sole occupant captures; contested = no gold; owner keeps it until captured
 for(const c of G.cp){const ow=new Set(G.u.filter(u=>u.x>=c.x&&u.x<c.x+2&&u.y>=c.y&&u.y<c.y+2).map(u=>u.o));
  c.cont=ow.size>1;if(ow.size==1){const k=[...ow][0];if(c.o!=k){c.o=k;say(KN[k]+' captured a Control Point',c.x,c.y,k)}}
  if(c.o>=0&&!G.pl[c.o].alive)c.o=-1;if(c.o>=0&&!c.cont)G.pl[c.o].gold+=3}
 // income
 for(const P of G.pl)if(P.alive){P.gold+=1;for(const b of G.b)if(b.o==P.k&&b.t=='GoldMine')P.gold+=b.lv>1?9:7}
 for(const P of G.pl)if(P.alive){const V=vis(G,P.k);P.fx=[];for(const e of ev)if(e.ks.includes(P.k)||V[e.y*N+e.x]){P.log.push('R'+G.round+': '+e.t);P.fx.push({x:e.x,y:e.y,t:e.t})}}
 if(!chk(G))newRound(G);push(R)}
function msg(R,p){const G=R.g;
 if(!G)return{t:'lobby',room:R.code,size:R.size,host:R.players[0]===p,k:p.k,players:R.players.map(q=>({name:q.name,k:q.k,on:!!q.ws}))};
 const k=p.k,P=G.pl[k],V=G.over?new Uint8Array(N*N).fill(1):vis(G,k),s=(x,y)=>V[y*N+x];
 return{t:'game',over:G.over?1:0,winner:G.win,wname:G.win>=0?G.pl[G.win].name:'',now:Date.now(),dl:G.dl,round:G.round,k,gold:P.gold,ap:P.ap,apMax:P.apMax,
  done:P.done,alive:P.alive,fu:P.fu,au:P.au,orders:P.orders,terr:G.terr.join(''),dep:[...G.dep],vis:V.join(''),
  u:G.u.filter(u=>u.o==k||s(u.x,u.y)),b:G.b.filter(b=>b.o==k||s(b.x,b.y)),
  pl:G.pl.filter(q=>!q.na).map(q=>({k:q.k,name:q.name,alive:q.alive,done:q.done})),log:P.log.slice(-30),fx:P.fx,
  cp:G.cp.map(c=>{const v=[0,1,2,3].some(i=>s(c.x+i%2,c.y+(i>>1)));return{x:c.x,y:c.y,o:v?c.o:-2,cont:v&&!!c.cont}})}}
function push(R){for(const p of R.players)send(p.ws,msg(R,p))}
setInterval(()=>{const now=Date.now();for(const c in rooms){const R=rooms[c],G=R.g;
 if(!G){const n=R.players.length;R.players=R.players.filter(p=>p.ws||now-p.off<REC);if(!R.players.length)delete rooms[c];else if(R.players.length!=n)push(R);continue}
 if(G.over)continue;
 for(const p of R.players)if(!p.ws&&now-p.off>REC&&G.pl[p.k].alive){elim(G,p.k);G.u=G.u.filter(u=>u.hp>0);G.pl[p.k].log.push('You abandoned the match');chk(G);push(R)}
 if(G.over)continue;
 const on=k=>R.players.find(p=>p.k==k).ws;
 if(now>=G.dl||(G.pl.some(P=>P.alive&&P.done)&&G.pl.every(P=>!P.alive||P.done||!on(P.k))))resolve(R)}},1000);
wss.on('connection',ws=>{
 ws.on('message',d=>{let m;try{m=JSON.parse(d)}catch{return}
  const er=s=>send(ws,{t:'err',m:s});let R=ws.R,p=ws.p;
  if(m.t=='create'||m.t=='join'){const name=String(m.name||'Player').slice(0,16)||'Player';
   if(m.t=='create'){let c;do c=Math.random().toString(36).slice(2,7).toUpperCase();while(rooms[c]);R=rooms[c]={code:c,size:m.size==2?2:4,players:[],g:null}}
   else{R=rooms[String(m.room||'').toUpperCase()];if(!R)return er('Room not found')}
   p=R.players.find(q=>m.token&&q.token==m.token);
   if(p){if(p.ws&&p.ws!==ws)try{p.ws.close()}catch{}p.ws=ws;p.off=0}
   else{if(R.g)return er('Game already started');if(R.players.length>=R.size)return er('Room is full');
    p={token:Math.random().toString(36).slice(2)+Date.now().toString(36),name,k:-1,ws,off:0};R.players.push(p)}
   ws.R=R;ws.p=p;send(ws,{t:'me',room:R.code,token:p.token,name:p.name});return push(R)}
  if(!R||!p)return er('Not in a room');
  if(m.t=='pick'&&!R.g){const k=m.k|0;if(k<0||k>3)return;if(R.players.some(q=>q!==p&&q.k==k))return er('That kingdom is already taken');p.k=k;push(R)}
  else if(m.t=='start'&&!R.g){if(p!==R.players[0])return er('Only the host can start');
   if(R.players.length<R.size||R.players.some(q=>q.k<0||!q.ws))return er('All '+R.size+' players must join, pick a kingdom and be online');start(R);push(R)}
  else if(R.g&&m.t=='act'){const e=act(R,p,m.o||{});if(e)er(e);send(ws,msg(R,p))}
  else if(R.g&&m.t=='cancel'){cancel(R.g.pl[p.k],m.i|0);send(ws,msg(R,p))}
  else if(R.g&&m.t=='done'){const P=R.g.pl[p.k];if(P.alive&&!R.g.over){P.done=true;push(R)}}});
 ws.on('close',()=>{const p=ws.p,R=ws.R;if(!p||p.ws!==ws)return;p.ws=null;p.off=Date.now();push(R)})});
server.listen(process.env.PORT||3000,()=>console.log('Four Kings running'));
