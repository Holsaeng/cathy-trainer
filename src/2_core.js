
// ============================== 유틸 ==============================
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const rand = (a, b) => a + Math.random() * (b - a);
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
const SRC_LABEL = { Q: 'Q 동맥절제술', W: 'W 앰퓨테이션', E: 'E 수쳐', 'E충돌': 'E 충돌', R: 'R 이머전시 OP', D: 'D 무기 스킬', AA: '기본 공격', 'AA+': '강화 평타', P: '패시브 외상' };
const SRC_COLOR = { Q: '#ff3b5c', W: '#ff8f3b', E: '#3fd0c9', 'E충돌': '#7fe3dc', R: '#ffc857', D: '#b18cff', AA: '#d0d4dd', 'AA+': '#ff9fb2', P: '#ff6b9a' };

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
  passLanding(o, d, dist, r) {
    const W = CONFIG.world.w, H = CONFIG.world.h, inB = p => p.x >= r && p.x <= W - r && p.y >= r && p.y <= H - r;
    let L = dist; const end = q => V.add(o, V.mul(d, q));
    while (!inB(end(L)) && L > 0) L -= 0.05;   // 아레나 경계
    if (!Geo.inWall(end(L), r)) return L;
    for (let x = L; x <= L + 2.5; x += 0.05) if (inB(end(x)) && !Geo.inWall(end(x), r)) return x;
    for (let x = L; x >= 0; x -= 0.05) if (!Geo.inWall(end(x), r)) return x;
    return 0;
  },
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
  bushAt(p) { return (CONFIG.bushes || []).findIndex(b => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h); },
  // viewer가 target을 볼 수 있는가: 부쉬 밖이면 보임, 같은 부쉬이거나 가까우면 보임
  visible(viewer, target) {
    if (!viewer || !target) return true;
    const b = Vision.bushAt(target.pos); if (b < 0) return true;
    return Vision.bushAt(viewer.pos) === b || V.dist(viewer.pos, target.pos) <= CONFIG.vision.bushReveal;
  },
};

// ============================== 저장/설정 ==============================
const Store = {
  get(k, def) { try { const v = localStorage.getItem('cathySim.' + k); return v ? JSON.parse(v) : def; } catch (e) { return def; } },
  set(k, v) { try { localStorage.setItem('cathySim.' + k, JSON.stringify(v)); } catch (e) { /* 저장 불가 환경 */ } },
};
const DEFAULT_KEYS = { Q: 'q', W: 'w', E: 'e', R: 'r', D: 'd', F: 'f', S: 's', A: 'a' };
const DEFAULT_SETTINGS = { duelMap: 'basic', duelAnimals: false, enemyBuild: 'same', castMode: 'normal', castModes: {}, smartCast: false, showRange: true, gameSpeed: 1, showHitbox: false, sound: true, volume: 0.5, side: true, weapon: 'dagger', build: 'late' };
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
  ctx: null, master: null, last: {},
  init() {
    if (this.ctx) return;
    try {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      this.ctx = new AC(); this.master = this.ctx.createGain(); this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate * 0.5; this.nb = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const ch = this.nb.getChannelData(0); for (let i = 0; i < len; i++) ch[i] = Math.random() * 2 - 1;
    } catch (e) { this.ctx = null; }
  },
  ok() {
    if (!this.ctx || !Settings.sound) return false;
    if (this.ctx.state === 'suspended') this.ctx.resume();
    this.master.gain.value = Settings.volume; return true;
  },
  tone(f, dur, type, vol, f2, delay = 0) {
    const t = this.ctx.currentTime + delay, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.05);
  },
  noise(dur, vol, freq, type = 'bandpass', delay = 0) {
    const t = this.ctx.currentTime + delay, s = this.ctx.createBufferSource(), f = this.ctx.createBiquadFilter(), g = this.ctx.createGain();
    s.buffer = this.nb; f.type = type; f.frequency.value = freq;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dur + 0.05);
  },
  play(n) {
    if (!this.ok()) return;
    const now = performance.now(); if (this.last[n] && now - this.last[n] < 35) return; this.last[n] = now;
    switch (n) {
      case 'hit': this.noise(0.08, 0.25, 1800); this.tone(220, 0.07, 'square', 0.04, 110); break;
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
      const a = Math.random() * Math.PI, d = V.fromAng(a), L = rand(1.6, 2.4);
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
    if (type !== 'true') dmg *= 100 / (100 + Math.max(0, tgt.def * (1 - (o.pen || 0))));   // 방어 관통(%) 반영
    if (o.min) dmg = Math.max(o.min, dmg);
    dmg = Math.max(0, dmg);
    let absorbed = 0;
    if (tgt.shield > 0) { absorbed = Math.min(tgt.shield, dmg); tgt.shield -= absorbed; }
    tgt.hp -= dmg - absorbed;
    tgt.flash = 0.12;
    const col = type === 'true' ? '#ffd1dc' : type === 'normal' ? (o.crit ? '#ff5d5d' : '#ffffff') : '#ffb347';
    FX.text(tgt.pos, (o.crit ? '✦' : '') + Math.round(dmg), col, o.crit ? 20 : type === 'true' ? 12 : 15, { bold: o.crit || type === 'skill' });
    if (src === Game.player) Stats.dealt(o.source || '?', dmg);
    if (tgt === Game.player) { Stats.takenTotal += dmg; Stats.playerHits++; Events.emit('playerHit', { dmg }); Sfx.play('hurt'); }
    else Sfx.play('hit');
    if (!o.noShake) FX.addShake(o.crit ? 6 : type === 'true' ? 0 : 2.5);
    if (tgt.onDamaged && !tgt.dead) tgt.onDamaged(dmg, src);   // 피격 반응(예: 아야 패시브 보호막)
    if (tgt.hp <= 0) this.kill(src, tgt);
    if (o.trauma && src === Game.player && !tgt.dead) Passive.applyTrauma(tgt, o.source);
    return dmg;
  },
  kill(src, tgt) {
    if (tgt.infinite) { tgt.hp = tgt.maxHp; FX.text(tgt.pos, '체력 리셋', '#8a93a6', 11); return; }
    tgt.hp = 0; tgt.dead = true; tgt.deathT = 0;
    FX.burst(tgt.pos, tgt.color, 26, 7, 0.8, 0.12); FX.ring(tgt.pos, 0.3, 2, '#ffffff', 0.5);
    if (src === Game.player) Stats.kills++;
    Events.emit('kill', { unit: tgt });
    if (Game.time - (tgt.rMaxMark ?? -99) < 0.3) { Events.emit('rKillMax'); FX.toast('응급 OP 최대 피해 처치!', CONFIG.theme.gold); }
  },
};

// ============================== 패시브: 외과 전문의 ==============================
const Passive = {
  lvl() { return Game.player.build.passiveLv + 1; },
  applyTrauma(t, src) {
    const p = Game.player, P = CONFIG.passive;
    if (!t || t.dead || t.crit > 0) return;
    if (P.traumaPerSkill) {   // 같은 스킬로는 한 번만 쌓임 — 지속시간만 갱신
      if (t.traumaT <= 0 || !t.traumaSrc) t.traumaSrc = new Set();
      if (src && t.traumaSrc.has(src)) { t.traumaT = P.traumaDur; return; }
      if (src) t.traumaSrc.add(src);
    }
    t.trauma = Math.min(P.stacks, t.trauma + 1); t.traumaT = P.traumaDur;
    Combat.damage(p, t, Math.max(P.traumaMin || 0, p.sp * P.traumaSp), { type: 'true', source: 'P', noShake: true });
    if (!t.dead && t.trauma >= P.stacks) this.critical(t, 'stack');
  },
  critical(t, by) {
    const p = Game.player, P = CONFIG.passive;
    if (!t || t.dead) return;
    if (t.crit > 0) {   // 이미 치명적 외상: 갱신. R로 다시 부여하면 Q 쿨 감소도 적용 (영상: R 직후 Q 재사용)
      t.crit = P.critDur; t.healRed = P.critDur;
      if (by === 'R' && CONFIG.passive.rReapplyQcdr) this.reduceQ(p);
      return;
    }
    t.trauma = 0; t.traumaT = 0; t.traumaSrc = null; t.crit = P.critDur; t.healRed = P.critDur;
    FX.ring(t.pos, 0.3, 1.8, CONFIG.theme.accent, 0.45, 0.12); FX.text(t.pos, '치명적 외상!', CONFIG.theme.accent, 17, { bold: true });
    Sfx.play('crit');
    Combat.damage(p, t, t.maxHp * P.critMaxHp + p.sp * P.critSp, { type: 'true', source: 'P' });
    // 보호막 + 이동 속도 증가 준비
    p.shield = Math.max(p.shield, lv(P.shield, this.lvl()) + p.sp * P.shieldSp); p.shieldT = P.shieldDur; p.shieldBoostUsed = false;
    if (CONFIG.skills.Q.cdrOnAnyCritical || by === 'Q') this.reduceQ(p);
    Stats.criticals++; Events.emit('critical', { target: t });
  },
  // Q 쿨다운 감소
  reduceQ(p) {
    const q = p.skills.Q; if (q.cd <= 0) return;
    q.cd *= 1 - lv(CONFIG.skills.Q.critCdr, q.lv); q.reduced = true; FX.text(p.pos, 'Q 쿨감', CONFIG.theme.accent2, 13, { bold: true });
  },
};
