(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.Crystal=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  // 原稿三关保留，后三关为新增挑战。
  const LEVELS=[
    {id:1,name:'认识推动',group:'基础实验',subtitle:'一次推动，让晶核与目标共鸣。',intent:'先观察目标，再推动相邻晶核。',map:['#####','#@$.#','#   #','#   #','#####'],shortest:1},
    {id:2,name:'转换站位',group:'基础实验',subtitle:'方向不对时，改变你的位置。',intent:'需要绕到晶核另一侧，才能改变推动方向。',map:['######','# @  #','# $ ##','#  . #','######'],shortest:4},
    {id:3,name:'双目标规划',group:'基础实验',subtitle:'留出通路，再安排归位顺序。',intent:'两个晶核共享通路。先留出站位，再处理第二颗。',map:['#######','#     #','# .$. #','#  $@ #','#     #','#######'],shortest:12},
    {id:4,name:'绕过隔墙',group:'进阶挑战',subtitle:'直线被阻挡，尝试从侧面接近。',intent:'隔墙改变推动方向，先规划研究员的绕行路线。',map:['########','# .  . #','#  #   #','# $$ # #','#  @   #','#      #','########'],shortest:15},
    {id:5,name:'转角回路',group:'进阶挑战',subtitle:'暂时远离目标，也可能是正确的开始。',intent:'先调整晶核的位置，利用外围回路重新获得推动站位。',map:['#######','#  .  #','#  #  #','# $$@ #','#  #. #','#     #','#######'],shortest:22},
    {id:6,name:'最后的共鸣',group:'进阶挑战',subtitle:'把目标顺序和回身空间一起考虑。',intent:'三颗晶核共享回路，留出空间再处理上方的两个目标。',map:['#######','#.$.  #','#  #  #','# $$@ #','#  #. #','#     #','#######'],shortest:32}
  ];
  const DIRS={up:[0,-1],right:[1,0],down:[0,1],left:[-1,0]};
  const deadCache=new WeakMap();
  function load(level){
    if(!level||!Array.isArray(level.map)||!level.map.length)throw Error('地图配置无效');
    const width=level.map[0].length,height=level.map.length;
    if(!width||level.map.some(row=>typeof row!=='string'||row.length!==width||/[^# @$.*+]/.test(row)))throw Error('地图格式无效');
    const walls=[],crates=[],targets=[];let player=-1;
    level.map.forEach((row,y)=>[...row].forEach((c,x)=>{
      const i=y*width+x;
      if(c==='#')walls.push(i);
      if('$*'.includes(c))crates.push(i);
      if('.*+'.includes(c))targets.push(i);
      if('@+'.includes(c)){if(player!==-1)throw Error('玩家起点不唯一');player=i;}
    }));
    if(player<0||!crates.length||crates.length!==targets.length)throw Error('关卡配置无效');
    return {levelId:level.id,width,height,walls,targets,player,crates,moves:0,pushes:0,won:targets.every(t=>crates.includes(t))};
  }
  function adjacent(s,index,direction){
    const d=DIRS[direction];if(!d)return -1;
    const x=index%s.width+d[0],y=Math.floor(index/s.width)+d[1];
    return x<0||y<0||x>=s.width||y>=s.height?-1:y*s.width+x;
  }
  function move(s,direction){
    if(s.won)return {state:s,changed:false,reason:'本关已经完成，可以撤销或选择下一关。'};
    const next=adjacent(s,s.player,direction);
    if(next<0||s.walls.includes(next))return {state:s,changed:false,reason:'前方是墙体，换个方向试试。'};
    const crates=[...s.crates];let pushed=false;
    if(crates.includes(next)){
      const after=adjacent(s,next,direction);
      if(after<0||s.walls.includes(after)||crates.includes(after))return {state:s,changed:false,reason:'晶核前方需要空位，不能同时推动两颗晶核。'};
      crates[crates.indexOf(next)]=after;pushed=true;
    }
    const state={...s,player:next,crates,moves:s.moves+1,pushes:s.pushes+Number(pushed)};
    state.won=state.targets.every(t=>crates.includes(t));
    return {state,changed:true,pushed};
  }
  function deadSquares(s){
    const signature=s.targets.join(',');const cached=deadCache.get(s.walls);
    if(cached&&cached.signature===signature)return cached.cells;
    // 从目标反向推导：箱子前身位置和研究员站位都必须是地面。
    const walls=new Set(s.walls),reachable=new Set(s.targets),queue=[...s.targets];
    for(let head=0;head<queue.length;head++)for(const direction of Object.keys(DIRS)){
      const before=adjacent(s,queue[head],direction),behind=before<0?-1:adjacent(s,before,direction);
      if(before<0||behind<0||walls.has(before)||walls.has(behind)||reachable.has(before))continue;
      reachable.add(before);queue.push(before);
    }
    const cells=new Set();
    for(let i=0;i<s.width*s.height;i++)if(!walls.has(i)&&!reachable.has(i))cells.add(i);
    deadCache.set(s.walls,{signature,cells});return cells;
  }
  function deadlocks(s){const cells=deadSquares(s);return s.crates.filter(c=>cells.has(c));}
  function corners(s){
    return s.crates.filter(c=>!s.targets.includes(c)&&['up','down'].some(d=>{const i=adjacent(s,c,d);return i<0||s.walls.includes(i);})&&['left','right'].some(d=>{const i=adjacent(s,c,d);return i<0||s.walls.includes(i);}));
  }
  function search(start,limit=100000){
    if(start.won)return {status:'solved',path:[],explored:0};
    if(deadlocks(start).length)return {status:'deadlock',path:null,explored:0};
    const key=s=>`${s.player}|${[...s.crates].sort((a,b)=>a-b).join(',')}`;
    const queue=[{state:start,parent:-1,direction:null}],seen=new Set([key(start)]);let head=0;
    for(;head<queue.length&&head<limit;head++){
      const entry=queue[head];
      if(entry.state.won){
        const path=[];let i=head;
        while(queue[i].parent!==-1){path.push(queue[i].direction);i=queue[i].parent;}
        return {status:'solved',path:path.reverse(),explored:head+1};
      }
      for(const direction of Object.keys(DIRS)){
        const result=move(entry.state,direction);
        if(!result.changed||deadlocks(result.state).length)continue;
        const k=key(result.state);
        if(!seen.has(k)){seen.add(k);queue.push({state:result.state,parent:head,direction});}
      }
    }
    return {status:head<queue.length?'limit':'unsolvable',path:null,explored:head};
  }
  function solve(start,limit){return search(start,limit).path;}
  function replay(level,path){
    if(!Array.isArray(path)||path.length>5000)return null;
    let state=load(level);const history=[];
    for(const direction of path){
      if(!Object.hasOwn(DIRS,direction))return null;
      const result=move(state,direction);if(!result.changed)return null;
      history.push(state);state=result.state;
    }
    return {state,history};
  }
  return {LEVELS,DIRS,load,adjacent,move,corners,deadlocks,search,solve,replay};
});
