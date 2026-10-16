(function(){
  'use strict';
  const R=CrystalRogue,C=Crystal,$=id=>document.getElementById(id),KEY='crystal-expedition-v1';
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const names={up:'上',right:'右',down:'下',left:'左'},arrows={up:'↑',right:'→',down:'↓',left:'←'};
  const randomSeed=()=>{const a=new Uint32Array(1);if(window.crypto?.getRandomValues)crypto.getRandomValues(a);else a[0]=Date.now()>>>0;return a[0].toString(36).toUpperCase().padStart(7,'0');};
  const dailySeed=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date()).replace(/[^0-9]/g,'');
  let raw=null;try{raw=JSON.parse(localStorage.getItem(KEY));}catch(_){}
  const profile={records:[]};
  if(Array.isArray(raw?.records))profile.records=raw.records.filter(r=>r&&typeof r.id==='string'&&Number.isSafeInteger(r.score)&&r.score>=0&&r.score<100000&&typeof r.seed==='string').slice(-30).map(r=>({id:r.id.slice(0,50),seed:R.normalizeSeed(r.seed),score:r.score,won:r.won===true,relics:Array.isArray(r.relics)?r.relics.filter(id=>R.relic(id)):[]}));
  let commands=[],future=[],run=R.create(randomSeed()),runId=Date.now().toString(36),selected=null,hintAction=null,hints=0,hintBusy=false,mode='expedition',pendingSeed=null;
  const query=new URLSearchParams(location.search),requestedSeed=query.get('seed');
  if(raw?.current&&(!requestedSeed||R.normalizeSeed(requestedSeed)===R.normalizeSeed(raw.current.seed))){
    const restored=R.replay(raw.current.seed,raw.current.commands);
    if(restored){
      run=restored;commands=[...raw.current.commands];
      const proposed=Array.isArray(raw.current.future)&&raw.current.future.length<5000&&raw.current.future.every(R.isAction)?raw.current.future:[];
      future=R.replay(run.seed,[...commands,...[...proposed].reverse()])?[...proposed]:[];
      hints=Number.isSafeInteger(raw.current.hints)&&raw.current.hints>=0?raw.current.hints:0;
      if(typeof raw.current.id==='string')runId=raw.current.id.slice(0,50);
    }
  }else if(requestedSeed)run=R.create(requestedSeed);
  function announce(value){$('run-announcement').textContent=value;}
  function save(){
    try{localStorage.setItem(KEY,JSON.stringify({...profile,current:{id:runId,seed:run.seed,commands,future,hints}}));}
    catch(_){announce('浏览器存储不可用，当前仍可游玩；不要刷新页面。');}
  }
  function record(){
    if(!['victory','failed'].includes(run.phase)||profile.records.some(r=>r.id===runId))return;
    profile.records.push({id:runId,seed:run.seed,score:run.score,won:run.phase==='victory',relics:[...run.relics]});profile.records=profile.records.slice(-30);
  }
  function play(type){window.dispatchEvent(new CustomEvent('crystal:sound',{detail:type}));}
  function setMode(value){
    mode=value==='classic'?'classic':'expedition';
    $('classic-screen').hidden=mode!=='classic';$('expedition-screen').hidden=mode!=='expedition';
    $('mode-classic').setAttribute('aria-pressed',String(mode==='classic'));$('mode-expedition').setAttribute('aria-pressed',String(mode==='expedition'));
    $('progress').hidden=mode!=='classic';
    try{localStorage.setItem('crystal-lab-mode',mode);}catch(_){}
  }
  function start(seed){
    record();run=R.create(seed);runId=Date.now().toString(36)+'-'+randomSeed();commands=[];future=[];hints=0;selected=null;hintAction=null;hintBusy=false;
    $('run-seed').value=run.seed;announce('先选一个主动技能，定义本次远征的起手式。');render();save();
  }
  function requestStart(seed){
    const value=R.normalizeSeed(seed);
    if(commands.length&&!['victory','failed'].includes(run.phase)){
      pendingSeed=value;$('run-confirm').showModal();return;
    }
    start(value);
  }
  function execute(command,isRedo=false){
    if(commands.length>=5000){announce('本局操作记录已达上限，请开启新远征。');return;}
    const result=R.command(run,command);
    if(!result.changed){announce(result.reason);play('blocked');return;}
    run=result.state;commands.push(command);if(isRedo)future.pop();else future=[];
    selected=null;hintAction=null;hintBusy=false;
    if(run.phase==='victory')record();
    announce(run.phase==='room'?'选择方向移动，或先点技能再选择方向。':run.phase==='cleared'?'房间完成！可以继续成长，也可以先撤销复盘。':run.phase==='failed'?'稳定度耗尽。可撤销最近操作，或结束本次远征。':'');
    render();save();
    if(R.isAction(command)){$('rogue-board')?.focus({preventScroll:true});play(run.phase==='cleared'?'win':run.lastEffects.some(e=>e.type==='dock')?'dock':'push');}
  }
  function canUndo(){return ['room','cleared','failed'].includes(run.phase)&&R.isAction(commands[commands.length-1]);}
  function undo(){
    if(!canUndo())return;
    future.push(commands.pop());run=R.replay(run.seed,commands);selected=null;hintAction=null;hintBusy=false;
    announce('完整恢复了棋盘、电荷、稳定度和联动状态。');render();save();
  }
  function directional(direction){execute(selected?selected+':'+direction:direction);}
  function arm(kind){
    if(run.phase!=='room')return;
    const ability=R.availableSkills(run).find(r=>r.skill===kind);
    if(!ability||run.energy<ability.cost){announce('电荷不足，先归位充能，或撤销调整路线。');return;}
    selected=selected===kind?null:kind;hintAction=null;render();
    announce(selected?kind==='pull'?'向晶核所在方向牵引；研究员反向后退，高亮为后退落点。':kind==='pulse'?'向两格外的晶核发出脉冲；高亮为晶核落点，你留在原位。':'已选择相位棱镜，高亮为两格外的落点，请选择方向。':'已回到普通移动。');
  }
  function hud(){
    const owned=run.relics.map(R.relic),best=Math.max(0,...profile.records.filter(r=>r.won).map(r=>r.score));
    return `<aside class="run-sidebar"><section class="panel run-status-panel"><div class="kicker">本次远征 / ${esc(run.seed)}</div><div class="run-score-block"><div class="run-summary-title">第 ${run.floor+1} 房 / 4</div><span class="run-score-label">共鸣得分</span><b class="run-score" id="run-score">${run.score}</b></div><div><div class="run-meter-label"><span>稳定度</span><b id="run-stability">${run.stability} / ${run.maxStability}</b></div><div class="run-meter ${run.stability<25?'low':''}"><span style="width:${run.stability}%"></span></div></div><div><div class="run-meter-label"><span>电荷</span><b id="run-energy">${run.energy} / ${R.energyCap(run)}</b></div><div class="run-meter energy"><span style="width:${run.energy/R.energyCap(run)*100}%"></span></div></div><p class="run-resource-note">普通操作消耗稳定度。每颗晶核首次归位 +1 电荷、+12 分；协议可改变收益。完成房间恢复 20 稳定度。</p><div class="run-path" aria-label="远征进度">${[0,1,2,3].map(i=>`<span class="${i<run.roomsCleared?'done':i===run.floor?'active':''}">${i<run.roomsCleared?'✓':'0'+(i+1)}</span>`).join('')}</div></section><section class="panel run-build-panel"><div class="run-build-title"><span>已装配协议</span><span>${owned.length} / 4</span></div>${owned.length?owned.map(r=>`<div class="run-owned"><strong><i>${r.icon}</i>${r.name}</strong><p>${r.desc}</p></div>`).join(''):'<p class="fine">每完成一个房间，选择一项成长。协议仅在本次远征生效。</p>'}<div class="run-best">本机最高通关分：<b>${best||'等待首次远征'}</b></div></section></aside>`;
  }
  function draft(){
    return `<section class="run-stage"><div class="eyebrow">${run.floor===0?'CHOOSE YOUR FIRST PROTOCOL':'DRAFT / GROW YOUR BUILD'}</div><h2>${run.floor===0?'先选你的起手式':'下一次归位，会有什么不同？'}</h2><p>${run.floor===0?'每个技能都能改变站位规则。选一张，开始四房间远征。':'三选一，加入当前构筑。试着围绕已有技能补充充能、续航或联动。'}</p><div class="run-choices">${R.offers(run).map(id=>{const r=R.relic(id);return `<button class="protocol-card" data-r-command="pick:${id}"><span class="type">${r.type} / ${r.tag}</span><span class="protocol-glyph">${r.icon}</span><strong>${r.name}</strong><span class="desc">${r.desc}</span><span class="choose">装配此协议 →</span></button>`;}).join('')}</div><p class="run-tip">${run.floor===0?'例：归位充能 → 牵引解围 → 下一次成长选择回收外壳，让技能更频繁。':'同一种子的协议选项固定，刷新不会重抽。电荷、稳定度和已获得协议带入下一房。'}</p>${how()}</section>`;
  }
  function routes(){
    const level=R.roomLevel(run.seed,run.floor);
    return `<section class="run-stage"><div class="eyebrow">SECTOR / 0${run.floor+1}</div><h2>${level.name} · 选择区域强度</h2><p>先观察棋盘，再结合当前协议和稳定度决定。两条路线使用相同棋盘，改变资源压力与收益。</p><div class="route-preview" role="img" aria-label="本房间棋盘预览" style="grid-template-columns:repeat(${level.map[0].length},1fr)">${[...level.map.join('')].map(c=>`<span class="${c==='#'?'wall':c==='@'?'player':c==='$'?'crate':c==='.'?'goal':''}"></span>`).join('')}</div><div class="run-choices routes">${Object.entries(R.ROUTES).map(([id,r])=>`<button class="protocol-card route-card ${id}" data-r-command="route:${id}"><span class="type">${id==='steady'?'平稳推进':'高分挑战'}</span><span class="protocol-glyph">${id==='steady'?'◌':'ϟ'}</span><strong>${r.name}</strong><span class="desc">${r.desc}</span><span class="choose">进入区域 →</span></button>`).join('')}</div><p class="run-tip">已装配：${run.relics.map(id=>R.relic(id).name).join(' + ')}。房间内可以完整撤销，无需为试错额外付费。</p></section>`;
  }
  function boardHtml(){
    const b=run.room.board,previews=new Map();
    if(selected&&run.phase==='room')for(const d of Object.keys(C.DIRS)){
      const p=R.preview(run,selected,d);if(p.valid)previews.set(selected==='pull'?p.board.player:p.to,arrows[d]);
    }
    const direction=hintAction?.split(':').pop(),hint=direction?C.adjacent(b,b.player,direction):-1;
    const effect=run.lastEffects.find(e=>['pull','blink','pulse'].includes(e.type));
    return `<div id="rogue-board" class="board run-board ${b.won?'won':''}" tabindex="0" role="group" aria-label="共鸣远征棋盘" data-player="${b.player}" data-crates="${b.crates.join(',')}" style="grid-template-columns:repeat(${b.width},1fr);--cols:${b.width};--rows:${b.height}">${Array.from({length:b.width*b.height},(_,i)=>{
      const wall=b.walls.includes(i),goal=b.targets.includes(i),gem=b.crates.includes(i),player=b.player===i,charged=run.room.charged.includes(b.crates.indexOf(i));
      const description=wall?'墙体':player?'研究员':gem?goal?'已归位晶核':'晶核':goal?'目标位':'地面';
      return `<div class="cell ${wall?'wall':''} ${goal?'goal':''} ${charged?'target-charged':''} ${previews.has(i)?'preview':''} ${i===hint?'hint-cell':''}" role="img" aria-label="${Math.floor(i/b.width)+1}行${i%b.width+1}列：${description}">${gem?'<span class="gem"></span>':''}${player?'<span class="person"></span>':''}${previews.has(i)?`<span class="preview-symbol">${previews.get(i)}</span>`:''}${effect?.at===i?'<span class="skill-ring"></span>':''}</div>`;
    }).join('')}${effect?`<svg class="run-beam ${effect.type}" aria-hidden="true" viewBox="0 0 ${b.width} ${b.height}" preserveAspectRatio="none"><line x1="${effect.from%b.width+.5}" y1="${Math.floor(effect.from/b.width)+.5}" x2="${effect.at%b.width+.5}" y2="${Math.floor(effect.at/b.width)+.5}" /></svg>`:''}</div>`;
  }
  function effects(){return `<div class="run-effects">${run.lastEffects.map(e=>e.type==='dock'?`<span class="run-effect">首次归位 · 电荷 +${e.amount} / 得分 +12</span>`:e.type==='echo'?`<span class="run-effect">回声联动 · 电荷 +1 / 得分 +10</span>`:e.type==='heal'?`<span class="run-effect">生长晶簇 · 稳定 +${e.amount}</span>`:e.type==='energy'?`<span class="run-effect">回收外壳 · 电荷 +${e.amount}</span>`:'').join('')}</div>`;}
  function room(){
    const b=run.room.board,skills=R.availableSkills(run),clear=run.lastEffects.find(e=>e.type==='clear');
    return `<section class="run-stage"><div class="run-room-header"><div><div class="eyebrow">CHAMBER / 0${run.floor+1}</div><h2>${run.room.level.name}</h2></div><span class="route-chip ${run.room.route}">${R.ROUTES[run.room.route].name} · ${b.moves} 步</span></div><p class="run-room-subtitle">${b.targets.filter(t=>b.crates.includes(t)).length} / ${b.targets.length} 晶核归位 · 本房间技能 ${run.room.skills} 次</p>${boardHtml()}${effects()}<div class="run-skillbar">${skills.map((s,i)=>`<button class="run-skill ${selected===s.skill?'active':''}" data-r-skill="${s.skill}" aria-pressed="${selected===s.skill}" ${run.phase!=='room'||run.energy<s.cost?'disabled':''}><span class="hotkey">${i+1}</span>${s.icon} ${s.name}<small>${s.cost} 电荷 · ${selected===s.skill?'选择方向施放':'点击选择方向'}</small></button>`).join('')}</div><div class="run-input-hint">${selected?'高亮格为有效落点；方向键施放，Esc 取消。':hintAction?'建议：'+(hintAction.includes(':')?R.availableSkills(run).find(s=>s.skill===hintAction.split(':')[0])?.name+' → ':'移动 → ')+names[hintAction.split(':').pop()]:'普通移动不消耗电荷。先选技能，再按方向键或方向按钮。'}</div><div class="run-controls"><div class="run-buttons"><button id="run-undo" ${canUndo()?'':'disabled'}>↶ 撤销</button><button id="run-redo" ${future.length&&run.phase==='room'?'':'disabled'}>↷ 重做</button><button id="run-hint" ${run.phase==='room'&&!hintBusy?'':'disabled'}>${hintBusy?'思考中…':'思路提示'}</button><button id="run-cancel" ${selected?'':'disabled'}>取消技能</button></div><div class="dpad" aria-label="远征方向控制">${['up','left','down','right'].map(d=>`<button data-r-dir="${d}" aria-label="远征向${names[d]}" ${run.phase==='room'?'':'disabled'}>${arrows[d]}</button>`).join('')}</div></div>${run.phase==='cleared'?`<div class="run-clear"><h3>房间共鸣完成</h3><p>通关得分 +${clear?.amount||0} · 稳定度恢复 ${clear?.recovery||20}（上限 ${run.maxStability}）</p><button class="primary" data-r-command="advance">${run.floor===3?'完成远征，记录成绩 →':'选择下一项成长 →'}</button><p>继续前仍可撤销。确认继续后锁定本房间结算。</p></div>`:''}${run.phase==='failed'?'<div class="run-clear"><h3>稳定度耗尽</h3><p>可以撤销找回局面，或带着新思路开启下一次远征。</p><button id="run-retry" class="primary">同种子再试</button></div>':''}${how()}</section>`;
  }
  function end(){
    return `<section class="run-stage"><div class="eyebrow">EXPEDITION COMPLETE / ${esc(run.seed)}</div><h2>这次构筑，完成了四次共鸣。</h2><div class="run-end-score">${run.score}</div><p>本机共鸣得分 · 下次换一种起手式，看看同一条路线会有什么不同。</p><div class="run-end-details"><div><b>4 / 4</b><span>房间完成</span></div><div><b>${run.totalMoves}</b><span>总操作</span></div><div><b>${run.totalSkills}</b><span>技能施放</span></div></div><div class="run-end-build">${run.relics.map(id=>`<span>${R.relic(id).icon} ${R.relic(id).name}</span>`).join('')}</div><div class="run-end-actions"><button id="run-retry" class="primary">同种子，换个构筑</button><button id="run-another">开启随机远征</button><button id="run-copy-end">复制这次挑战</button></div><p class="run-tip">种子决定房间和可选协议，你的选择决定技能与资源。成绩保存在本机，不设线上排行榜。</p></section>`;
  }
  function how(){return '<details class="run-how"><summary>远征操作与规则</summary><ol><li>开局选技能，随后选择稳态或过载区域。每完成一房，再三选一成长。</li><li>方向键 / WASD 普通移动；数字键 1 / 2 / 3 选择已装配技能，再按方向施放；Esc 取消。</li><li>Z 撤销，Y 重做，H 获取思路提示。触屏可滑动棋盘或点击方向按钮。</li><li>稳定度耗尽时仍可撤销。成功归位可充能，每颗晶核在同一房间只结算一次。</li><li>房间内撤销会完整恢复资源和联动；继续到下一房后不能撤销上一房。</li></ol></details>';}
  function render(){
    $('expedition-content').innerHTML=`<div class="run-layout">${hud()}${run.phase==='draft'?draft():run.phase==='route'?routes():run.phase==='victory'?end():room()}</div>`;
    $('expedition-content').dataset.phase=run.phase;
    $('expedition-content').dataset.seed=run.seed;
    $('expedition-content').dataset.owned=run.relics.join(',');
    $('expedition-content').dataset.floor=String(run.floor);
    document.body.dataset.expeditionPhase=run.phase;
  }
  function hint(){
    if(run.phase!=='room'||hintBusy)return;
    hintBusy=true;selected=null;const captured=run;render();announce('正在结合当前电荷和已装配技能寻找路线…');
    setTimeout(()=>{
      if(run!==captured){hintBusy=false;return;}
      let result=R.solveRoom(run);
      if(result.status==='limit'){
        const ordinary=C.solve(run.room.board);let check=run;
        if(ordinary){for(const a of ordinary){const next=R.command(check,a);if(!next.changed||next.state.phase==='failed'){check=null;break;}check=next.state;}if(check?.phase==='cleared')result={status:'solved',path:ordinary};}
      }
      hintBusy=false;hints++;hintAction=result.path?.[0]||null;render();save();
      announce(hintAction?'思路提示：'+(hintAction.includes(':')?R.availableSkills(run).find(s=>s.skill===hintAction.split(':')[0]).name+'，向':'向')+names[hintAction.split(':').pop()]+'。只给出一步，你仍可选择其他路线。':result.status==='limit'?'暂未找到路线。可先撤销调整站位；搜索上限不代表局面无解。':'当前资源下未找到归位路线。请撤销几步，重新安排技能与站位。');
    },35);
  }
  async function share(){
    const value=location.protocol==='file:'?'晶核归位 · 共鸣远征，种子 '+run.seed:location.origin+location.pathname+'?mode=expedition&seed='+encodeURIComponent(run.seed);
    try{await navigator.clipboard.writeText(value);announce('已复制挑战'+(location.protocol==='file:'?'种子':'链接')+'。');}
    catch(_){$('run-seed').value=run.seed;$('run-seed').focus();$('run-seed').select();announce('种子 '+run.seed+' 已选中，可手动复制给朋友。');}
  }
  $('expedition-content').addEventListener('click',e=>{
    const target=e.target.closest('button');if(!target||target.disabled)return;
    if(target.dataset.rCommand)execute(target.dataset.rCommand);
    else if(target.dataset.rSkill)arm(target.dataset.rSkill);
    else if(target.dataset.rDir)directional(target.dataset.rDir);
    else if(target.id==='run-undo')undo();
    else if(target.id==='run-redo'&&future.length)execute(future[future.length-1],true);
    else if(target.id==='run-cancel'){selected=null;render();announce('已回到普通移动。');}
    else if(target.id==='run-hint')hint();
    else if(target.id==='run-retry')requestStart(run.seed);
    else if(target.id==='run-another')requestStart(randomSeed());
    else if(target.id==='run-copy-end')share();
  });
  $('mode-expedition').onclick=()=>setMode('expedition');$('mode-classic').onclick=()=>setMode('classic');
  $('run-start').onclick=()=>requestStart($('run-seed').value);$('run-random').onclick=()=>requestStart(randomSeed());$('run-daily').onclick=()=>requestStart('DAILY-'+dailySeed());$('run-share').onclick=share;
  $('run-confirm-yes').onclick=()=>{$('run-confirm').close();start(pendingSeed);};$('run-confirm-no').onclick=()=>{$('run-confirm').close();pendingSeed=null;};
  document.addEventListener('keydown',e=>{
    if(mode!=='expedition'||$('run-confirm').open||['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)||e.altKey)return;
    const key=e.key.toLowerCase(),dirs={arrowup:'up',w:'up',arrowright:'right',d:'right',arrowdown:'down',s:'down',arrowleft:'left',a:'left'};
    if((e.ctrlKey||e.metaKey)&&!['z','y'].includes(key))return;
    if(dirs[key]&&run.phase==='room'){e.preventDefault();if(!e.repeat)directional(dirs[key]);}
    else if(key==='z'){e.preventDefault();if(e.shiftKey&&future.length&&run.phase==='room')execute(future[future.length-1],true);else undo();}
    else if(key==='y'&&future.length&&run.phase==='room'){e.preventDefault();execute(future[future.length-1],true);}
    else if(key==='h'){e.preventDefault();hint();}
    else if(key==='escape'){selected=null;render();announce('已取消技能，回到普通移动。');}
    else if(['1','2','3'].includes(key)){const ability=R.availableSkills(run)[Number(key)-1];if(ability){e.preventDefault();arm(ability.skill);}}
  });
  let gesture=null;
  $('expedition-content').addEventListener('pointerdown',e=>{
    const b=e.target.closest('#rogue-board');if(!b||e.pointerType==='mouse'||e.isPrimary===false||run.phase!=='room')return;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY};b.setPointerCapture(e.pointerId);e.preventDefault();
  });
  $('expedition-content').addEventListener('pointerup',e=>{
    if(!gesture||e.pointerId!==gesture.id)return;const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;
    if(Math.max(Math.abs(dx),Math.abs(dy))>=24)directional(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');
  });
  $('expedition-content').addEventListener('pointercancel',()=>{gesture=null;});
  window.addEventListener('pagehide',save);
  let savedMode=null;try{savedMode=localStorage.getItem('crystal-lab-mode');}catch(_){}
  $('run-seed').value=run.seed;render();setMode(query.get('mode')||savedMode||'expedition');save();
})();
