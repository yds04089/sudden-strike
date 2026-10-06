// 타일맵, 충돌, DDA 레이캐스트. 0=빈칸, 1=벽돌, 2=콘크리트, 3=금속 상자
const GameMap = (() => {
  const rows = [
    '111111111111111111111111',
    '1......................1',
    '1..22..............22..1',
    '1..22..............22..1',
    '1......................1',
    '1....3333......3333....1',
    '1.......11....11.......1',
    '1.......11....11.......1',
    '1......................1',
    '1..2222..........2222..1',
    '1......2........2......1',
    '1..........33..........1',
  ];
  // 위아래 대칭: 아래쪽 절반은 위쪽을 뒤집어서 만든다
  for (let i = rows.length - 1; i >= 0; i--) rows.push(rows[i]);

  const h = rows.length;
  const w = rows[0].length;
  const cells = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    if (rows[y].length !== w) throw new Error('map row ' + y + ' has wrong length');
    for (let x = 0; x < w; x++) cells[y * w + x] = rows[y][x] === '.' ? 0 : +rows[y][x];
  }

  const cell = (ix, iy) => (ix < 0 || iy < 0 || ix >= w || iy >= h ? 1 : cells[iy * w + ix]);
  const isWall = (x, y) => cell(Math.floor(x), Math.floor(y)) !== 0;
  const blocked = (x, y, r) => isWall(x - r, y - r) || isWall(x + r, y - r) || isWall(x - r, y + r) || isWall(x + r, y + r);

  // 벽 충돌 이동: 축별로 따로 처리해서 벽을 따라 미끄러지게 한다
  function move(e, dx, dy, r = 0.22) {
    if (!blocked(e.x + dx, e.y, r)) e.x += dx;
    if (!blocked(e.x, e.y + dy, r)) e.y += dy;
  }

  // DDA. (dx,dy)가 단위벡터면 실제 거리, 카메라 광선이면 카메라 평면까지의 수직 거리가 나온다.
  const hit = { dist: 0, side: 0, cell: 0, wallX: 0 };
  function cast(ox, oy, dx, dy) {
    let mx = Math.floor(ox), my = Math.floor(oy);
    const ddx = dx === 0 ? 1e30 : Math.abs(1 / dx);
    const ddy = dy === 0 ? 1e30 : Math.abs(1 / dy);
    let stepX, stepY, sdx, sdy;
    if (dx < 0) { stepX = -1; sdx = (ox - mx) * ddx; } else { stepX = 1; sdx = (mx + 1 - ox) * ddx; }
    if (dy < 0) { stepY = -1; sdy = (oy - my) * ddy; } else { stepY = 1; sdy = (my + 1 - oy) * ddy; }
    let side = 0;
    for (let i = 0; i < 80; i++) {
      if (sdx < sdy) { sdx += ddx; mx += stepX; side = 0; } else { sdy += ddy; my += stepY; side = 1; }
      if (cell(mx, my) !== 0) break;
    }
    const dist = side === 0 ? sdx - ddx : sdy - ddy;
    let wallX = side === 0 ? oy + dist * dy : ox + dist * dx;
    wallX -= Math.floor(wallX);
    hit.dist = dist; hit.side = side; hit.cell = cell(mx, my); hit.wallX = wallX;
    return dist;
  }

  const spawns = { red: [], blue: [] };
  for (const x of [2.5, 5.5, 8.5, 11.5, 12.5, 15.5, 18.5, 21.5]) {
    spawns.red.push({ x, y: 1.5 });
    spawns.blue.push({ x, y: h - 1.5 });
  }

  function randomFree() {
    for (;;) {
      const x = 1 + Math.floor(Math.random() * (w - 2)), y = 1 + Math.floor(Math.random() * (h - 2));
      if (cell(x, y) === 0) return { x, y };
    }
  }

  // 격자 BFS (8방향, 모서리 끼임 방지). 시작 칸은 제외한 칸 중심 좌표 배열을 돌려준다.
  function findPath(sx, sy, gx, gy) {
    sx = Math.floor(sx); sy = Math.floor(sy); gx = Math.floor(gx); gy = Math.floor(gy);
    if (cell(gx, gy) !== 0) return [];
    const prev = new Int16Array(w * h).fill(-2);
    const queue = [sy * w + sx];
    prev[sy * w + sx] = -1;
    const goal = gy * w + gx;
    for (let qi = 0; qi < queue.length && prev[goal] === -2; qi++) {
      const cur = queue[qi], cx = cur % w, cy = (cur / w) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (cell(nx, ny) !== 0 || prev[ny * w + nx] !== -2) continue;
          if (dx && dy && (cell(cx + dx, cy) !== 0 || cell(cx, cy + dy) !== 0)) continue;
          prev[ny * w + nx] = cur;
          queue.push(ny * w + nx);
        }
      }
    }
    if (prev[goal] === -2) return [];
    const path = [];
    for (let c = goal; c !== sy * w + sx; c = prev[c]) path.push({ x: (c % w) + 0.5, y: ((c / w) | 0) + 0.5 });
    return path.reverse();
  }

  return { w, h, cells, cell, isWall, move, cast, hit, spawns, randomFree, findPath, rayDist: cast };
})();
