// 키보드 + 마우스(Pointer Lock) + 터치 입력.
// 터치 UI(touch.js)는 아래 주입 API(axis/addLook/setFire/setAim/pressKey)로 같은 경로에 합류한다.
const Input = (() => {
  const keys = {};
  const pressed = {};
  const axis = { x: 0, y: 0 };      // 터치 조이스틱 이동 (-1..1, y>0 = 앞으로)
  let mdx = 0, mdy = 0, fire = false, aim = false, wheel = 0;
  let touchMode = false;            // 터치 기기에서는 터치 후 브라우저가 만드는 가짜 마우스 이벤트를 무시한다
  const blockDefault = new Set(['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

  addEventListener('keydown', (e) => {
    if (blockDefault.has(e.code)) e.preventDefault();
    if (!keys[e.code]) pressed[e.code] = true;
    keys[e.code] = true;
  });
  addEventListener('keyup', (e) => { keys[e.code] = false; });
  document.addEventListener('mousemove', (e) => {
    if (document.pointerLockElement) { mdx += e.movementX; mdy += e.movementY; }
  });
  addEventListener('mousedown', (e) => {
    if (touchMode || !document.pointerLockElement) return;
    if (e.button === 0) fire = true;
    if (e.button === 2) aim = true;
  });
  addEventListener('mouseup', (e) => {
    if (touchMode) return;
    if (e.button === 0) fire = false;
    if (e.button === 2) aim = false;
  });
  addEventListener('contextmenu', (e) => e.preventDefault());
  addEventListener('wheel', (e) => { wheel += Math.sign(e.deltaY); }, { passive: true });
  addEventListener('blur', () => {
    for (const k in keys) keys[k] = false;
    fire = false; aim = false; axis.x = axis.y = 0;
  });

  return {
    keys, axis,
    get fire() { return fire; },
    get aim() { return aim; },
    consumeMouse() { const r = [mdx, mdy]; mdx = mdy = 0; return r; },
    consumeWheel() { const w = wheel; wheel = 0; return w; },
    wasPressed(code) { const p = pressed[code]; pressed[code] = false; return !!p; },
    reset() {
      for (const k in pressed) pressed[k] = false;
      mdx = mdy = wheel = 0; fire = false; aim = false; axis.x = axis.y = 0;
    },
    // ---- 터치 주입 API ----
    setTouchMode(b) { touchMode = b; },
    addLook(dx, dy) { mdx += dx; mdy += dy; },
    setFire(b) { fire = b; },
    setAim(b) { aim = b; },
    pressKey(code) { pressed[code] = true; },
  };
})();
