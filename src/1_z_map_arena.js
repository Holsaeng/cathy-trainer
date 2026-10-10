
// ============================== 원형 맵: 원형 투기장 (LoL 아레나 3:3풍) ==============================
//   원 바깥을 계단식 벽(띠)으로 채워 원형 경계를 만듦 → 이동·시야·투사체·돌진 규칙은 기존 벽 그대로 적용
//   가운데는 가로 띠, 위·아래는 세로 기둥(0.4m) → 계단 오차 0.4m 이하, 벽은 원 안으로 들어오지 않음. 화면에는 매끈한 원으로 그림
//   안쪽: 기둥 4개(높은 벽), 낮은 턱 2개(시야 통과), 위·아래 부쉬
(() => {
  const W = CONFIG.world.w, H = CONFIG.world.h, cx = W / 2, cy = H / 2, R = 8.6, s = 0.4, k = R * Math.SQRT1_2;
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
  // 안쪽 지형: 중심 대칭(점대칭) — 양쪽 조건 동일
  walls.push(
    { x: 12.4, y: 4.8, w: 1.2, h: 1.2 }, { x: 18.4, y: 12.0, w: 1.2, h: 1.2 },   // 기둥(이동·시야 차단) — 벽꿍·시야 끊기
    { x: 18.4, y: 4.8, w: 1.2, h: 1.2 }, { x: 12.4, y: 12.0, w: 1.2, h: 1.2 },
    { x: 15.7, y: 6.2, w: 0.6, h: 1.4, kind: 'low' }, { x: 15.7, y: 10.4, w: 0.6, h: 1.4, kind: 'low' },   // 중앙 낮은 턱(시야 통과)
  );
  CONFIG.maps.arena = {
    name: '원형 투기장', round: { c: { x: cx, y: cy }, r: R }, walls,
    bushes: [{ x: 14.8, y: 1.9, w: 2.4, h: 1.6 }, { x: 14.8, y: 14.5, w: 2.4, h: 1.6 }],
    spawns: { p: { x: cx - 6, y: cy }, e: { x: cx + 6, y: cy } },
    animals: [{ x: cx, y: 4.6 }, { x: cx, y: 13.4 }, { x: cx, y: cy }],
  };
})();
