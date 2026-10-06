// 봇 AI: 순찰 -> 발견(반응 지연) -> 교전(스트레이프/사격) -> 놓치면 마지막 위치 수색
const Bot = (() => {
  const DIFF = {
    easy:   { acc: 0.22, react: 0.7,  fireInt: 0.28, dmg: 12, turn: 4.5 },
    normal: { acc: 0.35, react: 0.45, fireInt: 0.2,  dmg: 14, turn: 6 },
    hard:   { acc: 0.5,  react: 0.25, fireInt: 0.15, dmg: 14, turn: 8 },
  };
  const SPEED = 2.8;
  const rand = Math.random;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
  const turnToward = (f, target, rate, dt) => {
    const d = angDiff(target, f.angle);
    f.angle += Math.max(-rate * dt, Math.min(rate * dt, d));
  };

  function init(f, diffName) {
    f.ai = {
      diff: DIFF[diffName] || DIFF.normal, path: [], pi: 0, target: null, react: 0, fireT: 0,
      strafe: 1, strafeT: 0, scanT: rand() * 0.2, loseT: 0, lastSeen: null, stuckT: 0, lastX: f.x, lastY: f.y,
    };
  }

  function repath(f, gx, gy) {
    f.ai.path = GameMap.findPath(f.x, f.y, gx, gy);
    f.ai.pi = 0;
  }

  function scan(b, g) {
    const a = b.ai;
    let best = null, bd = 1e9;
    for (const f of g.fighters) {
      if (!f.alive || f.team === b.team || f.invuln > 0) continue;
      const dx = f.x - b.x, dy = f.y - b.y, d = Math.hypot(dx, dy);
      if (d > 17 || d >= bd) continue;
      const inView = Math.abs(angDiff(Math.atan2(dy, dx), b.angle)) < 1.0;
      if (!inView && d > 2.5 && b.hurtRecent <= 0) continue;
      if (GameMap.rayDist(b.x, b.y, dx / d, dy / d) < d - 0.3) continue;
      best = f; bd = d;
    }
    if (best) {
      if (a.target !== best) { a.target = best; a.react = a.diff.react * (0.7 + rand() * 0.6); }
      a.lastSeen = { x: best.x, y: best.y };
      a.loseT = 0;
    } else if (a.target) {
      a.loseT += 0.2;
      if (a.loseT > 0.6) {
        a.target = null;
        if (a.lastSeen) repath(b, a.lastSeen.x, a.lastSeen.y);
      }
    }
  }

  function shoot(b, t, g) {
    const a = b.ai, dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy);
    if (GameMap.rayDist(b.x, b.y, dx / d, dy / d) < d - 0.3) return;
    b.flash = 0.07;
    const prob = a.diff.acc * Math.max(0.25, Math.min(1, 1.15 - d / 22)) * (t.speedNow > 1 ? 0.75 : 1) * (t.z > 0.03 ? 0.7 : 1);
    if (rand() < prob) g.damage(t, a.diff.dmg, b, false);
    const p = g.player;
    if (!b.isPlayer) Sound.rifle(Math.max(0, 1 - Math.hypot(p.x - b.x, p.y - b.y) / 22) * 0.35);
  }

  function follow(b, dt, speed) {
    const a = b.ai, n = a.path[a.pi];
    if (!n) return false;
    const dx = n.x - b.x, dy = n.y - b.y, d = Math.hypot(dx, dy);
    if (d < 0.25) { a.pi++; return true; }
    turnToward(b, Math.atan2(dy, dx), 7, dt);
    step(b, dx / d, dy / d, speed, dt);
    return true;
  }

  function step(b, mx, my, speed, dt) {
    GameMap.move(b, mx * speed * dt, my * speed * dt);
  }

  function update(b, dt, g) {
    const a = b.ai;
    a.scanT -= dt;
    if (a.scanT <= 0) { a.scanT = 0.15 + rand() * 0.1; scan(b, g); }
    if (a.target && !a.target.alive) a.target = null;
    const px = b.x, py = b.y;

    if (a.target) {
      const t = a.target, dx = t.x - b.x, dy = t.y - b.y, d = Math.hypot(dx, dy);
      const want = Math.atan2(dy, dx);
      turnToward(b, want, a.diff.turn, dt);
      a.react -= dt; a.strafeT -= dt; a.fireT -= dt;
      if (a.strafeT <= 0) { a.strafe = rand() < 0.5 ? -1 : 1; a.strafeT = 0.5 + rand(); }
      const fwd = d > 10 ? 1 : d < 3.5 ? -1 : 0;
      const mx = Math.cos(want) * fwd * 0.6 - Math.sin(want) * a.strafe * 0.7;
      const my = Math.sin(want) * fwd * 0.6 + Math.cos(want) * a.strafe * 0.7;
      step(b, mx, my, SPEED, dt);
      if (a.react <= 0 && a.fireT <= 0 && Math.abs(angDiff(want, b.angle)) < 0.3) {
        a.fireT = a.diff.fireInt * (0.8 + rand() * 0.5);
        shoot(b, t, g);
      }
    } else {
      if (a.pi >= a.path.length) {
        // 순찰: 적 진영 쪽을 60% 확률로 노린다
        let goal = GameMap.randomFree();
        if (rand() < 0.6) {
          for (let i = 0; i < 8; i++) {
            const c = GameMap.randomFree();
            if ((b.team === 'red') === (c.y > GameMap.h / 2)) { goal = c; break; }
          }
        }
        repath(b, goal.x, goal.y);
      }
      follow(b, dt, SPEED);
    }

    // 아군끼리 겹치지 않도록 밀어내기
    for (const o of g.fighters) {
      if (o === b || !o.alive) continue;
      const dx = b.x - o.x, dy = b.y - o.y, d = Math.hypot(dx, dy);
      if (d < 0.5 && d > 0.001) GameMap.move(b, (dx / d) * 1.2 * dt, (dy / d) * 1.2 * dt);
    }

    // 끼임 감지: 이동하려는데 1초간 거의 안 움직이면 새 경로
    const moved = Math.hypot(b.x - px, b.y - py);
    b.speedNow = moved / Math.max(dt, 1e-4);
    b.walkPhase += moved * 3;
    if (!a.target && a.pi < a.path.length && moved < 0.2 * dt) {
      a.stuckT += dt;
      if (a.stuckT > 1) { a.stuckT = 0; a.path = []; a.pi = 0; }
    } else a.stuckT = 0;
  }

  function onDamaged(b, attacker) {
    b.hurtRecent = 1.5;
    if (b.ai && attacker && !b.ai.target) b.ai.lastSeen = { x: attacker.x, y: attacker.y };
  }

  return { init, update, onDamaged };
})();
