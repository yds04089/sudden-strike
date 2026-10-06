// HUD: 선명하게 보이도록 화면 해상도 캔버스에 따로 그린다
const Hud = (() => {
  const RED = '#ff5a4d', BLUE = '#5aa0ff';
  const FONT = "'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif";
  let cv, g, u = 1;
  let mobile = false, dpr = 1;

  function init(canvas) { cv = canvas; g = cv.getContext('2d'); }
  function resize(w, h, ratio) { cv.width = w; cv.height = h; dpr = ratio || 1; }
  function setMobile(b) { mobile = b; }

  function text(str, x, y, size, color, align = 'left', weight = 'bold') {
    g.font = `${weight} ${size * u}px ${FONT}`;
    g.textAlign = align; g.fillStyle = color;
    g.fillText(str, x, y);
  }
  const teamColor = (t) => (t === 'red' ? RED : BLUE);

  function draw(G) {
    const W = cv.width, H = cv.height;
    // 폰은 화면이 작아서(가로 높이 ~390px) 글자가 너무 작아지지 않도록 CSS px 기준 하한을 둔다
    u = mobile ? Math.max(H / 720, 0.85 * dpr) : H / 720;
    g.clearRect(0, 0, W, H);
    if (G.state === 'menu') return;
    const p = G.player;

    // 피격 비네팅
    if (G.hurtT > 0) {
      const grad = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.85);
      grad.addColorStop(0, 'rgba(180,0,0,0)');
      grad.addColorStop(1, `rgba(180,0,0,${Math.min(0.6, G.hurtT * 1.4)})`);
      g.fillStyle = grad; g.fillRect(0, 0, W, H);
    }
    if (p.hp < 30 && p.alive) {
      g.fillStyle = `rgba(120,0,0,${0.12 + 0.08 * Math.sin(G.time * 6)})`;
      g.fillRect(0, 0, W, H);
    }

    drawIndicators(G, W, H);
    if (p.alive && !G.demo) {
      if (p.zoom > 1.5) drawScope(G, p, W, H); else drawCrosshair(G, p, W, H);
    }
    drawScore(G, W);
    drawFeed(G, W);
    drawMinimap(G);
    if (!G.demo) drawStatus(p, W, H);
    if (!p.alive && !G.demo) drawDeath(G, W, H);
    if (Input.keys.Tab || G.state === 'over') drawScoreboard(G, W, H);
  }

  function drawCrosshair(G, p, W, H) {
    const cx = W / 2, cy = H / 2;
    const w = p.weps[p.cur].def;
    const spread = w.base + p.spread + (p.speedNow > 0.5 ? w.move : 0);
    const gap = (4 + spread * Render.FOCAL * (W / Render.W) * 0.8) * (u > 0 ? 1 : 1);
    const len = 9 * u, t = 2 * u;
    const m = G.marker;
    g.fillStyle = 'rgba(255,255,255,0.9)';
    if (!w.melee) {
      g.fillRect(cx - gap - len, cy - t / 2, len, t);
      g.fillRect(cx + gap, cy - t / 2, len, t);
      g.fillRect(cx - t / 2, cy - gap - len, t, len);
      g.fillRect(cx - t / 2, cy + gap, t, len);
    }
    g.fillRect(cx - 1, cy - 1, 2, 2);
    if (m.t > 0) {
      g.strokeStyle = m.kill || m.head ? '#ff3b30' : '#ffffff';
      g.lineWidth = 2.5 * u;
      const a = 8 * u, b = 18 * u;
      g.beginPath();
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        g.moveTo(cx + sx * a, cy + sy * a); g.lineTo(cx + sx * b, cy + sy * b);
      }
      g.stroke();
    }
    if (p.reloadT > 0) {
      const f = 1 - p.reloadT / w.reload;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(cx - 50 * u, cy + 50 * u, 100 * u, 8 * u);
      g.fillStyle = '#ffd34d'; g.fillRect(cx - 50 * u, cy + 50 * u, 100 * u * f, 8 * u);
      text('재장전', cx, cy + 82 * u, 16, '#ffd34d', 'center');
    }
  }

  // 스코프 화면: 원형 시야 바깥을 검게 가리고 가는 십자선을 그린다
  function drawScope(G, p, W, H) {
    const cx = W / 2, cy = H / 2, r = H * 0.46;
    g.fillStyle = '#000';
    g.beginPath();
    g.rect(0, 0, W, H);
    g.arc(cx, cy, r, 0, Math.PI * 2, true);
    g.fill('evenodd');
    g.strokeStyle = 'rgba(0,0,0,0.9)'; g.lineWidth = 1.5 * u;
    g.beginPath();
    g.moveTo(cx - r, cy); g.lineTo(cx + r, cy);
    g.moveTo(cx, cy - r); g.lineTo(cx, cy + r);
    g.stroke();
    g.lineWidth = 4 * u;
    g.beginPath(); g.arc(cx, cy, r, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#ff3b30'; g.fillRect(cx - 2 * u, cy - 2 * u, 4 * u, 4 * u);
    const m = G.marker;
    if (m.t > 0) {
      g.strokeStyle = m.kill || m.head ? '#ff3b30' : '#fff'; g.lineWidth = 2.5 * u;
      g.beginPath(); g.arc(cx, cy, 14 * u, 0, Math.PI * 2); g.stroke();
    }
  }

  function drawIndicators(G, W, H) {
    const p = G.player, cx = W / 2, cy = H / 2, R = H * 0.28;
    for (const i of G.indicators) {
      const a = i.angle - p.angle - Math.PI / 2;
      g.strokeStyle = `rgba(255,40,40,${Math.min(1, i.t)})`;
      g.lineWidth = 12 * u;
      g.beginPath(); g.arc(cx, cy, R, a - 0.22, a + 0.22); g.stroke();
    }
  }

  function drawScore(G, W) {
    const cx = W / 2, half = mobile ? 100 : 150, side = mobile ? 62 : 100; // 모바일은 우상단 버튼과 안 겹치게 좁게
    g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillRect(cx - half * u, 10 * u, half * 2 * u, 44 * u);
    text(G.scores.red, cx - side * u, 44 * u, 32, RED, 'center');
    text(G.scores.blue, cx + side * u, 44 * u, 32, BLUE, 'center');
    const t = Math.ceil(G.timeLeft), mm = (t / 60) | 0, ss = t % 60;
    text(`${mm}:${ss < 10 ? '0' : ''}${ss}`, cx, 38 * u, 22, '#fff', 'center');
    text(`목표 ${G.killLimit}킬`, cx, 66 * u, 12, 'rgba(255,255,255,0.7)', 'center', 'normal');
  }

  function drawFeed(G, W) {
    let y = (mobile ? 72 : 28) * u; // 모바일은 우상단 무기/일시정지 버튼 아래로
    for (const e of G.feed) {
      g.font = `bold ${15 * u}px ${FONT}`;
      const tail = e.head ? ' ★' : '';
      const wv = g.measureText(e.victim).width, wk = g.measureText(e.killer + '  ▸  ').width, wt = g.measureText(tail).width;
      const total = wk + wv + wt + 16 * u, x = W - total - 14 * u;
      g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y - 17 * u, total, 24 * u);
      text(e.killer, x + 8 * u, y, 15, teamColor(e.kteam));
      text('  ▸  ', x + 8 * u + g.measureText(e.killer).width, y, 15, '#ccc');
      text(e.victim, x + 8 * u + wk, y, 15, teamColor(e.vteam));
      if (tail) text(tail, x + 8 * u + wk + wv, y, 15, '#ffd34d');
      y += 28 * u;
    }
  }

  function drawMinimap(G) {
    const cs = (mobile ? 3.4 : 5) * u, ox = 14 * u, oy = 14 * u;
    const p = G.player;
    g.fillStyle = 'rgba(0,0,0,0.55)'; g.fillRect(ox - 4 * u, oy - 4 * u, GameMap.w * cs + 8 * u, GameMap.h * cs + 8 * u);
    const colors = ['', '#8a4a3a', '#777', '#4a6a7a'];
    for (let y = 0; y < GameMap.h; y++) {
      for (let x = 0; x < GameMap.w; x++) {
        const c = GameMap.cells[y * GameMap.w + x];
        if (c) { g.fillStyle = colors[c]; g.fillRect(ox + x * cs, oy + y * cs, cs, cs); }
      }
    }
    for (const f of G.fighters) {
      if (!f.alive) continue;
      let show = f.team === p.team;
      if (!show && p.alive) {
        const dx = f.x - p.x, dy = f.y - p.y, d = Math.hypot(dx, dy);
        show = d < 18 && GameMap.rayDist(p.x, p.y, dx / d, dy / d) >= d - 0.3;
      }
      if (!show) continue;
      g.fillStyle = f === p ? '#fff' : teamColor(f.team);
      g.beginPath(); g.arc(ox + f.x * cs, oy + f.y * cs, (f === p ? 3.2 : 2.6) * u, 0, Math.PI * 2); g.fill();
      if (f === p) {
        g.strokeStyle = '#fff'; g.lineWidth = 1.5 * u;
        g.beginPath(); g.moveTo(ox + f.x * cs, oy + f.y * cs);
        g.lineTo(ox + (f.x + Math.cos(f.angle) * 2) * cs, oy + (f.y + Math.sin(f.angle) * 2) * cs); g.stroke();
      }
    }
  }

  // 모바일: 체력/탄약을 하단 중앙 한 줄로 (좌: 조이스틱, 우: 버튼 영역을 피한다)
  function drawStatusMobile(p, W, H) {
    const w = p.weps[p.cur], d = w.def;
    const pw = 280 * u, ph = 54 * u, x = W / 2 - pw / 2, y = H - ph - 8 * u;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(x, y, pw, ph);
    const hpC = p.hp < 30 ? '#ff4d4d' : '#fff';
    text('HP', x + 10 * u, y + 20 * u, 13, '#bbb');
    text(Math.max(0, Math.ceil(p.hp)), x + 40 * u, y + 24 * u, 24, hpC);
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(x + 10 * u, y + 34 * u, 110 * u, 9 * u);
    g.fillStyle = p.hp < 30 ? '#ff4d4d' : '#4ddc7a'; g.fillRect(x + 10 * u, y + 34 * u, 110 * u * Math.max(0, p.hp) / 100, 9 * u);
    text(d.name, x + pw - 10 * u, y + 18 * u, 13, '#ddd', 'right');
    if (!d.melee) {
      text(w.reserve, x + pw - 10 * u, y + 44 * u, 18, '#bbb', 'right');
      text(w.mag, x + pw - 52 * u, y + 44 * u, 28, w.mag <= d.mag * 0.25 ? '#ff6b5a' : '#fff', 'right');
    } else text('—', x + pw - 10 * u, y + 44 * u, 24, '#bbb', 'right');
    if (p.invuln > 0) text('보호', x + 128 * u, y + 20 * u, 12, '#ffd34d', 'center', 'normal');
  }

  function drawStatus(p, W, H) {
    if (mobile) return drawStatusMobile(p, W, H);
    const w = p.weps[p.cur], d = w.def;
    // 체력
    const bx = 24 * u, by = H - 54 * u, bw = 230 * u, bh = 16 * u;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(bx - 8 * u, by - 40 * u, bw + 16 * u, 70 * u);
    text('HP', bx, by - 10 * u, 16, '#fff');
    text(Math.max(0, Math.ceil(p.hp)), bx + bw, by - 8 * u, 30, p.hp < 30 ? '#ff4d4d' : '#fff', 'right');
    g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(bx, by, bw, bh);
    g.fillStyle = p.hp < 30 ? '#ff4d4d' : '#4ddc7a'; g.fillRect(bx, by, bw * Math.max(0, p.hp) / 100, bh);
    if (p.invuln > 0) text('리스폰 보호', bx, by + 46 * u, 12, '#ffd34d', 'left', 'normal');
    // 탄약
    const ax = W - 24 * u;
    g.fillStyle = 'rgba(0,0,0,0.5)'; g.fillRect(ax - 190 * u, H - 100 * u, 206 * u, 84 * u);
    text(d.name, ax, H - 74 * u, 18, '#ddd', 'right');
    if (!d.melee) {
      text(w.mag, ax - 70 * u, H - 30 * u, 44, w.mag <= d.mag * 0.25 ? '#ff6b5a' : '#fff', 'right');
      text('/ ' + w.reserve, ax, H - 30 * u, 24, '#bbb', 'right');
    } else text('—', ax, H - 30 * u, 36, '#bbb', 'right');
    // 무기 슬롯
    for (let i = 0; i < p.weps.length; i++) {
      const sx = W / 2 - 140 * u + i * 70 * u, sy = H - 40 * u;
      g.fillStyle = i === p.cur ? 'rgba(255,211,77,0.85)' : 'rgba(0,0,0,0.45)';
      g.fillRect(sx, sy, 62 * u, 26 * u);
      text(`${i + 1} ${p.weps[i].def.name}`, sx + 31 * u, sy + 19 * u, 13, i === p.cur ? '#000' : '#ddd', 'center');
    }
  }

  function drawDeath(G, W, H) {
    const p = G.player;
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(0, 0, W, H);
    text('사망', W / 2, H / 2 - 20 * u, 56, '#ff4d4d', 'center');
    if (G.killer) text(`${G.killer.name} 에게 당했습니다`, W / 2, H / 2 + 22 * u, 22, '#fff', 'center');
    text(`${Math.ceil(Math.max(0, p.respawnT))}초 후 리스폰`, W / 2, H / 2 + 58 * u, 18, '#ddd', 'center', 'normal');
  }

  function drawScoreboard(G, W, H) {
    const w = 560 * u, rowH = 26 * u, x = (W - w) / 2;
    const rows = G.fighters.slice().sort((a, b) => b.kills - a.kills);
    const total = Math.max(rows.length, 1) * rowH + 90 * u, y = Math.max(80 * u, (H - total) / 2);
    g.fillStyle = 'rgba(0,0,0,0.75)'; g.fillRect(x, y, w, total);
    text('스코어보드', x + w / 2, y + 30 * u, 20, '#fff', 'center');
    text('이름', x + 20 * u, y + 58 * u, 13, '#aaa');
    text('킬', x + w - 140 * u, y + 58 * u, 13, '#aaa', 'right');
    text('데스', x + w - 30 * u, y + 58 * u, 13, '#aaa', 'right');
    rows.forEach((f, i) => {
      const ry = y + 84 * u + i * rowH;
      if (f.isPlayer) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x + 6 * u, ry - 18 * u, w - 12 * u, rowH); }
      text(f.name + (f.alive ? '' : ' ☠'), x + 20 * u, ry, 16, teamColor(f.team));
      text(f.kills, x + w - 140 * u, ry, 16, '#fff', 'right');
      text(f.deaths, x + w - 30 * u, ry, 16, '#fff', 'right');
    });
  }

  return { init, resize, setMobile, draw };
})();
