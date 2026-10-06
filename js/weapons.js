// 무기 3종(소총/권총/칼), 발사·반동·재장전, 히트스캔 판정
const Weapons = (() => {
  const DEFS = [
    { id: 'rifle', name: '소총', auto: true, interval: 0.095, dmg: 24, head: 2.5, mag: 30, reserve: 120, reload: 2.1,
      base: 0.006, move: 0.02, perShot: 0.0035, max: 0.035, recoil: 7, recoilYaw: 0.012, range: 60, sound: 'rifle' },
    // 저격총: 우클릭 스코프(줌). 스코프 밖에서는 탄이 크게 퍼진다.
    { id: 'sniper', name: '저격총', auto: false, interval: 1.2, dmg: 90, head: 2.5, mag: 5, reserve: 20, reload: 2.8,
      base: 0.0004, unscoped: 0.05, move: 0.05, perShot: 0, max: 0, recoil: 30, recoilYaw: 0.01, range: 80,
      sound: 'sniper', scope: true, zoom: 3 },
    { id: 'pistol', name: '권총', auto: false, interval: 0.2, dmg: 34, head: 2.5, mag: 12, reserve: 60, reload: 1.5,
      base: 0.004, move: 0.015, perShot: 0.012, max: 0.03, recoil: 12, recoilYaw: 0.01, range: 60, sound: 'pistol' },
    { id: 'knife', name: '칼', melee: true, auto: false, interval: 0.55, dmg: 70, head: 1, range: 1.5, base: 0, move: 0, max: 0 },
  ];
  const HEAD_ZONE = 0.1; // 봇 키 위쪽 이만큼이 머리

  function reset(p) {
    p.weps = DEFS.map((def) => ({ def, mag: def.mag || 0, reserve: def.reserve || 0 }));
    p.cur = 0; p.last = 1;
    p.fireCd = 0; p.reloadT = 0; p.switchT = 0; p.kick = 0; p.flashT = 0; p.spread = 0; p.recoil = 0;
  }

  function hitscan(g, shooter, ang, slope, range) {
    const dx = Math.cos(ang), dy = Math.sin(ang);
    const wallD = Math.min(GameMap.cast(shooter.x, shooter.y, dx, dy), range);
    let best = null;
    for (const f of g.fighters) {
      if (f === shooter || !f.alive || f.team === shooter.team) continue;
      const rx = f.x - shooter.x, ry = f.y - shooter.y;
      const t = rx * dx + ry * dy;
      if (t <= 0 || t > wallD) continue;
      if (Math.abs(rx * dy - ry * dx) > 0.2) continue;
      const h = 0.5 + (shooter.z || 0) + slope * t;
      if (h < 0 || h > Render.BOT_H) continue;
      if (!best || t < best.dist) best = { f, dist: t, head: h > Render.BOT_H - HEAD_ZONE };
    }
    return best;
  }

  function switchTo(p, i) {
    if (i === p.cur || i < 0 || i >= p.weps.length) return;
    p.last = p.cur; p.cur = i;
    p.reloadT = 0; p.switchT = 0.35; p.fireCd = 0.2;
    Sound.switch();
  }

  function startReload(p) {
    const w = p.weps[p.cur];
    if (w.def.melee || p.reloadT > 0 || w.mag >= w.def.mag || w.reserve <= 0) return;
    p.reloadT = w.def.reload;
    Sound.reload();
  }

  function fire(g, p) {
    const w = p.weps[p.cur], d = w.def;
    if (p.fireCd > 0 || p.reloadT > 0 || p.switchT > 0) return;
    p.fireCd = d.interval;
    p.kick = 1;

    let target;
    if (d.melee) {
      Sound.knife();
      target = hitscan(g, p, p.angle, 0, d.range);
    } else {
      if (w.mag <= 0) { Sound.empty(); p.fireCd = 0.25; startReload(p); return; }
      w.mag--;
      const unscoped = d.scope && p.zoom < d.zoom - 0.3 ? d.unscoped : 0;
      const spread = d.base + p.spread + unscoped + (p.speedNow > 0.5 || p.z > 0 ? d.move : 0);
      const ang = p.angle + (Math.random() * 2 - 1) * spread;
      const slope = p.pitch / Render.FOCAL + (Math.random() * 2 - 1) * spread;
      target = hitscan(g, p, ang, slope, d.range);
      p.spread = Math.min(d.max, p.spread + d.perShot);
      const kick = d.recoil * (0.7 + Math.random() * 0.6);
      p.pitch += kick; p.recoil += kick;
      p.angle += (Math.random() - 0.5) * d.recoilYaw;
      p.flashT = 0.05;
      Sound[d.sound]();
      if (w.mag === 0) startReload(p);
    }
    if (target) g.damage(target.f, d.dmg * (target.head ? d.head : 1), p, target.head);
  }

  function update(p, dt, firing) {
    p.fireCd -= dt; p.switchT -= dt; p.flashT -= dt;
    p.kick = Math.max(0, p.kick - dt * 8);
    p.spread = Math.max(0, p.spread - dt * 0.05);
    if (p.reloadT > 0) {
      p.reloadT -= dt;
      if (p.reloadT <= 0) {
        const w = p.weps[p.cur];
        const take = Math.min(w.def.mag - w.mag, w.reserve);
        w.mag += take; w.reserve -= take;
      }
    }
    // 사격을 멈추면 반동으로 튄 시점이 일부 돌아온다
    if (!firing && p.recoil > 0) {
      const back = Math.min(p.recoil, 90 * dt);
      p.pitch -= back; p.recoil -= back;
    }
  }

  return { DEFS, reset, fire, update, switchTo, startReload };
})();
