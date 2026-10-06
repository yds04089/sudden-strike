// 모바일 터치 UI: 왼쪽 가상 조이스틱, 오른쪽 드래그 시점, 발사/점프/재장전/스코프/무기 버튼
// 모든 입력은 Input의 주입 API로 전달한다. Pointer Events + pointerId로 멀티터치를 구분한다.
const TouchUI = (() => {
  const $ = (id) => document.getElementById(id);
  const LOOK = 1.8;     // 드래그 1px당 시점 이동 배율 (마우스 델타와 같은 단위로 환산)
  const RADIUS = 55;    // 조이스틱 반경(px)
  const DEADZONE = 0.1;

  const root = $('touch');
  const joy = { id: null };
  const look = { id: null, x: 0, y: 0 };
  let visible = false;
  let onPause = null;

  const capture = (el, id) => { try { el.setPointerCapture(id); } catch (e) { /* 합성 이벤트 등 */ } };

  // ---- 조이스틱 (처음 터치한 위치가 중심) ----
  function bindJoystick() {
    const zone = $('joy-zone'), base = $('joy-base'), knob = $('joy-knob');
    let cx = 0, cy = 0;
    const move = (x, y) => {
      let dx = x - cx, dy = y - cy;
      const d = Math.hypot(dx, dy);
      if (d > RADIUS) { dx = (dx / d) * RADIUS; dy = (dy / d) * RADIUS; }
      knob.style.transform = `translate(${dx}px, ${dy}px)`;
      const m = Math.hypot(dx, dy) / RADIUS;
      if (m < DEADZONE) { Input.axis.x = Input.axis.y = 0; return; }
      Input.axis.x = dx / RADIUS; Input.axis.y = -dy / RADIUS;
    };
    zone.addEventListener('pointerdown', (e) => {
      if (joy.id !== null) return;
      e.preventDefault();
      joy.id = e.pointerId; cx = e.clientX; cy = e.clientY;
      capture(zone, e.pointerId);
      base.style.left = cx + 'px'; base.style.top = cy + 'px';
      base.classList.add('on');
      move(cx, cy);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === joy.id) move(e.clientX, e.clientY); });
    const end = (e) => {
      if (e.pointerId !== joy.id) return;
      joy.id = null; Input.axis.x = Input.axis.y = 0;
      knob.style.transform = ''; base.classList.remove('on');
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // ---- 시점 드래그 ----
  function bindLook() {
    const zone = $('look-zone');
    zone.addEventListener('pointerdown', (e) => {
      if (look.id !== null) return;
      e.preventDefault();
      look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY;
      capture(zone, e.pointerId);
    });
    zone.addEventListener('pointermove', (e) => {
      if (e.pointerId !== look.id) return;
      Input.addLook((e.clientX - look.x) * LOOK, (e.clientY - look.y) * LOOK);
      look.x = e.clientX; look.y = e.clientY;
    });
    const end = (e) => { if (e.pointerId === look.id) look.id = null; };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }

  // 누르고 있는 동안 유지되는 버튼. dragLook이면 누른 채 손가락을 움직여 조준도 가능(발사 버튼).
  function holdButton(el, onDown, onUp, dragLook) {
    let id = null, lx = 0, ly = 0;
    el.addEventListener('pointerdown', (e) => {
      if (id !== null) return;
      e.preventDefault();
      id = e.pointerId; lx = e.clientX; ly = e.clientY;
      capture(el, id);
      el.classList.add('down');
      onDown();
    });
    el.addEventListener('pointermove', (e) => {
      if (!dragLook || e.pointerId !== id) return;
      Input.addLook((e.clientX - lx) * LOOK, (e.clientY - ly) * LOOK);
      lx = e.clientX; ly = e.clientY;
    });
    const end = (e) => {
      if (e.pointerId !== id) return;
      id = null; el.classList.remove('down'); onUp();
    };
    el.addEventListener('pointerup', end);
    el.addEventListener('pointercancel', end);
  }

  function tapButton(el, fn) {
    el.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      el.classList.add('down');
      fn();
    });
    const up = () => el.classList.remove('down');
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('pointerleave', up);
  }

  function init(pauseFn) {
    onPause = pauseFn;
    bindJoystick();
    bindLook();
    holdButton($('b-fire'), () => Input.setFire(true), () => Input.setFire(false), true);
    holdButton($('b-jump'), () => { Input.keys.Space = true; }, () => { Input.keys.Space = false; }, false);
    tapButton($('b-reload'), () => Input.pressKey('KeyR'));
    tapButton($('b-scope'), () => Input.setAim(!Input.aim));    // 저격총 스코프는 토글
    tapButton($('b-score'), () => { Input.keys.Tab = !Input.keys.Tab; });
    tapButton($('b-pause'), () => { if (onPause) onPause(); });
    for (const b of document.querySelectorAll('.wbtn')) {
      tapButton(b, () => Input.pressKey('Digit' + (+b.dataset.i + 1)));
    }
    // 스크롤/확대/길게 누르기 방지
    document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    document.addEventListener('gesturestart', (e) => e.preventDefault());
    document.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  // 눌린 상태를 모두 해제 (일시정지/숨김 시)
  function release() {
    joy.id = null; look.id = null;
    Input.axis.x = Input.axis.y = 0;
    Input.setFire(false); Input.setAim(false);
    Input.keys.Space = false; Input.keys.Tab = false;
    $('joy-base').classList.remove('on');
    for (const el of root.querySelectorAll('.down')) el.classList.remove('down');
  }

  function setVisible(v) {
    if (v === visible) return;
    visible = v;
    root.classList.toggle('hidden', !v);
    if (!v) release();
  }

  // 매 프레임: 현재 무기 강조, 스코프 버튼 표시, 스코프 자동 해제
  function sync(G) {
    if (!visible || !G.player || !G.player.weps) return;
    const p = G.player, def = p.weps[p.cur].def;
    for (const b of document.querySelectorAll('.wbtn')) b.classList.toggle('on', +b.dataset.i === p.cur);
    const sc = $('b-scope');
    sc.classList.toggle('hidden', !def.scope);
    sc.classList.toggle('on', Input.aim);
    if ((!def.scope || p.reloadT > 0 || !p.alive) && Input.aim) Input.setAim(false);
  }

  return { init, setVisible, sync, release };
})();
