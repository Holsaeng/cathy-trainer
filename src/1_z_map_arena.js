
// ============================== 원형 맵: 원형 투기장 (LoL 아레나 3:3풍) ==============================
//   다른 맵과 별개 공간: 맵마다 공간 크기(world)를 따로 가짐 → 이 맵은 36×36m, 원 지름 34.4m(반지름 17.2m)
//   원 바깥을 계단식 벽으로 채워 원형 경계를 만듦 → 이동·시야·투사체·돌진 규칙은 기존 벽 그대로 적용
//   가운데는 가로 띠, 위·아래는 세로 기둥(0.45m) → 계단 오차 0.45m 이하, 벽은 원 안으로 들어오지 않음. 화면에는 매끈한 원으로 그림
//   안쪽: 기둥 6개(높은 벽), 낮은 턱 2개·창문 벽 2개(시야 통과), 부쉬 4개 — 점대칭(양쪽 조건 동일)
CONFIG.worldBase = Object.assign({}, CONFIG.world);   // 기본 공간(다른 맵) — Game.start에서 맵마다 CONFIG.world를 바꿈
(() => {
  const W = 36, H = 36, cx = W / 2, cy = H / 2, R = 17.2, s = 0.45, k = R * Math.SQRT1_2;
  const walls = [], f3 = v => +v.toFixed(3), add = (x, y, w, h) => { if (w > 1e-3 && h > 1e-3) walls.push({ x: f3(x), y: f3(y), w: f3(w), h: f3(h), edge: true }); };
  const chord = d => Math.sqrt(Math.max(0, R * R - d * d));
  const n = Math.ceil(2 * k / s), st = 2 * k / n;
  for (let i = 0; i < n; i++) {   // 가운데 띠: 왼쪽·오른쪽 (중심에서 가장 가까운 y의 현 → 벽이 원 안으로 안 들어옴)
    const y = cy - k + i * st, half = chord(Math.min(Math.abs(y - cy), Math.abs(y + st - cy), (y < cy && y + st > cy) ? 0 : Infinity));
    add(0, y, cx - half, st); add(cx + half, y, W - cx - half, st);
  }
  for (let i = 0; i < n; i++) {   // 위·아래 덮개: 세로 기둥
    const x = cx - k + i * st, half = chord(Math.min(Math.abs(x - cx), Math.abs(x + st - cx), (x < cx && x + st > cx) ? 0 : Infinity));
    add(x, 0, st, cy - half); add(x, cy + half, st, H - cy - half);
  }
  add(0, 0, cx - k, cy - k); add(cx + k, 0, W - cx - k, cy - k); add(0, cy + k, cx - k, H - cy - k); add(cx + k, cy + k, W - cx - k, H - cy - k);   // 모서리
  // 안쪽 지형: 중심 대칭(점대칭) — (x, y) ↔ (W - x - w, H - y - h)
  const sym = o => [o, Object.assign({}, o, { x: f3(W - o.x - o.w), y: f3(H - o.y - o.h) })];
  walls.push(
    ...sym({ x: 11.3, y: 11.3, w: 1.4, h: 1.4 }), ...sym({ x: 23.3, y: 11.3, w: 1.4, h: 1.4 }),   // 안쪽 기둥 4개(이동·시야 차단) — 벽꿍·시야 끊기
    ...sym({ x: 17.2, y: 5.2, w: 1.6, h: 1.6 }),                                                  // 위·아래 큰 기둥
    ...sym({ x: 17.7, y: 13.4, w: 0.6, h: 1.8, kind: 'low' }),                                    // 중앙 낮은 턱(시야 통과)
    ...sym({ x: 24.5, y: 8.6, w: 3.2, h: 0.5, kind: 'glass' }),                                   // 창문 벽(너머가 보임)
  );
  const bushes = [...sym({ x: 16.8, y: 8.2, w: 2.4, h: 1.8 }), ...sym({ x: 4.6, y: 10.6, w: 2.2, h: 2.6 })];
  CONFIG.maps.arena = {
    name: '원형 투기장', world: { w: W, h: H }, round: { c: { x: cx, y: cy }, r: R }, walls, bushes,
    spawns: { p: { x: cx - 9, y: cy }, e: { x: cx + 9, y: cy } },
    animals: [{ x: cx, y: 11 }, { x: cx, y: 25 }, { x: cx, y: cy }],
  };
})();
