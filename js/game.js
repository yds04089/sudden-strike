// 게임 상태, 플레이어 조작, 팀 데스매치 규칙
const Game = (() => {
  const NAMES = ['Alpha', 'Bravo', 'Charlie', 'Delta', 'Echo', 'Foxtrot', 'Golf', 'Hotel', 'India', 'Juliet'];
  const PLAYER_SPEED = 3.6, WALK_SPEED = 1.7, SENS = 0.0022, JUMP_V = 2.0, GRAVITY = 9;
  const KILL_LIMIT = 30, MATCH_TIME = 360, RESPAWN = 3;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  const G = {
    state: 'menu', demo: false, diff: 'normal', fighters: [], player: null,
    scores: { red: 0, blue: 0 }, killLimit: KILL_LIMIT, timeLeft: MATCH_TIME, time: 0,
    feed: [], indicators: [], marker: { t: 0, kill: false, head: false }, hurtT: 0, killer: null,
    result: null, onEnd: null,
  };

  function makeFighter(name, team, isPlayer) {
    return {
      name, team, isPlayer, x: 0, y: 0, angle: 0, pitch: 0, hp: 100, alive: false, invuln: 0,
      kills: 0, deaths: 0, respawnT: 0, corpseT: 0, speedNow: 0, vx: 0, vy: 0, flash: 0,
      walkPhase: 0, hurtRecent: 0, ai: null, bobT: 0, bobAmp: 0, fireHeld: false, z: 0, vz: 0, zoom: 1,
    };
  }

  function pickSpawn(f) {
    const enemies = G.fighters.filter((o) => o.alive && o.team !== f.team);
    const scored = GameMap.spawns[f.team].map((s) => {
      let d = 99;
      for (const e of enemies) d = Math.min(d, Math.hypot(e.x - s.x, e.y - s.y));
      return { s, d: d + Math.random() * 4 };
    });
    scored.sort((a, b) => b.d - a.d);
    return scored[0].s;
  }

  function respawn(f) {
    const s = pickSpawn(f);
    f.x = s.x; f.y = s.y;
    f.angle = f.team === 'red' ? Math.PI / 2 : -Math.PI / 2;
    f.pitch = 0; f.hp = 100; f.alive = true; f.invuln = 2; f.corpseT = 0;
    f.speedNow = 0; f.vx = f.vy = 0; f.hurtRecent = 0; f.z = f.vz = 0; f.zoom = 1;
    if (f.isPlayer) { Weapons.reset(f); G.killer = null; }
    if (!f.isPlayer || G.demo) Bot.init(f, G.diff);
  }

  G.start = function (opts) {
    G.diff = opts.diff || 'normal';
    G.demo = !!opts.demo;
    G.fighters = [];
    G.scores = { red: 0, blue: 0 };
    G.timeLeft = MATCH_TIME; G.time = 0; G.feed = []; G.indicators = []; G.result = null;
    G.marker.t = 0; G.hurtT = 0;
    const n = opts.teamSize || 4;
    G.player = makeFighter('YOU', 'blue', true);
    G.fighters.push(G.player);
    let ni = 0;
    for (let i = 1; i < n; i++) G.fighters.push(makeFighter(NAMES[ni++ % NAMES.length], 'blue', false));
    for (let i = 0; i < n; i++) G.fighters.push(makeFighter(NAMES[ni++ % NAMES.length], 'red', false));
    for (const f of G.fighters) respawn(f);
    Input.reset();
    G.state = 'playing';
  };

  function updatePlayer(p, dt) {
    const K = Input.keys;
    const [mdx, mdy] = Input.consumeMouse();
    p.angle += (mdx * SENS) / p.zoom;      // 줌하면 감도도 같이 낮춘다
    p.pitch = clamp(p.pitch - (mdy * 1.0) / p.zoom, -120, 120);

    // 점프: 카메라 높이(z)만 바뀐다. 벽은 모두 천장까지 닿아서 넘을 수는 없다.
    if (p.z === 0 && K.Space) p.vz = JUMP_V;
    if (p.z > 0 || p.vz > 0) {
      p.vz -= GRAVITY * dt;
      p.z += p.vz * dt;
      if (p.z <= 0) { p.z = 0; p.vz = 0; }
    }

    // 키보드(0/1)와 조이스틱(아날로그)을 합친다. 방향은 정규화하고, 크기(최대 1)만큼 속도를 줄인다.
    const fx = (K.KeyW ? 1 : 0) - (K.KeyS ? 1 : 0) + Input.axis.y;
    const sx = (K.KeyD ? 1 : 0) - (K.KeyA ? 1 : 0) + Input.axis.x;
    const len = Math.hypot(fx, sx) || 1, mag = Math.min(1, len);
    const speed = (K.ShiftLeft || K.ShiftRight ? WALK_SPEED : PLAYER_SPEED) * mag;
    const c = Math.cos(p.angle), s = Math.sin(p.angle);
    const tx = ((c * fx - s * sx) / len) * speed, ty = ((s * fx + c * sx) / len) * speed;
    const k = Math.min(1, dt * 14);
    p.vx += (tx - p.vx) * k; p.vy += (ty - p.vy) * k;
    const px = p.x, py = p.y;
    GameMap.move(p, p.vx * dt, p.vy * dt);
    p.speedNow = Math.hypot(p.x - px, p.y - py) / dt;
    p.bobT += p.speedNow * dt * 2.2;
    const bobTarget = p.z > 0 ? 0 : Math.min(1, p.speedNow / PLAYER_SPEED);
    p.bobAmp += (bobTarget - p.bobAmp) * Math.min(1, dt * 8);

    const n = p.weps.length;
    for (let i = 0; i < n; i++) if (Input.wasPressed('Digit' + (i + 1))) Weapons.switchTo(p, i);
    if (Input.wasPressed('KeyQ')) Weapons.switchTo(p, p.last);
    const wheel = Input.consumeWheel();
    if (wheel) Weapons.switchTo(p, (p.cur + (wheel > 0 ? 1 : n - 1)) % n);
    if (Input.wasPressed('KeyR')) Weapons.startReload(p);

    const def = p.weps[p.cur].def;
    // 저격총: 우클릭을 누르고 있는 동안 스코프 줌 (무기 교체/재장전 중에는 해제)
    const wantZoom = def.scope && Input.aim && p.reloadT <= 0 && p.switchT <= 0 ? def.zoom : 1;
    p.zoom += (wantZoom - p.zoom) * Math.min(1, dt * 14);
    if (Math.abs(p.zoom - wantZoom) < 0.02) p.zoom = wantZoom;
    const firing = Input.fire;
    if (firing && (def.auto || !p.fireHeld)) Weapons.fire(G, p);
    p.fireHeld = firing;
    Weapons.update(p, dt, firing);
  }

  G.damage = function (t, dmg, attacker, head) {
    if (!t.alive || t.invuln > 0 || G.state !== 'playing') return;
    t.hp -= dmg;
    if (t.isPlayer) {
      G.indicators.push({ angle: Math.atan2(attacker.y - t.y, attacker.x - t.x), t: 1.3 });
      G.hurtT = 0.5;
      Sound.hurt();
    } else {
      Bot.onDamaged(t, attacker);
    }
    if (attacker.isPlayer) {
      G.marker.t = 0.25; G.marker.kill = t.hp <= 0; G.marker.head = head;
      head ? Sound.headshot() : Sound.hit();
    }
    if (t.hp <= 0) kill(t, attacker, head);
  };

  function kill(t, killer, head) {
    t.alive = false; t.hp = 0; t.deaths++; t.respawnT = RESPAWN; t.corpseT = 0;
    killer.kills++;
    G.scores[killer.team]++;
    G.feed.push({ killer: killer.name, kteam: killer.team, victim: t.name, vteam: t.team, head, t: 5 });
    if (G.feed.length > 5) G.feed.shift();
    if (t.isPlayer) { G.killer = killer; t.zoom = 1; }
    if (killer.isPlayer) Sound.kill();
    if (G.scores[killer.team] >= G.killLimit) end();
  }

  function end() {
    if (G.state !== 'playing') return;
    G.state = 'over';
    const { red, blue } = G.scores;
    G.result = red === blue ? 'draw' : (blue > red ? 'blue' : 'red');
    if (document.pointerLockElement) document.exitPointerLock();
    const win = G.result === 'blue';
    Sound.over(win);
    if (G.onEnd) G.onEnd(G.result);
  }

  G.update = function (dt) {
    if (G.state !== 'playing') return;
    G.time += dt;
    G.timeLeft -= dt;
    if (G.timeLeft <= 0) { G.timeLeft = 0; end(); return; }
    for (const f of G.fighters) {
      f.invuln -= dt; f.flash -= dt; f.hurtRecent -= dt;
      if (f.alive) {
        if (f.isPlayer && !G.demo) updatePlayer(f, dt); else Bot.update(f, dt, G);
      } else {
        f.respawnT -= dt; f.corpseT += dt;
        if (f.respawnT <= 0) respawn(f);
        if (f.isPlayer) f.pitch *= 0.9;
      }
    }
    for (const i of G.indicators) i.t -= dt;
    G.indicators = G.indicators.filter((i) => i.t > 0);
    for (const e of G.feed) e.t -= dt;
    G.feed = G.feed.filter((e) => e.t > 0);
    G.marker.t -= dt; G.hurtT -= dt;
  };

  return G;
})();
