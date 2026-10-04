
// ============================== 게임 ==============================
const Game = {
  state: 'menu', paused: false, mode: null, modeId: null, opts: null, units: [], projectiles: [], zones: [], player: null,
  time: 0, freeze: 0, cdMul: 1, buildId: 'late',
  start(id, opts = {}) {
    Events.clear(); FX.reset(); Stats.reset();
    Object.assign(this, { units: [], projectiles: [], zones: [], player: null, time: 0, freeze: 0, cdMul: 1, modeId: id, opts, buildId: opts.build || Settings.build });
    this.mode = Modes[id]; Input.reset();
    // 맵 적용 (지형·부쉬). 지정이 없으면 기본 아레나
    this.mapKey = CONFIG.maps[opts.map] ? opts.map : 'basic'; this.map = CONFIG.maps[this.mapKey];
    CONFIG.walls = this.map.walls.map(w => Object.assign({}, w)); CONFIG.bushes = (this.map.bushes || []).map(b => Object.assign({}, b));
    this.mode.start(opts);
    this.state = 'play'; this.paused = false; UI.hide();
  },
  restart() { this.start(this.modeId, this.opts); },
  step(dt) {
    if (this.freeze > 0) { this.freeze -= dt; this.mode.update(dt, true); FX.update(dt); return; }
    this.time += dt; Stats.tick(dt);
    for (const u of this.units.slice()) u.update(dt);
    for (const pr of this.projectiles) pr.update(dt);
    this.projectiles = this.projectiles.filter(p => !p.dead);
    this.updateZones(dt);
    for (const u of this.units) if (u.dead && u.respawn && (u.deathT += dt) >= (u.respawnDelay || CONFIG.modes.dummy.respawn)) u.revive();
    this.mode.update(dt, false);
    FX.update(dt);
  },
  updateZones(dt) {
    const p = this.player;
    for (const z of this.zones) {
      z.t -= dt;
      if (z.type === 'heal' && p && !p.dead && Geo.inORect(z.from, z.dir, z.len, z.width / 2, p.pos, p.r)) {
        const R = CONFIG.skills.R; z.acc += p.heal(p.maxHp * (R.zoneHealPct + p.sp * R.zoneHealSp) / 100 * dt, true);
      }
      if (Math.random() < dt * 12) { const pt = V.add(V.add(z.from, V.mul(z.dir, Math.random() * z.len)), V.mul(V.perp(z.dir), (Math.random() - 0.5) * z.width)); FX.text(pt, '+', '#5dff9a', 12, { life: 0.7 }); }
      if ((z.accT -= dt) <= 0) { if (z.acc > 1) FX.text(p.pos, '+' + Math.round(z.acc), '#5dff9a', 12); z.acc = 0; z.accT = 0.5; }
    }
    this.zones = this.zones.filter(z => z.t > 0);
  },
  finish(reason) {
    if (this.state !== 'play') return;
    this.state = 'result';
    const r = this.mode.result(reason) || {}; r.title = r.title || this.mode.title;
    Grade.compute(r); Records.save(r); UI.showResults(r);
  },
  togglePause() {
    if (this.state !== 'play') return;
    this.paused = !this.paused;
    if (this.paused) UI.showPause(); else UI.hide();
  },
  enemies() { return this.units.filter(u => u.team !== 0 && !u.dead); },
  visibleEnemies() { return this.enemies().filter(e => Vision.visible(this.player, e)); },
  nearestEnemy(pos, range) { let best = null, bd = range; for (const e of this.visibleEnemies()) { const d = V.dist(pos, e.pos) - e.r; if (d <= bd) { bd = d; best = e; } } return best; },
  pickEnemyAt(pt, rad) { let best = null, bd = Infinity; for (const e of this.visibleEnemies()) { const d = V.dist(pt, e.pos); if (d <= rad + e.r && d < bd) { bd = d; best = e; } } return best; },
};

// ============================== 등급/기록 ==============================
const Grade = {
  compute(r) {
    const St = Stats, { c, h } = St.totalCasts();
    const wasteTot = Object.values(St.waste).reduce((a, b) => a + b, 0), mistakeCount = Object.values(St.mistakes).reduce((a, b) => a + b, 0);
    const comps = [
      { k: 'acc', label: '스킬 적중률', v: c ? h / c : 0.5 },
      { k: 'waste', label: '쿨타임 관리', v: St.t > 5 ? clamp(1 - wasteTot / (St.t * 4) * 2.5, 0, 1) : 1 },
      { k: 'mistake', label: '실수 관리', v: clamp(1 - mistakeCount / Math.max(0.5, St.t / 60) / 12, 0, 1) },
      { k: 'mode', label: r.modeLabel || '모드 목표', v: clamp(r.modeRatio ?? 0.5, 0, 1) },
    ];
    const w = Object.assign({ acc: 35, waste: 20, mistake: 20, mode: 25 }, r.weights || {});
    let sum = 0, ws = 0; for (const cp of comps) { cp.w = w[cp.k]; sum += cp.v * cp.w; ws += cp.w; }
    r.gradeScore = ws ? Math.round(sum / ws * 100) : 0;
    r.grade = r.gradeScore >= 85 ? 'S' : r.gradeScore >= 70 ? 'A' : r.gradeScore >= 55 ? 'B' : r.gradeScore >= 40 ? 'C' : 'D';
    r.components = comps;
    const weak = comps.filter(cp => cp.w > 0).sort((a, b) => a.v - b.v)[0];
    const p100 = v => Math.round(v * 100);
    const tips = {
      acc: v => `스킬 적중률 ${p100(v)}% → ${Math.min(100, p100(v) + 10)}% 목표. E는 상대 진행 방향 앞쪽을, W는 바깥 범위(3~4m) 거리를 맞추세요.`,
      waste: () => `교전 중 쿨이 돌아온 스킬을 오래 묵혔습니다. 콤보 사이클을 줄여 쿨 낭비 시간을 절반으로 줄여 보세요.`,
      mistake: () => `실수가 잦습니다. 아래 실수 분석에서 가장 많은 항목 하나만 집중 교정해 보세요.`,
      mode: () => `${r.modeLabel || '모드 목표'} 수치를 끌어올리는 것이 다음 목표입니다. 게임 속도를 0.7x로 낮춰 연습한 뒤 1.0x로 돌아오세요.`,
    };
    r.nextGoal = weak ? tips[weak.k](weak.v) : '';
  },
};
const Records = {
  all() { return Store.get('records', {}); },
  save(r) {
    if (!r.key) return;
    const all = this.all(), rec = all[r.key] || { best: null, hist: [] };
    r.prevBest = rec.best; r.isBest = rec.best === null || r.score > rec.best;
    if (r.isBest) rec.best = r.score;
    rec.hist.push({ s: r.score, g: r.grade, d: Date.now() }); rec.hist = rec.hist.slice(-10);
    rec.title = r.recTitle || r.title; rec.label = r.scoreLabel;
    all[r.key] = rec; Store.set('records', all); r.hist = rec.hist;
  },
};

// ============================== 입력 ==============================
const Input = {
  screen: { x: 0, y: 0 }, world: { x: 16, y: 9 }, aiming: null, amove: false,
  reset() { this.aiming = null; this.amove = false; },
  init(cv) {
    cv.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('contextmenu', e => { if (Game.state === 'play') e.preventDefault(); });
    cv.addEventListener('mousemove', e => { this.screen = { x: e.clientX, y: e.clientY }; this.world = Render.toWorld(e.clientX, e.clientY); });
    cv.addEventListener('mousedown', e => {
      Sfx.init(); this.screen = { x: e.clientX, y: e.clientY }; this.world = Render.toWorld(e.clientX, e.clientY);
      if (Game.state !== 'play' || Game.paused || !Game.player) return;
      const p = Game.player, w = this.world;
      if (e.button === 2) {
        this.aiming = null; this.amove = false;
        const t = Game.pickEnemyAt(w, 0.35); if (t) p.cmdAttack(t); else p.cmdMove(w);
      } else if (e.button === 0) {
        if (this.aiming) { p.cmdSkill(this.aiming, w); this.aiming = null; }
        else if (this.amove) { p.cmdAttackMove(w); this.amove = false; }
      }
    });
    window.addEventListener('keydown', e => this.onKey(e));
    window.addEventListener('keyup', e => this.onKeyUp(e));
  },
  onKey(e) {
    if (UI.waitKey) {
      e.preventDefault();
      if (e.key === 'Escape') { UI.waitKey = null; UI.showSettings(UI.settingsBack); return; }
      const k = e.key.toLowerCase(); if (k.length !== 1 || k === ' ') return;
      for (const a in Settings.keys) if (Settings.keys[a] === k) Settings.keys[a] = Settings.keys[UI.waitKey];   // 충돌 시 맞바꿈
      Settings.keys[UI.waitKey] = k; UI.waitKey = null; saveSettings(); UI.showSettings(UI.settingsBack); return;
    }
    if (e.key === 'Tab') { e.preventDefault(); Settings.side = !Settings.side; saveSettings(); Side.update(); return; }
    if (e.key === 'Escape') {
      if (Game.state !== 'play') return;
      if (!Game.paused && this.aiming) { this.aiming = null; return; }
      if (!Game.paused && this.amove) { this.amove = false; return; }
      Game.togglePause(); return;
    }
    if (Game.state !== 'play' || Game.paused || e.repeat || !Game.player) return;
    const k = e.key.toLowerCase(), act = Object.keys(Settings.keys).find(a => Settings.keys[a] === k);
    if (!act) return;
    e.preventDefault(); Sfx.init();
    const p = Game.player, w = this.world;
    if (act === 'S') { p.cmdStop(); this.aiming = null; return; }
    if (act === 'A') { this.amove = true; this.aiming = null; return; }
    // 즉시 발동형: 단검 1차(유틸)
    if (act === 'D' && p.weapon === 'dagger' && p.daggerReady <= 0) { p.cmdSkill('D', w); return; }
    const mode = castModeOf(act);
    if (mode === 'smart') { p.cmdSkill(act, w); this.aiming = null; return; }           // 누르면 즉시 발동
    if (mode === 'release') { this.aiming = act; this.amove = false; this.holdKey = act; return; }   // 떼면 발동
    if (this.aiming === act) { p.cmdSkill(act, w); this.aiming = null; return; }   // 같은 키 두 번 = 시전
    this.aiming = act; this.amove = false;
  },
  onKeyUp(e) {
    if (!this.holdKey || Game.state !== 'play' || Game.paused || !Game.player) { this.holdKey = null; return; }
    const act = Object.keys(Settings.keys).find(a => Settings.keys[a] === e.key.toLowerCase());
    if (act !== this.holdKey) return;
    this.holdKey = null;
    if (this.aiming === act) { Game.player.cmdSkill(act, this.world); this.aiming = null; }
  },
};

// ============================== 그리기 도우미 ==============================
const FONT = "'Malgun Gothic','Apple SD Gothic Neo',system-ui,sans-serif";
const Draw = {
  rr(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); },
  text(ctx, s, x, y, o = {}) {
    ctx.font = `${o.bold ? '700 ' : ''}${o.size || 13}px ${FONT}`; ctx.textAlign = o.align || 'left'; ctx.textBaseline = 'middle';
    if (o.stroke) { ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(s, x, y); }
    ctx.fillStyle = o.color || '#e6e9ef'; ctx.fillText(s, x, y);
  },
  panel(ctx, x, y, w, h) { Draw.rr(ctx, x, y, w, h, 10); ctx.fillStyle = 'rgba(14,17,24,.92)'; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = '#2a3140'; ctx.stroke(); },
  oRect(ctx, s, ang, len, w) { ctx.save(); ctx.translate(s.x, s.y); ctx.rotate(ang); ctx.fillRect(0, -w / 2, len, w); ctx.strokeRect(0, -w / 2, len, w); ctx.restore(); },
  circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); },
};

// ============================== 렌더 ==============================
const HUD_H = 118;
const Render = {
  init() { this.cv = document.getElementById('game'); this.ctx = this.cv.getContext('2d'); this.resize(); window.addEventListener('resize', () => this.resize()); },
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    this.cv.width = W * dpr; this.cv.height = H * dpr;
    const ppm = Math.min((W - 20) / CONFIG.world.w, (H - HUD_H - 20) / CONFIG.world.h);
    this.L = { W, H, dpr, ppm, ox: (W - CONFIG.world.w * ppm) / 2, oy: Math.max(10, (H - HUD_H - CONFIG.world.h * ppm) / 2) };
  },
  toWorld(sx, sy) { const L = this.L; return { x: (sx - L.ox) / L.ppm, y: (sy - L.oy) / L.ppm }; },
  toScreen(p) { const L = this.L; return { x: L.ox + p.x * L.ppm + this.shx, y: L.oy + p.y * L.ppm + this.shy }; },
  frame() {
    const { ctx, L } = this, T = CONFIG.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#07090d'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const sh = Settings.reduceShake ? 0 : FX.shake; this.shx = (Math.random() - 0.5) * sh; this.shy = (Math.random() - 0.5) * sh;
    ctx.setTransform(L.dpr * L.ppm, 0, 0, L.dpr * L.ppm, L.dpr * (L.ox + this.shx), L.dpr * (L.oy + this.shy));
    this.drawWorld(ctx, T);
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    if (Game.state === 'menu') return;
    this.drawOverheads(ctx);
    this.drawTexts(ctx);
    if (Game.mode && Game.mode.drawScreen) Game.mode.drawScreen(ctx, L, 0);
    HUD.draw(ctx, L);
    this.drawTopInfo(ctx, L);
    this.drawToasts(ctx, L);
    if (Input.amove) { Draw.circle(ctx, Input.screen.x, Input.screen.y, 10); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.stroke(); Draw.text(ctx, 'A', Input.screen.x + 13, Input.screen.y - 10, { size: 13, bold: true, color: '#ffb347' }); }
  },
  drawWorld(ctx, T) {
    const W = CONFIG.world.w, H = CONFIG.world.h;
    ctx.fillStyle = T.floor; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = 0.02;
    for (let x = 0; x <= W; x++) { ctx.strokeStyle = x % 4 ? T.grid : '#1f2636'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y++) { ctx.strokeStyle = y % 4 ? T.grid : '#1f2636'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    ctx.strokeStyle = '#2f3850'; ctx.lineWidth = 0.08; ctx.strokeRect(0, 0, W, H);
    // 치유 영역
    for (const z of Game.zones) {
      ctx.save(); ctx.globalAlpha = 0.18 + 0.12 * Math.sin(Game.time * 6); ctx.fillStyle = '#5dff9a'; ctx.strokeStyle = 'rgba(93,255,154,.6)'; ctx.lineWidth = 0.04;
      Draw.oRect(ctx, z.from, V.ang(z.dir), z.len, z.width); ctx.restore();
    }
    if (Game.mode && Game.mode.drawWorld && Game.state !== 'menu') Game.mode.drawWorld(ctx);
    // 벽
    for (const w of CONFIG.walls) { ctx.fillStyle = T.wall; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeStyle = '#3c4660'; ctx.lineWidth = 0.06; ctx.strokeRect(w.x, w.y, w.w, w.h); }
    if (Game.state === 'menu') return;
    this.drawIndicators(ctx, T);
    for (const m of FX.marks) { const k = m.life / m.max; ctx.strokeStyle = m.color; ctx.globalAlpha = k; ctx.lineWidth = 0.05; Draw.circle(ctx, m.x, m.y, 0.15 + (1 - k) * 0.4); ctx.stroke(); ctx.globalAlpha = 1; }
    for (const t of FX.trails) { ctx.globalAlpha = (t.life / t.max) * 0.5; ctx.strokeStyle = t.color; ctx.lineWidth = t.width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(t.a.x, t.a.y); ctx.lineTo(t.b.x, t.b.y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    for (const u of Game.units.slice().sort((a, b) => a.pos.y - b.pos.y)) this.drawUnit(ctx, u, T);
    this.drawBushes(ctx);
    for (const pr of Game.projectiles) this.drawProjectile(ctx, pr, T);
    for (const s of FX.slashes) {
      const k = s.life / s.max; ctx.globalAlpha = k * 0.55; ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.R, s.ang - s.half, s.ang + s.half); ctx.arc(s.x, s.y, s.inner || 0, s.ang + s.half, s.ang - s.half, true); ctx.closePath(); ctx.fill();
      if (s.inner) { ctx.globalAlpha = k * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(s.x, s.y, s.inner, s.ang - s.half, s.ang + s.half); ctx.stroke(); }
    }
    for (const a of FX.arcs) {
      const k = a.life / a.max, end = V.add(a.a, V.mul(a.dir, a.len)), ctrl = V.add(V.add(a.a, V.mul(a.dir, a.len * 0.5)), V.mul(V.perp(a.dir), a.bend));
      ctx.lineCap = 'round';
      for (const [col, w, al] of [[a.color, a.width, 0.6], ['#ffffff', a.width * 0.25, 0.9]]) {
        ctx.globalAlpha = k * al; ctx.strokeStyle = col; ctx.lineWidth = w * (0.5 + 0.5 * k);
        ctx.beginPath(); ctx.moveTo(a.a.x, a.a.y); ctx.quadraticCurveTo(ctrl.x, ctrl.y, end.x, end.y); ctx.stroke();
      }
      ctx.lineCap = 'butt';
    }
    ctx.globalAlpha = 1;
    for (const r of FX.rings) { const k = 1 - r.life / r.max; ctx.globalAlpha = 1 - k; ctx.strokeStyle = r.color; ctx.lineWidth = r.width; Draw.circle(ctx, r.x, r.y, lerp(r.r0, r.r1, k)); ctx.stroke(); }
    for (const p of FX.parts) { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
  },
  // 스킬 사거리/범위 미리보기
  drawCastTelegraph(ctx, p) {
    const c = p.cast; if (!c || c.phase !== 'windup') return;
    const k = clamp(c.t / Math.max(0.01, c.windup), 0, 1);
    if (c.k === 'E') {
      const L = S.E.range, w = 0.85;
      ctx.save(); ctx.translate(p.pos.x, p.pos.y); ctx.rotate(c.ang);
      ctx.fillStyle = 'rgba(20,24,40,.75)'; ctx.fillRect(0, -w / 2, L, w);
      const g = ctx.createLinearGradient(0, 0, L * k, 0); g.addColorStop(0, 'rgba(70,110,255,.85)'); g.addColorStop(1, 'rgba(120,160,255,.45)');
      ctx.fillStyle = g; ctx.fillRect(0, -w / 2, L * k, w);
      ctx.strokeStyle = 'rgba(120,160,255,.9)'; ctx.lineWidth = 0.04; ctx.strokeRect(0, -w / 2, L, w); ctx.restore();
    } else if (c.k === 'R') {
      const L = clamp(V.dist(p.pos, c.aim), S.R.minDist, S.R.maxDist) * (0.25 + 0.75 * k), w = S.R.width;
      ctx.save(); ctx.translate(p.pos.x, p.pos.y); ctx.rotate(c.ang);
      ctx.fillStyle = 'rgba(140,160,255,.32)'; ctx.fillRect(0, -w / 2, L, w);
      ctx.strokeStyle = 'rgba(230,236,255,.9)'; ctx.lineWidth = 0.05; ctx.strokeRect(0, -w / 2, L, w);
      ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.02;
      for (let i = 0; i < 6; i++) { const x = (i + 0.5) / 6 * L; ctx.beginPath(); ctx.moveTo(x, -w / 2); ctx.lineTo(x - 0.4, w / 2); ctx.stroke(); }
      ctx.restore();
      // 정신집중: 캐시 주위로 모여드는 고리 + 진행도 호
      const R0 = p.r + 1.2 * (1 - k);
      ctx.strokeStyle = `rgba(255,59,92,${0.35 + 0.5 * k})`; ctx.lineWidth = 0.07; Draw.circle(ctx, p.pos.x, p.pos.y, R0 + 0.15); ctx.stroke();
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.09; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, p.r + 0.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      if (Math.random() < 0.6) { const a = Math.random() * Math.PI * 2; FX.parts.push({ x: p.pos.x + Math.cos(a) * 1.4, y: p.pos.y + Math.sin(a) * 1.4, vx: -Math.cos(a) * 3, vy: -Math.sin(a) * 3, life: 0.35, max: 0.35, color: '#ff8fa3', size: 0.07 }); }
    }
  },
  drawIndicators(ctx, T) {
    const p = Game.player; if (!p || p.dead) return;
    this.drawCastTelegraph(ctx, p);
    if (!Settings.showRange) return;
    ctx.strokeStyle = 'rgba(255,255,255,.1)'; ctx.lineWidth = 0.03; Draw.circle(ctx, p.pos.x, p.pos.y, p.aaCfg().range + p.r); ctx.stroke();
    if (Input.aiming) this.drawSkillShape(ctx, p, Input.aiming, Input.world, 0.25);
    if (p.cast && p.cast.phase === 'windup' && p.cast.k !== 'E' && p.cast.k !== 'R') this.drawSkillShape(ctx, p, p.cast.k, p.cast.aim, 0.2 + 0.35 * (p.cast.t / Math.max(0.01, p.cast.windup)));
  },
  drawSkillShape(ctx, p, k, aim, alpha) {
    const dir = V.norm(V.sub(aim, p.pos)), ang = V.ang(dir);
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = CONFIG.theme.accent; ctx.strokeStyle = CONFIG.theme.accent; ctx.lineWidth = 0.05;
    const ring = r => { ctx.save(); ctx.globalAlpha = 0.5; ctx.fillStyle = 'transparent'; Draw.circle(ctx, p.pos.x, p.pos.y, r); ctx.stroke(); ctx.restore(); };
    switch (k) {
      case 'Q': Draw.oRect(ctx, p.pos, ang, S.Q.dashDist, S.Q.hitWidth); break;
      case 'W': {
        const h = S.W.angle / 2 * Math.PI / 180;
        ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.arc(p.pos.x, p.pos.y, S.W.range, ang - h, ang + h); ctx.closePath(); ctx.fill();
        ctx.globalAlpha = Math.min(1, alpha * 3); ctx.strokeStyle = '#fff'; ctx.beginPath(); ctx.arc(p.pos.x, p.pos.y, S.W.innerRange, ang - h, ang + h); ctx.stroke(); break;
      }
      case 'E': Draw.oRect(ctx, p.pos, ang, S.E.range, 0.3); ring(S.E.range); break;
      case 'R': Draw.oRect(ctx, p.pos, ang, clamp(V.dist(p.pos, aim), S.R.minDist, S.R.maxDist), S.R.width); break;
      case 'D':
        if (p.weapon === 'dagger') { ring(S.D_dagger.range + p.r); const t = Game.pickEnemyAt(aim, CONFIG.input.pickRadius); if (t) { ctx.globalAlpha = 0.8; ctx.strokeStyle = '#b18cff'; Draw.circle(ctx, t.pos.x, t.pos.y, t.r + 0.25); ctx.stroke(); } }
        else Draw.oRect(ctx, p.pos, ang, S.D_dual.dist, S.D_dual.hitWidth);
        break;
      case 'F': { ring(S.F.dist); const d = Math.min(S.F.dist, V.dist(p.pos, aim)); ctx.globalAlpha = 0.7; Draw.circle(ctx, p.pos.x + dir.x * d, p.pos.y + dir.y * d, p.r); ctx.stroke(); break; }
    }
    ctx.restore();
  },
  // 부쉬: 유닛 위에 반투명 잎사귀
  drawBushes(ctx) {
    for (const b of CONFIG.bushes || []) {
      ctx.save(); ctx.fillStyle = 'rgba(46,110,62,.55)'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 0.35); ctx.fill(); ctx.strokeStyle = 'rgba(120,200,120,.5)'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = 'rgba(90,170,90,.45)';
      for (let i = 0; i < b.w * b.h * 2.2; i++) { const x = b.x + ((i * 0.618034) % 1) * b.w, y = b.y + ((i * 0.381966 * 1.7) % 1) * b.h; ctx.beginPath(); ctx.ellipse(x, y, 0.22, 0.12, i, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  },
  drawUnit(ctx, u, T) {
    if (u.dead) return;
    if (u.team !== 0 && !Vision.visible(Game.player, u)) return;   // 부쉬 속 적은 안 보임
    ctx.save();
    if (u.invuln > 0 && Math.floor(Game.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (u.kind === 'player' && Vision.bushAt(u.pos) >= 0) ctx.globalAlpha = 0.6;   // 부쉬 속: 상대에게 안 보임
    ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(u.pos.x, u.pos.y + u.r * 0.55, u.r * 0.95, u.r * 0.45, 0, 0, Math.PI * 2); ctx.fill();
    if (u.slows.length) { ctx.strokeStyle = 'rgba(255,170,60,.85)'; ctx.lineWidth = 0.07; ctx.beginPath(); ctx.ellipse(u.pos.x, u.pos.y + u.r * 0.45, u.r * 1.05, u.r * 0.5, 0, 0, Math.PI * 2); ctx.stroke(); }
    if (u.trauma > 0 && u.crit <= 0) {
      ctx.strokeStyle = 'rgba(70,110,255,.95)'; ctx.lineWidth = 0.09; ctx.lineCap = 'round';
      for (let i = 0; i < u.trauma; i++) { const ox = u.pos.x - 0.25 + i * 0.25, oy = u.pos.y + u.r * 0.5; ctx.beginPath(); ctx.moveTo(ox - 0.1, oy - 0.25); ctx.quadraticCurveTo(ox + 0.12, oy + 0.1, ox - 0.05, oy + 0.75); ctx.stroke(); }
      ctx.lineCap = 'butt';
    }
    if (u.crit > 0) {
      const pulse = 0.65 + 0.35 * Math.sin(Game.time * 12);
      ctx.fillStyle = `rgba(200,20,40,${pulse})`;
      for (let i = 0; i < 3; i++) { const a = Math.PI / 2 + (i - 1) * 2.1, tip = V.add(u.pos, V.mul(V.fromAng(a), u.r + 0.75)), b1 = V.add(u.pos, V.mul(V.fromAng(a - 0.35), u.r * 0.6)), b2 = V.add(u.pos, V.mul(V.fromAng(a + 0.35), u.r * 0.6)); ctx.beginPath(); ctx.moveTo(b1.x, b1.y); ctx.lineTo(tip.x, tip.y); ctx.lineTo(b2.x, b2.y); ctx.fill(); }
      ctx.strokeStyle = `rgba(255,59,92,${pulse})`; ctx.lineWidth = 0.08; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.22); ctx.stroke();
    }
    if (u.unstoppable > 0) { ctx.strokeStyle = T.gold; ctx.lineWidth = 0.12; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.15); ctx.stroke(); }
    // 결투 상대 스킬 예고선
    if (u.act && u.act.type === 's1') { ctx.save(); ctx.globalAlpha = 0.15 + 0.35 * (u.act.t / u.act.dur); ctx.fillStyle = '#b56cff'; ctx.strokeStyle = '#b56cff'; ctx.lineWidth = 0.03; Draw.oRect(ctx, u.pos, V.ang(u.act.dir), CONFIG.enemy.s1.range, CONFIG.enemy.s1.width); ctx.restore(); }
    ctx.fillStyle = u.color; Draw.circle(ctx, u.pos.x, u.pos.y, u.r); ctx.fill();
    ctx.lineWidth = 0.06; ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.stroke();
    ctx.save(); ctx.translate(u.pos.x, u.pos.y);
    if (u.kind === 'player') {
      ctx.fillStyle = '#fff'; ctx.fillRect(-0.06, -0.22, 0.12, 0.44); ctx.fillRect(-0.22, -0.06, 0.44, 0.12);   // 의료 십자
      ctx.rotate(u.facing); ctx.fillStyle = '#e6e9ef'; ctx.fillRect(u.r * 0.7, -0.08, 0.55, 0.16);           // 톱날
      ctx.fillStyle = '#c4c9d4'; for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.moveTo(u.r * 0.75 + i * 0.13, 0.08); ctx.lineTo(u.r * 0.81 + i * 0.13, 0.17); ctx.lineTo(u.r * 0.87 + i * 0.13, 0.08); ctx.fill(); }
    } else if (u.kind === 'animal') {
      ctx.fillStyle = '#6b4f39'; for (const s of [-1, 1]) { ctx.beginPath(); ctx.moveTo(s * 0.18, -0.3); ctx.lineTo(s * 0.34, -0.62); ctx.lineTo(s * 0.4, -0.22); ctx.fill(); }
    } else if (u.kind === 'dummy') {
      ctx.strokeStyle = '#5b6274'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(-0.3, -0.1); ctx.lineTo(0.3, -0.1); ctx.moveTo(0, -0.35); ctx.lineTo(0, 0.35); ctx.stroke();
    } else if (u.kind === 'target') {
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.05; Draw.circle(ctx, 0, 0, u.r * 0.55); ctx.stroke(); Draw.circle(ctx, 0, 0, u.r * 0.18); ctx.fillStyle = '#fff'; ctx.fill();
    } else {
      ctx.rotate(u.facing); ctx.strokeStyle = '#e1d4ff'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(u.r + 0.5, 0); ctx.stroke();
    }
    ctx.restore();
    if (u.kind === 'player' && u.daggerReady > 0) {
      ctx.strokeStyle = 'rgba(120,180,255,.9)'; ctx.lineWidth = 0.03;
      for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, r0 = u.r * 0.6, x0 = u.pos.x + Math.cos(a) * r0, y0 = u.pos.y + u.r * 0.4 + Math.sin(a) * r0 * 0.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + rand(-0.2, 0.2), y0 + rand(-0.2, 0.1)); ctx.lineTo(x0 + rand(-0.25, 0.25), y0 + rand(-0.3, 0.15)); ctx.stroke(); }
    }
    if (u.flash > 0) { ctx.globalAlpha = Math.min(1, u.flash / 0.12) * 0.8; ctx.fillStyle = '#fff'; Draw.circle(ctx, u.pos.x, u.pos.y, u.r); ctx.fill(); ctx.globalAlpha = 1; }
    if (u.shield > 0) {
      const g = ctx.createRadialGradient(u.pos.x, u.pos.y, u.r * 0.3, u.pos.x, u.pos.y, u.r + 0.45);
      g.addColorStop(0, 'rgba(90,120,255,0)'); g.addColorStop(0.75, 'rgba(90,120,255,.28)'); g.addColorStop(1, 'rgba(150,175,255,.55)');
      ctx.fillStyle = g; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.45); ctx.fill();
      ctx.strokeStyle = 'rgba(170,190,255,.8)'; ctx.lineWidth = 0.04; ctx.stroke();
    }
    if (u.root > 0) {
      ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.05;
      for (const [rr, sp] of [[u.r + 0.22, 4], [u.r + 0.34, -3]]) { ctx.beginPath(); ctx.ellipse(u.pos.x, u.pos.y, rr, rr * 0.8, Game.time * sp, 0.3, Math.PI * 2 - 0.3); ctx.stroke(); }
    }
    if (u.stun > 0) for (let i = 0; i < 3; i++) { const a = Game.time * 5 + i * 2.09; ctx.fillStyle = T.gold; Draw.circle(ctx, u.pos.x + Math.cos(a) * 0.35, u.pos.y - u.r - 0.2 + Math.sin(a) * 0.12, 0.07); ctx.fill(); }
    if (Settings.showHitbox) { ctx.strokeStyle = '#5dff9a'; ctx.lineWidth = 0.03; Draw.circle(ctx, u.pos.x, u.pos.y, u.r); ctx.stroke(); }
    ctx.restore();
  },
  drawProjectile(ctx, pr, T) {
    ctx.save();
    if (pr.kind === 'needle') {
      if (pr.owner && !pr.owner.dead) { ctx.strokeStyle = 'rgba(255,255,255,.35)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(pr.owner.pos.x, pr.owner.pos.y); ctx.lineTo(pr.pos.x, pr.pos.y); ctx.stroke(); }   // 실
      ctx.translate(pr.pos.x, pr.pos.y); ctx.rotate(V.ang(pr.dir)); ctx.shadowColor = T.accent2; ctx.shadowBlur = 10; ctx.fillStyle = T.accent2; ctx.fillRect(-0.45, -0.05, 0.6, 0.1);
      ctx.beginPath(); ctx.moveTo(0.15, -0.09); ctx.lineTo(0.35, 0); ctx.lineTo(0.15, 0.09); ctx.fill();
    } else {
      const col = pr.color || '#c79bff', ln = pr.len || 1.2; ctx.translate(pr.pos.x, pr.pos.y); ctx.rotate(V.ang(pr.dir)); ctx.shadowColor = col; ctx.shadowBlur = 12; ctx.fillStyle = col; ctx.fillRect(-ln / 2, -pr.width / 2, ln, pr.width);
    }
    ctx.restore();
    if (Settings.showHitbox) { ctx.strokeStyle = '#5dff9a'; ctx.lineWidth = 0.02; Draw.circle(ctx, pr.pos.x, pr.pos.y, pr.width / 2); ctx.stroke(); }
  },
  // 머리 위 체력바/외상 중첩/상태
  drawOverheads(ctx) {
    const L = this.L;
    for (const u of Game.units) {
      if (u.dead || (u.team !== 0 && !Vision.visible(Game.player, u))) continue;
      const s = this.toScreen(u.pos), R = u.r * L.ppm, bw = Math.max(44, R * 2.6), bh = 6, x = s.x - bw / 2, y = s.y - R - 16;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
      const total = Math.max(u.maxHp, u.hp + u.shield);
      ctx.fillStyle = u.team === 0 ? '#3fd07a' : '#e5484d'; ctx.fillRect(x, y, bw * Math.max(0, u.hp) / total, bh);
      if (u.shield > 0) { ctx.fillStyle = '#e9eef7'; ctx.fillRect(x + bw * Math.max(0, u.hp) / total, y, bw * u.shield / total, bh); }
      if (u.healRed > 0) { ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 1; ctx.strokeRect(x - 1, y - 1, bw + 2, bh + 2); }
      Draw.text(ctx, u.kind === 'player' ? `캐시 Lv${u.build.level}` : u.name + (u.infinite ? ' ∞' : ''), s.x, y - 7, { size: 11, align: 'center', color: '#c9cfdb', stroke: true });
      if (u.team !== 0) {
        if (u.crit > 0) {
          Draw.rr(ctx, s.x - 46, y - 33, 92, 17, 8); ctx.fillStyle = 'rgba(255,59,92,.9)'; ctx.fill();
          Draw.text(ctx, `치명적 외상 ${fmt(u.crit, 1)}`, s.x, y - 24.5, { size: 11, bold: true, align: 'center', color: '#fff' });
        } else if (u.trauma > 0) {
          for (let i = 0; i < CONFIG.passive.stacks; i++) { Draw.circle(ctx, s.x - 14 + i * 14, y - 24, 5); ctx.fillStyle = i < u.trauma ? '#ff3b5c' : 'rgba(255,255,255,.15)'; ctx.fill(); ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.stroke(); }
          ctx.strokeStyle = '#ff9fb2'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(s.x + 30, y - 24, 5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * u.traumaT / CONFIG.passive.traumaDur); ctx.stroke();
        }
      }
      const st = [];
      if (u.stun > 0) st.push('기절 ' + fmt(u.stun, 1)); if (u.root > 0) st.push('속박 ' + fmt(u.root, 1));
      if (u.slows.length) st.push('둔화'); if (u.fear > 0) st.push('공포 ' + fmt(u.fear, 1)); if (u.unstoppable > 0) st.push('저지 불가');
      if (st.length) Draw.text(ctx, st.join(' · '), s.x, s.y + R + 13, { size: 11, bold: true, align: 'center', color: CONFIG.theme.gold, stroke: true });
    }
  },
  drawTexts(ctx) {
    for (const t of FX.texts) {
      const s = this.toScreen(t); ctx.globalAlpha = clamp(t.life / t.max * 1.6, 0, 1);
      Draw.text(ctx, t.str, s.x, s.y, { size: t.size, bold: t.bold, align: 'center', color: t.color, stroke: true });
    }
    ctx.globalAlpha = 1;
  },
  drawTopInfo(ctx, L) {
    const p = Game.player, b = CONFIG.builds[Game.buildId];
    // 가운데 점수판(약 ±190px)과 겹치지 않도록 왼쪽 정보는 폭을 넘으면 말줄임
    const maxW = Math.max(160, L.W / 2 - 200);
    const fit = (s, size, bold) => { ctx.font = `${bold ? '700 ' : ''}${size}px ${FONT}`; if (ctx.measureText(s).width <= maxW) return s; while (s.length > 4 && ctx.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; };
    Draw.text(ctx, fit(`${Game.mode.title}  ·  ${fmt(Game.time, 1)}s`, 13, true), 12, 16, { size: 13, bold: true, stroke: true });
    Draw.text(ctx, fit(`${b.label} · ${p ? CONFIG.basicAttack[p.weapon].label : ''} · x${fmt(Settings.gameSpeed, 1)} · FPS ${Math.round(fps)}`, 11), 12, 34, { size: 11, color: '#8a93a6', stroke: true });
    Draw.text(ctx, fit(`ESC 일시정지 · Tab 패널 · 시전: ${CAST_MODES[Settings.castMode]}${Object.keys(Settings.castModes).length ? ' (스킬별 설정 있음)' : ''}`, 11), 12, 50, { size: 11, color: '#8a93a6', stroke: true });
  },
  drawToasts(ctx, L) {
    FX.toasts.forEach((t, i) => { ctx.globalAlpha = clamp(t.life, 0, 1); Draw.text(ctx, t.str, L.W / 2, L.H - HUD_H - 22 - (FX.toasts.length - 1 - i) * 20, { size: 13, bold: true, align: 'center', color: t.color, stroke: true }); });
    ctx.globalAlpha = 1;
  },
};

// ============================== HUD ==============================
const HUD = {
  flashUntil: {},
  flash(k) { this.flashUntil[k] = performance.now() + 250; },
  draw(ctx, L) {
    const p = Game.player; if (!p) return;
    const pw = Math.min(L.W - 16, 660), ph = 104, x0 = (L.W - pw) / 2, y0 = L.H - ph - 8, T = CONFIG.theme;
    Draw.panel(ctx, x0, y0, pw, ph);
    // 초상화 + 레벨
    const cx = x0 + 50, cy = y0 + 52;
    Draw.circle(ctx, cx, cy, 36); ctx.fillStyle = '#1b2030'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = T.accent; ctx.stroke();
    Draw.text(ctx, '캐시', cx, cy, { size: 16, bold: true, align: 'center' });
    Draw.circle(ctx, cx + 27, cy + 25, 12); ctx.fillStyle = T.accent; ctx.fill();
    Draw.text(ctx, String(p.build.level), cx + 27, cy + 25, { size: 11, bold: true, align: 'center', color: '#fff' });
    // 체력/스태미나
    const slotsW = 6 * 52, bx = x0 + 98, bw = Math.max(100, pw - 98 - slotsW - 22), by = y0 + 14;
    const tot = Math.max(p.maxHp, p.hp + p.shield);
    ctx.fillStyle = '#0f131b'; ctx.fillRect(bx, by, bw, 18);
    ctx.fillStyle = '#3fd07a'; ctx.fillRect(bx, by, bw * Math.max(0, p.hp) / tot, 18);
    if (p.shield > 0) { ctx.fillStyle = '#e9eef7'; ctx.fillRect(bx + bw * Math.max(0, p.hp) / tot, by, bw * p.shield / tot, 18); }
    Draw.text(ctx, `${Math.round(Math.max(0, p.hp))} / ${p.maxHp}${p.shield > 0 ? ` (+${Math.round(p.shield)})` : ''}`, bx + bw / 2, by + 9.5, { size: 11, bold: true, align: 'center', stroke: true });
    ctx.fillStyle = '#0f131b'; ctx.fillRect(bx, by + 24, bw, 9); ctx.fillStyle = '#4aa3ff'; ctx.fillRect(bx, by + 24, bw * p.st / p.maxSt, 9);
    Draw.text(ctx, `SP ${Math.round(p.st)}`, bx + bw - 2, by + 40, { size: 10, align: 'right', color: '#8a93a6' });
    // 버프 표시
    const buffs = [];
    if (p.enhanced > 0) buffs.push(['강화 평타', '#ff9fb2']);
    if (p.shield > 0) buffs.push([`보호막 ${fmt(p.shieldT, 1)}`, '#e9eef7']);
    if (p.msBuffs.some(m => m.tag === 'pboost')) buffs.push(['이속↑', T.accent2]);
    if (p.daggerReady > 0) buffs.push([`단검 ${fmt(p.daggerReady, 1)}`, '#b18cff']);
    if (p.dualRecast > 0) buffs.push([`2식 ${fmt(p.dualRecast, 1)}`, '#ff8fa3']);
    if (p.unstoppable > 0) buffs.push(['저지 불가', T.gold]);
    let bxx = bx;
    for (const [t, c] of buffs) { ctx.font = `700 10px ${FONT}`; const w = ctx.measureText(t).width + 12; Draw.rr(ctx, bxx, by + 50, w, 16, 8); ctx.fillStyle = c + '33'; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.stroke(); Draw.text(ctx, t, bxx + w / 2, by + 58, { size: 10, bold: true, align: 'center', color: c }); bxx += w + 4; if (bxx > bx + bw - 30) break; }
    Draw.text(ctx, `AD ${p.ad} · SP ${p.sp} · AS ${p.as} · CDR ${Math.round(p.cdr * 100)}%`, bx, by + 80, { size: 10, color: '#8a93a6' });
    // 스킬 슬롯
    const sx0 = x0 + pw - slotsW - 8;
    ['Q', 'W', 'E', 'R', 'D', 'F'].forEach((k, i) => this.slot(ctx, p, k, sx0 + i * 52, y0 + 12, 46));
  },
  slot(ctx, p, k, x, y, s) {
    const def = p.skillDef(k), st = p.skills[k], T = CONFIG.theme;
    const special = (k === 'D' && (p.daggerReady > 0 || p.dualRecast > 0));
    const ready = st.lv > 0 && st.cd <= 0;
    Draw.rr(ctx, x, y, s, s, 8); ctx.fillStyle = '#1b2030'; ctx.fill();
    Draw.text(ctx, def.short, x + s / 2, y + s / 2 + 3, { size: 13, bold: true, align: 'center', color: ready || special ? '#fff' : '#9aa2b3' });
    if (st.lv <= 0) { Draw.rr(ctx, x, y, s, s, 8); ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fill(); Draw.text(ctx, '잠김', x + s / 2, y + s / 2, { size: 11, align: 'center', color: '#666' }); }
    else if (st.cd > 0 && !special) {
      ctx.save(); Draw.rr(ctx, x, y, s, s, 8); ctx.clip();
      ctx.fillStyle = 'rgba(0,0,0,.68)'; ctx.beginPath(); ctx.moveTo(x + s / 2, y + s / 2);
      ctx.arc(x + s / 2, y + s / 2, s, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (st.cd / st.cdMax)); ctx.closePath(); ctx.fill(); ctx.restore();
      Draw.text(ctx, st.cd >= 1 ? String(Math.ceil(st.cd)) : fmt(st.cd, 1), x + s / 2, y + s / 2 + 3, { size: 16, bold: true, align: 'center', stroke: true });
    }
    const flash = (this.flashUntil[k] || 0) > performance.now();
    Draw.rr(ctx, x, y, s, s, 8); ctx.lineWidth = Input.aiming === k ? 3 : 2;
    ctx.strokeStyle = flash ? '#ff5d5d' : Input.aiming === k ? '#ffffff' : special ? T.gold : ready ? T.accent : '#2a3140'; ctx.stroke();
    Draw.text(ctx, (Settings.keys[k] || '').toUpperCase(), x + 5, y + 9, { size: 10, bold: true, color: '#c9cfdb' });
    const maxLv = k === 'R' || k === 'D' ? 3 : k === 'F' ? 0 : 5;
    for (let i = 0; i < maxLv; i++) { ctx.fillStyle = i < st.lv ? T.gold : '#2a3140'; ctx.fillRect(x + 4 + i * ((s - 8) / maxLv), y + s + 4, (s - 8) / maxLv - 2, 4); }
  },
};
