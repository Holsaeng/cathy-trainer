
// ============================== 유틸 ==============================
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
// 판정용 난수(시드): 같은 시드 + 같은 입력 = 같은 결과 → 리플레이·온라인 대전 준비. Game.start마다 새 시드(opts.seed로 지정 가능)
//   치명타·AI 판단·소음 위치·회피 패턴처럼 결과에 영향을 주는 곳만 rnd()/rand(). 화면 효과·소리는 Math.random 그대로
const Rng = {
  s: 1, seed0: 1,
  seed(v) { this.s = this.seed0 = (v >>> 0) || 1; },
  next() { let t = (this.s = (this.s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; },   // mulberry32
};
const rnd = () => Rng.next();
// 내 편 = 내 캐릭터와 같은 팀 (온라인 대전 손님은 팀 1). 화면 표시(색·시야)에만 사용
// 게임 버전(빌드 때 내용 해시로 채움). 온라인 대전은 버전이 같아야 연결됨
const BUILD_ID = '__BUILD__';
const myTeam = () => (typeof Game !== 'undefined' && Game.player) ? Game.player.team : 0;
const rand = (a, b) => a + Rng.next() * (b - a);
const vrand = (a, b) => a + Math.random() * (b - a);   // 화면 효과용 (판정 난수를 소모하지 않음)
const V = {
  add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }), sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
  mul: (a, s) => ({ x: a.x * s, y: a.y * s }), len: a => Math.hypot(a.x, a.y), dist: (a, b) => Math.hypot(a.x - b.x, a.y - b.y),
  norm: a => { const l = Math.hypot(a.x, a.y); return l > 1e-9 ? { x: a.x / l, y: a.y / l } : { x: 1, y: 0 }; },
  dot: (a, b) => a.x * b.x + a.y * b.y, perp: a => ({ x: -a.y, y: a.x }), ang: a => Math.atan2(a.y, a.x),
  fromAng: t => ({ x: Math.cos(t), y: Math.sin(t) }), lerp: (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }),
  copy: a => ({ x: a.x, y: a.y }),
};
const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return d; };
const lv = (v, l) => Array.isArray(v) ? v[clamp(l - 1, 0, v.length - 1)] : v;   // 레벨별 수치 조회
const fmt = (n, d = 0) => Number(n).toFixed(d);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const SKILL_KEYS = ['Q', 'W', 'E', 'R', 'D'];
const SRC_LABEL = { Q: 'Q 동맥절제술', W: 'W 앰퓨테이션', E: 'E 수쳐', 'E충돌': 'E 충돌', R: 'R 이머전시 OP', D: 'D 무기 스킬', F: 'F 전술 스킬', AA: '기본 공격', 'AA+': '강화 평타', P: '패시브 외상' };
const SRC_COLOR = { Q: '#ff3b5c', W: '#ff8f3b', E: '#3fd0c9', 'E충돌': '#7fe3dc', R: '#ffc857', D: '#b18cff', F: '#9fd8ff', AA: '#d0d4dd', 'AA+': '#ff9fb2', P: '#ff6b9a' };

// ============================== 기하/충돌 ==============================
const Geo = {
  // 점-선분 거리
  segDist(p, a, b) {
    const abx = b.x - a.x, aby = b.y - a.y, l2 = abx * abx + aby * aby;
    let t = l2 ? ((p.x - a.x) * abx + (p.y - a.y) * aby) / l2 : 0; t = clamp(t, 0, 1);
    return Math.hypot(p.x - (a.x + abx * t), p.y - (a.y + aby * t));
  },
  // 부채꼴-원 판정
  inSector(c, ang, R, half, p, r) {
    const d = V.dist(c, p); if (d - r > R) return false; if (d < r + 0.01) return true;
    const a = Math.atan2(p.y - c.y, p.x - c.x);
    return Math.abs(angDiff(a, ang)) <= half + Math.asin(Math.min(1, r / d));
  },
  // 회전 사각형-원 판정 (시작점 s, 방향 dir, 길이 len, 반폭 halfW)
  inORect(s, dir, len, halfW, p, r) {
    const rx = p.x - s.x, ry = p.y - s.y, along = rx * dir.x + ry * dir.y, perp = Math.abs(-rx * dir.y + ry * dir.x);
    return along >= -r && along <= len + r && perp <= halfW + r;
  },
  _slab(o, d, x0, y0, x1, y1) {
    if (o.x > x0 && o.x < x1 && o.y > y0 && o.y < y1) return Infinity;   // 이미 내부면 무시
    let tmin = -Infinity, tmax = Infinity;
    if (Math.abs(d.x) < 1e-9) { if (o.x < x0 || o.x > x1) return Infinity; }
    else { let a = (x0 - o.x) / d.x, b = (x1 - o.x) / d.x; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
    if (Math.abs(d.y) < 1e-9) { if (o.y < y0 || o.y > y1) return Infinity; }
    else { let a = (y0 - o.y) / d.y, b = (y1 - o.y) / d.y; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
    if (tmax < tmin || tmax < 0) return Infinity;
    return tmin >= 0 ? tmin : Infinity;
  },
  // 광선이 벽/경계에 처음 닿는 거리 (dist 이내가 아니면 Infinity)
  rayHit(o, d, dist, pad) {
    let best = Infinity;
    for (const w of CONFIG.walls) { const t = Geo._slab(o, d, w.x - pad, w.y - pad, w.x + w.w + pad, w.y + w.h + pad); if (t < best) best = t; }
    const W = CONFIG.world.w, H = CONFIG.world.h;
    if (d.x > 1e-9) best = Math.min(best, (W - pad - o.x) / d.x); else if (d.x < -1e-9) best = Math.min(best, (pad - o.x) / d.x);
    if (d.y > 1e-9) best = Math.min(best, (H - pad - o.y) / d.y); else if (d.y < -1e-9) best = Math.min(best, (pad - o.y) / d.y);
    best = Math.max(0, best);
    return best <= dist ? best : Infinity;
  },
  // 간단한 길찾기: 목표까지 직선이 벽에 막히면 그 벽의 모서리를 경유
  detour(pos, target, r) {
    const dist = V.dist(pos, target); if (dist < 0.05) return target;
    const dir = V.norm(V.sub(target, pos)), pad = r - 0.05;
    let wall = null, bt = Infinity;
    for (const w of CONFIG.walls) { const t = Geo._slab(pos, dir, w.x - pad, w.y - pad, w.x + w.w + pad, w.y + w.h + pad); if (t < bt && t <= dist) { bt = t; wall = w; } }
    if (!wall) return target;
    const cp = r + 0.2, W = wall, corners = [{ x: W.x - cp, y: W.y - cp }, { x: W.x + W.w + cp, y: W.y - cp }, { x: W.x - cp, y: W.y + W.h + cp }, { x: W.x + W.w + cp, y: W.y + W.h + cp }];
    let best = null, bc = Infinity;
    for (const c of corners) {
      const cd = V.dist(pos, c); if (cd < 0.35) continue;   // 방금 도착한 모서리는 제외
      const t = Geo._slab(pos, V.norm(V.sub(c, pos)), W.x - pad, W.y - pad, W.x + W.w + pad, W.y + W.h + pad);
      if (t < cd - 0.05) continue;   // 모서리까지도 막힘
      const cost = cd + V.dist(c, target); if (cost < bc) { bc = cost; best = c; }
    }
    return best ? Geo.pushOut(V.copy(best), r) : target;
  },
  inWall(p, r) { return CONFIG.walls.some(w => p.x > w.x - r && p.x < w.x + w.w + r && p.y > w.y - r && p.y < w.y + w.h + r); },
  // 지형 통과 돌진의 착지점: 벽 안이면 진행 방향으로 빠져나간 지점, 그래도 안 되면 뒤로
  // 광선이 사각형을 지나는 구간 [진입, 이탈] (없으면 null)
  _span(o, d, x0, y0, x1, y1) {
    let tmin = -Infinity, tmax = Infinity;
    if (Math.abs(d.x) < 1e-9) { if (o.x < x0 || o.x > x1) return null; } else { let a = (x0 - o.x) / d.x, b = (x1 - o.x) / d.x; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
    if (Math.abs(d.y) < 1e-9) { if (o.y < y0 || o.y > y1) return null; } else { let a = (y0 - o.y) / d.y, b = (y1 - o.y) / d.y; if (a > b) [a, b] = [b, a]; tmin = Math.max(tmin, a); tmax = Math.min(tmax, b); }
    return tmax >= tmin && tmax > 0 ? [tmin, tmax] : null;
  },
  // 벽 넘는 돌진: 돌진 끝이 벽 안이면, 벽 두께의 thresh 비율 이상 지났으면 벽 너머로, 아니면 벽 앞에서 멈춤
  //  캐시 Q = 0.85 (벽 85%를 지나면 넘음) / 캐시 R = 0.8 / 다니엘 E·AI 도약 = 0.5 (벽 중심 안쪽에서 끝나면 못 넘음)
  passDash(o, d, dist, r, thresh = 0.5) {
    const W = CONFIG.world.w, H = CONFIG.world.h, inB = p => p.x >= r && p.x <= W - r && p.y >= r && p.y <= H - r;
    let L = dist; const end = q => V.add(o, V.mul(d, q));
    while (!inB(end(L)) && L > 0) L -= 0.05;   // 아레나 경계
    for (const w of CONFIG.walls) {
      const e = Geo._span(o, d, w.x - r, w.y - r, w.x + w.w + r, w.y + w.h + r);   // 몸 반경만큼 넓힌 벽
      if (!e || e[0] <= 0 || !(e[0] < L && L < e[1])) continue;                     // 돌진 끝이 이 벽 안일 때만
      const raw = Geo._span(o, d, w.x, w.y, w.x + w.w, w.y + w.h);
      const f = raw ? (L - raw[0]) / Math.max(1e-6, raw[1] - raw[0]) : 0;
      if (f >= thresh && inB(end(e[1] + 0.03)) && !Geo.inWall(end(e[1] + 0.03), r)) return e[1] + 0.03;   // 넘어감
      return Math.max(0, e[0] - 0.03);                                                                        // 벽 앞에서 멈춤
    }
    if (Geo.inWall(end(L), r)) return Geo.clampDash(o, d, L, r);
    return L;
  },
  passLanding(o, d, dist, r) { return Geo.passDash(o, d, dist, r, 0.5); },   // AI 도약(카티야 E 등): 벽 중심 규칙
  clampDash(o, d, dist, pad) { const t = Geo.rayHit(o, d, dist, pad); return t === Infinity ? dist : Math.max(0, t - 0.02); },
  // 벽 밖으로 밀어내기
  pushOut(pos, r) {
    for (const w of CONFIG.walls) {
      const cx = clamp(pos.x, w.x, w.x + w.w), cy = clamp(pos.y, w.y, w.y + w.h);
      const dx = pos.x - cx, dy = pos.y - cy, d = Math.hypot(dx, dy);
      if (d < 1e-6) {
        const l = pos.x - w.x, rr = w.x + w.w - pos.x, t = pos.y - w.y, b = w.y + w.h - pos.y, m = Math.min(l, rr, t, b);
        if (m === l) pos.x = w.x - r; else if (m === rr) pos.x = w.x + w.w + r; else if (m === t) pos.y = w.y - r; else pos.y = w.y + w.h + r;
      } else if (d < r) { pos.x = cx + dx / d * r; pos.y = cy + dy / d * r; }
    }
    pos.x = clamp(pos.x, r, CONFIG.world.w - r); pos.y = clamp(pos.y, r, CONFIG.world.h - r);
    return pos;
  },
};

// ============================== 시야(부쉬) ==============================
const Vision = {
  // 이터널 리턴 시야 규칙 (공식 패치 노트·나무위키·유튜브 시야 강의)
  //  · 기본 시야 낮 8.5m / 밤 3.4m → 서서히 6.4m. 높은 벽은 시야를 막고(암시야), 낮은 턱·화단은 이동만 막고 시야는 통과, 창문 벽은 너머가 보임
  //  · 부쉬: 안에서는 밖이 보이고 밖에서는 안이 안 보임(2.2m 이내·같은 부쉬 제외). 시야 안의 부쉬에 들어가면 흔들림이 보임
  //  · 시야 밖 행동은 소음(스킬·평타 '!' 핑, 발소리 — 부쉬 안에선 발소리 없음)으로 대략적인 위치가 드러남
  //  · 망원 카메라(13m, 벽에 가려짐, 은신 감지) · 정찰 드론(목표 지점 원형 5초, 벽 무시)
  reveals: [],   // 원형 시야 구역 {team, pos, r, t, drone} — 정찰 드론·카티야 정찰 다트 등 (벽 무시)
  fogOn: false,  // 시야 시스템 사용 여부 — 1:1 결투
  ghosts: {},    // 시야에서 사라진 적의 마지막 위치 {id: {pos, r, color, t}}
  noises: [],    // 소음 {pos, team, kind, r, t, max, src, born}
  rustles: [],   // 부쉬 흔들림 {b, pt, t, team}
  night: false, nightT: 0, cycleT: 0, timeMode: 'day',
  isBlocker(w) { return !w.kind || w.kind === 'wall'; },   // 시야를 막는 벽(높은 벽)
  // 시야 차단 벽까지의 거리 (없으면 Infinity)
  rayBlock(o, d, dist) {
    let best = Infinity;
    for (const w of CONFIG.walls) { if (!Vision.isBlocker(w)) continue; const t = Geo._slab(o, d, w.x, w.y, w.x + w.w, w.y + w.h); if (t < best) best = t; }
    return best <= dist ? Math.max(0, best) : Infinity;
  },
  baseSight() {
    const V0 = CONFIG.vision; if (!Vision.night) return V0.sight;
    return lerp(V0.night.start, V0.night.end, clamp(Vision.nightT / V0.night.ramp, 0, 1));
  },
  sightOf(u) { const rest = u.rest ? (Vision.night ? CONFIG.rest.sightNight : CONFIG.rest.sightDay) : 0; return ((u.sight || Vision.baseSight()) - rest) * (u.sightMul || 1); },   // 휴식 중 시야 감소
  // a→b 사이에 시야를 막는 벽이 없는가 (시야선)
  los(a, b) { const d = V.dist(a, b); if (d < 1e-6) return true; return Vision.rayBlock(a, V.mul(V.sub(b, a), 1 / d), d) === Infinity; },
  inSight(viewer, pt, r = 0) { return V.dist(viewer.pos, pt) - r <= Vision.sightOf(viewer) && Vision.los(viewer.pos, pt); },
  // 팀의 설치물(카메라)·원형 시야 구역이 이 지점을 보는가
  wards(team) { return Game.units.filter(u => u.kind === 'ward' && !u.dead && u.team === team); },
  zoneSees(team, pt, r = 0) {
    if (Vision.reveals.some(z => z.team === team && V.dist(z.pos, pt) - r <= z.r)) return true;
    return Vision.wards(team).some(w => V.dist(w.pos, pt) - r <= w.sightR() && Vision.los(w.pos, pt));
  },
  detects(team, pt) { return Vision.wards(team).some(w => w.detect && V.dist(w.pos, pt) <= w.sightR() && Vision.los(w.pos, pt)); },   // 은신 감지(망원 카메라)
  // 플레이어 기준으로 이 지점이 보이는가 (투사체·잔상·흔들림 표시용)
  pointVisible(pt) { const p = Game.player; return !Vision.fogOn || !p || (!p.dead && Vision.inSight(p, pt)) || Vision.zoneSees(p.team, pt); },
  // 시야 다각형: 반경까지 광선을 쏴서 시야 차단 벽에 막히는 지점들
  polyFrom(pos, R) {
    const N = CONFIG.vision.rays, pts = [];
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, d = { x: Math.cos(a), y: Math.sin(a) }, t = Vision.rayBlock(pos, d, R); pts.push(V.add(pos, V.mul(d, t === Infinity ? R : t))); }
    return pts;
  },
  poly(viewer) { return Vision.polyFrom(viewer.pos, Vision.sightOf(viewer)); },
  bushAt(p) { return (CONFIG.bushes || []).findIndex(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); },
  // 점에서 부쉬 사각형까지 거리
  rectDist(p, b) { const dx = Math.max(b.x - p.x, 0, p.x - (b.x + b.w)), dy = Math.max(b.y - p.y, 0, p.y - (b.y + b.h)); return Math.hypot(dx, dy); },
  // viewer가 target을 볼 수 있는가
  visible(viewer, target) {
    if (!viewer || !target) return true;
    if (viewer.team === target.team) return true;
    const pt = target.pos, zone = () => Vision.zoneSees(viewer.team, pt, target.r);
    if (target.stealthT > 0) return Vision.detects(viewer.team, pt);                                     // 은신: 카메라만 감지
    if (viewer.blindT > 0 && V.dist(viewer.pos, pt) > (viewer.blindR || 4.5)) return zone();             // 시야 감소(다니엘 W) — 설치물 시야는 그대로
    if (Vision.fogOn && !Vision.inSight(viewer, pt, target.r)) return zone();                             // 시야 반경 밖·벽 뒤(암시야)
    if (target.revealT > 0) return true;                                                                   // 행동·피격 노출
    const b = Vision.bushAt(pt); if (b < 0) return true;
    if (Vision.bushAt(viewer.pos) === b || V.dist(viewer.pos, pt) <= CONFIG.vision.bushReveal) return true;
    return zone();                                                                                         // 부쉬 속: 카메라·드론 시야로만
  },
  // ---------- 소음 ----------
  // 시야 밖에서 난 소리: 스킬·평타는 '!' 핑, 이동은 발소리(부쉬 안에서는 발소리 없음)
  noise(u, kind) {
    if (!Vision.fogOn || !u || u.dead) return;
    const N = CONFIG.vision.noise, r = N[kind] || N.skill;
    if (kind === 'step' && Vision.bushAt(u.pos) >= 0) return;
    const j = kind === 'step' ? 0.2 : N.jitter, pos = { x: u.pos.x + (rnd() - 0.5) * 2 * j, y: u.pos.y + (rnd() - 0.5) * 2 * j };
    const life = kind === 'step' ? N.stepLife : N.ping;
    Vision.noises.push({ pos, team: u.team, kind, r, t: life, max: life, src: u, born: Game.time });
  },
  // 행동(스킬·평타) = 부쉬 속이면 잠깐 노출 + 소음
  act(u, kind = 'skill') { if (!u) return; u.revealT = Math.max(u.revealT || 0, CONFIG.vision.actionReveal); Vision.noise(u, kind); },
  // 이 유닛(듣는 쪽) 기준, since 이후 들린 상대 소음 중 가장 최근 것
  heard(listener, since = 0) {
    let best = null;
    for (const n of Vision.noises) if (n.team !== listener.team && n.team !== 2 && n.born > since && V.dist(n.pos, listener.pos) <= n.r && (!best || n.born > best.born)) best = n;
    return best;
  },
  // ---------- 부쉬 흔들림 ----------
  rustle(b, pt, team, skill) { if (b < 0) return; const R = Vision.rustles.find(r => r.b === b && r.team === team); if (R) { R.t = CONFIG.vision.rustle; R.pt = V.copy(pt); R.born = Game.time; R.skill = !!skill; } else Vision.rustles.push({ b, pt: V.copy(pt), t: CONFIG.vision.rustle, team, born: Game.time, skill: !!skill }); },
  // ---------- 낮/밤 ----------
  setTime(mode) { Vision.timeMode = mode || 'day'; Vision.night = mode === 'night'; Vision.nightT = 0; Vision.cycleT = 0; },
  updateTime(dt) {
    const V0 = CONFIG.vision;
    if (Vision.night) Vision.nightT += dt;
    if (Vision.timeMode !== 'cycle') return;
    Vision.cycleT += dt;
    const len = Vision.night ? V0.cycle.night : V0.cycle.day;
    if (Vision.cycleT >= len) {
      Vision.cycleT = 0; Vision.night = !Vision.night; Vision.nightT = 0;
      FX.toastAll(Vision.night ? '🌙 밤이 되었습니다 — 시야 3.4m에서 서서히 회복' : '☀ 낮이 되었습니다 — 시야 8.5m', Vision.night ? '#8fa8ff' : CONFIG.theme.gold);
    }
  },
  update(dt) {
    Vision.reveals = Vision.reveals.filter(z => (z.t -= dt) > 0);
    Vision.noises = Vision.noises.filter(n => (n.t -= dt) > 0);
    Vision.rustles = Vision.rustles.filter(r => (r.t -= dt) > 0);
    if (!Vision.fogOn || !Game.player) return;
    Vision.updateTime(dt);
    const N = CONFIG.vision.noise;
    for (const u of Game.units) {
      if (u.dead || u.kind === 'ward') continue;
      // 발소리
      const moving = V.len(u.vel || { x: 0, y: 0 }) > 0.6 || (u.act && u.act.type === 'dash');
      if (moving && (u.stepT = (u.stepT || 0) - dt) <= 0) { u.stepT = N.stepEvery; if (u.team !== 2) Vision.noise(u, 'step'); }
      // 부쉬 진입 흔들림
      const b = Vision.bushAt(u.pos);
      if (b >= 0 && u._bush !== b) Vision.rustle(b, u.pos, u.team);
      u._bush = b;
      // 마지막으로 본 위치 잔상(플레이어 시점)
      if (u.team === Game.player.team) continue;
      if (Vision.visible(Game.player, u)) Vision.ghosts[u.id] = { pos: V.copy(u.pos), r: u.r, color: u.color, t: CONFIG.vision.ghost, kind: u.kind };
      else if (Vision.ghosts[u.id]) { const g = Vision.ghosts[u.id]; if ((g.t -= dt) <= 0) delete Vision.ghosts[u.id]; }
    }
    for (const id in Vision.ghosts) { const u = Game.units.find(x => x.id === +id); if (!u || u.dead) delete Vision.ghosts[id]; }
  },
};

// ============================== 저장/설정 ==============================
const Store = {
  get(k, def) { try { const v = localStorage.getItem('cathySim.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('cathySim.' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
};
const DEFAULT_KEYS = { Q: 'q', W: 'w', E: 'e', R: 'r', D: 'd', F: 'f', S: 's', A: 'a', C: 'c', V: 'v', X: 'x', Y: 'y' };   // C 망원 카메라 · V 정찰 드론
const DEFAULT_SETTINGS = { gfx: '2d', models3d: true, models3dBy: {}, camLock: true, toon: true, vfx3d: true, tactical: 'blink', character: 'cathy', fog: true, duelTime: 'day', duelMap: 'basic', duelAnimals: false, enemyBuild: 'same', castMode: 'normal', castModes: {}, smartCast: false, showRange: true, gameSpeed: 1, showHitbox: false, pointerLock: false, moveButton: 'right', gearOn: false, gearSets: null, netPredict: true, netStun: true, sound: true, ambient: true, weather: 'clear', volume: 0.5, side: true, weapon: 'dagger', build: 'late' };
const Settings = Object.assign({}, DEFAULT_SETTINGS, Store.get('settings', {}));
Settings.keys = Object.assign({}, DEFAULT_KEYS, Settings.keys || {});
// 시전 방식: normal(키 → 좌클릭) / smart(키를 누르면 즉시) / release(누르는 동안 범위 표시, 떼면 시전)
if (!['normal', 'smart', 'release'].includes(Settings.castMode)) Settings.castMode = Settings.smartCast ? 'smart' : 'normal';
Settings.castModes = Object.assign({}, Settings.castModes || {});
const CAST_MODES = { normal: '일반 (키 → 좌클릭)', smart: '스마트 (누르면 즉시 발동)', release: '범위 표시 후 떼면 발동' };
const castModeOf = k => Settings.castModes[k] || Settings.castMode;
const saveSettings = () => Store.set('settings', Settings);

// ============================== 사운드 (Web Audio 합성) ==============================
const Sfx = {
  ctx: null, master: null, last: {}, dest: null,
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain();
      // 여러 소리가 겹쳐도 찢어지지 않게 압축기 → 출력
      this.comp = this.ctx.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.ratio.value = 4;
      this.master.connect(this.comp); this.comp.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5; this.nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.nb.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
      this.initAmbient();
    } catch (e) { this.ctx = null; }
  },
  ok() {
    if (!this.ctx || !Settings.sound) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.value = Settings.volume; return true;
  },
  out() { return this.dest || this.master; },
  tone(f, dur, type, vol, f2, delay = 0) {
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.out()); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, type = 'bandpass', delay = 0) {
    const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.nb; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.out()); s.start(t); s.stop(t + dur + 0.05);
  },
  // ---------- 위치 → 좌우(스테레오)·거리 ----------
  //   듣는 사람 = 내 캐릭터. 화면 오른쪽 소리는 오른쪽 스피커로, 멀수록 작게(최소 30%)
  spatial(pos) {
    const p = typeof Game !== 'undefined' && Game.player;
    if (!pos || !p || !p.pos) return { pan: 0, vol: 1 };
    const dx = pos.x - p.pos.x, d = Math.hypot(dx, pos.y - p.pos.y);
    return { pan: clamp(dx / 9, -0.85, 0.85), vol: clamp(1 - (d - 5) / 18, 0.3, 1) };
  },
  // ---------- 타격음 종류: 공격한 쪽의 무기에 따라 ----------
  hitKind(src, type, o = {}) {
    if (type === 'true') return null;
    if (o.crit) return 'hitCrit';
    if (type === 'skill') return 'hitSkill';
    if (!src) return 'hit';
    if (src.charKey === 'daniel' || src.motifKey === 'daniel') return 'hitShadow';
    if (src === Game.player) return src.weapon === 'dual' ? 'hitTwin' : 'hitBlade';
    const w = (src.motif && src.motif.weapon) || '';
    if (/권총|총|저격|pistol|sniper|rifle/i.test(w)) return 'hitGun';
    if (/활|석궁|bow|crossbow/i.test(w)) return 'hitArrow';
    return src.melee ? 'hitBlade' : 'hit';
  },
  // u의 주인(그 캐릭터를 조종하는 사람)에게는 n, 다른 사람에게는 other(없으면 무음). 온라인 대전에선 손님에게도 시점에 맞게 전달
  playFor(u, n, pos, other) {
    const name = u === Game.player ? n : other;
    if (name) Net.quiet(() => this.play(name, pos));
    Net.note('sfor', [n, pos || null, other || null], u);
  },
  play(n, pos) {
    if (!n || !this.ok()) return;
    const now = performance.now(); if (this.last[n] && now - this.last[n] < 35) return; this.last[n] = now;
    const S = this.spatial(pos);
    if (pos && this.ctx.createStereoPanner) {
      const pn = this.ctx.createStereoPanner(), g = this.ctx.createGain();
      pn.pan.value = S.pan; g.gain.value = S.vol; g.connect(pn); pn.connect(this.master); this.dest = g;
      setTimeout(() => { try { g.disconnect(); pn.disconnect(); } catch (e) { /* 이미 해제 */ } }, 1500);
    }
    this.lastPlay = { n, pan: S.pan, vol: S.vol };
    try { this.sound(n); } finally { this.dest = null; }
  },
  sound(n) {
    switch (n) {
      case 'hit': this.noise(0.08, 0.25, 1800); this.tone(220, 0.07, 'square', 0.04, 110); break;
      // 무기별 타격음
      // 단검: 짧고 날카로운 금속음
      case 'hitBlade': this.noise(0.05, 0.22, 4200); this.tone(1900, 0.06, 'triangle', 0.035, 1300); this.tone(240, 0.06, 'square', 0.03, 120); break;
      // 쌍검: 두 번 겹치는 칼질
      case 'hitTwin': this.noise(0.04, 0.2, 3600); this.noise(0.04, 0.17, 4400, 'bandpass', 0.05); this.tone(1600, 0.05, 'triangle', 0.03, 1100, 0.05); break;
      // 그림자 가위(다니엘): 묵직한 절삭
      case 'hitShadow': this.noise(0.09, 0.22, 900, 'lowpass'); this.tone(520, 0.1, 'sawtooth', 0.03, 260); break;
      // 총: 탕 + 저음
      case 'hitGun': this.noise(0.05, 0.3, 2400, 'highpass'); this.tone(140, 0.09, 'sine', 0.09, 60); break;
      // 활·석궁: 퍽
      case 'hitArrow': this.noise(0.06, 0.22, 1200); this.tone(320, 0.08, 'triangle', 0.05, 160); break;
      case 'hitSkill': this.noise(0.12, 0.28, 1500); this.tone(180, 0.12, 'square', 0.05, 80); break;
      // 치명타: 높은 울림 강조
      case 'hitCrit': this.noise(0.08, 0.3, 3200); this.tone(1320, 0.1, 'triangle', 0.07, 1760); this.tone(200, 0.1, 'square', 0.05, 90); break;
      // 처치: 쿵 + 짧은 종소리
      case 'kill': this.tone(90, 0.5, 'sine', 0.16, 40); this.noise(0.35, 0.3, 500, 'lowpass'); [784, 1175].forEach((f, i) => this.tone(f, 0.25, 'triangle', 0.06, null, 0.08 + i * 0.08)); break;
      // 내가 쓰러짐
      case 'death': this.tone(220, 0.7, 'sawtooth', 0.08, 55); this.noise(0.5, 0.25, 300, 'lowpass'); break;
      case 'aa': this.noise(0.06, 0.2, 2600, 'highpass'); break;
      case 'dash': this.noise(0.18, 0.18, 900, 'lowpass'); this.tone(500, 0.15, 'sawtooth', 0.04, 1400); break;
      case 'slash': this.noise(0.2, 0.3, 3000); this.tone(900, 0.12, 'triangle', 0.06, 300); break;
      case 'throw': this.tone(1400, 0.12, 'triangle', 0.07, 2400); break;
      case 'stun': this.tone(180, 0.25, 'square', 0.1, 90); this.noise(0.15, 0.3, 600); break;
      case 'crit': this.tone(660, 0.12, 'sawtooth', 0.08, 990); this.tone(990, 0.18, 'sine', 0.08, 1320, 0.06); break;
      case 'ult': this.noise(0.45, 0.35, 700, 'lowpass'); this.tone(120, 0.45, 'sawtooth', 0.1, 60); break;
      case 'blink': this.tone(1200, 0.15, 'sine', 0.08, 400); break;
      case 'combo': [523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.16, 'triangle', 0.09, null, i * 0.07)); break;
      case 'win': [392, 523, 659, 784, 1046].forEach((f, i) => this.tone(f, 0.2, 'triangle', 0.09, null, i * 0.09)); break;
      case 'fail': this.tone(300, 0.25, 'square', 0.07, 150); break;
      case 'error': this.tone(200, 0.08, 'square', 0.05); break;
      case 'hurt': this.noise(0.2, 0.35, 400, 'lowpass'); this.tone(150, 0.2, 'sawtooth', 0.08, 80); break;
      case 'click': this.tone(700, 0.04, 'sine', 0.05); break;
      // 밤 귀뚜라미
      case 'chirp': [0, 0.05, 0.1].forEach(d => this.tone(4300 + Math.random() * 300, 0.035, 'sine', 0.012, null, d)); break;
      // 천둥: 낮게 우르릉
      case 'thunder': this.noise(1.6, 0.5, 180, 'lowpass'); this.noise(0.9, 0.35, 90, 'lowpass', 0.25); this.tone(55, 1.4, 'sine', 0.12, 32); break;
      // 낮 새소리
      case 'bird': this.tone(2600, 0.09, 'sine', 0.012, 3400); this.tone(3000, 0.07, 'sine', 0.01, 2500, 0.12); break;
    }
  },
  // ---------- 환경음: 낮은 바람 + 새소리 / 밤은 더 낮은 바람 + 귀뚜라미. 낮밤이 바뀌면 천천히 섞여 바뀜 ----------
  //   게임 중(Game.step → Sfx.tick)에만 들림. tick이 끊기면(메뉴·일시정지) 자동으로 줄어듦
  AMB: { day: { wind: 0.05, freq: 700 }, night: { wind: 0.032, freq: 420 } },
  initAmbient() {
    const c = this.ctx, len = c.sampleRate * 2, b = c.createBuffer(1, len, c.sampleRate), ch = b.getChannelData(0);
    // 부드러운(갈색) 잡음
    let v = 0; for (let i = 0; i < len; i++) { v = v * 0.985 + (Math.random() * 2 - 1) * 0.15; ch[i] = v; }
    const s = c.createBufferSource(); s.buffer = b; s.loop = true;
    this.ambF = c.createBiquadFilter(); this.ambF.type = 'lowpass'; this.ambF.frequency.value = 600;
    this.ambG = c.createGain(); this.ambG.gain.value = 0;
    s.connect(this.ambF); this.ambF.connect(this.ambG); this.ambG.connect(this.master); s.start();
    // 빗소리: 흰 잡음을 높은 대역만 남겨 쏴아
    const r = c.createBufferSource(); r.buffer = this.nb; r.loop = true;
    const rf = c.createBiquadFilter(); rf.type = 'bandpass'; rf.frequency.value = 3800; rf.Q.value = 0.5;
    this.rainG = c.createGain(); this.rainG.gain.value = 0; r.connect(rf); rf.connect(this.rainG); this.rainG.connect(this.master); r.start(); this.rainLevel = 0;
    this.ambT = 0; this.ambLast = 0; this.ambLevel = 0;
    setInterval(() => { if (this.ambG && performance.now() - this.ambLast > 400) { this.ambTarget(0); this.rainTarget(0); } }, 300);
  },
  ambTarget(v, freq) {
    if (!this.ambG) return; const t = this.ctx.currentTime;
    this.ambLevel = v; this.ambG.gain.setTargetAtTime(v, t, 1.2); if (freq) this.ambF.frequency.setTargetAtTime(freq, t, 1.5);
  },
  rainTarget(v) { if (!this.rainG) return; this.rainLevel = v; this.rainG.gain.setTargetAtTime(v, this.ctx.currentTime, 1.0); },
  tick(dt) {
    if (!this.ctx || !this.ambG) return;
    this.ambLast = performance.now();
    if (!Settings.sound || Settings.ambient === false) { this.ambTarget(0); this.rainTarget(0); return; }
    this.rainTarget(Settings.weather === 'rain' ? 0.07 : 0);
    this.master.gain.value = Settings.volume;
    // 바람이 일렁임
    const A = Vision.night ? this.AMB.night : this.AMB.day, sway = 0.75 + 0.25 * Math.sin(Game.time * 0.37) * Math.sin(Game.time * 0.11 + 1);
    this.ambTarget(A.wind * sway, A.freq);
    // 가끔 새·귀뚜라미 (내 주변 무작위 방향)
    if ((this.ambT -= dt) <= 0) {
      this.ambT = Vision.night ? 0.6 + Math.random() * 1.6 : 2.5 + Math.random() * 5;
      const p = Game.player, a = Math.random() * Math.PI * 2, r = 6 + Math.random() * 10;
      if (p && p.pos) this.play(Vision.night ? 'chirp' : 'bird', { x: p.pos.x + Math.cos(a) * r, y: p.pos.y + Math.sin(a) * r });
    }
  },
};

// ============================== 이벤트 버스 ==============================
const Events = {
  h: {},
  on(n, f) { (this.h[n] = this.h[n] || []).push(f); },
  emit(n, d) { const a = this.h[n]; if (a) for (const f of a.slice()) f(d || {}); },
  clear() { this.h = {}; },
};

// ============================== 이펙트 ==============================
const FX = {
  reset() { this.parts = []; this.texts = []; this.rings = []; this.slashes = []; this.trails = []; this.marks = []; this.arcs = []; this.toasts = []; this.shake = 0; this.toastLast = {}; },
  // 휘어진 큰 베기 궤적 (강화 평타의 내려찍기)
  arc(from, dir, len, bend, color, life = 0.4, width = 0.28) { this.arcs.push({ a: V.copy(from), dir: V.copy(dir), len, bend, color, life, max: life, width }); },
  // 대상 위에 교차하는 X자 베기 (R)
  xslash(pos, color = '#ff3b5c', n = 4) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI, d = V.fromAng(a), L = 1.6 + Math.random() * 0.8;
      this.trail(V.sub(pos, V.mul(d, L / 2)), V.add(pos, V.mul(d, L / 2)), color, 0.14, 0.55);
      this.trail(V.sub(pos, V.mul(d, L / 2.4)), V.add(pos, V.mul(d, L / 2.4)), '#ffffff', 0.04, 0.4);
    }
  },
  // 피 튀김 (E 충돌)
  blood(pos) {
    this.burst(pos, '#ff2a3d', 34, 8, 0.7, 0.14); this.burst(pos, '#7a0010', 16, 5, 0.9, 0.18);
    this.ring(pos, 0.2, 2.0, '#ff2a3d', 0.4, 0.18);
  },
  burst(pos, color, n = 10, spd = 4, life = 0.5, size = 0.08) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, s = spd * (0.3 + Math.random() * 0.7);
      this.parts.push({ x: pos.x, y: pos.y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size });
    }
  },
  text(pos, str, color = '#fff', size = 14, opt = {}) {
    const life = opt.life || 0.9;
    this.texts.push({ x: pos.x + (Math.random() - 0.5) * 0.5, y: pos.y - 0.6, vy: -1.3, str, color, size, life, max: life, bold: opt.bold });
  },
  ring(pos, r0, r1, color, life = 0.35, width = 0.06) { this.rings.push({ x: pos.x, y: pos.y, r0, r1, color, life, max: life, width }); },
  slash(pos, ang, R, half, color, life = 0.25, inner = 0) { this.slashes.push({ x: pos.x, y: pos.y, ang, R, half, color, life, max: life, inner }); },
  trail(a, b, color, width = 0.3, life = 0.25) { this.trails.push({ a: V.copy(a), b: V.copy(b), color, width, life, max: life }); },
  // 알림: toastFor = 그 캐릭터 주인에게만 / toastAll = 모두에게(라운드·스피어·낮밤). 그냥 toast는 이 화면에만
  toastFor(u, str, color) { if (u === Game.player) this.toast(str, color); Net.note('tfor', [str, color || null], u); },
  // 캐릭터 머리 위 글자를 보는 사람 기준으로: who = 'owner'(주인만) | 'seen'(주인 + 그 캐릭터가 보이는 사람) | 'all'. color 'team' = 보는 사람 기준 내 편·적 색
  textFor(u, str, color, size, opt, who = 'seen') {
    if (FX.canSee(u, who, Game.player)) Net.quiet(() => this.text(u.pos, str, FX.teamColor(color, u), size, opt));
    Net.note('textfor', [V.copy(u.pos), str, color, size || null, opt || null, who], u);
  },
  // 링도 보는 사람 기준 색 (color 'team')
  ringFor(u, pos, r0, r1, color, life) { Net.quiet(() => this.ring(pos, r0, r1, FX.teamColor(color, u), life)); Net.note('ringfor', [V.copy(pos), r0, r1, color, life || null], u); },
  canSee(u, who, viewer) { return who === 'all' || u === viewer || (who === 'seen' && !!viewer && Vision.visible(viewer, u)); },
  teamColor(c, u) { return c === 'team' ? (u && u.team === myTeam() ? '#7fd1ff' : '#ff8a8a') : c; },
  toastAll(str, color) { this.toast(str, color); Net.note('toast', [str, color || null]); },
  mark(pos, color) { this.marks.push({ x: pos.x, y: pos.y, color, life: 0.4, max: 0.4 }); },
  addShake(px) { this.shake = Math.min(14, Math.max(this.shake, px)); },
  toast(str, color = '#e6e9ef') {
    const now = performance.now(); if (this.toastLast[str] && now - this.toastLast[str] < 1200) return; this.toastLast[str] = now;
    this.toasts.push({ str, color, life: 1.8 }); if (this.toasts.length > 4) this.toasts.shift();
  },
  update(dt) {
    const dec = arr => arr.filter(o => (o.life -= dt) > 0);
    for (const p of this.parts) { p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
    for (const t of this.texts) { t.y += t.vy * dt; t.vy *= 0.96; }
    this.parts = dec(this.parts); this.texts = dec(this.texts); this.rings = dec(this.rings); this.slashes = dec(this.slashes);
    this.trails = dec(this.trails); this.marks = dec(this.marks); this.toasts = dec(this.toasts); this.arcs = dec(this.arcs);
    this.shake = Math.max(0, this.shake - dt * 45);
  },
};
FX.reset();

// ============================== 전투 ==============================
const Combat = {
  // type: 'skill' | 'normal' | 'true'(고정 피해)
  damage(src, tgt, amount, o = {}) {
    if (!tgt || tgt.dead || tgt.invuln > 0) return 0;
    const type = o.type || 'skill';
    let dmg = amount;
    // 방어 관통: 적용 방어력 = 방어력 × (1 − %관통) − 고정 관통 (노트 2.4). %는 옵션(o.pen)이 없으면 공격한 쪽 장비 능력치
    const penPct = o.pen !== undefined ? o.pen : (src && src.penPct) || 0, penFlat = (src && src.penFlat) || 0;
    if (type !== 'true') dmg *= 100 / (100 + Math.max(0, tgt.def * (1 - penPct) - penFlat));
    if (o.min) dmg = Math.max(o.min, dmg);
    dmg *= ItemFx.damageMul(src, tgt, type);   // 장비: 집행자
    dmg = Math.max(0, dmg);
    let absorbed = 0;
    if (tgt.shield > 0) { absorbed = Math.min(tgt.shield, dmg); tgt.shield -= absorbed; }
    tgt.hp -= dmg - absorbed;
    tgt.flash = 0.12;
    const col = type === 'true' ? '#ffd1dc' : type === 'normal' ? (o.crit ? '#ff5d5d' : '#ffffff') : '#ffb347';
    if (o.tick) FX.text(tgt.pos, String(Math.max(1, Math.round(dmg))), '#ff8fa8', 10); else FX.text(tgt.pos, (o.crit ? '✦' : '') + Math.round(dmg), col, o.crit ? 20 : type === 'true' ? 12 : 15, { bold: o.crit || type === 'skill' });
    if (src && src.S) src.S.dealt(o.source || '?', dmg);   // 통계는 캐릭터별(내 캐릭터 = Stats)
    if (tgt.S) { tgt.S.takenTotal += dmg; tgt.S.playerHits++; }
    if (tgt === Game.player) Events.emit('playerHit', { dmg });
    if (tgt.kind === 'player') tgt.revealT = Math.max(tgt.revealT || 0, CONFIG.vision.hitReveal);   // 피격 시 위치 노출 (사람이 조종하는 캐릭터 — 온라인 대전 양쪽 모두)
    if (!o.tick) { Sfx.playFor(tgt, 'hurt'); Sfx.play(Sfx.hitKind(src, type, o) || 'hit', tgt.pos); }   // 맞은 사람에겐 아픈 소리 추가
    Rest.onDamage(src, tgt, o);   // 직접 피해: 전투 상태 + 휴식 취소
    if (!o.noShake) FX.addShake(o.crit ? 6 : type === 'true' ? 0 : 2.5);
    if (tgt.onDamaged && !tgt.dead) tgt.onDamaged(dmg, src);   // 피격 반응(예: 아야 패시브 보호막)
    if (tgt.hp <= 0) this.kill(src, tgt);
    if (src) ItemFx.onDamage(src, tgt);   // 장비: 치유 감소
    // 흡혈: 생명력 흡수(평타) · 모든 피해 흡혈(광역은 50%, 야생동물 60% — 노트 2.1)
    if (src && !src.dead && dmg > 0 && (src.ls || src.omni) && src.heal) {
      const vs = tgt.kind === 'animal' ? 0.6 : 1, aoe = o.aoe ? 0.5 : 1;
      const h = dmg * ((type === 'normal' ? src.ls || 0 : 0) + (src.omni || 0) * aoe) * vs; if (h > 0) src.heal(h, true);
    }
    if (src && src.onDealt && dmg > 0) src.onDealt(tgt, dmg, o);   // 다니엘: 영감 축적·최근 피해
    if (o.trauma && src instanceof Cathy && src.usesTrauma !== false && !tgt.dead) Passive.applyTrauma(tgt, o.source, src);   // 외상: 공격한 캐시 기준(온라인 대전 상대 캐시도)
    return dmg;
  },
  kill(src, tgt) {
    if (tgt.kind === 'ward') { tgt.hp = 0; tgt.dead = true; FX.burst(tgt.pos, '#c9cfdb', 10, 3, 0.4); FX.text(tgt.pos, '카메라 파괴', '#c9cfdb', 11, { bold: true }); return; }   // 시야 아이템
    if (tgt.infinite) { tgt.hp = tgt.maxHp; FX.text(tgt.pos, '체력 리셋', '#8a93a6', 11); return; }
    tgt.hp = 0; tgt.dead = true; tgt.deathT = 0;
    FX.burst(tgt.pos, tgt.color, 26, 7, 0.8, 0.12); FX.ring(tgt.pos, 0.3, 2, '#ffffff', 0.5);
    if (src && src.S) src.S.kills++;
    Sfx.playFor(tgt, 'death', tgt.pos, 'kill');   // 쓰러진 사람에겐 쓰러지는 소리, 나머지는 처치음
    Events.emit('kill', { unit: tgt });
    if (Game.time - (tgt.rMaxMark ?? -99) < 0.3) { Events.emit('rKillMax'); FX.toastFor(src, '응급 OP 최대 피해 처치!', CONFIG.theme.gold); }
  },
};

// ============================== 패시브: 외과 전문의 ==============================
const Passive = {
  // p = 패시브 주인(공격한 캐시). 생략하면 내 캐릭터
  lvl(p = Game.player) { return p.build.passiveLv + 1; },
  applyTrauma(t, src, p = Game.player) {
    const P = CONFIG.passive;
    if (!t || t.dead || t.crit > 0 || t.kind === 'ward') return;
    if (P.traumaPerSkill) {   // 같은 스킬로는 한 번만 쌓임 — 지속시간만 갱신
      if (t.traumaT <= 0 || !t.traumaSrc) t.traumaSrc = new Set();
      if (src && t.traumaSrc.has(src)) { t.traumaT = P.traumaDur; return; }
      if (src) t.traumaSrc.add(src);
    }
    t.trauma = Math.min(P.stacks, t.trauma + 1); t.traumaT = P.traumaDur;
    this.bleed(t, 'trauma', Math.max(P.traumaMin || 0, p.sp * P.traumaSp), P.traumaDur, true, p);
    if (!t.dead && t.trauma >= P.stacks) this.critical(t, 'stack', p);
  },
  critical(t, by, p = Game.player) {
    const P = CONFIG.passive;
    if (!t || t.dead) return;
    if (t.crit > 0) {   // 이미 치명적 외상: 갱신. R로 다시 부여하면 Q 쿨 감소도 적용 (영상: R 직후 Q 재사용)
      t.crit = P.critDur; t.healRed = P.critDur;
      this.bleed(t, 'crit', t.maxHp * P.critMaxHp + p.sp * P.critSp, P.critDur, false, p);
      if (by === 'R' && CONFIG.passive.rReapplyQcdr) this.reduceQ(p);
      return;
    }
    t.trauma = 0; t.traumaT = 0; t.traumaSrc = null; t.crit = P.critDur; t.healRed = P.critDur;
    FX.ring(t.pos, 0.3, 1.8, CONFIG.theme.accent, 0.45, 0.12); FX.text(t.pos, '치명적 외상!', CONFIG.theme.accent, 17, { bold: true });
    Sfx.play('crit');
    t.bleeds = (t.bleeds || []).filter(b => b.kind !== 'trauma');   // 외상 → 치명적 외상으로 바뀜
    this.bleed(t, 'crit', t.maxHp * P.critMaxHp + p.sp * P.critSp, P.critDur, false, p);
    // 보호막 + 이동 속도 증가 준비
    p.shield = Math.max(p.shield, lv(P.shield, this.lvl(p)) + p.sp * P.shieldSp); p.shieldT = P.shieldDur; p.shieldBoostUsed = false;
    if (CONFIG.skills.Q.cdrOnAnyCritical || by === 'Q') this.reduceQ(p);
    p.S.criticals++; Events.emit('critical', { target: t, by: p });
  },
  // 출혈(고정 피해 지속): total을 dur초 동안 tick 간격으로 나눠 입힘. stack=true면 부여마다 따로 쌓이고, 아니면 같은 종류를 새로 갱신
  bleed(t, kind, total, dur, stack, p = Game.player) {
    const P = CONFIG.passive, n = Math.max(1, Math.round(dur / P.tick));
    t.bleeds = t.bleeds || [];
    if (!stack) t.bleeds = t.bleeds.filter(b => b.kind !== kind);
    t.bleeds.push({ kind, src: p, per: total / n, n, acc: 0 });
  },
  tickBleeds(u, dt) {
    if (!u.bleeds || !u.bleeds.length || u.dead) return;
    const P = CONFIG.passive;
    for (const b of u.bleeds) {
      b.acc += dt;
      while (b.acc >= P.tick && b.n > 0 && !u.dead) { b.acc -= P.tick; b.n--; Combat.damage(b.src, u, b.per, { type: 'true', source: 'P', noShake: true, tick: true }); }
    }
    u.bleeds = u.bleeds.filter(b => b.n > 0);
  },
  // Q 쿨다운 감소
  reduceQ(p) {
    const q = p.skills.Q; if (q.cd <= 0) return;
    q.cd *= 1 - lv(CONFIG.skills.Q.critCdr, q.lv); q.reduced = true; FX.text(p.pos, 'Q 쿨감', CONFIG.theme.accent2, 13, { bold: true });
  },
};
