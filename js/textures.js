// 외부 이미지 없이 코드로 생성하는 텍스처 (픽셀은 0xAABBGGRR 형태의 Uint32)
const Tex = (() => {
  const S = 64;
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const pack = (r, g, b) => (0xff000000 | (clamp(b) << 16) | (clamp(g) << 8) | clamp(r)) >>> 0;
  function hash(x, y, s) {
    let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 982451653)) | 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function make(fn) {
    const t = new Uint32Array(S * S);
    for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) t[y * S + x] = fn(x, y);
    return t;
  }

  const brick = make((x, y) => {
    const row = (y / 16) | 0, off = row & 1 ? 16 : 0;
    const bx = (x + off) & 31, by = y & 15;
    if (by < 2 || bx < 2) { const n = hash(x, y, 1) * 20; return pack(150 + n, 148 + n, 140 + n); }
    const id = hash(((x + off) / 32) | 0, row, 2), n = hash(x, y, 3) * 30;
    return pack(140 + id * 40 + n, 55 + id * 20 + n * 0.5, 40 + id * 15 + n * 0.4);
  });

  const concrete = make((x, y) => {
    let v = 112 + hash(x, y, 4) * 28 + hash(x >> 3, y >> 3, 5) * 20;
    if ((x & 31) === 0 || (y & 31) === 0) v -= 35;
    return pack(v, v, v + 4);
  });

  const rivets = [[7, 7], [56, 7], [7, 56], [56, 56]];
  const metal = make((x, y) => {
    const n = hash(x, y, 6) * 14;
    let r = 55 + n, g = 85 + n, b = 100 + n;
    if (x < 3 || y < 3 || x > 60 || y > 60) { r -= 25; g -= 25; b -= 25; }
    if (Math.abs(x - y) < 2 || Math.abs(x + y - 63) < 2) { r += 25; g += 25; b += 25; }
    for (const [cx, cy] of rivets) if ((x - cx) ** 2 + (y - cy) ** 2 < 5) { r += 40; g += 40; b += 40; }
    return pack(r, g, b);
  });

  const floor = make((x, y) => {
    let v = ((x >> 5) + (y >> 5)) & 1 ? 78 : 92;
    v += hash(x, y, 7) * 14;
    if ((x & 31) === 0 || (y & 31) === 0) v -= 30;
    return pack(v, v - 2, v - 6);
  });

  const ceil = make((x, y) => {
    let v = 48 + hash(x, y, 8) * 10;
    if ((x & 15) === 0 || (y & 15) === 0) v -= 14;
    return pack(v, v + 2, v + 8);
  });

  // ---- 봇 스프라이트 (64x96) ----
  const SW = 64, SH = 96;
  function drawBot(g, team, leg, fire) {
    const main = team === 'red' ? '#c0392b' : '#2f6fdc';
    const dark = team === 'red' ? '#7b241c' : '#1b3f87';
    const l1 = leg ? 90 : 84, l2 = leg ? 84 : 90;
    g.fillStyle = '#2b2f36';
    g.fillRect(22, 60, 9, l1 - 60); g.fillRect(33, 60, 9, l2 - 60);
    g.fillStyle = '#111';
    g.fillRect(21, l1 - 5, 11, 5); g.fillRect(32, l2 - 5, 11, 5);
    g.fillStyle = main; g.fillRect(17, 28, 30, 34);
    g.fillStyle = dark; g.fillRect(17, 28, 30, 6); g.fillRect(21, 38, 22, 4);
    g.fillRect(11, 30, 7, 26);
    g.fillRect(44, 32, 14, 7);
    g.fillStyle = '#1a1a1a'; g.fillRect(38, 36, 20, 6); g.fillRect(43, 41, 5, 7);
    g.fillStyle = '#e0b48a'; g.beginPath(); g.arc(32, 17, 8, 0, Math.PI * 2); g.fill();
    g.fillStyle = dark; g.beginPath(); g.arc(32, 15, 9, Math.PI, 0); g.fill(); g.fillRect(23, 14, 18, 3);
    if (fire) { g.fillStyle = '#ffe066'; g.beginPath(); g.arc(60, 39, 4, 0, Math.PI * 2); g.fill(); }
  }
  function spriteCanvas() {
    const c = document.createElement('canvas');
    c.width = SW; c.height = SH;
    return c;
  }
  function toPixels(c) {
    const d = c.getContext('2d').getImageData(0, 0, SW, SH);
    return new Uint32Array(d.data.buffer);
  }
  function botFrames(team) {
    const frames = [];
    for (const [leg, fire] of [[0, 0], [1, 0], [0, 1]]) {
      const c = spriteCanvas();
      drawBot(c.getContext('2d'), team, leg, fire);
      frames.push(toPixels(c));
    }
    // 쓰러진 모습: 서 있는 모습을 눕혀서 아래쪽에 그린다
    const standing = spriteCanvas();
    drawBot(standing.getContext('2d'), team, 0, 0);
    const dead = spriteCanvas(), dg = dead.getContext('2d');
    dg.translate(2, 94); dg.rotate(-Math.PI / 2); dg.scale(0.62, 0.62);
    dg.drawImage(standing, 0, 0);
    frames.push(toPixels(dead));
    return frames;
  }

  return {
    walls: [null, brick, concrete, metal],
    floor, ceil,
    bot: { red: botFrames('red'), blue: botFrames('blue') },
    SW, SH,
  };
})();
