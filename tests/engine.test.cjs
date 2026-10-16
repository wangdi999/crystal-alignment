const test=require('node:test'),assert=require('node:assert/strict'),C=require('../engine.js');
const originalMaps=[['#####','#@$.#','#   #','#   #','#####'],['######','# @  #','# $ ##','#  . #','######'],['#######','#     #','# .$. #','#  $@ #','#     #','#######']];
test('原稿三关地图完整保留',()=>{
  C.LEVELS.slice(0,3).forEach((level,i)=>assert.deepEqual(level.map,originalMaps[i]));
});
for(const level of C.LEVELS)test(`第 ${level.id} 关最短解 ${level.shortest} 步且全部归位`,()=>{
  let state=C.load(level);const before=JSON.stringify(state),result=C.search(state);
  assert.equal(result.status,'solved');assert.equal(result.path.length,level.shortest);
  assert.equal(JSON.stringify(state),before);
  for(const direction of result.path){const move=C.move(state,direction);assert.ok(move.changed);state=move.state;assert.equal(C.deadlocks(state).length,0);}
  assert.ok(state.won);assert.equal(state.moves,level.shortest);
  assert.equal(state.targets.filter(t=>state.crates.includes(t)).length,state.crates.length);
  assert.equal(C.move(state,'up').changed,false);
  assert.deepEqual(C.solve(state),[]);
});
test('碰墙、双晶核阻挡与非拉动规则',()=>{
  const start=C.load(C.LEVELS[0]);assert.equal(C.move(start,'up').changed,false);
  assert.equal(start.moves,0);assert.deepEqual(C.move(start,'down').state.crates,start.crates);
  const pair=C.load({id:9,map:['#######','#@$$..#','#######']});assert.equal(C.move(pair,'right').changed,false);
});
test('边缘移动不会跨行环绕',()=>{
  const state={...C.load(C.LEVELS[0]),walls:[],player:4};assert.equal(C.move(state,'right').changed,false);
});
test('死角与沿墙死位均可识别；目标不被误报',()=>{
  const corner=C.load({id:9,map:['#######','#@    #','#  .  #','#  $  #','#     #','#######']});
  corner.crates=[8];assert.ok(C.deadlocks(corner).includes(8));
  const wall={...corner,crates:[10]};assert.equal(C.corners(wall).length,0);assert.ok(C.deadlocks(wall).includes(10));
  assert.equal(C.search(wall).status,'deadlock');
  assert.equal(C.deadlocks({...corner,crates:[corner.targets[0]]}).length,0);
});
test('搜索预算耗尽和确实无解分别返回不同状态',()=>{
  assert.equal(C.search(C.load(C.LEVELS[5]),1).status,'limit');
  const blocked=C.load({id:9,map:['#######','#@# . #','###$  #','#     #','#######']});
  assert.ok(['deadlock','unsolvable'].includes(C.search(blocked).status));
});
test('存档只重放合法方向，不信任坐标；非法与过长记录被拒绝',()=>{
  const result=C.replay(C.LEVELS[1],['down']);assert.equal(result.state.moves,1);assert.equal(result.history.length,1);
  assert.deepEqual(result.history[0],C.load(C.LEVELS[1]));
  for(const path of [null,{},['left','left'],['__proto__'],Array(5001).fill('down')])assert.equal(C.replay(C.LEVELS[1],path),null);
});
test('不规则地图、多玩家、未知字符与数量错误配置拒绝加载',()=>{
  for(const map of [['###','#@$.#'],['######','#@@$.#','######'],['#####','#@x.#','#####'],['#####','#@ .#','#####']])assert.throws(()=>C.load({id:9,map}));
});
