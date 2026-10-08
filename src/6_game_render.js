
// ============================== 게임 ==============================
const Game = {
  state: 'menu', paused: false, mode: null, modeId: null, opts: null, units: [], projectiles: [], zones: [], player: null,
  time: 0, tick: 0, seed: 1, uid0: 0, freeze: 0, cdMul: 1, buildId: 'late',
  start(id, opts = {}) {
    Events.clear(); FX.reset(); Stats.reset();
    Object.assign(this, { units: [], projectiles: [], zones: [], player: null, time: 0, freeze: 0, cdMul: 1, modeId: id, opts, buildId: opts.build || Settings.build, demoLock: false });
    this.mode = Modes[id]; Input.reset();
    // 시드·틱: 같은 시드 + 같은 명령 기록(Cmd.log) = 같은 판 (리플레이·온라인 대전 준비)
    this.seed = opts.seed !== undefined ? opts.seed >>> 0 : (Math.random() * 4294967296) >>> 0; Rng.seed(this.seed); this.tick = 0; this.uid0 = UID; Cmd.reset();
    // 맵 적용 (지형·부쉬). 지정이 없으면 기본 아레나
    this.mapKey = CONFIG.maps[opts.map] ? opts.map : 'basic'; this.map = CONFIG.maps[this.mapKey];
    CONFIG.walls = this.map.walls.map(w => Object.assign({}, w)); CONFIG.bushes = (this.map.bushes || []).map(b => Object.assign({}, b)); Vision.reveals = []; Vision.ghosts = {}; Vision.noises = []; Vision.rustles = []; this.drones = []; Sphere.stop();
    Vision.fogOn = (id === 'duel' || id === 'pvp') && Settings.fog !== false; Vision.setTime(Vision.fogOn ? (opts.time || Settings.duelTime || 'day') : 'day');
    this.mode.start(opts);
    this.state = 'play'; this.paused = false; UI.hide();
  },
  restart() { this.start(this.modeId, this.opts); },
  step(dt) { this._step(dt); Net.afterStep(); Replay.afterStep(); },   // 온라인 호스트: 0.05초마다 상태 전송
  _step(dt) {
    Cmd.feed(); Net.feed(); this.tick++;
    if (this.freeze > 0) { this.freeze -= dt; this.mode.update(dt, true); FX.update(dt); return; }
    this.time += dt; Stats.tick(dt); Vision.update(dt);
    Sfx.tick(dt);
    for (const u of this.units.slice()) u.update(dt);
    VisionItems.update(dt); for (const u of this.units) VisionItems.tick(u, dt);
    this.units = this.units.filter(u => !(u.dead && u.kind === 'ward'));   // 파괴·만료된 카메라 제거
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
    if (Replay.active) { Replay.end(); return; }   // 다시 보기 중엔 기록·결과 화면 없이 끝
    this.state = 'result';
    if (Net.role === 'host') Net.flush();
    Replay.last = Replay.capture();   // 결과 화면 「리플레이 저장」용   // 손님에게 경기 종료 전달
    const r = this.mode.result(reason) || {}; r.title = r.title || this.mode.title;
    if (this.opts && this.opts.gear && r.key) { r.key += '|g' + Builds.sig(this.opts.gear); r.recTitle = (r.recTitle || r.title) + ' · 장비'; }   // 장비별 최고 기록
    Grade.compute(r); Records.save(r); UI.showResults(r);
  },
  togglePause() {
    if (this.state !== 'play') return;
    if (Net.role) { FX.toast('온라인 대전 중에는 일시정지할 수 없습니다', '#aaa'); return; }
    this.paused = !this.paused;
    if (this.paused) { Input.unlock(); Input.rDown = false; UI.showPause(); } else UI.hide();
  },
  // 적 목록은 「누구 기준」인지(of)에 따라 — 기본 내 캐릭터. 온라인 대전에선 상대(팀 1) 캐릭터 기준으로도 부름
  enemies(of = this.player) { const tm = of ? of.team : 0; return this.units.filter(u => u.team !== tm && !u.dead && !(u.untargetable > 0) && u.kind !== 'ward'); },   // 대상 지정 불가(다니엘 걸작)·카메라 제외
  visibleEnemies(of = this.player) { return this.enemies(of).filter(e => Vision.visible(of, e)); },
  nearestEnemy(pos, range, of = this.player) { let best = null, bd = range; for (const e of this.visibleEnemies(of)) { const d = V.dist(pos, e.pos) - e.r; if (d <= bd) { bd = d; best = e; } } return best; },
  pickEnemyAt(pt, rad, of = this.player) { let best = null, bd = Infinity; const tm = of ? of.team : 0, wards = this.units.filter(u => u.kind === 'ward' && !u.dead && u.team !== tm && Vision.visible(of, u));   // 상대 카메라는 평타로 파괴
    for (const e of this.visibleEnemies(of).concat(wards)) { const d = V.dist(pt, e.pos); if (d <= rad + e.r && d < bd) { bd = d; best = e; } } return best; },
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
  rDown: false, rLast: 0, locked: false, lockLostT: 0,
  reset() { this.aiming = null; this.amove = false; this.rDown = false; },
  // 우클릭 이동/공격 (누르고 있으면 계속 커서를 따라감 — 실제 게임처럼)
  rightCmd(hold) {
    const p = Game.player, w = this.world; if (!p) return;
    const t = Game.pickEnemyAt(w, 0.35);
    if (t) { if (p.attackTarget !== t) Cmd.attack(t); } else if (!hold || !p.attackTarget) Cmd.move(w);
  },
  tick() {   // 매 프레임: 우클릭 유지 이동 · 걸작 중 커서 위치 전달
    const p = Game.player;
    if (p && p.shadow && Game.state === 'play' && !Game.paused && !Game.demoLock && (!p.cursor || V.dist(p.cursor, this.world) > 0.25) && performance.now() - (this.curLast || 0) > 80) { this.curLast = performance.now(); Cmd.cursor(this.world); }
    if (!this.rDown || Game.state !== 'play' || Game.paused || !Game.player || Game.demoLock) return;
    const now = performance.now(); if (now - this.rLast < 90) return;
    this.rLast = now; this.rightCmd(true);
  },
  moveBtn() { return Settings.moveButton === 'left' ? 0 : 2; },   // 이동 버튼: 우클릭(기본) / 좌클릭(웨일 등 브라우저 마우스 제스처 회피)
  setPos(x, y) { this.screen = { x, y }; this.world = Renderer.toWorld(x, y); },
  // 마우스 잠금(Pointer Lock): 웨일·비발디 등 브라우저의 우클릭 드래그 '마우스 제스처'가 게임 입력을 가로채지 않도록 커서를 캔버스에 가둠
  wantLock() { return Settings.pointerLock && Game.state === 'play' && !Game.paused; },
  lock(cv) { if (this.wantLock() && !this.locked && cv.requestPointerLock) { try { const r = cv.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) { /* 미지원 */ } } },
  unlock() { if (document.pointerLockElement && document.exitPointerLock) document.exitPointerLock(); },
  init(cv) {
    const block = e => { e.preventDefault(); e.stopPropagation(); };
    cv.addEventListener('contextmenu', block);
    window.addEventListener('contextmenu', e => { if (Game.state === 'play') block(e); });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === cv;
      if (!this.locked) { this.rDown = false; if (Game.state === 'play' && !Game.paused && Settings.pointerLock) { this.lockLostT = performance.now(); Game.togglePause(); } }   // Esc로 잠금이 풀리면 일시정지
    });
    cv.addEventListener('mousemove', e => {
      if (e.buttons & 2) block(e);   // 우클릭 드래그를 페이지가 소비 (제스처 확장 프로그램 대응)
      if (this.locked) this.setPos(clamp(this.screen.x + e.movementX, 0, window.innerWidth - 1), clamp(this.screen.y + e.movementY, 0, window.innerHeight - 1));
      else this.setPos(e.clientX, e.clientY);
    });
    window.addEventListener('mouseup', e => { if (e.button === this.moveBtn()) this.rDown = false; if (e.button === 2 && Game.state === 'play') block(e); });
    cv.addEventListener('mousedown', e => {
      Sfx.init(); if (!this.locked) this.setPos(e.clientX, e.clientY);
      if (e.button === 2) block(e);
      if (Game.state !== 'play' || Game.paused || !Game.player || Game.demoLock) return;
      this.lock(cv);
      const p = Game.player;
      const w = this.world, mb = this.moveBtn();
      if (e.button === 0 && (this.aiming || this.amove)) {   // 스킬 조준·공격 이동 확정은 항상 좌클릭
        if (this.aiming) { Cmd.skill(this.aiming, w); this.aiming = null; } else { Cmd.amove(w); this.amove = false; }
      } else if (e.button === mb) {   // 이동/공격 (누르고 있으면 계속 따라감)
        this.aiming = null; this.amove = false; this.rDown = true; this.rLast = performance.now();
        this.rightCmd(false);
        if (mb === 2 && !Settings.whaleHint && /Whale\//.test(navigator.userAgent)) { Settings.whaleHint = true; saveSettings(); FX.toast("웨일 마우스 제스처가 뜨면: 설정 → 마우스 → 이동 버튼 '좌클릭'", '#4aa3ff'); }
      } else if (e.button === 2) { this.aiming = null; this.amove = false; }   // 좌클릭 이동 모드: 우클릭 = 조준 취소
      
    });
    cv.addEventListener('wheel', e => { if (Renderer.mode === '3d' && Game.state === 'play') { e.preventDefault(); Render3D.onWheel(e); } }, { passive: false });   // 3D 카메라 줌
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
      if (performance.now() - Input.lockLostT < 400) return;   // 마우스 잠금 해제용 Esc는 이미 일시정지로 처리됨
      if (!Game.paused && this.aiming) { this.aiming = null; return; }
      if (!Game.paused && this.amove) { this.amove = false; return; }
      Game.togglePause(); return;
    }
    if (e.key === ' ' && Game.state === 'play') { e.preventDefault(); this.spaceHeld = true; return; }   // 스페이스(누르고 있기): 카메라를 내 캐릭터로
    if (Game.state !== 'play' || Game.paused || e.repeat || !Game.player) return;
    if (Game.modeId === 'combo' && e.key.toLowerCase() === 'g' && !Object.values(Settings.keys).includes('g')) { e.preventDefault(); Modes.combo.startDemo(); return; }   // 콤보 시범 보기
    if (Game.demoLock) return;   // 시범 중엔 입력 막음
    const k = e.key.toLowerCase(), act = Object.keys(Settings.keys).find(a => Settings.keys[a] === k);
    if (!act) return;
    e.preventDefault(); Sfx.init();
    const p = Game.player, w = this.world;
    if (act === 'S') { Cmd.stop(); this.aiming = null; return; }
    if (act === 'X') { this.aiming = null; this.amove = false; Cmd.rest(); return; }   // 휴식 (다시 누르면 일어남)
    if (act === 'C') { Cmd.camera(w); return; }   // 망원 카메라: 커서 방향(최대 4m)에 즉시 설치
    if (act === 'V') { Cmd.drone(w); return; }    // 정찰 드론: 커서 지점(최대 24m)으로 발사
    if (act === 'A') { this.amove = true; this.aiming = null; return; }
    if (act === 'Y') { Settings.camLock = Settings.camLock === false; saveSettings(); FX.toast(Settings.camLock ? '카메라 잠금' : '카메라 잠금 해제 — 화면 가장자리로 이동, 스페이스로 내 캐릭터', '#9fd8ff'); return; }   // 이터널 리턴과 같은 카메라 잠금 전환
    if (act === 'R' && p.shadow) { Cmd.skill('R', w); this.aiming = null; return; }   // 다니엘 걸작 중 R = 즉시 탈출
    // 즉시 발동형: 단검 1차(유틸)
    if (act === 'D' && p.weapon === 'dagger' && p.daggerReady <= 0) { Cmd.skill('D', w); return; }
    const mode = castModeOf(act);
    if (mode === 'smart') { Cmd.skill(act, w); this.aiming = null; return; }           // 누르면 즉시 발동
    if (mode === 'release') { this.aiming = act; this.amove = false; this.holdKey = act; return; }   // 떼면 발동
    if (this.aiming === act) { Cmd.skill(act, w); this.aiming = null; return; }   // 같은 키 두 번 = 시전
    this.aiming = act; this.amove = false;
  },
  onKeyUp(e) {
    if (e.key === ' ') this.spaceHeld = false;
    if (!this.holdKey || Game.state !== 'play' || Game.paused || !Game.player) { this.holdKey = null; return; }
    const act = Object.keys(Settings.keys).find(a => Settings.keys[a] === e.key.toLowerCase());
    if (act !== this.holdKey) return;
    this.holdKey = null;
    if (this.aiming === act) { Cmd.skill(act, this.world); this.aiming = null; }
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

// ============================== 렌더러 (표시 계층) ==============================
// 게임 로직은 월드 좌표(m)만 다루고, 그리기와 화면↔월드 좌표 변환은 Renderer가 담당
// 구현: Render(2D 캔버스). 이후 3D 구현을 같은 인터페이스로 추가 — init / frame / toWorld / toScreen / pxPerMeter / inputCanvas
const Renderer = {
  impl: null, mode: '2d',
  init() { Render.init(); this.impl = Render; this.setMode(Settings.gfx, true); },
  // 그래픽 전환: '3d'는 Three.js·WebGL이 가능할 때만, 실패하면 2D로 되돌리고 알림
  setMode(m, quiet) {
    if (m === '3d') {
      try { if (!Render3D.ready) Render3D.init(); Render3D.resize(); Render3D.show(true); this.impl = Render3D; this.mode = '3d'; return true; }
      catch (e) { console.warn('3D 렌더러 사용 불가:', e); if (!quiet) FX.toast('3D 그래픽을 사용할 수 없어 2D로 표시합니다', '#ffb347'); Settings.gfx = '2d'; saveSettings(); }
    }
    if (Render3D.ready) Render3D.show(false);
    this.impl = Render; this.mode = '2d'; return m !== '3d';
  },
  resize() { Render.resize(); if (Render3D.ready) Render3D.resize(); },
  frame() { Input.tick(); this.impl.frame(); },
  toWorld(sx, sy) { return this.impl.toWorld(sx, sy); },
  toScreen(p, h = 0) { return this.impl.toScreen(p, h); },   // h: 지면에서의 높이(m) — 2D는 무시
  pxPerMeter(p) { return this.impl.pxPerMeter(p); },
  overhead(u) { return this.impl.overhead(u); },               // 머리 위 체력바 위치 {x, top, bottom}
  inputCanvas() { return this.impl.inputCanvas(); },
};

// ============================== 2D 렌더 ==============================
const HUD_H = 118;
const Render = {
  init() { this.cv = document.getElementById('game'); this.ctx = this.cv.getContext('2d'); this.resize(); window.addEventListener('resize', () => Renderer.resize()); },
  resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    this.cv.width = W * dpr; this.cv.height = H * dpr;
    const ppm = Math.min((W - 20) / CONFIG.world.w, (H - HUD_H - 20) / CONFIG.world.h);
    this.L = { W, H, dpr, ppm, ox: (W - CONFIG.world.w * ppm) / 2, oy: Math.max(10, (H - HUD_H - CONFIG.world.h * ppm) / 2) };
  },
  toWorld(sx, sy) { const L = this.L; return { x: (sx - L.ox) / L.ppm, y: (sy - L.oy) / L.ppm }; },
  toScreen(p) { const L = this.L; return { x: L.ox + p.x * L.ppm + (this.shx || 0), y: L.oy + p.y * L.ppm + (this.shy || 0) }; },
  pxPerMeter() { return this.L.ppm; },
  inputCanvas() { return this.cv; },
  frame() {
    const { ctx, L } = this, T = CONFIG.theme;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#07090d'; ctx.fillRect(0, 0, this.cv.width, this.cv.height);
    const sh = Settings.reduceShake ? 0 : FX.shake; this.shx = (Math.random() - 0.5) * sh; this.shy = (Math.random() - 0.5) * sh;
    ctx.setTransform(L.dpr * L.ppm, 0, 0, L.dpr * L.ppm, L.dpr * (L.ox + this.shx), L.dpr * (L.oy + this.shy));
    this.drawWorld(ctx, T);
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0);
    ScreenLayer.draw(ctx, L);   // 체력바·글자·HUD — 렌더러와 무관한 화면 좌표 층
  },
  // layer: 'all' = 2D 전체 / 'ground' = 3D 렌더러의 바닥 데칼(예고 범위·이펙트·상태 표시·안개만 — 바닥·벽·부쉬·유닛 몸체·투사체는 3D 메시)
  drawWorld(ctx, T, layer = 'all') {
    const W = CONFIG.world.w, H = CONFIG.world.h, all = layer === 'all';
    if (all) {
      ctx.fillStyle = T.floor; ctx.fillRect(0, 0, W, H);
      ctx.lineWidth = 0.02;
      for (let x = 0; x <= W; x++) { ctx.strokeStyle = x % 4 ? T.grid : '#1f2636'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
      for (let y = 0; y <= H; y++) { ctx.strokeStyle = y % 4 ? T.grid : '#1f2636'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
      ctx.strokeStyle = '#2f3850'; ctx.lineWidth = 0.08; ctx.strokeRect(0, 0, W, H);
    }
    // 치유 영역
    for (const z of Game.zones) {
      ctx.save(); ctx.globalAlpha = 0.18 + 0.12 * Math.sin(Game.time * 6); ctx.fillStyle = '#5dff9a'; ctx.strokeStyle = 'rgba(93,255,154,.6)'; ctx.lineWidth = 0.04;
      Draw.oRect(ctx, z.from, V.ang(z.dir), z.len, z.width); ctx.restore();
    }
    if (Game.mode && Game.mode.drawWorld && Game.state !== 'menu') Game.mode.drawWorld(ctx);
    // 벽
    if (all) for (const w of CONFIG.walls) {
      if (w.kind === 'low') {   // 낮은 턱·화단: 이동만 막고 시야는 통과
        ctx.fillStyle = '#26303f'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeStyle = '#4d5a72'; ctx.lineWidth = 0.04; ctx.setLineDash([0.18, 0.12]); ctx.strokeRect(w.x, w.y, w.w, w.h); ctx.setLineDash([]);
        ctx.fillStyle = 'rgba(90,150,90,.35)'; for (let i = 0; i < (w.w + w.h) * 1.5; i++) { const t = (i + 0.5) / ((w.w + w.h) * 1.5); ctx.fillRect(w.x + (w.w > w.h ? t * w.w : w.w * 0.3), w.y + (w.w > w.h ? w.h * 0.3 : t * w.h), 0.12, 0.12); }
      } else if (w.kind === 'glass') {   // 창문 벽: 이동은 막고 너머가 보임
        ctx.fillStyle = '#2b3346'; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeStyle = '#3c4660'; ctx.lineWidth = 0.06; ctx.strokeRect(w.x, w.y, w.w, w.h);
        ctx.fillStyle = 'rgba(140,200,255,.45)'; const L = Math.max(w.w, w.h), hz = w.w > w.h;
        for (let t = 0.25; t < L - 0.2; t += 0.8) { if (hz) ctx.fillRect(w.x + t, w.y + w.h * 0.25, 0.5, w.h * 0.5); else ctx.fillRect(w.x + w.w * 0.25, w.y + t, w.w * 0.5, 0.5); }
      } else { ctx.fillStyle = T.wall; ctx.fillRect(w.x, w.y, w.w, w.h); ctx.strokeStyle = '#3c4660'; ctx.lineWidth = 0.06; ctx.strokeRect(w.x, w.y, w.w, w.h); }
    }
    if (Game.state === 'menu') return;
    this.drawIndicators(ctx, T);
    for (const m of FX.marks) { const k = m.life / m.max; ctx.strokeStyle = m.color; ctx.globalAlpha = k; ctx.lineWidth = 0.05; Draw.circle(ctx, m.x, m.y, 0.15 + (1 - k) * 0.4); ctx.stroke(); ctx.globalAlpha = 1; }
    const fx3 = !all && typeof VFX3D !== 'undefined' && VFX3D.on();   // 3D 스킬 이펙트가 켜져 있으면 베기·궤적·파티클은 3D로만
    for (const t of FX.trails) { if (fx3 && t.width <= VFX3D.WIDE) continue; ctx.globalAlpha = (t.life / t.max) * 0.5; ctx.strokeStyle = t.color; ctx.lineWidth = t.width; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(t.a.x, t.a.y); ctx.lineTo(t.b.x, t.b.y); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.lineCap = 'butt';
    for (const u of Game.units.slice().sort((a, b) => a.pos.y - b.pos.y)) this.drawUnit(ctx, u, T, !all);
    for (const u of Game.units) if (u.rest && !u.dead && (u.team === myTeam() || Vision.visible(Game.player, u))) Rest.draw(ctx, u);
    if (Game.player && Game.player.drawExtra && Game.state !== 'menu') Game.player.drawExtra(ctx);
    if (Game.player && Game.state !== 'menu') Tactical.draw(ctx, Game.player);
    if (all) { this.drawBushes(ctx); for (const pr of Game.projectiles) this.drawProjectile(ctx, pr, T); }
    if (!fx3) for (const s of FX.slashes) {
      const k = s.life / s.max; ctx.globalAlpha = k * 0.55; ctx.fillStyle = s.color;
      ctx.beginPath(); ctx.arc(s.x, s.y, s.R, s.ang - s.half, s.ang + s.half); ctx.arc(s.x, s.y, s.inner || 0, s.ang + s.half, s.ang - s.half, true); ctx.closePath(); ctx.fill();
      if (s.inner) { ctx.globalAlpha = k * 0.9; ctx.strokeStyle = '#fff'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(s.x, s.y, s.inner, s.ang - s.half, s.ang + s.half); ctx.stroke(); }
    }
    if (!fx3) for (const a of FX.arcs) {
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
    if (!fx3) for (const p of FX.parts) { ctx.globalAlpha = p.life / p.max; ctx.fillStyle = p.color; ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size); }
    ctx.globalAlpha = 1;
    if (Vision.fogOn && Game.player) this.drawFog(ctx);
  },
  // 전장의 안개: 시야 다각형(벽에 막힘)과 시야 구역만 밝게, 나머지는 어둡게 + 사라진 적의 마지막 위치
  drawFog(ctx) {
    const p = Game.player, cv = ctx.canvas, V0 = CONFIG.vision;
    if (!this.fogCv) this.fogCv = document.createElement('canvas');
    const fc = this.fogCv; if (fc.width !== cv.width || fc.height !== cv.height) { fc.width = cv.width; fc.height = cv.height; }
    if (!fc.width || !fc.height) return;   // 창이 최소화되는 등 캔버스 크기가 0이면 건너뜀
    const f = fc.getContext('2d');
    f.setTransform(1, 0, 0, 1, 0, 0); f.globalCompositeOperation = 'source-over'; f.clearRect(0, 0, fc.width, fc.height);
    f.fillStyle = Vision.night ? `rgba(2,4,12,${V0.nightFog})` : `rgba(4,6,10,${V0.fogAlpha})`; f.fillRect(0, 0, fc.width, fc.height);
    f.setTransform(ctx.getTransform()); f.globalCompositeOperation = 'destination-out'; f.fillStyle = '#000';
    if (!p.dead) { const pts = Vision.poly(p); f.beginPath(); f.moveTo(pts[0].x, pts[0].y); for (const q of pts) f.lineTo(q.x, q.y); f.closePath(); f.fill(); }
    for (const z of Vision.reveals) if (z.team === p.team) { f.beginPath(); f.arc(z.pos.x, z.pos.y, z.r, 0, Math.PI * 2); f.fill(); }
    for (const w of Vision.wards(p.team)) {   // 카메라 시야(벽에 가려짐) — 설치 위치가 고정이라 캐시
      const R = w.sightR(); if (!w._poly || w._polyR !== R) { w._poly = Vision.polyFrom(w.pos, R); w._polyR = R; }
      f.beginPath(); f.moveTo(w._poly[0].x, w._poly[0].y); for (const q of w._poly) f.lineTo(q.x, q.y); f.closePath(); f.fill();
    }
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(fc, 0, 0); ctx.restore();
    // 아군 시야 구역 테두리(드론·카메라)
    for (const z of Vision.reveals) if (z.team === p.team && z.drone) KU.ring(ctx, z.pos, z.r, '#7fd1ff', 0.35 * Math.min(1, z.t), true);
    // 상대 드론: 드론이 내 시야 안에 있을 때만 범위가 보임
    for (const z of Vision.reveals) if (z.team !== p.team && z.drone && Vision.pointVisible(z.pos)) { KU.ring(ctx, z.pos, z.r, '#ff8a8a', 0.5, true); KU.fill(ctx, z.pos, 0.18, '#ff8a8a', 0.9); }
    for (const fl of Game.drones || []) { const k = clamp(fl.t / fl.dur, 0, 1), at = V.lerp(fl.from, fl.to, k); if (fl.team === p.team || Vision.pointVisible(at)) KU.fill(ctx, at, 0.16, fl.team === p.team ? '#7fd1ff' : '#ff8a8a', 0.9); }
    this.drawNoises(ctx);
    for (const id in Vision.ghosts) {   // 잔상: 흐린 테두리 + 물음표
      const g = Vision.ghosts[id], u = Game.units.find(x => x.id === +id); if (u && Vision.visible(p, u)) continue;
      ctx.save(); ctx.globalAlpha = 0.25 + 0.35 * g.t / V0.ghost; ctx.strokeStyle = g.color; ctx.lineWidth = 0.06; ctx.setLineDash([0.15, 0.1]);
      Draw.circle(ctx, g.pos.x, g.pos.y, g.r); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = g.color; ctx.font = 'bold 0.5px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', g.pos.x, g.pos.y); ctx.restore();
    }
  },
  // 소음: 시야 밖에서 들린 상대의 스킬·평타('!' 핑)와 발소리
  drawNoises(ctx) {
    const p = Game.player; if (!p || p.dead) return;
    for (const nz of Vision.noises) {
      if (nz.team === p.team || nz.team === 2 || V.dist(nz.pos, p.pos) > nz.r) continue;
      if (nz.src && !nz.src.dead && Vision.visible(p, nz.src)) continue;   // 보이는 상대의 소리는 표시 안 함
      const k = nz.t / nz.max;
      ctx.save();
      if (nz.kind === 'step') {   // 발소리: 작은 발자국 두 개
        ctx.globalAlpha = 0.55 * k; ctx.fillStyle = '#d7dbe6';
        ctx.beginPath(); ctx.ellipse(nz.pos.x - 0.1, nz.pos.y, 0.07, 0.12, 0.3, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.ellipse(nz.pos.x + 0.12, nz.pos.y - 0.18, 0.07, 0.12, 0.3, 0, Math.PI * 2); ctx.fill();
      } else {   // 스킬·평타 소음: 빨간 느낌표 핑
        ctx.globalAlpha = 0.85 * k; ctx.strokeStyle = '#ff4d5e'; ctx.lineWidth = 0.07;
        Draw.circle(ctx, nz.pos.x, nz.pos.y, 0.35 + (1 - k) * 0.6); ctx.stroke();
        ctx.fillStyle = '#ff4d5e'; ctx.font = 'bold 0.55px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('!', nz.pos.x, nz.pos.y + 0.02);
      }
      ctx.restore();
    }
  },
  // 스킬 사거리/범위 미리보기
  drawCastTelegraph(ctx, p) {
    const c = p.cast; if (!c || c.phase !== 'windup' || p.charKey) return;   // 캐시 전용 연출
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
    if (p.drawShape && p.drawShape(ctx, k, aim, alpha)) return;   // 캐릭터별 조준 미리보기(다니엘)
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
    (CONFIG.bushes || []).forEach((b, bi) => {
      // 흔들림: 내 시야(또는 아군 시야) 안의 부쉬에 누가 들어가거나 스킬이 지나가면 흔들림 — 시야 밖이면 안 보임
      const R = Vision.rustles.find(r => r.b === bi && (r.team !== myTeam() || r.skill) && Vision.pointVisible(r.pt)), sh = R ? Math.sin(Game.time * 40) * 0.06 * (R.t / CONFIG.vision.rustle) : 0;
      ctx.save(); ctx.fillStyle = R ? 'rgba(70,140,80,.62)' : 'rgba(46,110,62,.55)'; Draw.rr(ctx, b.x, b.y, b.w, b.h, 0.35); ctx.fill(); ctx.strokeStyle = 'rgba(120,200,120,.5)'; ctx.lineWidth = 0.05; ctx.stroke();
      ctx.fillStyle = R ? 'rgba(150,220,140,.6)' : 'rgba(90,170,90,.45)';
      for (let i = 0; i < b.w * b.h * 2.2; i++) { const x = b.x + ((i * 0.618034) % 1) * b.w + sh * Math.sin(i), y = b.y + ((i * 0.381966 * 1.7) % 1) * b.h; ctx.beginPath(); ctx.ellipse(x, y, 0.22, 0.12, i + sh * 4, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    });
  },
  drawUnit(ctx, u, T, decal) {
    if (u.dead) return;
    if (u.team !== myTeam() && !Vision.visible(Game.player, u)) return;   // 부쉬 속 적은 안 보임
    if (u.kind === 'ward') {   // 망원 카메라: 삼각대 + 남은 시간 링 (내 카메라는 시야 반경 점선)
      if (decal) { if (u.team === myTeam() && Settings.showRange) KU.ring(ctx, u.pos, u.sightR(), u.color, 0.18, true); return; }
      const k = clamp(u.life / CONFIG.vision.camera.dur, 0, 1);
      ctx.save(); ctx.strokeStyle = u.color; ctx.lineWidth = 0.05;
      ctx.beginPath(); ctx.moveTo(u.pos.x, u.pos.y - 0.05); ctx.lineTo(u.pos.x - 0.2, u.pos.y + 0.25); ctx.moveTo(u.pos.x, u.pos.y - 0.05); ctx.lineTo(u.pos.x + 0.2, u.pos.y + 0.25); ctx.moveTo(u.pos.x, u.pos.y - 0.05); ctx.lineTo(u.pos.x, u.pos.y + 0.28); ctx.stroke();
      ctx.fillStyle = u.color; ctx.fillRect(u.pos.x - 0.16, u.pos.y - 0.24, 0.32, 0.2);
      ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, 0.42, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      if (u.team === myTeam() && Settings.showRange) { ctx.globalAlpha = 0.18; ctx.setLineDash([0.3, 0.25]); Draw.circle(ctx, u.pos.x, u.pos.y, u.sightR()); ctx.stroke(); }
      ctx.restore(); return;
    }
    ctx.save();
    if (u.invuln > 0 && Math.floor(Game.time * 20) % 2 === 0) ctx.globalAlpha = 0.45;
    if (u.kind === 'player' && u.shadow && u.shadow.phase !== 'out') { ctx.restore(); return; }   // 걸작: 대상 그림자 속
    if (u.kind === 'player' && Vision.bushAt(u.pos) >= 0) ctx.globalAlpha = 0.6;   // 부쉬 속: 상대에게 안 보임
    if (u.kind === 'player' && u.stealthT > 0) ctx.globalAlpha = 0.35;              // 은신
    if (!decal) { ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.beginPath(); ctx.ellipse(u.pos.x, u.pos.y + u.r * 0.55, u.r * 0.95, u.r * 0.45, 0, 0, Math.PI * 2); ctx.fill(); }
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
    if (decal) { this.drawUnitDecal(ctx, u, T); ctx.restore(); return; }
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
      for (let i = 0; i < 4; i++) { const a = Math.random() * Math.PI * 2, r0 = u.r * 0.6, x0 = u.pos.x + Math.cos(a) * r0, y0 = u.pos.y + u.r * 0.4 + Math.sin(a) * r0 * 0.5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x0 + vrand(-0.2, 0.2), y0 + vrand(-0.2, 0.1)); ctx.lineTo(x0 + vrand(-0.25, 0.25), y0 + vrand(-0.3, 0.15)); ctx.stroke(); }
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
  // 3D 모드의 바닥 표시: 보호막·속박·히트박스 (기절 별·몸체는 3D)
  drawUnitDecal(ctx, u, T) {
    if (u.shield > 0) { ctx.strokeStyle = 'rgba(170,190,255,.85)'; ctx.lineWidth = 0.07; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.3); ctx.stroke(); }
    if (u.root > 0) { ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 0.05; for (const [rr, sp] of [[u.r + 0.22, 4], [u.r + 0.34, -3]]) { ctx.beginPath(); ctx.ellipse(u.pos.x, u.pos.y, rr, rr * 0.8, Game.time * sp, 0.3, Math.PI * 2 - 0.3); ctx.stroke(); } }
    if (Settings.showHitbox) { ctx.strokeStyle = '#5dff9a'; ctx.lineWidth = 0.03; Draw.circle(ctx, u.pos.x, u.pos.y, u.r); ctx.stroke(); }
  },
  // 머리 위 표시 위치(2D): 몸 원 위
  overhead(u) { const s = this.toScreen(u.pos), R = u.r * this.L.ppm; return { x: s.x, top: s.y - R - 16, bottom: s.y + R + 13 }; },
  drawProjectile(ctx, pr, T) {
    if (pr.team !== myTeam() && !Vision.pointVisible(pr.pos)) return;   // 시야 밖 적 투사체는 안 보임
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
};

// ============================== 화면 층 (렌더러 공통) ==============================
// 월드 위치는 Renderer.toScreen으로 화면 좌표로 바꿔서 그림 — 2D·3D 렌더러가 같이 사용
const ScreenLayer = {
  draw(ctx, L) {
    if (Game.state === 'menu') return;
    this.drawOverheads(ctx);
    this.drawTexts(ctx);
    if (Game.mode && Game.mode.drawScreen) Game.mode.drawScreen(ctx, L, 0);
    if (Replay.active) Draw.text(ctx, Replay.label(), L.W / 2, L.H - 150, { size: 14, bold: true, align: 'center', color: '#9fd8ff', stroke: true });
    HUD.draw(ctx, L);
    this.drawTopInfo(ctx, L);
    this.drawToasts(ctx, L);
    if (Input.locked) {   // 마우스 잠금 중엔 OS 커서가 숨겨지므로 직접 그림
      const s = Input.screen; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(s.x - 9, s.y); ctx.lineTo(s.x - 3, s.y); ctx.moveTo(s.x + 3, s.y); ctx.lineTo(s.x + 9, s.y); ctx.moveTo(s.x, s.y - 9); ctx.lineTo(s.x, s.y - 3); ctx.moveTo(s.x, s.y + 3); ctx.lineTo(s.x, s.y + 9); ctx.stroke();
    }
    if (Input.amove) { Draw.circle(ctx, Input.screen.x, Input.screen.y, 10); ctx.strokeStyle = '#ffb347'; ctx.lineWidth = 2; ctx.stroke(); Draw.text(ctx, 'A', Input.screen.x + 13, Input.screen.y - 10, { size: 13, bold: true, color: '#ffb347' }); }
  },
  // 머리 위 체력바/외상 중첩/상태
  drawOverheads(ctx) {
    for (const u of Game.units) {
      if (u.dead || u.kind === 'ward' || (u.team !== myTeam() && !Vision.visible(Game.player, u))) continue;
      const o = Renderer.overhead(u), s = { x: o.x }, R = u.r * Renderer.pxPerMeter(u.pos), bw = clamp(R * 2.6, 44, 110), bh = 6, x = o.x - bw / 2, y = o.top;
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.fillRect(x - 1, y - 1, bw + 2, bh + 2);
      const total = Math.max(u.maxHp, u.hp + u.shield);
      ctx.fillStyle = u.team === myTeam() ? '#3fd07a' : '#e5484d'; ctx.fillRect(x, y, bw * Math.max(0, u.hp) / total, bh);
      if (u.shield > 0) { ctx.fillStyle = '#e9eef7'; ctx.fillRect(x + bw * Math.max(0, u.hp) / total, y, bw * u.shield / total, bh); }
      if (u.healRed > 0) { ctx.strokeStyle = '#ff3b5c'; ctx.lineWidth = 1; ctx.strokeRect(x - 1, y - 1, bw + 2, bh + 2); }
      Draw.text(ctx, u.kind === 'player' ? `${u.name || '캐시'} Lv${u.build.level}` : u.name + (u.infinite ? ' ∞' : ''), s.x, y - 7, { size: 11, align: 'center', color: '#c9cfdb', stroke: true });
      if (u.team !== myTeam()) {
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
      if (st.length) Draw.text(ctx, st.join(' · '), s.x, o.bottom, { size: 11, bold: true, align: 'center', color: CONFIG.theme.gold, stroke: true });
    }
  },
  drawTexts(ctx) {
    for (const t of FX.texts) {
      const s = Renderer.toScreen(t, 1.5); ctx.globalAlpha = clamp(t.life / t.max * 1.6, 0, 1);   // 3D: 머리 높이쯤에 뜸
      Draw.text(ctx, t.str, s.x, s.y, { size: t.size, bold: t.bold, align: 'center', color: t.color, stroke: true });
    }
    ctx.globalAlpha = 1;
  },
  drawTopInfo(ctx, L) {
    const p = Game.player, b = (p && p.build) || CONFIG.builds[Game.buildId];   // 장비 빌드면 그 라벨
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
    Draw.circle(ctx, cx, cy, 36); ctx.fillStyle = '#1b2030'; ctx.fill(); ctx.lineWidth = 3; ctx.strokeStyle = p.charKey ? p.color : T.accent; ctx.stroke();
    Draw.text(ctx, p.name || '캐시', cx, cy, { size: 16, bold: true, align: 'center' });
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
    if (p.unstoppable > 0 && !p.shadow) buffs.push(['저지 불가', T.gold]);
    if (p.charKey === 'daniel') {
      if (p.stealthT > 0) buffs.push([`은신 ${fmt(p.stealthT, 1)}`, '#b07cff']);
      if (p.shadowT > 0) buffs.push([`그림자 평타 ${fmt(p.shadowT, 1)}`, '#7d5cb8']);
      if (p.qShots > 0) buffs.push([`가위 공속 ×${p.qShots}`, '#d9a8ff']);
      if (p.mark) buffs.push([p.mark.t >= p.K.W.ready ? '영감 활성!' : `영감 ${fmt(p.K.W.ready - p.mark.t, 1)}`, p.mark.t >= p.K.W.ready ? '#ffd1ff' : '#b07cff']);
      if (p.shadow) buffs.push(['걸작 (R 재사용: 탈출)', p.color]);
      if (Vision.night) buffs.push(['밤: 고독한 예술가', '#8fa8ff']);
    }
    if (p.rest) buffs.push([Rest.done(p) ? '휴식 완료' : `휴식 ${p.rest.stage + 1}단계 → +${Math.round(Rest.nextHeal(p))}`, '#9fe0ff']);
    else if (p.restCd > 0) buffs.push([`휴식 대기 ${fmt(p.restCd, 1)}`, '#8a93a6']);
    let bxx = bx;
    for (const [t, c] of buffs) { ctx.font = `700 10px ${FONT}`; const w = ctx.measureText(t).width + 12; Draw.rr(ctx, bxx, by + 50, w, 16, 8); ctx.fillStyle = c + '33'; ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 1; ctx.stroke(); Draw.text(ctx, t, bxx + w / 2, by + 58, { size: 10, bold: true, align: 'center', color: c }); bxx += w + 4; if (bxx > bx + bw - 30) break; }
    Draw.text(ctx, `AD ${p.ad} · SP ${p.sp} · AS ${p.as} · CDR ${Math.round(p.cdr * 100)}%`, bx, by + 74, { size: 10, color: '#8a93a6' });
    if (Vision.fogOn && p.items) {   // 시야: 낮/밤 · 시야 거리 · 시야 아이템 보유량
      const it = (k, key) => `${(Settings.keys[key] || '').toUpperCase()} ${CONFIG.vision[k].name} ×${p.items[k]}${p.itemCd[k] > 0 ? ` (${fmt(p.itemCd[k], 1)})` : ''}`;
      Draw.text(ctx, `${Vision.night ? '🌙 밤' : '☀ 낮'} 시야 ${fmt(Vision.sightOf(p), 1)}m · ${it('camera', 'C')} · ${it('drone', 'V')}`, bx, by + 88, { size: 10, bold: true, color: Vision.night ? '#8fa8ff' : '#c9cfdb' });
    }
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
