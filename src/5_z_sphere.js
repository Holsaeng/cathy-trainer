
// ============================== 크로노 스피어 (시즌 12 임시 안전지대) ==============================
// 두 가지 규칙: temp = 임시 안전지대(차단벽 — 못 나감, 활성화 순간 밖은 즉사) · final = 최종 안전지대(벽 없음 — 밖에 나가면 폭발 타이머가 줄어듦)
// 공식 12.0 패치노트 스케줄(임시): 반경 30m로 5초 대기 → 20초에 걸쳐 10m → 10초간 이동 목표 표시 → 이동 → 15초에 걸쳐 5m → 40초 유지 → 5초에 걸쳐 0m
// 활성화 후에는 차단벽을 넘을 수 없음(이동기도 벽에 부딪혀 종료). 활성화 순간 차단벽 밖의 실험체는 즉사
// 금지구역 폭발 타이머: 시작 30초(20 + 6일차 밤 +10), 처치 관여 +7초(최대 30), 스피어가 소멸하면 전 지역이 금지구역 → 타이머가 많이 남은 쪽이 이김
//   같은 순간 양 팀이 모두 폭사하면(처치 없는 결투 등) 남은 체력 비율로 판정
const Sphere = {
  active: false,
  start(kind) {
    const S = CONFIG.sphere, W = CONFIG.world;
    this.kind = kind === 'final' ? 'final' : 'temp'; this.wall = this.kind === 'temp';
    this.active = true; this.done = false; this.t = 0; this.i = 0;
    this.c = { x: W.w / 2, y: W.h / 2 }; this.r = this.phases()[0].r; this.from = { c: V.copy(this.c), r: this.r };
    this.target = null; this.armed = false; this.tie = null;
    const B = CONFIG.sphere.boom;
    for (const u of Game.units) if (isHero(u)) { u.boom = Math.min(B.start, B.max) + B.night; u.boomWarn = false; u.hitBy = null; }
  },
  stop() { this.active = false; for (const u of Game.units) if (isHero(u)) u.boom = null; },
  heroes() { return Game.units.filter(u => isHero(u) && !u.dead && u.boom != null); },
  // 지금 금지구역에 있나: 차단벽 밖, 또는 스피어 소멸 후 전 지역
  inZone(u) { return this.done || V.dist(u.pos, this.c) > this.r + 0.05; },
  draining(u) { return this.active && u.boom != null && !u.dead && this.inZone(u) && !u.stasis; },
  // 처치 관여: 처치자 + 최근 피해를 준 적 실험체 → +7초(최대 30초, 이미 넘으면 그대로)
  onKill(src, tgt) {
    if (!isHero(tgt)) return;
    const B = CONFIG.sphere.boom, who = new Set();
    if (src && isHero(src)) who.add(src);
    if (tgt.hitBy) for (const [u, t] of tgt.hitBy) if (Game.time - t <= B.assist) who.add(u);
    for (const u of who) {
      if (u.dead || u.boom == null || u.team === tgt.team) continue;
      const nb = Math.max(u.boom, Math.min(B.max, u.boom + B.kill));
      if (nb > u.boom) { FX.text(u.pos, `폭발 타이머 +${fmt(nb - u.boom, 1)}초`, '#9fe0ff', 12, { bold: true }); u.boom = nb; if (u.boom > B.warn) u.boomWarn = false; }
    }
  },
  // 폭사: 빈사·보호막과 무관하게 즉사
  explode(u, why) {
    if (u.dead) return;
    u.boom = 0; u.infinite = false; u.shield = 0;
    FX.burst(u.pos, '#ff5d5d', 34, 9, 0.9, 0.14); FX.ring(u.pos, 0.4, 3, '#ffb347', 0.6);
    FX.text(u.pos, why || '폭사', '#ff5d5d', 16, { bold: true });
    Combat.kill(null, u);
  },
  tieWin() { return this.tie && this.tie[1] > this.tie[0] ? 'e' : 'p'; },
  phases() { return this.kind === 'final' ? CONFIG.sphere.finalPhases : CONFIG.sphere.phases; },
  phase() { return this.phases()[this.i]; },
  // 이동 목표: 반경 10m 원이 아레나 안쪽에 오도록
  pickTarget() {
    const W = CONFIG.world, m = CONFIG.sphere.targetMargin, rd = Geo.round();
    for (let k = 0; k < 30; k++) {
      const q = { x: rand(m, W.w - m), y: rand(m * 0.5, W.h - m * 0.5) };
      if (rd && V.dist(q, rd.c) > rd.r - 3) continue;   // 원형 맵: 이동 목표는 원 안쪽(경계에서 3m 이상)
      if (V.dist(q, this.c) > 3 && !Geo.inWall(q, 0.6)) return q;
    }
    return V.copy(this.c);
  },
  update(dt) {
    if (!this.active) return;
    if (!this.armed) {   // 활성화: 차단벽 밖에 있는 실험체는 즉사 (임시 안전지대만)
      this.armed = true;
      if (this.wall) for (const u of this.heroes()) if (V.dist(u.pos, this.c) > this.r) this.explode(u, '차단벽 밖 — 즉사');
    }
    this.tickBoom(dt);
    if (this.done) return;
    const P = this.phase(); this.t += dt;
    const k = P.dur > 0 ? clamp(this.t / P.dur, 0, 1) : 1;
    if (P.type === 'shrink') this.r = lerp(this.from.r, P.r, k);
    if (P.type === 'show' && !this.target) this.target = this.pickTarget();
    if (P.type === 'move' && this.target) this.c = V.lerp(this.from.c, this.target, k);
    if (this.t >= P.dur) {
      this.i++; this.t = 0; this.from = { c: V.copy(this.c), r: this.r };
      if (P.type === 'move') this.target = null;
      if (this.i >= this.phases().length) { this.done = true; this.r = 0; FX.toastAll('크로노 스피어 소멸 — 전 지역 금지구역! 폭발 타이머 감소', '#ff8a8a'); return; }
      const N = this.phase(); if (N.label) FX.toastAll(`${this.name()}: ${N.label}`, '#9fe0ff');
    }
    // 차단벽: 모든 유닛을 원 안으로 (이동기·강제 이동 포함) — 임시 안전지대만. 최종 안전지대는 밖으로 나갈 수 있음(폭발 타이머 감소)
    if (this.wall) for (const u of Game.units) {
      if (u.dead || u.kind === 'ward') continue;
      const d = V.dist(u.pos, this.c), lim = Math.max(0, this.r - u.r);
      if (d > lim) {
        const dir = d > 1e-6 ? V.mul(V.sub(u.pos, this.c), 1 / d) : { x: 1, y: 0 };
        u.pos = V.add(this.c, V.mul(dir, lim));
        if (u.forced) { u.forced.to = V.copy(u.pos); }   // 돌진은 차단벽에 부딪혀 종료
        if (u.act && u.act.type === 'dash') u.act.to = V.copy(u.pos);
      }
    }
  },
  // 폭발 타이머: 금지구역에 있으면 감소, 0이면 폭사. 같은 순간 양 팀이 다 터지면 남은 체력 비율 기록(판정용)
  tickBoom(dt) {
    const B = CONFIG.sphere.boom, live = this.heroes(), gone = [];
    for (const u of live) {
      if (!this.draining(u)) continue;
      u.boom = Math.max(0, u.boom - dt);
      if (u.boom <= B.warn && !u.boomWarn) { u.boomWarn = true; if (u === Game.player) FX.toast(`폭발 ${B.warn}초 전!`, '#ff5d5d'); }
      if (u.boom <= 0) gone.push(u);
    }
    if (!gone.length) return;
    const left = t => live.filter(u => u.team === t && !gone.includes(u)).length;
    if (!left(0) && !left(1)) { const r = t => { const a = gone.filter(u => u.team === t); return a.reduce((s, u) => s + Math.max(0, u.hp) / u.maxHp, 0) / Math.max(1, a.length); }; this.tie = { 0: r(0), 1: r(1) }; }
    for (const u of gone) this.explode(u, '폭사');
  },
  // 화면 위: 스피어 단계 + 내 폭발 타이머
  drawHud(ctx, L, oy = 0) {
    if (!this.active) return;
    Draw.text(ctx, this.label(), L.W / 2, 46 + oy, { size: 12, bold: true, align: 'center', color: this.done ? '#ff8a8a' : '#9fe0ff', stroke: true });
    const p = Game.player; if (!p || p.boom == null || p.dead) return;
    const dr = this.draining(p), low = p.boom <= CONFIG.sphere.boom.warn;
    Draw.text(ctx, `폭발 타이머 ${fmt(p.boom, 1)}초${dr ? (p.stasis ? '' : ' ▼') : ''}${p.stasis && this.inZone(p) ? ' (경직 — 정지)' : ''}`, L.W / 2, 66 + oy,
      { size: low ? 17 : 14, bold: true, align: 'center', color: low && dr && Math.floor(Game.time * 4) % 2 ? '#ffffff' : dr ? '#ff5d5d' : '#ffd27a', stroke: true });
  },
  name() { return this.kind === 'final' ? '최종 안전지대' : '크로노 스피어'; },
  // AI 이동 후보 점수용: 차단벽 근처·밖은 감점
  penalty(q) { if (!this.active) return 0; const d = V.dist(q, this.c), m = this.r - 1.2; return d > m ? (d - m) * 4 : 0; },
  label() {
    if (!this.active) return '';
    const P = this.phase(); if (!P || this.done) return `${this.name()} 소멸 · 전 지역 금지구역 — 폭발 타이머가 많이 남은 쪽이 승리`;
    return `${this.name()}${this.wall ? '' : ' (밖 = 금지구역)'} · ${P.label || ''} · 반경 ${fmt(this.r, 1)}m · ${Math.ceil(P.dur - this.t)}초`;
  },
  draw(ctx) {
    if (!this.active) return;
    const W = CONFIG.world;
    // 바깥(차단벽 밖)을 붉게
    const rd = Geo.round();   // 원형 맵: 원 안에만
    ctx.save(); if (rd) { ctx.beginPath(); ctx.arc(rd.c.x, rd.c.y, rd.r, 0, Math.PI * 2); ctx.clip(); }
    ctx.beginPath(); ctx.rect(0, 0, W.w, W.h); ctx.arc(this.c.x, this.c.y, Math.max(0.01, this.r), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(160,30,50,.22)'; ctx.fill('evenodd');
    ctx.strokeStyle = this.wall ? '#9fe0ff' : '#ff8a8a'; ctx.lineWidth = 0.1; ctx.setLineDash(this.wall ? [0.5, 0.25] : [0.25, 0.25]); ctx.lineDashOffset = -Game.time * 2;
    ctx.beginPath(); ctx.arc(this.c.x, this.c.y, Math.max(0.01, this.r), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // 다음 이동 지점
    if (this.target) { ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(this.target.x, this.target.y, this.r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(this.c.x, this.c.y); ctx.lineTo(this.target.x, this.target.y); ctx.stroke(); }
    ctx.restore();
  },
};
