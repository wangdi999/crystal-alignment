(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory(require('./engine.js'));
  else root.CrystalRogue=factory(root.Crystal);
})(typeof globalThis!=='undefined'?globalThis:this,function(C){
  'use strict';
  const RELICS=[
    {id:'tractor',name:'牵引线圈',icon:'↶',type:'技能',tag:'逆转站位',desc:'消耗 2 电荷：把面前晶核拉到脚下，同时后退一格。',skill:'pull',cost:2},
    {id:'phase',name:'相位棱镜',icon:'◇',type:'技能',tag:'跨越障碍',desc:'消耗 2 电荷：向指定方向跃迁两格，可越过中间墙体或晶核。落点必须为空。',skill:'blink',cost:2},
    {id:'pulse',name:'脉冲模组',icon:'⌁',type:'技能',tag:'远程推动',desc:'消耗 3 电荷：推动两格外的晶核一格。中间必须通畅，你留在原地。',skill:'pulse',cost:3},
    {id:'superconductor',name:'超导绕组',icon:'ϟ',type:'充能',tag:'归位供能',desc:'每颗晶核首次归位额外获得 2 电荷，电荷上限由 8 提升至 10。'},
    {id:'recycler',name:'回收外壳',icon:'⟳',type:'充能',tag:'技能循环',desc:'每次成功施放技能后返还 1 电荷。失败操作不扣资源。'},
    {id:'growth',name:'生长晶簇',icon:'✦',type:'续航',tag:'归位修复',desc:'每颗晶核首次归位恢复 5 稳定度。与额外充能可同时触发。'},
    {id:'precision',name:'精密齿轮',icon:'⚙',type:'效率',tag:'省步构筑',desc:'每房间前 3 次普通推动免除基础稳定消耗。过载附加消耗仍需支付。'},
    {id:'afterglow',name:'余辉晶壳',icon:'◉',type:'续航',tag:'电荷储蓄',desc:'房间完成时，每点剩余电荷额外恢复 2 稳定度。电荷本身继续保留。'},
    {id:'echo',name:'回声发生器',icon:'≋',type:'联动',tag:'技能接推动',desc:'技能之后的下一次普通推动，额外获得 1 电荷与 10 分。每颗晶核每房间只触发一次。'}
  ];
  const ROUTES={steady:{name:'稳态区',charge:2,score:0,desc:'入场 +2 电荷。普通操作消耗 1 稳定度，通关恢复 20。'},overload:{name:'过载区',charge:3,score:50,desc:'入场 +3 电荷，通关额外 +50 分；每次普通推动额外消耗 1 稳定度。'}};
  const extra=(id,name,map)=>({id,name,map});
  // 只抽取已验证可解的手工模板；旋转与镜像不改变可解性。
  const POOLS=[
    [C.LEVELS[1],C.LEVELS[2],extra(101,'双叉入口',['#######','# . . #','#  #  #','# $ $ #','#  @  #','#######'])],
    [C.LEVELS[3],extra(102,'镜墙外环',['########','# .  . #','#  ##  #','#      #','#  $$  #','#  @   #','########'])],
    [C.LEVELS[4]],
    [C.LEVELS[5],extra(103,'双星回廊',['#######','# $.. #','#  #  #','# $$@ #','#  #. #','#     #','#######']),extra(104,'回身余地',['#######','# $.  #','#. #  #','# $$@ #','#  #. #','#     #','#######'])]
  ];
  const has=(run,id)=>run.relics.includes(id);
  const relic=id=>RELICS.find(r=>r.id===id);
  function hash(value){let h=2166136261;for(const ch of String(value)){h^=ch.charCodeAt(0);h=Math.imul(h,16777619);}return h>>>0;}
  function random(seed){let n=hash(seed);return ()=>{n+=0x6D2B79F5;let t=n;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return ((t^(t>>>14))>>>0)/4294967296;};}
  function shuffle(items,rng){const out=[...items];for(let i=out.length-1;i>0;i--){const j=Math.floor(rng()*(i+1));[out[i],out[j]]=[out[j],out[i]];}return out;}
  function normalizeSeed(value){return String(value||'').toUpperCase().replace(/[^A-Z0-9-]/g,'').slice(0,18)||'RESONANCE';}
  function create(seed){return {version:1,seed:normalizeSeed(seed),phase:'draft',floor:0,stability:80,maxStability:100,energy:4,score:0,relics:[],room:null,totalMoves:0,totalSkills:0,roomsCleared:0,lastEffects:[]};}
  function energyCap(run){return has(run,'superconductor')?10:8;}
  function offers(run){
    if(run.phase!=='draft')return [];
    const rng=random(run.seed+'|draft|'+run.floor+'|'+[...run.relics].sort().join(','));
    return shuffle(RELICS.filter(r=>!run.relics.includes(r.id)&&(run.floor>0||r.skill)),rng).slice(0,3).map(r=>r.id);
  }
  function transform(map,variant){
    let rows=map.map(row=>[...row]);
    if(variant>=4)rows=rows.map(row=>row.reverse());
    for(let i=0;i<variant%4;i++)rows=Array.from({length:rows[0].length},(_,x)=>rows.map(row=>row[x]).reverse());
    return rows.map(row=>row.join(''));
  }
  function roomLevel(seed,floor){
    const rng=random(normalizeSeed(seed)+'|room|'+floor),pool=POOLS[floor],base=pool[Math.floor(rng()*pool.length)],variant=Math.floor(rng()*8);
    return {id:base.id,name:base.name,map:transform(base.map,variant),variant};
  }
  function unchanged(run,reason){return {state:run,changed:false,reason};}
  function choose(run,id){
    if(!offers(run).includes(id))return unchanged(run,'只能选择当前展示的协议。');
    return {state:{...run,relics:[...run.relics,id],phase:'route',lastEffects:[]},changed:true};
  }
  function enter(run,route){
    if(run.phase!=='route'||!Object.hasOwn(ROUTES,route))return unchanged(run,'当前不能进入这个区域。');
    const level=roomLevel(run.seed,run.floor),room={level,route,board:C.load(level),charged:[],echoRewarded:[],echoPending:false,precisionUsed:0,skills:0};
    return {state:{...run,phase:'room',room,energy:Math.min(energyCap(run),run.energy+ROUTES[route].charge),lastEffects:[]},changed:true};
  }
  function availableSkills(run){return run.relics.map(relic).filter(r=>r.skill);}
  function preview(run,kind,direction){
    if(run.phase!=='room')return {valid:false,reason:'先选择协议与路线，再开始房间实验。'};
    if(!Object.hasOwn(C.DIRS,direction))return {valid:false,reason:'请选择方向。'};
    const b=run.room.board;
    if(kind==='move'){
      const result=C.move(b,direction);
      return {valid:result.changed,reason:result.reason,board:result.state,pushed:result.pushed,crateId:result.pushed?b.crates.findIndex(c=>!result.state.crates.includes(c)):-1,cost:0};
    }
    const ability=availableSkills(run).find(r=>r.skill===kind);
    if(!ability)return {valid:false,reason:'尚未获得这个技能。'};
    if(run.energy<ability.cost)return {valid:false,reason:'电荷不足。首次归位可以充能，也可先撤销调整站位。'};
    const near=C.adjacent(b,b.player,direction),far=near<0?-1:C.adjacent(b,near,direction);
    const free=i=>i>=0&&!b.walls.includes(i)&&!b.crates.includes(i);
    const crates=[...b.crates];let player=b.player,crateId=-1,to=-1;
    if(kind==='pull'){
      const opposite={up:'down',down:'up',left:'right',right:'left'}[direction],back=C.adjacent(b,b.player,opposite);
      crateId=b.crates.indexOf(near);
      if(crateId<0||!free(back))return {valid:false,reason:'牵引需要面前有晶核、身后有空位。'};
      crates[crateId]=b.player;player=back;to=b.player;
    }else if(kind==='blink'){
      if(!free(far))return {valid:false,reason:'跃迁落点必须是两格外的空地。'};
      player=far;to=far;
    }else if(kind==='pulse'){
      crateId=b.crates.indexOf(far);const beyond=far<0?-1:C.adjacent(b,far,direction);
      if(!free(near)||crateId<0||!free(beyond))return {valid:false,reason:'脉冲需要隔一格的晶核、中间通畅，且晶核后方有空位。'};
      crates[crateId]=beyond;to=beyond;
    }else return {valid:false,reason:'未知技能。'};
    const board={...b,player,crates,moves:b.moves+1,pushes:b.pushes+Number(crateId>=0),won:b.targets.every(t=>crates.includes(t))};
    return {valid:true,board,crateId,pushed:crateId>=0,cost:ability.cost,to};
  }
  function act(run,kind,direction){
    const p=preview(run,kind,direction);if(!p.valid)return unchanged(run,p.reason);
    const r={...run,room:{...run.room,board:p.board,charged:[...run.room.charged],echoRewarded:[...run.room.echoRewarded]},lastEffects:[]};
    const room=r.room,normalPush=kind==='move'&&p.pushed,skill=kind!=='move';
    const protectedPush=normalPush&&has(r,'precision')&&room.precisionUsed<3;
    let loss=protectedPush?0:1;
    if(normalPush&&room.route==='overload')loss++;
    if(normalPush)room.precisionUsed++;
    r.stability=Math.max(0,r.stability-loss);r.energy-=p.cost;r.totalMoves++;
    if(skill){
      r.totalSkills++;room.skills++;
      r.lastEffects.push({type:kind,at:p.to,from:run.room.board.player});
      if(has(r,'recycler')){r.energy++;r.lastEffects.push({type:'energy',amount:1,label:'回收外壳'});}
      if(has(r,'echo'))room.echoPending=true;
    }else if(normalPush&&room.echoPending){
      room.echoPending=false;
      if(!room.echoRewarded.includes(p.crateId)){
        room.echoRewarded.push(p.crateId);r.energy++;r.score+=10;
        r.lastEffects.push({type:'echo',amount:10,label:'回声联动'});
      }
    }
    room.board.crates.forEach((cell,id)=>{
      if(!room.board.targets.includes(cell)||room.charged.includes(id))return;
      room.charged.push(id);const gain=has(r,'superconductor')?3:1;r.energy+=gain;r.score+=12;
      r.lastEffects.push({type:'dock',at:cell,amount:gain,label:'首次归位'});
      if(has(r,'growth')){r.stability+=5;r.lastEffects.push({type:'heal',amount:5,label:'生长晶簇'});}
    });
    r.energy=Math.min(energyCap(r),r.energy);r.stability=Math.min(r.maxStability,r.stability);
    if(room.board.won){
      const bonus=Math.max(20,80+r.floor*20-room.board.moves)+ROUTES[room.route].score;
      const recovery=20+(has(r,'afterglow')?r.energy*2:0);
      r.score+=bonus;r.stability=Math.min(r.maxStability,r.stability+recovery);r.phase='cleared';r.roomsCleared++;
      r.lastEffects.push({type:'clear',amount:bonus,recovery});
    }else if(r.stability<=0)r.phase='failed';
    return {state:r,changed:true};
  }
  function advance(run){
    if(run.phase!=='cleared')return unchanged(run,'完成房间后才能继续。');
    return {state:{...run,phase:run.floor===3?'victory':'draft',floor:run.floor===3?3:run.floor+1,room:run.floor===3?run.room:null,lastEffects:[]},changed:true};
  }
  function isAction(command){return typeof command==='string'&&/^(?:(pull|blink|pulse):)?(up|right|down|left)$/.test(command);}
  function command(run,value){
    if(typeof value!=='string')return unchanged(run,'指令格式无效。');
    if(value.startsWith('pick:'))return choose(run,value.slice(5));
    if(value.startsWith('route:'))return enter(run,value.slice(6));
    if(value==='advance')return advance(run);
    if(isAction(value)){const parts=value.split(':');return parts.length===1?act(run,'move',parts[0]):act(run,parts[0],parts[1]);}
    return unchanged(run,'指令无效。');
  }
  function replay(seed,commands){
    if(!Array.isArray(commands)||commands.length>5000)return null;
    let run=create(seed);
    for(const value of commands){const result=command(run,value);if(!result.changed)return null;run=result.state;}
    return run;
  }
  function solveRoom(run,limit=24000){
    if(run.phase==='cleared')return {status:'solved',path:[],explored:0};
    if(run.phase!=='room')return {status:'invalid',path:null,explored:0};
    const actions=Object.keys(C.DIRS).map(d=>d).concat(availableSkills(run).flatMap(r=>Object.keys(C.DIRS).map(d=>r.skill+':'+d)));
    const key=r=>[r.room.board.player,r.room.board.crates.join(','),r.energy,r.room.charged.join(','),Number(r.room.echoPending),r.room.echoRewarded.join(','),Math.min(3,r.room.precisionUsed)].join('|');
    const compact=r=>({...r,lastEffects:[]});
    const queue=[{state:compact(run),parent:-1,action:null}],best=new Map([[key(run),run.stability]]);let head=0;
    for(;head<queue.length&&head<limit;head++){
      const node=queue[head];
      if(node.state.phase==='cleared'){
        const path=[];let i=head;while(queue[i].parent>=0){path.push(queue[i].action);i=queue[i].parent;}
        return {status:'solved',path:path.reverse(),explored:head+1};
      }
      for(const action of actions){
        const result=command(node.state,action);if(!result.changed||result.state.phase==='failed')continue;
        const r=result.state,k=key(r);if((best.get(k)??-1)>=r.stability)continue;
        best.set(k,r.stability);queue.push({state:compact(r),parent:head,action});
      }
    }
    return {status:head<queue.length?'limit':'unsolvable',path:null,explored:head};
  }
  return {RELICS,ROUTES,POOLS,relic,has,hash,normalizeSeed,create,offers,roomLevel,transform,energyCap,availableSkills,preview,choose,enter,act,advance,isAction,command,replay,solveRoom};
});
