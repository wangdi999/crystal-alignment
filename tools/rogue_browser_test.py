"""通过实际单文件与真实点击验证远征成长、技能、存档和模式隔离。"""
import json,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
local=ROOT/'.test-tools'
if local.exists():sys.path.insert(0,str(local))
from playwright.sync_api import sync_playwright
URL=(ROOT/'dist/crystal-alignment.html').as_uri()+'?mode=expedition&seed=BUILD-0'
passed=[];errors=[]
def check(value,name):
    assert value,name
    passed.append(name);print('通过：'+name,flush=True)
READ="""() => {const s=JSON.parse(localStorage.getItem('crystal-expedition-v1')).current;const r=CrystalRogue.replay(s.seed,s.commands);return {saved:s,run:r,offers:CrystalRogue.offers(r)}}"""
with sync_playwright() as pw:
    browser=pw.chromium.launch(executable_path=r'C:\Program Files\Google\Chrome\Application\chrome.exe',headless=True)
    context=browser.new_context(viewport={'width':1440,'height':1080},accept_downloads=True)
    context.set_offline(True);page=context.new_page()
    page.on('pageerror',lambda e:errors.append(str(e)))
    page.on('console',lambda m:errors.append(m.text) if m.type=='error' else None)
    page.goto(URL);page.wait_for_load_state('load')
    def state():return page.evaluate(READ)
    def click_command(command):page.locator(f'[data-r-command="{command}"]').click()
    def act(action):
        parts=action.split(':')
        if len(parts)>1:page.locator(f'[data-r-skill="{parts[0]}"]').click()
        page.get_by_role('button',name='远征向'+{'up':'上','right':'右','down':'下','left':'左'}[parts[-1]],exact=True).click()
    check(not page.locator('#expedition-screen').is_hidden() and page.locator('.protocol-card').count()==3,'离线进入远征，开局三种主动技能可选')
    page.screenshot(path=str(ROOT/'artifacts/10-expedition-draft.png'),full_page=True)
    click_command('pick:phase');check(state()['run']['relics']==['phase'],'实际选择相位棱镜作为起手式')
    click_command('route:steady');check(state()['run']['phase']=='room','实际选择路线并进入房间')
    classic_before=page.locator('#moves').inner_text()
    # 只读取状态并搜索合法技能站位，全部状态变化都通过控件完成。
    setup=page.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('crystal-expedition-v1')).current,R=CrystalRogue;const start=R.replay(s.seed,s.commands),q=[{r:start,p:[]}],seen=new Set();for(let h=0;h<q.length&&h<1000;h++){const {r,p}=q[h];for(const d of Object.keys(Crystal.DIRS))if(R.preview(r,'blink',d).valid)return [...p,'blink:'+d];for(const d of Object.keys(Crystal.DIRS)){const a=R.command(r,d);if(!a.changed||a.state.phase!=='room')continue;const k=a.state.room.board.player+'|'+a.state.room.board.crates.join(',');if(!seen.has(k)){seen.add(k);q.push({r:a.state,p:[...p,d]})}}}return null}""")
    check(bool(setup),'能够从合法房间状态找到可执行技能')
    for action in setup[:-1]:act(action)
    before=state()['run'];act(setup[-1]);after=state()['run']
    check(after['totalSkills']==before['totalSkills']+1 and after['energy']==before['energy']-2,'相位技能真实施放并扣除电荷')
    check(page.locator('#moves').inner_text()==classic_before,'远征按键与操作不会改变隐藏的经典棋盘')
    page.locator('#run-undo').click();check(state()['run']==before,'撤销完整恢复技能前的全部资源与位置')
    page.reload();check(state()['run']==before,'刷新恢复本局并保留重做记录')
    page.locator('#run-redo').click();check(state()['run']==after,'刷新后重做技能得到相同结果')
    page.locator('[data-r-skill="blink"]').click();check(page.locator('#rogue-board .preview').count()>0,'技能瞄准显示有效落点预览')
    page.keyboard.press('Escape');check(page.locator('#rogue-board .preview').count()==0,'Esc 取消技能瞄准')
    page.screenshot(path=str(ROOT/'artifacts/11-expedition-room.png'),full_page=True)
    for floor in range(4):
        if floor>0:
            before_draft=state();offers=before_draft['offers']
            page.reload();check(state()['offers']==offers,f'第 {floor+1} 房协议选项刷新不重抽')
            pick=next((x for x in ['recycler','superconductor','echo','growth','precision','afterglow'] if x in offers),offers[0])
            click_command('pick:'+pick);click_command('route:overload' if floor%2 else 'route:steady')
        path=page.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('crystal-expedition-v1')).current,r=CrystalRogue.replay(s.seed,s.commands);let p=CrystalRogue.solveRoom(r,18000);if(p.path)return p.path;return Crystal.solve(r.room.board)}""")
        check(bool(path),f'第 {floor+1} 房有可执行的资源内归位路线')
        for action in path:act(action)
        check(state()['run']['phase']=='cleared',f'第 {floor+1} 房通过真实操作完成')
        if floor==0:
            cleared=state()['run'];page.locator('#run-undo').click();check(state()['run']['phase']=='room','房间结算确认前可撤销最后一步')
            page.locator('#run-redo').click();check(state()['run']==cleared,'重做不会叠加结算奖励')
        click_command('advance')
        if floor<3:check(state()['run']['phase']=='draft',f'第 {floor+1} 房后进入成长三选一')
    check(state()['run']['phase']=='victory' and len(state()['run']['relics'])==4,'完整四房远征形成四协议构筑并结算')
    page.screenshot(path=str(ROOT/'artifacts/12-expedition-victory.png'),full_page=True)
    score=state()['run']['score'];page.reload();check(state()['run']['score']==score and state()['run']['phase']=='victory','完整远征成绩与终局刷新保留')
    page.locator('#run-retry').click();check(state()['run']['phase']=='draft' and len(state()['run']['relics'])==0,'新周目清空局内成长并保留种子')
    check(page.locator('.run-best').inner_text().find(str(score))>=0,'本机通关最高分保留')
    page.locator('#mode-classic').click();page.get_by_role('button',name='向右',exact=True).click()
    check(page.get_by_role('dialog').count()==1,'经典模式仍可正常通关')
    page.get_by_role('button',name='查看棋盘',exact=True).click();page.locator('#mode-expedition').click()
    page.locator('#run-daily').click();check(state()['run']['seed'].startswith('DAILY-'),'每日同种子入口正常')
    context.close()
    mobile=browser.new_context(viewport={'width':390,'height':844},is_mobile=True,has_touch=True);mobile.set_offline(True)
    phone=mobile.new_page();phone.on('pageerror',lambda e:errors.append(str(e)));phone.goto(URL)
    check(phone.evaluate('document.documentElement.scrollWidth<=innerWidth'),'远征草稿页面窄屏没有横向溢出')
    phone.screenshot(path=str(ROOT/'artifacts/13-expedition-mobile.png'),full_page=True)
    phone.locator('[data-r-command="pick:phase"]').tap();phone.locator('[data-r-command="route:steady"]').tap()
    phone.locator('[data-r-skill="blink"]').tap();phone.get_by_role('button',name='远征向右',exact=True).tap()
    check(phone.evaluate('document.documentElement.scrollWidth<=innerWidth'),'远征棋盘与技能条窄屏没有横向溢出')
    if phone.locator('[data-r-skill="blink"]').get_attribute('aria-pressed')=='true':phone.locator('#run-cancel').tap()
    data=phone.evaluate("""()=>{const s=JSON.parse(localStorage.getItem('crystal-expedition-v1')).current,r=CrystalRogue.replay(s.seed,s.commands);return {moves:r.totalMoves,d:Object.keys(Crystal.DIRS).find(d=>CrystalRogue.command(r,d).changed)}}""")
    phone.locator('#rogue-board').scroll_into_view_if_needed();rect=phone.locator('#rogue-board').bounding_box()
    x=rect['x']+rect['width']/2;y=rect['y']+rect['height']/2
    dx,dy={'up':(0,-60),'right':(60,0),'down':(0,60),'left':(-60,0)}[data['d']]
    touch=mobile.new_cdp_session(phone)
    touch.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':x,'y':y}]})
    touch.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x+dx,'y':y+dy}]})
    touch.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
    check(phone.evaluate("(()=>{const s=JSON.parse(localStorage.getItem('crystal-expedition-v1')).current;return CrystalRogue.replay(s.seed,s.commands).totalMoves})()")==data['moves']+1,'远征真实触屏滑动可执行普通操作')
    mobile.close();browser.close()
check(not errors,'新模式全程无浏览器脚本或控制台错误')
(ROOT/'artifacts/rogue-browser-report.json').write_text(json.dumps({'passed':passed,'errors':errors,'note':'Chrome 离线自动化，包含四房间真实点击和手机视口模拟；并非真人试玩。'},ensure_ascii=False,indent=2),encoding='utf-8')
