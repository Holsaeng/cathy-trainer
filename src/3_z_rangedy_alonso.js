
// ============================== 플레이어블: 알론소 (글러브 · 퓨어 탱커) ==============================
// 플레이어 = 실험체 키트 틀(RangedPlayer + PKits.alonso, 근접 평타) · AI = RangedDuelist + Kits.alonso(4_d_alonso_ai.js)
// 스킬 효과는 AlonsoCore를 플레이어·AI가 함께 씀 (주인 o의 어댑터 o.al: K · L · hit · foes · cdStart · cdSet · level · color · S)
// 수치: CONFIG.rangedKits.alonso (나무위키 + 공식 영상) · 근거 docs/er_notes_playables.md 11장 · ⚠ = 출처 없는 추정값
//   P 플라즈마 배리어: 이동 불가 효과(기절·속박·공포·에어본) 1회 무효 + 0.1초 면역 · 피해를 안 받고 일정 시간 지나면 다시 준비 · 스킬로 적 실험체를 이동 불가로 만들면 1명당 회복
//   Q 마그네틱 펀치: 직선 투사체 → 적중한 적과 연결(표식) · 연결 대상을 바라보면 이속 증가(가까울수록 더) · 그 적을 평타·무기 스킬로 치면 추가 피해 + 0.9초 기절
//   W 바운싱 실드: 2.5초 전방 피해 60% 감소 · 파동 5회(점점 빠르게) · 재사용·종료 시 마무리 피해 (추가 체력 비례)
//   E 어트랙션 슬램!: 대상 지정(4.75m) → 0.8초 뒤 돌진(그 사이 8.25m 밖으로 나가면 취소·쿨 30% 반환) → 피해 + 속박
//   R 게더링 필드: 정신 집중 3.5초 — 주변 4.75m 당기기 + 피해 → 0.5초마다 회복·지속 피해·밖으로 가려는 적 60% 둔화 → 재사용·종료 시 유지 시간 비례 마무리 피해

const AlonsoCore = {
  attach(o) {
    Object.assign(o, { alMark: null, alW: null, alR: null, alE: null, alUpper: 0, alWaves: [], alBar: { ready: true, quiet: 0, immune: 0 } });
    o.ccGuard = type => this.guard(o, type);
    o.dmgMulFrom = src => this.shieldMul(o, src);
  },
  bonusHp(o) { const lvl = o.al.level(); return Math.max(0, o.maxHp - (1000 + 94 * (lvl - 1))); },
  // ---------- P 플라즈마 배리어 ----------
  guard(o, type) {
    if (!['stun', 'root', 'fear'].includes(type)) return false;
    const B = o.alBar; if (B.immune > 0) return true;
    if (!B.ready) return false;
    B.ready = false; B.immune = o.al.K.P.immune; B.quiet = 0; FX.text(o.pos, '플라즈마 배리어', '#7fd7ff', 12, { bold: true }); FX.ring(o.pos, o.r, o.r + 0.6, '#7fd7ff', 0.3);
    return true;
  },
  onDamaged(o) { o.alBar.quiet = 0; },
  // 이동 불가 CC + 패시브 회복 (적 실험체 1명당)
  cc(o, u, type, dur) {
    if (!u || u.dead) return false;
    const ok = u.applyCC(type, dur);
    if (ok && isHero(u)) { const P = o.al.K.P, l = o.al.L('P'); o.heal(lv(P.heal, l) + o.maxHp * lv(P.healPct, l)); }
    return ok;
  },
  // ---------- 보이는 효과 (판정과 무관) ----------
  // 주먹 타격: 맞은 자리에 작은 충격파 · 기절(연결 터뜨리기)·어퍼컷은 크게 + 화면 흔들림(내가 치거나 맞을 때)
  punchFx(o, u, big) {
    const to = V.norm(V.sub(u.pos, o.pos)), at = V.sub(u.pos, V.mul(to, u.r * 0.5));
    FX.ring(at, 0.1, big ? 1.4 : 0.75, big ? '#ffd166' : '#9fe3ff', big ? 0.32 : 0.18, big ? 0.14 : 0.08);
    FX.burst(at, big ? '#ffd166' : '#9fe3ff', big ? 14 : 7, big ? 6 : 4.5);
    if (o === Game.player || u === Game.player) FX.addShake(big ? 7 : 2);
  },
  // 평타 적중 (플레이어·AI 공통): 연결된 적이면 큰 타격 + 기절
  aaHit(o, u) { this.punchFx(o, u, !!(o.alMark && o.alMark.u === u)); this.pop(o, u); },
  // ---------- Q 마그네틱 펀치 ----------
  qHit(o, u) {
    const Q = o.al.K.Q, l = o.al.L('Q'); o.al.hit(u, lv(Q.base, l) + (o.sp || 0) * Q.sp, 'Q');
    if (isHero(u) || u.kind === 'dummy') { o.al.S.count('linkOn'); o.alMark = { u, t: Q.markDur }; FX.text(u.pos, '자력 연결', o.al.color, 12, { bold: true }); }
  },
  // 연결된 적을 평타·무기 스킬로 치면: 최대 체력 비례 추가 피해 + 기절
  pop(o, u) {
    const M = o.alMark; if (!M || M.u !== u) return;
    const Q = o.al.K.Q, l = o.al.L('Q'); o.alMark = null; o.al.S.count('linkPop');
    o.al.hit(u, u.maxHp * lv(Q.popPct, l) + o.al.level() * Q.popLv, 'Q');
    if (this.cc(o, u, 'stun', Q.stun)) FX.text(u.pos, '기절', '#ffd166', 12, { bold: true });
  },
  // ---------- W 바운싱 실드 ----------
  wStart(o, dir) { const W = o.al.K.W; o.alW = { t: 0, dir: V.copy(dir), next: 0 }; o.al.cdStart('W'); FX.text(o.pos, W.name, o.al.color, 12, { bold: true }); },
  // 전방(방패 쪽) 피해 60% 감소
  shieldMul(o, src) {
    const S = o.alW; if (!S || !src || !src.pos) return 1;
    const to = V.sub(src.pos, o.pos); return V.len(to) < 0.01 || V.dot(to, S.dir) > 0 ? 1 - o.al.K.W.reduce : 1;
  },
  wBox(o, u) { const S = o.alW, W = o.al.K.W, rel = V.sub(u.pos, o.pos), a = V.dot(rel, S.dir), s = Math.abs(rel.x * S.dir.y - rel.y * S.dir.x); return a >= W.near - u.r && a <= W.len + u.r && s <= W.width / 2 + u.r; },
  wWave(o, fin) {
    const W = o.al.K.W, l = o.al.L('W'), bh = this.bonusHp(o), amt = fin ? lv(W.fin, l) + (o.sp || 0) * W.finSp + bh * W.finHp : lv(W.base, l) + (o.sp || 0) * W.sp + bh * W.bhp;
    FX.slash(o.pos, V.ang(o.alW.dir), o.r + (fin ? 1.4 : 0.9), fin ? 1.0 : 0.7, fin ? '#ffb347' : '#7fd7ff', fin ? 0.3 : 0.18, o.r + 0.2);   // 방패를 미는 순간 앞쪽 섬광 (파동 자체는 draw에서 앞으로 나아감)
    o.alWaves.push({ from: V.copy(o.pos), dir: V.copy(o.alW.dir), d: W.near, amt, fin, hit: new Set() });   // 파동 = 14m/s 투사체(나무위키) — 앞으로 나아가며 닿은 적에게 1번씩
  },
  // 파동 진행: 이번 스텝에 지난 구간(앞 0.5~5m · 폭 3m) 안의 적
  wTick(o, dt) {
    const W = o.al.K.W;
    for (const w of o.alWaves) {
      const d0 = w.d; w.d = Math.min(W.len, w.d + W.speed * dt);
      for (const u of o.al.foes()) {
        if (w.hit.has(u.id)) continue; const rel = V.sub(u.pos, w.from), a = V.dot(rel, w.dir), s = Math.abs(rel.x * w.dir.y - rel.y * w.dir.x);
        if (a >= d0 - u.r && a <= w.d + u.r && s <= W.width / 2 + u.r) { w.hit.add(u.id); o.al.hit(u, w.amt, 'W'); }
      }
    }
    o.alWaves = o.alWaves.filter(w => w.d < W.len);
  },
  wEnd(o) { if (!o.alW) return; this.wWave(o, true); o.alW = null; },
  // ---------- E 어트랙션 슬램! (0.8초 뒤 돌진) ----------
  eLand(o, u) {
    const E = o.al.K.E, l = o.al.L('E');
    o.al.hit(u, lv(E.base, l) + o.def * E.defR + o.maxHp * E.hpR, 'E');
    this.cc(o, u, 'root', lv(E.root, l)); FX.text(u.pos, '속박', '#ffd166', 12, { bold: true });
    o.alE = null; FX.ring(u.pos, 0.2, 1.6, o.al.color, 0.35, 0.16); FX.burst(u.pos, o.al.color, 12, 5); if (o === Game.player || u === Game.player) FX.addShake(6);
  },
  // 0.8초 준비: 대상과 이어진 선이 차오름 · 8.25m 취소 거리 표시
  eAim(o, u) { o.alE = { u, t: 0 }; },
  eGo(o, from, to) { o.alE = null; FX.trail(from, to, o.al.color, 0.9, 0.35); },
  eValid(o, u) { return u && !u.dead && !(u.untargetable > 0) && V.dist(o.pos, u.pos) <= o.al.K.E.cancel && Vision.visible(o, u); },
  // ---------- R 게더링 필드 ----------
  rStart(o) {
    const R = o.al.K.R, l = o.al.L('R'); o.alR = { t: 0, acc: 0, c: V.copy(o.pos) };
    FX.ring(o.pos, 0.5, R.r, o.al.color, 0.4); FX.text(o.pos, R.name, o.al.color, 14, { bold: true }); Sfx.play('ult');
    for (const u of o.al.foes()) {
      if (V.dist(u.pos, o.pos) > R.r + u.r) continue;
      o.al.hit(u, lv(R.base, l) + (o.sp || 0) * R.sp, 'R');
      if (u.dead || u.unstoppable > 0) continue;
      const dir = V.norm(V.sub(o.pos, u.pos)), dd = Math.max(0, Math.min(R.pull, V.dist(u.pos, o.pos) - o.r - u.r - 0.1));
      if (dd > 0.05) u.forced = { from: V.copy(u.pos), to: Geo.pushOut(V.add(u.pos, V.mul(dir, dd)), u.r), t: 0, dur: R.pullTime };
      if (isHero(u)) { const P = o.al.K.P, lp = o.al.L('P'); o.heal(lv(P.heal, lp) + o.maxHp * lv(P.healPct, lp)); }   // 당기기 = 이동 불가 판정 → 패시브 회복
    }
  },
  rTick(o, dt) {
    const S = o.alR, R = o.al.K.R, l = o.al.L('R'); S.t += dt; S.acc += dt;
    for (const u of o.al.foes()) {   // 영역 밖으로 가려는 적 둔화
      if (V.dist(u.pos, S.c) > R.r + u.r) continue;
      if (u.vel && V.dot(u.vel, V.sub(u.pos, S.c)) > 0.1) u.addSlow(R.slow, 0.15);
    }
    if (S.acc >= R.tick) {
      S.acc -= R.tick; o.heal(R.heal + o.maxHp * lv(R.healPct, l), true); FX.ring(S.c, R.r, R.r * 0.55, o.al.color, 0.3, 0.1);   // 안으로 모이는 고리
      for (const u of o.al.foes()) if (V.dist(u.pos, S.c) <= R.r + u.r) o.al.hit(u, lv(R.dot, l) + (o.sp || 0) * R.dotSp, 'R', { tick: true });
    }
    return S.t >= R.dur;
  },
  rEnd(o, interrupted) {
    const S = o.alR; if (!S) return; o.alR = null; if (interrupted) { FX.text(o.pos, '게더링 필드 끊김', '#aaa', 11); return; }
    const R = o.al.K.R, l = o.al.L('R'), k = clamp(S.t / R.dur, 0, 1), bh = this.bonusHp(o);
    const amt = lerp(lv(R.minF, l) + (o.sp || 0) * R.minSp + bh * R.minHp, lv(R.maxF, l) + (o.sp || 0) * R.maxSp + bh * R.maxHp, k);
    FX.ring(S.c, 0.5, R.r, '#ffb347', 0.45, 0.2); FX.ring(S.c, 0.3, R.r * 0.6, '#ffd166', 0.3, 0.12); FX.text(S.c, `마무리 ${Math.round(k * 100)}%`, '#ffb347', 13, { bold: true });
    let any = false; for (const u of o.al.foes()) if (V.dist(u.pos, S.c) <= R.r + u.r) { o.al.hit(u, amt, 'R'); FX.burst(u.pos, '#ffb347', 10, 5); any = true; }
    if (o === Game.player || any) FX.addShake(5 + 5 * k);
  },
  // ---------- D 어퍼컷 (무기 스킬) ----------
  dHit(o, u) {
    const D = o.al.K.D, l = o.al.L('D'), base = (o.bonusAd || 0) * D.bad * (1 + (o.aaAmp || 0)) + (o.sp || 0) * D.sp;
    o.al.hit(u, base, 'D', { type: 'normal' }); o.al.hit(u, base * lv(D.extra, l), 'D'); o.al.hit(u, lv(D.fixed, l), 'D', { type: 'true' });
    o.alUpper++; this.punchFx(o, u, true); FX.text(u.pos, '어퍼컷', '#ffb347', 12, { bold: true }); this.pop(o, u);
  },
  // ---------- 매 스텝 ----------
  update(o, dt) {
    const K = o.al.K, B = o.alBar;
    if (o.alWaves.length) this.wTick(o, dt);
    if (B.immune > 0) B.immune -= dt;
    if (o.alE && ((o.alE.t += dt) > K.E.windup + 0.2 || o.alE.u.dead)) o.alE = null;
    if (!B.ready && (B.quiet += dt) >= lv(K.P.cd, o.al.L('P'))) { B.ready = true; FX.ring(o.pos, o.r, o.r + 0.4, '#7fd7ff', 0.25); }
    // Q 연결: 시간·거리 · 연결 대상을 바라보며 움직이면 이속(가까울수록 더 — 최대 2배 ⚠)
    const M = o.alMark;
    if (M) {
      M.t -= dt; const u = M.u, d = V.dist(o.pos, u.pos);
      if (M.t <= 0 || u.dead || d > K.Q.breakDist) o.alMark = null;
      else {
        const to = V.norm(V.sub(u.pos, o.pos)), face = o.alW ? o.alW.dir : V.fromAng(o.facing);
        if (V.dot(face, to) > 0.5) o.addMsBuff(lv(K.Q.ms, o.al.L('Q')) * (1 + clamp(1 - d / K.Q.range, 0, 1)), 0.12, false, 'alQ');
      }
    }
    // W 방패: 파동 · 이속 감소 · 끝나면 마무리
    const S = o.alW;
    if (S) {
      S.t += dt; o.addMsBuff(-K.W.slow, 0.12, false, 'alW');
      while (S.next < K.W.waves.length && S.t >= K.W.waves[S.next]) { this.wWave(o, false); S.next++; }
      if (S.t >= K.W.dur || o.dead) this.wEnd(o);
    }
  },
  draw(o, ctx) {
    const K = o.al.K, col = o.al.color, T = Game.time, BLUE = '#7fd7ff';
    // W 방패: 막는 쪽(앞) 범위 + 두꺼운 방패 호(남은 시간만큼) + 앞으로 나아가는 파동
    if (o.alW) {
      const S = o.alW, W = K.W, a = V.ang(S.dir), n = V.perp(S.dir), rest = 1 - S.t / W.dur;
      ctx.save(); ctx.globalAlpha = 0.1; ctx.fillStyle = BLUE; ctx.strokeStyle = BLUE; ctx.lineWidth = 0.05; Draw.oRect(ctx, V.add(o.pos, V.mul(S.dir, W.near)), a, W.len - W.near, W.width);
      ctx.globalAlpha = 0.45; ctx.setLineDash([0.25, 0.15]); ctx.beginPath(); const e0 = V.add(o.pos, V.mul(S.dir, W.near)), e1 = V.add(o.pos, V.mul(S.dir, W.len));
      for (const sg of [-1, 1]) { const off = V.mul(n, sg * W.width / 2); ctx.moveTo(e0.x + off.x, e0.y + off.y); ctx.lineTo(e1.x + off.x, e1.y + off.y); } ctx.stroke(); ctx.restore();
      ctx.save(); ctx.strokeStyle = BLUE; ctx.lineCap = 'round'; ctx.globalAlpha = 0.85; ctx.lineWidth = 0.16; ctx.beginPath(); ctx.arc(o.pos.x, o.pos.y, o.r + 0.4, a - 1.15, a + 1.15); ctx.stroke();
      ctx.globalAlpha = 0.35; ctx.lineWidth = 0.32; ctx.beginPath(); ctx.arc(o.pos.x, o.pos.y, o.r + 0.4, a - 1.15 * rest, a + 1.15 * rest); ctx.stroke(); ctx.restore();
    }
    for (const w of o.alWaves) {
      const W = K.W, c = V.add(w.from, V.mul(w.dir, w.d)), n = V.mul(V.perp(w.dir), W.width / 2), f = 1 - w.d / W.len;
      ctx.save(); ctx.strokeStyle = w.fin ? '#ffb347' : BLUE; ctx.globalAlpha = 0.35 + 0.55 * f; ctx.lineWidth = w.fin ? 0.3 : 0.2; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c.x - n.x, c.y - n.y); ctx.quadraticCurveTo(c.x + w.dir.x * 0.6, c.y + w.dir.y * 0.6, c.x + n.x, c.y + n.y); ctx.stroke(); ctx.restore();
    }
    // R 게더링 필드: 굵은 경계 + 안으로 모이는 고리 + 알론소 둘레의 마무리 피해 충전(유지할수록 강함)
    if (o.alR) {
      const S = o.alR, R = K.R, k = clamp(S.t / R.dur, 0, 1);
      KU.fill(ctx, S.c, R.r, col, 0.1 + 0.05 * Math.sin(T * 8));
      ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = 0.85; ctx.lineWidth = 0.14; Draw.circle(ctx, S.c.x, S.c.y, R.r); ctx.stroke();
      for (let i = 0; i < 3; i++) { const f = (T * 0.9 + i / 3) % 1; ctx.globalAlpha = 0.45 * f; ctx.lineWidth = 0.08; Draw.circle(ctx, S.c.x, S.c.y, Math.max(0.3, R.r * (1 - f))); ctx.stroke(); }
      ctx.globalAlpha = 0.3; ctx.lineWidth = 0.18; Draw.circle(ctx, o.pos.x, o.pos.y, o.r + 0.55); ctx.stroke();
      ctx.globalAlpha = 0.95; ctx.strokeStyle = k > 0.99 ? '#ffd166' : '#ffb347'; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(o.pos.x, o.pos.y, o.r + 0.55, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); ctx.restore();
    }
    // E 준비(0.8초): 대상까지 선이 차오름 · 대상 둘레 시간 · 취소 거리(8.25m)
    if (o.alE && !o.alE.u.dead) {
      const u = o.alE.u, k = clamp(o.alE.t / K.E.windup, 0, 1), tip = V.add(o.pos, V.mul(V.sub(u.pos, o.pos), k));
      ctx.save(); ctx.strokeStyle = col; ctx.lineCap = 'round';
      ctx.globalAlpha = 0.3; ctx.lineWidth = 0.08; ctx.setLineDash([0.2, 0.14]); ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.lineTo(u.pos.x, u.pos.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.9; ctx.lineWidth = 0.2; ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.lineTo(tip.x, tip.y); ctx.stroke();
      ctx.lineWidth = 0.12; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.35, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.globalAlpha = 0.25; ctx.lineWidth = 0.05; ctx.setLineDash([0.3, 0.2]); Draw.circle(ctx, o.pos.x, o.pos.y, K.E.cancel); ctx.stroke(); ctx.restore();
    }
    // Q 자력 연결: 흐르는 선 + 대상 둘레 남은 시간 · 평타가 닿는 거리면 노랑(= 지금 치면 기절)
    if (o.alMark && !o.alMark.u.dead) {
      const u = o.alMark.u, k = clamp(o.alMark.t / K.Q.markDur, 0, 1), rng = typeof o.aaRange === 'function' ? o.aaRange() : (o.aaRange || 1.2);
      const c2 = V.dist(o.pos, u.pos) <= rng + o.r + u.r + 0.1 ? '#ffd166' : BLUE;
      ctx.save(); ctx.strokeStyle = c2; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(T * 12); ctx.lineWidth = 0.13; ctx.setLineDash([0.22, 0.12]); ctx.lineDashOffset = -T * 2;
      ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.lineTo(u.pos.x, u.pos.y); ctx.stroke(); ctx.setLineDash([]);
      ctx.globalAlpha = 0.9; ctx.lineWidth = 0.12; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.3, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
      ctx.globalAlpha = 0.3; ctx.lineWidth = 0.05; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.3); ctx.stroke(); ctx.restore();
    }
    // P 배리어 준비: 몸 둘레 고리(천천히 깜빡) · 막은 직후 밝게
    if (o.alBar.immune > 0) KU.ring(ctx, o.pos, o.r + 0.2, BLUE, 1, false);
    else if (o.alBar.ready) KU.ring(ctx, o.pos, o.r + 0.12, BLUE, 0.4 + 0.15 * Math.sin(T * 3), false);
  },
};

// ============================== 플레이어 키트 ==============================
PKits.alonso = {
  short: { Q: '펀치', W: '실드', E: '슬램', R: '필드', D: '어퍼컷' },
  noAim: ['W', 'R'],   // W: 커서 방향으로 방패(재입력 = 마무리) · R: 제자리(재입력 = 마무리)
  def: { E: { moveCancel: false }, R: { channel: true, moveCancel: false }, D: { moveCancel: false } },
  label(p, k) { if (k === 'W' && p.alW) return '터뜨리기'; if (k === 'R' && p.alR) return '마무리'; return this.short[k]; },
  noCrit: true,
  init(p) {
    p.melee = true;   // 근접(팀 AI·상대 AI 판단) — 조작 틀은 실험체 키트 그대로
    p.al = { K: p.K, color: p.color, S: p.S, L: k => p.L(k), hit: (u, amt, k, o) => p.hitS(u, amt, k, o), foes: () => p.foes(), level: () => p.build.level || 1,
      cdStart: k => p.startCd(k), cdSet: (k, v) => { p.skills[k].cd = v; } };
    Object.defineProperty(p.al, 'S', { get: () => p.S });
    AlonsoCore.attach(p);
  },
  // 근접 평타: 투사체 없이 즉시 (연결된 적이면 기절)
  fireAA(p, t) { p.aaLand(t); return true; },
  onAAHit(p, u) { AlonsoCore.aaHit(p, u); },
  onDamaged(p) { AlonsoCore.onDamaged(p); },
  reset(p) { Object.assign(p, { alMark: null, alW: null, alR: null, alE: null, alWaves: [], alBar: { ready: true, quiet: 0, immune: 0 } }); },
  recast(p, k) { return (k === 'W' && !!p.alW) || (k === 'R' && !!p.alR); },
  // R 정신 집중 중 재입력 = 바로 마무리 (시전 중에도)
  instant(p, k) {
    if (k === 'R' && p.alR && p.cast && p.cast.k === 'R') { p.cast.data.finish = true; return true; }
    if (k === 'W' && p.alW) { AlonsoCore.wEnd(p); return true; }
    return false;
  },
  update(p, dt) {
    AlonsoCore.update(p, dt);
    // R 정신 집중이 CC로 끊김(배리어가 막으면 계속)
    if (p.alR && (p.stun > 0 || p.fear > 0 || p.silence > 0 || p.dead || !p.cast || p.cast.k !== 'R')) { AlonsoCore.rEnd(p, true); if (p.cast && p.cast.k === 'R') p.cast = null; }
  },
  cast: {
    // Q: 커서 방향 직선 투사체 (선딜 0.25초)
    Q(p, aim) {
      const Q = p.K.Q;
      p.beginCast('Q', aim, { windup: () => Q.windup, recovery: () => 0.05,
        fire(q, c) { q.startCd('Q'); Sfx.play('throw'); let hit = false;
          const pr = q.shot({ dir: c.dir, speed: Q.speed, range: Q.range, width: Q.width, len: 0.8, color: '#7fd7ff', onHit: u => { hit = true; AlonsoCore.qHit(q, u); } }); pr.look = 'fist'; pr.onDone = () => q.S.resolveShot('Q', hit); } }, {});
      return true;
    },
    // W: 커서 방향으로 방패 2.5초 (움직일 수 있음, 방향 고정)
    W(p, aim) { if (p.alW) { AlonsoCore.wEnd(p); return true; } AlonsoCore.wStart(p, p.dirTo(aim)); p.instantUsed('W'); return true; },
    // E: 대상 지정 4.75m(밖이면 다가감) → 0.8초 뒤 돌진 + 속박 (그 사이 8.25m 밖이면 취소·쿨 30% 반환)
    E(p, aim) {
      const t = p.targetAt(aim, 'E'); if (!t) return false; const E = p.K.E;
      return p.chaseCast('E', t, E.range, () => {
        p.startCd('E'); AlonsoCore.eAim(p, t); FX.ring(t.pos, t.r, t.r + 0.5, p.color, 0.8); FX.text(t.pos, E.name, p.color, 13, { bold: true });
        p.beginCast('E', t.pos, { windup: () => E.windup, recovery: () => 0.05,
          fire(q, c) {
            if (!AlonsoCore.eValid(q, t)) { q.skills.E.cd *= 1 - E.refund; q.skills.E.cdMax = q.skills.E.cd; FX.text(q.pos, '슬램 취소', '#aaa', 11); q.alE = null; c.data.cancel = true; return; }
            c.data.from = V.copy(q.pos); q.unstoppable = Math.max(q.unstoppable, 0.4);
          },
          tick(q, c, dt) {
            if (c.data.cancel) return true;
            const to = V.sub(t.pos, q.pos), d = V.len(to), step = E.dashSpeed * dt, reach = q.r + t.r + 0.05;
            if (t.dead || d <= reach + step) { if (!t.dead) { q.pos = Geo.pushOut(V.sub(t.pos, V.mul(V.norm(to), reach)), q.r); AlonsoCore.eGo(q, c.data.from, q.pos); AlonsoCore.eLand(q, t); } else q.alE = null; q.unstoppable = 0; return true; }
            q.pos = V.add(q.pos, V.mul(to, step / d)); q.facing = V.ang(to); return c.t > 1.2;
          } }, {});
      });
    },
    // R: 정신 집중 3.5초 (재입력 = 마무리)
    R(p) {
      const R = p.K.R;
      p.beginCast('R', p.pos, { windup: () => 0, recovery: () => 0.1,
        fire(q, c) { q.startCd('R'); AlonsoCore.rStart(q); },
        tick(q, c, dt) { if (!q.alR) return true; const done = AlonsoCore.rTick(q, dt) || c.data.finish; if (done) AlonsoCore.rEnd(q, false); return done; } }, {});
      return true;
    },
    // D 어퍼컷: 대상 지정(1.35m + 짧게 다가감)
    D(p, aim) {
      const t = p.targetAt(aim, 'D'); if (!t) return false; const D = p.K.D;
      return p.chaseCast('D', t, D.range + D.hop, () => {
        p.startCd('D'); const to = V.sub(t.pos, p.pos), d = V.len(to);
        if (d > p.r + t.r + D.range) p.pos = Geo.pushOut(V.add(p.pos, V.mul(to, (d - p.r - t.r - 0.2) / d)), p.r);
        p.facing = V.ang(to); AlonsoCore.dHit(p, t); p.instantUsed('D'); Sfx.play('aa');
      });
    },
  },
  shape(p, k) {
    const K = p.K;
    if (k === 'Q') return { kind: 'line', len: K.Q.range, width: K.Q.width };
    if (k === 'W') return { kind: 'line', len: K.W.len, width: K.W.width };
    if (k === 'E') return { kind: 'target', range: K.E.range };
    if (k === 'R') return { kind: 'self', r: K.R.r };
    if (k === 'D') return { kind: 'target', range: K.D.range + K.D.hop };
    return null;
  },
  draw(p, ctx) { AlonsoCore.draw(p, ctx); },
  hud(p) {
    const b = [[p.alBar.ready ? '배리어 준비' : `배리어 ${fmt(Math.max(0, lv(p.K.P.cd, p.L('P')) - p.alBar.quiet), 1)}`, p.alBar.ready ? '#7fd7ff' : '#8a93a6']];
    if (p.alMark) b.push([`자력 연결 ${fmt(p.alMark.t, 1)} (평타 = 기절)`, '#7fd7ff']);
    if (p.alW) b.push([`실드 ${fmt(p.K.W.dur - p.alW.t, 1)} (W: 터뜨리기)`, p.color]);
    if (p.alR) b.push([`게더링 필드 ${fmt(p.K.R.dur - p.alR.t, 1)} (R: 마무리)`, p.color]);
    return b;
  },
};
