const test=require('node:test'),assert=require('node:assert/strict'),R=require('../rogue.js'),C=require('../engine.js');
const fixture=(relics=['tractor'],map=['########','#    . #','# @$.  #','# $    #','#      #','########'])=>{
  const run=R.create('RULES');run.phase='room';run.relics=[...relics];run.energy=6;
  run.room={level:{id:999,name:'规则夹具',map},route:'steady',board:C.load({id:999,map}),charged:[],echoRewarded:[],echoPending:false,precisionUsed:0,skills:0};return run;
};
test('相同种子的房间、变体、协议与操作结果完全确定',()=>{
  let a=R.create('SEED-42'),b=R.create('SEED-42');
  for(let f=0;f<4;f++)assert.deepEqual(R.roomLevel(a.seed,f),R.roomLevel(b.seed,f));
  assert.deepEqual(R.offers(a),R.offers(b));
  a=R.choose(a,'tractor').state;b=R.choose(b,'tractor').state;
  a=R.enter(a,'steady').state;b=R.enter(b,'steady').state;assert.deepEqual(a,b);
});
test('开局保证三种不同技能；协议不会重复获得或刷新重抽',()=>{
  const a=R.create('DRAFT');assert.equal(R.offers(a).length,3);assert.ok(R.offers(a).every(id=>R.relic(id).skill));
  assert.equal(R.choose(a,'growth').changed,false);
  const route=R.choose(a,'phase').state;assert.equal(route.phase,'route');assert.equal(R.choose(route,'phase').changed,false);
  const draft={...route,phase:'draft',floor:1};assert.ok(!R.offers(draft).includes('phase'));assert.deepEqual(R.offers(draft),R.offers(JSON.parse(JSON.stringify(draft))));
});
test('九个手工模板的八种对称变体均能通过合法普通操作归位',()=>{
  for(const pool of R.POOLS)for(const level of pool)for(let v=0;v<8;v++){
    let board=C.load({...level,map:R.transform(level.map,v)});const path=C.solve(board);assert.ok(path,level.name+' 变体 '+v);
    for(const direction of path)board=C.move(board,direction).state;assert.ok(board.won);
  }
});
test('相位步跨越中间墙，普通移动不会穿墙，原状态保持不变',()=>{
  const run=fixture(['phase'],['#######','#@#   #','#  $. #','#     #','#######']);const before=JSON.stringify(run);
  assert.equal(R.act(run,'move','right').changed,false);
  const result=R.act(run,'blink','right');assert.ok(result.changed);assert.equal(result.state.room.board.player,10);assert.equal(result.state.energy,4);assert.equal(result.state.totalSkills,1);assert.equal(JSON.stringify(run),before);
});
test('牵引可以救回经典静态死位，但必须留出后退站位',()=>{
  const run=fixture(['tractor'],['#######','# $   #','# @ . #','#     #','#######']);assert.equal(C.deadlocks(run.room.board).length,1);
  const pulled=R.act(run,'pull','up');assert.ok(pulled.changed);assert.equal(C.deadlocks(pulled.state.room.board).length,0);assert.equal(pulled.state.energy,4);
  const blocked=fixture(['tractor'],['#######','#  .  #','# @$  #','#######']);assert.equal(R.act(blocked,'pull','up').changed,false);
});
test('脉冲隔一格推动，研究员留在原位；中间障碍会阻挡',()=>{
  const run=fixture(['pulse'],['#######','#@ $. #','#     #','#######']);const p=run.room.board.player;
  const result=R.act(run,'pulse','right');assert.equal(result.state.phase,'cleared');assert.equal(result.state.room.board.player,p);assert.equal(result.state.energy,4);
  const blocked=fixture(['pulse'],['#######','#@#$. #','#     #','#######']);assert.equal(R.act(blocked,'pulse','right').changed,false);
});
test('无技能、无电荷、无效方向或非法落点都不扣资源',()=>{
  const run=fixture();run.energy=1;
  for(const [skill,d] of [['pull','right'],['blink','right'],['pulse','right'],['pull','up'],['move','__proto__']]){
    const result=R.act(run,skill,d);assert.equal(result.changed,false);assert.strictEqual(result.state,run);
  }
});
test('每颗晶核每房只产出一次首次归位收益，来回拉推不能刷取',()=>{
  let run=fixture();run=R.act(run,'move','right').state;assert.equal(run.energy,7);assert.equal(run.score,12);assert.deepEqual(run.room.charged,[0]);
  run=R.act(run,'pull','right').state;assert.equal(run.energy,5);
  run=R.act(run,'move','right').state;assert.equal(run.energy,5);assert.equal(run.score,12);
});
test('超导与生长在首次归位同时生效，并且遵守资源上限',()=>{
  let run=fixture(['tractor','superconductor','growth']);run.stability=70;
  run=R.act(run,'move','right').state;assert.equal(run.energy,9);assert.equal(run.stability,74);assert.equal(R.energyCap(run),10);
  const again=R.act(R.act(run,'pull','right').state,'move','right').state;assert.equal(again.energy,7);assert.equal(again.stability,72);
});
test('回收与回声形成联动，同一晶核不能重复获得回声分',()=>{
  let run=fixture(['tractor','recycler','echo']);run=R.act(run,'move','right').state;
  run=R.act(run,'pull','right').state;assert.equal(run.energy,6);assert.equal(run.room.echoPending,true);
  run=R.act(run,'move','right').state;assert.equal(run.energy,7);assert.equal(run.score,22);
  run=R.act(run,'pull','right').state;run=R.act(run,'move','right').state;assert.equal(run.energy,6);assert.equal(run.score,22);
});
test('精密齿轮免除基础消耗，过载附加消耗仍存在',()=>{
  const run=fixture(['precision']);const safe=R.act(run,'move','right').state;assert.equal(safe.stability,80);
  run.room.route='overload';const risk=R.act(run,'move','right').state;assert.equal(risk.stability,79);
});
test('过载路线给更多电荷与通关分，但消耗更多稳定度',()=>{
  const draft=R.choose(R.create('ROUTE'),'pulse').state;
  const a=R.enter(draft,'steady').state,b=R.enter(draft,'overload').state;
  assert.deepEqual(a.room.board,b.room.board);assert.equal(b.energy,a.energy+1);
  const map=['#####','#@$.#','#####'];let x=fixture([],map),y=fixture([],map);y.room.route='overload';
  x=R.act(x,'move','right').state;y=R.act(y,'move','right').state;assert.equal(y.score-x.score,50);
});
test('余辉保留剩余电荷并在通关时恢复额外稳定度',()=>{
  let run=fixture(['afterglow'],['#####','#@$.#','#####']);run.stability=20;
  run=R.act(run,'move','right').state;assert.equal(run.energy,7);assert.equal(run.stability,53);assert.equal(run.phase,'cleared');
});
test('稳定度耗尽时失败，最后一步归位可正常获得通关恢复',()=>{
  const run=fixture();run.stability=1;assert.equal(R.act(run,'move','left').state.phase,'failed');
  const win=fixture([],['#####','#@$.#','#####']);win.stability=1;const cleared=R.act(win,'move','right').state;assert.equal(cleared.phase,'cleared');assert.equal(cleared.stability,20);
});
test('事件重放恢复协议、棋盘与全部资源，拒绝非法记录',()=>{
  const commands=['pick:tractor','route:steady'];let run=R.replay('SAVE',commands);assert.ok(run);
  const move=Object.keys(C.DIRS).find(d=>R.command(run,d).changed);const before=JSON.stringify(run);run=R.command(run,move).state;
  assert.deepEqual(R.replay('SAVE',[...commands,move]),run);assert.equal(JSON.stringify(R.replay('SAVE',commands)),before);
  for(const commands of [null,{},['pick:growth'],['route:steady'],['pick:tractor','route:steady','__proto__'],Array(5001).fill('up')])assert.equal(R.replay('SAVE',commands),null);
});
test('思路搜索支持技能与电荷，返回的每一步都可真实执行',()=>{
  const run=fixture(['tractor'],['#######','# $   #','# @ . #','#     #','#######']);
  const result=R.solveRoom(run);assert.equal(result.status,'solved');assert.ok(result.path.some(a=>a.startsWith('pull:')));
  let r=run;for(const a of result.path){const next=R.command(r,a);assert.ok(next.changed);r=next.state;}assert.equal(r.phase,'cleared');
  assert.equal(R.solveRoom(run,1).status,'limit');
});
test('四房间完整远征：三种起手式、不同路线与种子均可合法通关',()=>{
  let wins=0;
  for(let seed=0;seed<20;seed++)for(const starter of ['tractor','phase','pulse']){
    let run=R.create('SIM-'+seed);
    for(let floor=0;floor<4;floor++){
      run=R.choose(run,floor===0?starter:R.offers(run)[0]).state;
      run=R.enter(run,seed%2?'overload':'steady').state;
      const path=C.solve(run.room.board);assert.ok(path);
      for(const a of path){const next=R.command(run,a);assert.ok(next.changed);run=next.state;}
      assert.equal(run.phase,'cleared');run=R.advance(run).state;
    }
    assert.equal(run.phase,'victory');assert.equal(run.relics.length,4);assert.equal(run.roomsCleared,4);wins++;
  }
  assert.equal(wins,60);
});
