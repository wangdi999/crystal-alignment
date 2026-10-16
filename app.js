(function(){
  'use strict';
  const C=Crystal,$=id=>document.getElementById(id),KEY='crystal-lab-v2';
  const names={up:'上',right:'右',down:'下',left:'左'},arrows={up:'↑',right:'→',down:'↓',left:'←'};
  const number=value=>Number.isSafeInteger(value)&&value>=0&&value<=1000000?value:0;
  const newStats=()=>({invalid:0,undos:0,redos:0,restarts:0,hints:0});
  let raw=null;
  try{raw=JSON.parse(localStorage.getItem(KEY));}catch(_){}
  const progress={version:2,current:1,completed:{},unassisted:{},sessions:{},attempts:[],sound:false};
  function validRecord(record){return record&&typeof record==='object'&&C.LEVELS.some(l=>l.id===record.level)&&Number.isSafeInteger(record.moves)&&record.moves>0&&Number.isSafeInteger(record.pushes)&&record.pushes>0&&record.pushes<=record.moves&&record.moves<=5000;}
  function cleanRecord(record){return {level:record.level,moves:record.moves,pushes:record.pushes,seconds:number(record.seconds),hints:number(record.hints),undos:number(record.undos),redos:number(record.redos),restarts:number(record.restarts),invalid:number(record.invalid),time:typeof record.time==='string'&&/^\d{4}-\d\d-\d\dT/.test(record.time)?record.time.slice(0,30):''};}
  if(raw&&typeof raw==='object'){
    if(C.LEVELS.some(l=>l.id===raw.current))progress.current=raw.current;
    for(const level of C.LEVELS){
      for(const kind of ['completed','unassisted']){
        const record=raw[kind]?.[level.id];
        if(validRecord(record)&&record.level===level.id)progress[kind][level.id]=cleanRecord(record);
      }
      const session=raw.sessions?.[level.id];
      if(session&&typeof session==='object')progress.sessions[level.id]=session;
    }
    if(Array.isArray(raw.attempts))progress.attempts=raw.attempts.filter(validRecord).slice(-200).map(cleanRecord);
    progress.sound=raw.sound===true;
  }
  let index=0,state,history=[],path=[],future=[],stats,elapsed=0,clock=performance.now(),wasVisible=!document.hidden,hintDirection=null,recent=-1,modalOpen=false,audio=null;
  function tick(){
    const now=performance.now();
    if(state&&!state.won&&wasVisible)elapsed+=Math.max(0,now-clock);
    clock=now;wasVisible=!document.hidden;
  }
  function save(){
    tick();
    if(state)progress.sessions[state.levelId]={path:[...path],future:[...future],stats:{...stats},elapsed};
    try{localStorage.setItem(KEY,JSON.stringify(progress));$('save-note').textContent='进度已自动保存';}
    catch(_){$('save-note').textContent='存储不可用，当前仍可游玩';}
  }
  function notice(value,tone='normal'){$('notice').textContent=value;$('notice').dataset.tone=tone;}
  function sound(type){
    if(!progress.sound)return;
    try{
      if(!audio)audio=new (window.AudioContext||window.webkitAudioContext)();
      if(audio.state==='suspended')audio.resume().catch(()=>{});
      const notes=type==='win'?[440,554,659]:type==='dock'?[660,880]:type==='push'?[310]:type==='blocked'?[130]:[230];
      notes.forEach((frequency,i)=>{
        const oscillator=audio.createOscillator(),gain=audio.createGain(),t=audio.currentTime+i*.09;
        oscillator.type='sine';oscillator.frequency.value=frequency;
        gain.gain.setValueAtTime(.0001,t);gain.gain.exponentialRampToValueAtTime(.045,t+.008);gain.gain.exponentialRampToValueAtTime(.0001,t+.12);
        oscillator.connect(gain);gain.connect(audio.destination);oscillator.start(t);oscillator.stop(t+.13);
      });
    }catch(_){}
  }
  function closeModal(){
    $('modal').innerHTML='';modalOpen=false;
    $('board').focus({preventScroll:true});
  }
  function begin(i){
    if(state)save();
    index=i;progress.current=C.LEVELS[i].id;state=C.load(C.LEVELS[i]);history=[];path=[];future=[];stats=newStats();elapsed=0;clock=performance.now();hintDirection=null;recent=-1;
    const session=progress.sessions[state.levelId];
    const restored=session&&C.replay(C.LEVELS[i],session.path);
    if(restored){
      state=restored.state;history=restored.history;path=[...session.path];
      const proposed=Array.isArray(session.future)&&session.future.length<=5000?session.future:[];
      future=C.replay(C.LEVELS[i],[...path,...[...proposed].reverse()])?[...proposed]:[];
      for(const key of Object.keys(stats))stats[key]=number(session.stats?.[key]);
      elapsed=typeof session.elapsed==='number'&&Number.isFinite(session.elapsed)?Math.max(0,Math.min(session.elapsed,86400000)):0;
    }
    closeModal();render();save();
    if(state.won)notice('本关已完成。可以撤销回看，或选择下一关。','success');
    else if(restored&&path.length)notice('已恢复上次的棋盘。继续你的归位实验。');
    else notice(i===0?'向右推动一次，让晶核进入圆形目标位 →':'先观察目标与通路，再开始移动。');
    if(C.deadlocks(state).length)notice('晶核处于无法归位的死位，按 Z 撤销或重开。','danger');
  }
  function render(){
    const level=C.LEVELS[index],dead=C.deadlocks(state),docked=state.targets.filter(t=>state.crates.includes(t)).length;
    $('progress').textContent=`${Object.keys(progress.completed).length} / 6 完成`;
    $('level-id').textContent=`${level.group} / 0${level.id}`;
    $('level-name').textContent=level.name;$('subtitle').textContent=level.subtitle;$('intent').textContent=level.intent;
    $('moves').textContent=state.moves;$('pushes').textContent=state.pushes;$('docked').textContent=`${docked}/${state.targets.length}`;
    $('undo').disabled=!history.length;$('redo').disabled=!future.length||state.won;$('hint').disabled=state.won;
    $('sound').textContent=progress.sound?'声音：开':'声音：关';$('sound').setAttribute('aria-pressed',String(progress.sound));$('sound').classList.toggle('sound-on',progress.sound);
    $('levels').innerHTML=C.LEVELS.map((l,i)=>{
      const best=progress.completed[l.id],alone=progress.unassisted[l.id],active=i===index;
      return `${i===0||i===3?`<div class="level-group">${l.group}</div>`:''}<button class="level-button ${active?'active':''}" data-level="${i}" ${active?'aria-current="true"':''}><b>0${l.id}</b><span>${l.name}<small>${alone?.moves===l.shortest?'★ 无提示最优解':best?'✓ 已归位':progress.sessions[l.id]?.path?.length?'继续实验':'等待实验'}</small></span></button>`;
    }).join('');
    $('level-select').innerHTML=C.LEVELS.map((l,i)=>`<option value="${i}" ${i===index?'selected':''}>0${l.id} · ${l.name}${progress.completed[l.id]?' ✓':''}</option>`).join('');
    const hint=hintDirection?C.adjacent(state,state.player,hintDirection):index===0&&state.moves===0?C.adjacent(state,state.player,'right'):-1;
    $('board').style.gridTemplateColumns=`repeat(${state.width},1fr)`;
    $('board').classList.toggle('won',state.won);
    $('board').dataset.player=state.player;$('board').dataset.crates=state.crates.join(',');
    $('board').innerHTML=Array.from({length:state.width*state.height},(_,i)=>{
      const wall=state.walls.includes(i),goal=state.targets.includes(i),gem=state.crates.includes(i),player=state.player===i;
      const label=wall?'墙体':player?goal?'目标位上的研究员':'研究员':gem?goal?'已归位晶核':dead.includes(i)?'无法归位的晶核':'晶核':goal?'目标位':'地面';
      return `<div class="cell ${wall?'wall':''} ${goal?'goal':''} ${dead.includes(i)?'dead':''} ${i===recent?'recent':''} ${i===hint?'hint-cell':''}" role="img" aria-label="${Math.floor(i/state.width)+1}行${i%state.width+1}列：${label}">${gem?'<span class="gem"></span>':''}${player?'<span class="person"></span>':''}${i===hint&&hintDirection?`<span class="hint-arrow">${arrows[hintDirection]}</span>`:''}</div>`;
    }).join('');
    const best=progress.completed[level.id],alone=progress.unassisted[level.id];
    $('observations').innerHTML=[['最佳移动',best?`${best.moves} 步 / ${best.pushes} 推`:'等待归位'],['无提示最佳',alone?`${alone.moves} 步`:'尚无记录'],['撤销 / 重做',`${stats.undos} / ${stats.redos}`],['提示 / 重开',`${stats.hints} / ${stats.restarts}`]].map(([label,value])=>`<div class="observation"><span>${label}</span><strong>${value}</strong></div>`).join('');
  }
  function moved(direction,isRedo=false){
    if(modalOpen||path.length>=5000)return;
    const result=C.move(state,direction);hintDirection=null;recent=-1;
    if(!result.changed){stats.invalid++;render();notice(result.reason);sound('blocked');save();return;}
    tick();const old=state;history.push(old);path.push(direction);state=result.state;
    if(isRedo){future.pop();stats.redos++;}else future=[];
    if(result.pushed)recent=state.crates.find(c=>!old.crates.includes(c));
    tick();render();
    if(C.deadlocks(state).length)notice('这颗晶核进入了无法归位的死位。按 Z 撤销，换个方向。','danger');
    else if(result.pushed&&state.targets.includes(recent))notice('一颗晶核已归位。留意其他晶核的推动路线。','success');
    else notice(result.pushed?'晶核已推动。下一次推动，需要站在哪里？':'');
    sound(result.pushed?state.targets.includes(recent)?'dock':'push':'move');
    if(state.won)complete();else save();
  }
  function undo(){
    if(!history.length)return;
    closeModal();tick();future.push(path.pop());state=history.pop();stats.undos++;hintDirection=null;recent=-1;render();save();notice('已恢复上一步。按 Y 可以重做。');
  }
  function restart(){
    closeModal();tick();state=C.load(C.LEVELS[index]);history=[];path=[];future=[];stats.restarts++;hintDirection=null;recent=-1;render();save();notice('棋盘已重置。');
  }
  function hint(){
    if(modalOpen||state.won)return;
    stats.hints++;
    const result=C.search(state);hintDirection=result.path?.[0]||null;recent=-1;render();save();
    if(hintDirection)notice(`下一步可以向${names[hintDirection]}移动 ${arrows[hintDirection]}。只提示一步，后续由你决定。`);
    else if(result.status==='limit')notice('搜索达到上限，暂未找到路线。可以先撤销几步重新观察。');
    else notice('当前局面无法归位。撤销最近的推动，或重开本关。','danger');
  }
  function complete(){
    const level=C.LEVELS[index];
    const record={level:state.levelId,moves:state.moves,pushes:state.pushes,seconds:Math.max(1,Math.round(elapsed/1000)),...stats,time:new Date().toISOString()};
    progress.attempts.push(record);progress.attempts=progress.attempts.slice(-200);
    for(const kind of ['completed',...(stats.hints===0?['unassisted']:[])]){
      const best=progress[kind][state.levelId];
      if(!best||record.moves<best.moves||(record.moves===best.moves&&record.pushes<best.pushes))progress[kind][state.levelId]=record;
    }
    render();save();notice('晶核已全部归位。','success');sound('win');modalOpen=true;
    const perfect=state.moves===level.shortest&&stats.hints===0,all=Object.keys(progress.completed).length===C.LEVELS.length;
    const next=C.LEVELS.findIndex((l,i)=>i>index&&!progress.completed[l.id]);
    const nextIndex=next>=0?next:C.LEVELS.findIndex(l=>!progress.completed[l.id]);
    const badge=perfect?'★ 无提示最优解':stats.hints?'借助提示完成':'独立归位完成';
    $('modal').innerHTML=`<div class="dialog-backdrop"><section class="dialog" role="dialog" aria-modal="true" aria-labelledby="win-title"><div class="eyebrow">RESONANCE COMPLETE</div><h2 id="win-title">${all?'六次实验，全部共鸣':'晶核已全部归位'}</h2><span class="badge">${badge}</span><p>${state.moves} 次移动 · ${state.pushes} 次推动 · ${record.seconds} 秒活跃操作时间</p><p>本关最短移动为 ${level.shortest} 步。${state.moves>level.shortest?'还可以试试更简洁的路线。':'每一步都恰到好处。'}</p><p>${all?'可以自由重玩，寻找无提示的最优路线。':`已完成 ${Object.keys(progress.completed).length} / 6 个实验。`}</p><div class="row"><button id="next" class="primary">${nextIndex<0?'重新挑战本关':'进入下一关 →'}</button><button id="review">查看棋盘</button></div></section></div>`;
    $('next').onclick=()=>{if(nextIndex<0)restart();else begin(nextIndex);};$('review').onclick=closeModal;$('next').focus();
  }
  $('levels').onclick=e=>{const b=e.target.closest('[data-level]');if(b)begin(Number(b.dataset.level));};
  $('level-select').onchange=e=>begin(Number(e.target.value));
  document.querySelectorAll('[data-dir]').forEach(b=>b.onclick=()=>moved(b.dataset.dir));
  $('undo').onclick=undo;$('redo').onclick=()=>{if(future.length)moved(future[future.length-1],true);};$('restart').onclick=restart;$('hint').onclick=hint;
  $('sound').onclick=()=>{progress.sound=!progress.sound;render();save();sound('dock');};
  $('export').onclick=()=>{
    save();const url=URL.createObjectURL(new Blob([JSON.stringify({...progress,note:'本机游玩记录；不是多人测试。'},null,2)],{type:'application/json'}));
    const link=document.createElement('a');link.href=url;link.download='晶核归位-我的实验记录.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  };
  let lastKey=0;
  document.addEventListener('keydown',e=>{
    if($('classic-screen')?.hidden)return;
    const key=e.key.toLowerCase();
    if(modalOpen){
      if(key==='escape'){e.preventDefault();closeModal();}
      if(key==='tab'){
        const buttons=[...$('modal').querySelectorAll('button')],first=buttons[0],last=buttons[buttons.length-1];
        if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}
        else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
      }
      return;
    }
    if(['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.altKey)return;
    const dirs={arrowup:'up',w:'up',arrowright:'right',d:'right',arrowdown:'down',s:'down',arrowleft:'left',a:'left'};
    if((e.ctrlKey||e.metaKey)&&key!=='z'&&key!=='y')return;
    if(dirs[key]){e.preventDefault();if(e.repeat&&performance.now()-lastKey<100)return;lastKey=performance.now();moved(dirs[key]);}
    else if(key==='z'){e.preventDefault();if(e.shiftKey)$('redo').click();else undo();}
    else if(key==='y'){e.preventDefault();$('redo').click();}
    else if(key==='r'){e.preventDefault();restart();}
    else if(key==='h'){e.preventDefault();hint();}
  });
  let gesture=null;
  $('board').addEventListener('pointerdown',e=>{
    if(e.pointerType==='mouse'||e.isPrimary===false||modalOpen)return;
    gesture={id:e.pointerId,x:e.clientX,y:e.clientY};$('board').setPointerCapture(e.pointerId);e.preventDefault();
  });
  $('board').addEventListener('pointerup',e=>{
    if(!gesture||gesture.id!==e.pointerId)return;
    const dx=e.clientX-gesture.x,dy=e.clientY-gesture.y;gesture=null;
    if(Math.max(Math.abs(dx),Math.abs(dy))<24)return;
    moved(Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up');
  });
  $('board').addEventListener('pointercancel',()=>{gesture=null;});
  // 页面进入后台时停止计时，避免把离开网页的时间算作解题时间。
  document.addEventListener('visibilitychange',save);
  window.addEventListener('pagehide',save);
  window.addEventListener('crystal:sound',e=>sound(e.detail));
  begin(C.LEVELS.findIndex(l=>l.id===progress.current));
})();
