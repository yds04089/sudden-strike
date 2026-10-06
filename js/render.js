// 레이캐스팅 렌더러: 바닥/천장 -> 벽 -> 스프라이트(봇) -> 무기 뷰모델
const Render = (() => {
  const W = 640, H = 360;
  const PLANE = 0.66;               // 카메라 평면 길이 (시야각 약 66°), 줌하면 줄어든다
  const BOT_H = 0.62;               // 봇 키 (벽 높이 = 1, 눈높이 = 0.5)
  const FOG = 18;
  let plane = PLANE;
  let focal = W / 2 / plane;        // 거리 1에서 1 단위 길이가 차지하는 픽셀 수
  let eye = 0.5;                    // 카메라 높이 (점프하면 올라간다)

  function setZoom(z) { plane = PLANE / z; focal = W / 2 / plane; }

  let canvas, ctx, img, buf;
  const zbuf = new Float32Array(W);

  // 거리 -> 밝기(0..256) 룩업
  const SH = new Int16Array(FOG * 8 + 1);
  for (let i = 0; i < SH.length; i++) SH[i] = Math.max(0.1, 1 - i / 8 / FOG) * 256;
  const shadeAt = (d) => SH[Math.min(SH.length - 1, (d * 8) | 0)];

  function init(c) {
    canvas = c;
    canvas.width = W; canvas.height = H;
    ctx = canvas.getContext('2d');
    img = ctx.createImageData(W, H);
    buf = new Uint32Array(img.data.buffer);
  }

  function draw(g) {
    const p = g.player;
    setZoom(p.zoom || 1);
    eye = 0.5 + (p.z || 0);
    const dirX = Math.cos(p.angle), dirY = Math.sin(p.angle);
    const plX = -dirY * plane, plY = dirX * plane;
    const horizon = (H / 2 + p.pitch) | 0;

    drawFloorCeil(p, dirX, dirY, plX, plY, horizon);
    drawWalls(p, dirX, dirY, plX, plY, horizon);
    drawSprites(g, p, dirX, dirY, plX, plY, horizon);
    ctx.putImageData(img, 0, 0);
    if (p.alive && !g.demo && (p.zoom || 1) < 1.5) drawViewModel(p);
  }

  function drawFloorCeil(p, dirX, dirY, plX, plY, horizon) {
    const toFloor = eye * focal, toCeil = (1 - eye) * focal;
    for (let y = 0; y < H; y++) {
      const dy = y - horizon;
      if (dy === 0) continue;
      const rowDist = (dy > 0 ? toFloor : toCeil) / Math.abs(dy);
      const s = shadeAt(rowDist);
      const tex = dy > 0 ? Tex.floor : Tex.ceil;
      let fx = p.x + rowDist * (dirX - plX), fy = p.y + rowDist * (dirY - plY);
      const sx = (rowDist * 2 * plX) / W, sy = (rowDist * 2 * plY) / W;
      let idx = y * W;
      for (let x = 0; x < W; x++) {
        const c = tex[((((fy * 64) | 0) & 63) << 6) | (((fx * 64) | 0) & 63)];
        buf[idx++] = 0xff000000 | ((((c >> 16) & 255) * s >> 8) << 16) | ((((c >> 8) & 255) * s >> 8) << 8) | (((c & 255) * s) >> 8);
        fx += sx; fy += sy;
      }
    }
  }

  function drawWalls(p, dirX, dirY, plX, plY, horizon) {
    const hit = GameMap.hit;
    for (let x = 0; x < W; x++) {
      const camX = (2 * x) / W - 1;
      const rdx = dirX + plX * camX, rdy = dirY + plY * camX;
      const dist = GameMap.cast(p.x, p.y, rdx, rdy);
      zbuf[x] = dist;
      const lineH = focal / dist;
      const top = horizon - (1 - eye) * lineH;
      const start = Math.max(0, Math.ceil(top)), end = Math.min(H - 1, Math.floor(horizon + eye * lineH));
      let texX = (hit.wallX * 64) | 0;
      if ((hit.side === 0 && rdx > 0) || (hit.side === 1 && rdy < 0)) texX = 63 - texX;
      const tex = Tex.walls[hit.cell];
      const s = (shadeAt(dist) * (hit.side ? 0.75 : 1)) | 0;
      const step = 64 / lineH;
      let texPos = (start - top) * step;
      for (let y = start; y <= end; y++) {
        const c = tex[(((texPos | 0) & 63) << 6) | texX];
        texPos += step;
        buf[y * W + x] = 0xff000000 | ((((c >> 16) & 255) * s >> 8) << 16) | ((((c >> 8) & 255) * s >> 8) << 8) | (((c & 255) * s) >> 8);
      }
    }
  }

  const visible = [];
  function drawSprites(g, p, dirX, dirY, plX, plY, horizon) {
    const invDet = 1 / (plX * dirY - dirX * plY);
    visible.length = 0;
    for (const f of g.fighters) {
      if (f === p) continue;
      if (!f.alive && f.corpseT > 2.5) continue;
      const dx = f.x - p.x, dy = f.y - p.y;
      const depth = invDet * (-plY * dx + plX * dy);
      if (depth < 0.2) continue;
      visible.push({ f, depth, side: invDet * (dirY * dx - dirX * dy) });
    }
    visible.sort((a, b) => b.depth - a.depth);

    for (const v of visible) {
      const f = v.f, depth = v.depth;
      const frames = Tex.bot[f.team];
      const tex = !f.alive ? frames[3] : f.flash > 0 ? frames[2] : frames[((f.walkPhase | 0) & 1)];
      const screenX = (W / 2) * (1 + v.side / depth);
      const sh = (focal / depth) * BOT_H, sw = (sh * Tex.SW) / Tex.SH;
      const bottom = horizon + (eye * focal) / depth, top = bottom - sh;
      const left = screenX - sw / 2;
      const s = f.invuln > 0 && ((g.time * 12) | 0) % 2 ? 256 : shadeAt(depth);
      const x0 = Math.max(0, Math.floor(left)), x1 = Math.min(W - 1, Math.floor(left + sw));
      const y0 = Math.max(0, Math.floor(top)), y1 = Math.min(H - 1, Math.floor(bottom));
      for (let x = x0; x <= x1; x++) {
        if (depth >= zbuf[x]) continue;
        const tx = (((x - left) / sw) * Tex.SW) | 0;
        for (let y = y0; y <= y1; y++) {
          const c = tex[((((y - top) / sh) * Tex.SH) | 0) * Tex.SW + tx];
          if (c >>> 24 < 128) continue;
          buf[y * W + x] = 0xff000000 | ((((c >> 16) & 255) * s >> 8) << 16) | ((((c >> 8) & 255) * s >> 8) << 8) | (((c & 255) * s) >> 8);
        }
      }
    }
  }

  // ---- 무기 뷰모델 (저해상도 캔버스 위에 도형으로 그림) ----
  function drawViewModel(p) {
    const w = p.weps[p.cur].def;
    const bobX = Math.sin(p.bobT) * p.bobAmp * 7;
    const bobY = Math.abs(Math.cos(p.bobT)) * p.bobAmp * 6;
    let dip = 0;
    if (p.reloadT > 0) dip = Math.sin(Math.min(1, (1 - p.reloadT / w.reload)) * Math.PI) * 70;
    if (p.switchT > 0) dip = Math.max(dip, (p.switchT / 0.35) * 80);
    const ox = W * 0.66 + bobX, oy = H + 6 + bobY + dip + p.kick * 14;

    ctx.save();
    ctx.translate(ox, oy);
    if (w.melee) {
      const swing = p.kick;
      ctx.rotate(-0.5 + swing * 1.2);
      ctx.fillStyle = '#3a2a1c'; ctx.fillRect(-8, -70, 16, 80);
      ctx.fillStyle = '#c9ced4';
      ctx.beginPath(); ctx.moveTo(-9, -70); ctx.lineTo(9, -70); ctx.lineTo(4, -170); ctx.lineTo(-2, -176); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#8e949b'; ctx.fillRect(-9, -72, 18, 4);
    } else {
      ctx.rotate(-0.1);
      if (w.id === 'rifle') {
        ctx.fillStyle = '#1f1f22'; ctx.fillRect(-13, -120, 26, 130);
        ctx.fillStyle = '#34343a'; ctx.fillRect(-9, -125, 18, 40);
        ctx.fillStyle = '#4b3a2a'; ctx.fillRect(-12, -70, 24, 60);
        ctx.fillStyle = '#111'; ctx.fillRect(-3, -135, 6, 14);
      } else if (w.id === 'sniper') {
        ctx.fillStyle = '#23272b'; ctx.fillRect(-7, -190, 14, 200);
        ctx.fillStyle = '#3a4048'; ctx.fillRect(-11, -120, 22, 60);
        ctx.fillStyle = '#18181c'; ctx.fillRect(-9, -150, 18, 26);     // 스코프
        ctx.fillStyle = '#5a7a9a'; ctx.fillRect(-6, -148, 12, 4);
        ctx.fillStyle = '#4b3a2a'; ctx.fillRect(-11, -60, 22, 70);
        ctx.fillStyle = '#111'; ctx.fillRect(-3, -198, 6, 10);
      } else {
        ctx.fillStyle = '#26262b'; ctx.fillRect(-10, -80, 20, 90);
        ctx.fillStyle = '#4a4a52'; ctx.fillRect(-11, -88, 22, 28);
        ctx.fillStyle = '#111'; ctx.fillRect(-3, -92, 6, 8);
      }
      ctx.fillStyle = '#d8a87c'; ctx.fillRect(-16, -22, 32, 40);
      if (p.flashT > 0) {
        const fy = w.id === 'sniper' ? -200 : w.id === 'rifle' ? -138 : -95;
        ctx.fillStyle = '#fff3a0';
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2, r = i % 2 ? 9 : 22;
          ctx.lineTo(Math.cos(a) * r, fy + Math.sin(a) * r);
        }
        ctx.closePath(); ctx.fill();
      }
    }
    ctx.restore();
  }

  return { init, draw, W, H, BOT_H, get FOCAL() { return focal; } };
})();
