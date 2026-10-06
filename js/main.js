// 진입점: 메뉴/일시정지/결과 화면, 게임 루프
(() => {
  const $ = (id) => document.getElementById(id);
  const stage = $('stage'), view = $('view'), hudCanvas = $('hud');
  const opts = { diff: 'normal', teamSize: 4 };
  const params = new URLSearchParams(location.search);
  const demo = params.has('auto'); // 개발용: 포인터 락 없이 플레이어를 AI가 조종

  // 터치 기기(또는 개발용 ?mobile=1)면 모바일 UI로 동작
  const mobile = params.has('mobile') || (matchMedia('(pointer: coarse)').matches && 'ontouchstart' in window);
  if (mobile) {
    document.body.classList.add('mobile');
    Input.setTouchMode(true);
    Hud.setMobile(true);
  }

  Render.init(view);
  Hud.init(hudCanvas);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    Hud.resize(Math.round(stage.clientWidth * dpr), Math.round(stage.clientHeight * dpr), dpr);
  }
  addEventListener('resize', resize);
  resize();

  const show = (id) => { for (const o of document.querySelectorAll('.overlay')) o.classList.toggle('hidden', o.id !== id); };
  const hideAll = () => show('');

  // 옵션 버튼
  for (const group of document.querySelectorAll('[data-opt]')) {
    group.addEventListener('click', (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      for (const s of group.children) s.classList.remove('on');
      b.classList.add('on');
      opts[group.dataset.opt] = group.dataset.opt === 'teamSize' ? +b.dataset.v : b.dataset.v;
    });
  }

  // 모바일: 전체화면 + 가로 고정 (지원하는 브라우저에서만, 실패는 무시)
  function enterFullscreen() {
    const el = document.documentElement;
    try {
      const p = el.requestFullscreen && el.requestFullscreen({ navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
    } catch (e) { /* iOS iPhone 등 미지원 */ }
    try {
      const o = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape');
      if (o && o.catch) o.catch(() => {});
    } catch (e) { /* 미지원 */ }
  }

  // 조작 입력을 받는 쪽(포인터 락/터치)을 켜고 끈다
  function engage() {
    if (mobile) { if (!demo) enterFullscreen(); } else if (!demo) view.requestPointerLock();
  }

  function begin() {
    Sound.init();
    Game.start({ ...opts, demo });
    paused = false;
    hideAll();
    engage();
  }
  $('start').addEventListener('click', begin);
  $('again').addEventListener('click', () => { show('menu'); });
  let paused = false;

  function pauseGame() {
    if (Game.state !== 'playing' || paused) return;
    paused = true;
    Input.reset();
    TouchUI.release();
    show('pause');
  }
  $('resume').addEventListener('click', () => {
    if (Game.state !== 'playing') return;
    paused = false; Input.reset(); hideAll(); Sound.init(); engage();
  });

  document.addEventListener('pointerlockchange', () => {
    if (demo || mobile) return;
    if (!document.pointerLockElement) pauseGame();
  });

  // 모바일: 앱 전환/가로 해제/전체화면 해제 시 자동 일시정지
  if (mobile) {
    TouchUI.init(pauseGame);
    document.addEventListener('visibilitychange', () => { if (document.hidden && !demo) pauseGame(); });
    matchMedia('(orientation: portrait)').addEventListener('change', (e) => { if (e.matches && !demo) pauseGame(); });
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement && !demo) pauseGame(); });
  }

  Game.onEnd = (result) => {
    const win = result === 'blue';
    $('result-title').textContent = result === 'draw' ? '무승부' : win ? '승리!' : '패배';
    $('result-title').className = result === 'draw' ? '' : win ? 'win' : 'lose';
    $('result-score').textContent = `RED ${Game.scores.red} : ${Game.scores.blue} BLUE   (내 킬 ${Game.player.kills} / 데스 ${Game.player.deaths})`;
    setTimeout(() => show('result'), 1200);
  };

  let last = performance.now(), fpsAcc = 0, fpsN = 0;
  function frame(now) {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (Game.state === 'playing' || Game.state === 'over') {
      if (!paused) Game.update(dt);
      Render.draw(Game);
    }
    if (mobile) {
      TouchUI.setVisible(Game.state === 'playing' && !paused);
      TouchUI.sync(Game);
    }
    Hud.draw(Game);
    fpsAcc += dt; fpsN++;
    if (params.has('debug') && !params.has('sim') && fpsAcc > 1) {
      $('debug').textContent = `fps ${(fpsN / fpsAcc) | 0}  red ${Game.scores.red} blue ${Game.scores.blue}`;
      fpsAcc = 0; fpsN = 0;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  if (demo) {
    begin();
    for (let i = +params.get('sim') || 0; i > 0; i--) Game.update(1 / 60); // 개발용: 미리 시뮬레이션
    if (params.has('place')) { // 개발용: 플레이어 앞에 적/아군/시체 봇을 배치
      const p = Game.player, [a, b, c] = Game.fighters.filter((f) => f !== p);
      p.x = 12; p.y = 20.5; p.angle = -Math.PI / 2;
      Object.assign(a, { team: 'red', x: 12, y: 15, alive: true });
      Object.assign(b, { team: 'red', x: 10.2, y: 12.5, alive: true, flash: 1 });
      Object.assign(c, { team: 'blue', x: 13.3, y: 17, alive: false, corpseT: 0 });
    }
    if (params.has('manual')) { // 개발용: 플레이어를 사람 조작 경로로 전환(뷰모델/HUD 확인)
      Game.demo = false;
      const p = Game.player;
      p.flashT = 0.04; p.kick = 0.6; p.spread = 0.02;
      if (params.has('wep')) { p.cur = +params.get('wep'); p.switchT = 0; }
      if (params.has('aim')) {
        Object.defineProperty(Input, 'aim', { get: () => true });
        p.zoom = p.weps[p.cur].zoom || p.weps[p.cur].def.zoom || 1;
      }
      if (params.has('jump')) { p.z = +params.get('jump') || 0.18; p.vz = 0; }
    }
    if (params.has('test')) { // 개발용: 합성 PointerEvent로 터치 조작이 게임 상태에 반영되는지 검증
      const p = Game.player, out = [];
      const ev = (id, type, x, y, pid = 1) => $(id).dispatchEvent(new PointerEvent(type, { pointerId: pid, clientX: x, clientY: y, bubbles: true, pointerType: 'touch' }));
      const run = (n) => { for (let i = 0; i < n; i++) { TouchUI.sync(Game); Game.update(1 / 60); } };
      const ok = (name, cond) => out.push(`${cond ? 'PASS' : 'FAIL'} ${name}`);
      TouchUI.setVisible(true);
      run(1);
      // 1) 조이스틱: 위로 밀면 앞으로 이동
      p.x = 12; p.y = 20; p.angle = -Math.PI / 2; const y0 = p.y;
      ev('joy-zone', 'pointerdown', 100, 300, 1); ev('joy-zone', 'pointermove', 100, 250, 1);
      ok('joystick axis.y>0.5', Input.axis.y > 0.5); run(30);
      ok('player moved forward', p.y < y0 - 0.5);
      ev('joy-zone', 'pointerup', 100, 250, 1); run(1);
      ok('joystick released', Input.axis.y === 0 && Input.axis.x === 0);
      // 2) 시점 드래그
      const a0 = p.angle; ev('look-zone', 'pointerdown', 500, 200, 2); ev('look-zone', 'pointermove', 560, 200, 2); run(1);
      ok('look drag turns right', p.angle > a0 + 0.1); ev('look-zone', 'pointerup', 560, 200, 2);
      // 3) 발사 버튼(누른 채 드래그로 조준)
      const m0 = p.weps[p.cur].mag; const a1 = p.angle;
      ev('b-fire', 'pointerdown', 700, 300, 3); ev('b-fire', 'pointermove', 720, 300, 3); run(20);
      ok('fire holds', Input.fire); ok('ammo decreased', p.weps[p.cur].mag < m0); ok('drag-look while firing', p.angle > a1);
      ev('b-fire', 'pointerup', 720, 300, 3); run(1); ok('fire released', !Input.fire);
      // 4) 점프
      ev('b-jump', 'pointerdown', 600, 200, 4); run(5); ok('jump z>0', p.z > 0); ev('b-jump', 'pointerup', 600, 200, 4); run(60);
      // 5) 무기 교체 + 스코프 토글
      ev('b-pause', 'pointerup', 0, 0, 9); // 일시정지 버튼 up은 무시되어야 함
      const wb = document.querySelectorAll('.wbtn')[1]; wb.dispatchEvent(new PointerEvent('pointerdown', { pointerId: 5, bubbles: true })); run(30);
      ok('switch to sniper', p.cur === 1);
      ev('b-scope', 'pointerdown', 0, 0, 6); run(40); ok('scope toggled on, zoom>1.5', Input.aim && p.zoom > 1.5);
      ev('b-scope', 'pointerdown', 0, 0, 6); run(40); ok('scope toggled off', !Input.aim && p.zoom < 1.2);
      // 6) 재장전
      ev('b-fire', 'pointerdown', 700, 300, 7); run(2); ev('b-fire', 'pointerup', 700, 300, 7); run(80);
      ev('b-reload', 'pointerdown', 0, 0, 8); run(2); ok('reload started', p.reloadT > 0);
      $('debug').textContent = 'TOUCHTEST ' + out.join(' | ');
    } else if (params.has('debug')) {
      const st = Game.fighters.map((f) => `${f.team[0]}:${f.name}(${f.x.toFixed(1)},${f.y.toFixed(1)}) hp${f.hp | 0} k${f.kills} d${f.deaths} ${f.alive ? 'A' : 'D'}`);
      $('debug').textContent = `t=${Game.time.toFixed(0)} red ${Game.scores.red} blue ${Game.scores.blue} | ` + st.join(' | ');
    }
  }
  window.__game = Game; // 디버깅용
})();
