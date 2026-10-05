
// ============================== 크로노 스피어 (시즌 12 임시 안전지대) ==============================
// 공식 12.0 패치노트 스케줄: 반경 30m로 5초 대기 → 20초에 걸쳐 10m → 10초간 이동 목표 표시 → 이동 → 15초에 걸쳐 5m → 40초 유지 → 5초에 걸쳐 0m
// 활성화 후에는 차단벽을 넘을 수 없음(이동기도 벽에 부딪혀 종료). 결투에서는 끝까지 승부가 안 나면 남은 체력 비율로 판정
const Sphere = {
  active: false,
  start() {
    const S = CONFIG.sphere, W = CONFIG.world;
    this.active = true; this.done = false; this.t = 0; this.i = 0;
    this.c = { x: W.w / 2, y: W.h / 2 }; this.r = S.phases[0].r; this.from = { c: V.copy(this.c), r: this.r };
    this.target = null;
  },
  stop() { this.active = false; },
  phase() { return CONFIG.sphere.phases[this.i]; },
  // 이동 목표: 반경 10m 원이 아레나 안쪽에 오도록
  pickTarget() {
    const W = CONFIG.world, m = CONFIG.sphere.targetMargin;
    for (let k = 0; k < 30; k++) {
      const q = { x: rand(m, W.w - m), y: rand(m * 0.5, W.h - m * 0.5) };
      if (V.dist(q, this.c) > 3 && !Geo.inWall(q, 0.6)) return q;
    }
    return V.copy(this.c);
  },
  update(dt) {
    if (!this.active || this.done) return;
    const P = this.phase(); this.t += dt;
    const k = P.dur > 0 ? clamp(this.t / P.dur, 0, 1) : 1;
    if (P.type === 'shrink') this.r = lerp(this.from.r, P.r, k);
    if (P.type === 'show' && !this.target) this.target = this.pickTarget();
    if (P.type === 'move' && this.target) this.c = V.lerp(this.from.c, this.target, k);
    if (this.t >= P.dur) {
      this.i++; this.t = 0; this.from = { c: V.copy(this.c), r: this.r };
      if (P.type === 'move') this.target = null;
      if (this.i >= CONFIG.sphere.phases.length) { this.done = true; this.r = 0; return; }
      const N = this.phase(); if (N.label) FX.toast(`크로노 스피어: ${N.label}`, '#9fe0ff');
    }
    // 차단벽: 모든 유닛을 원 안으로 (이동기·강제 이동 포함)
    for (const u of Game.units) {
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
  // AI 이동 후보 점수용: 차단벽 근처·밖은 감점
  penalty(q) { if (!this.active) return 0; const d = V.dist(q, this.c), m = this.r - 1.2; return d > m ? (d - m) * 4 : 0; },
  label() {
    if (!this.active) return '';
    const P = this.phase(); if (!P) return '크로노 스피어 종료';
    return `크로노 스피어 · ${P.label || ''} · 반경 ${fmt(this.r, 1)}m · ${Math.ceil(P.dur - this.t)}초`;
  },
  draw(ctx) {
    if (!this.active) return;
    const W = CONFIG.world;
    // 바깥(차단벽 밖)을 붉게
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W.w, W.h); ctx.arc(this.c.x, this.c.y, Math.max(0.01, this.r), 0, Math.PI * 2, true);
    ctx.fillStyle = 'rgba(160,30,50,.22)'; ctx.fill('evenodd');
    ctx.strokeStyle = '#9fe0ff'; ctx.lineWidth = 0.1; ctx.setLineDash([0.5, 0.25]); ctx.lineDashOffset = -Game.time * 2;
    ctx.beginPath(); ctx.arc(this.c.x, this.c.y, Math.max(0.01, this.r), 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
    // 다음 이동 지점
    if (this.target) { ctx.globalAlpha = 0.6; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 0.06; ctx.beginPath(); ctx.arc(this.target.x, this.target.y, this.r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.moveTo(this.c.x, this.c.y); ctx.lineTo(this.target.x, this.target.y); ctx.stroke(); }
    ctx.restore();
  },
};
