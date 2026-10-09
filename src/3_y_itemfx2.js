
// ============================== 장비 고유 효과 (추가 16종) ==============================
// 3_y_itemfx.js(ItemFx)에 붙이는 나머지 효과. 수치: 12.5 툴팁(근거리 값). 범위가 툴팁에 없는 것은 ⚠ 가정(RANGE)
//   충전-섬광 · 가벼운 발걸음 · 신속(루드라) · 현란함 · 포톤 런처 · 예열 · 열정-순환 · 돌풍 · 차원 균열 · 명경지수 · 응집 · 개시 · 달인 · 격동 · 각성 · 순풍
Object.assign(ItemFx, {
  RANGE: { gale: 2.5, master: 3, turbulence: 2.5 },   // ⚠ 돌풍·달인 반경은 툴팁에 없음(가정). 격동 2.5m는 툴팁
  FLASH: { slow: 0.25, dur: 1, cd: 5 }, STEP: { max: 100, slowAt: 100, slow: 0.2, slowDur: 2 },
  RUDRA: { need: 3, win: 4, dur: 3, ms: 0.2, ad: 0.12, cd: 10 }, DAZZLE: { ms: 0.03, max: 8, dur: 3 },
  WARMUP: { per: 0.025, max: 6, dur: 5, ms: 0.06 }, PASSION: { dur: 8 },
  GALE: { need: 3, win: 5, dur: 5, tick: 0.5, base: 20, sp: 0.15, hp: 0.005, cd: 10 },
  RIFT: { dur: 5, taken: 0.06, base: 12, sp: 0.04, cd: 20 }, CALM: { wait: 5, per: 30, perLv: 5, max: 50, maxLv: 10, maxSp: 0.4 },
  COHESION: { need: 2, win: 3, delay: 2, slow: 0.5, dur: 1, cd: 12 }, ONSET: { every: 20, dur: 5, sp: 16, as: 0.15, aaCut: 1 },
  MASTER: { delay: 0.5, base: 40, sp: 0.25, perLv: 2, slow: 0.35, dur: 1, cd: 10 }, TURB: { need: 2, base: 10, bonusHp: 0.12, perLv: 2 },
  AWAKEN: { dur: 8, pen: 0.1, cd: 20 }, BREEZE: { ms: 0.05, dur: 3 },
  lvl(u) { return (u.build && u.build.level) || 1; },
  // 개별 적중 기록(신속·돌풍·응집): 최근 시각 목록
  mark(u, key, win) { const a = (u[key] = (u[key] || []).filter(t => Game.time - t < win)); a.push(Game.time); return a.length; },
  // 평타 적중 직후 (onAA에서 부름)
  onAA2(p, t) {
    const K = this.k(p); if (!t || t.dead) return;
    const ch = this.isChar(t);
    if (K.flash && !(p.flashCd > 0)) { p.flashCd = this.FLASH.cd; t.addSlow(this.FLASH.slow, this.FLASH.dur); }
    if (K.stepDmg && p.steps > 0) {   // 가벼운 발걸음: 중첩 모두 소모 → 추가 피해, 최대 중첩이면 둔화
      const n = p.steps; p.steps = 0;
      Combat.damage(p, t, K.stepDmg * n / this.STEP.max, { type: 'skill', source: '가벼운 발걸음', noShake: true });
      if (n >= this.STEP.slowAt && !t.dead) t.addSlow(this.STEP.slow, this.STEP.slowDur);
    }
    if (K.photon) { p.photonN = (p.photonN || 0) + 1; if (p.photonN >= 3) { p.photonN = 0; const d = Combat.damage(p, t, K.photon + p.sp * K.photonSp, { type: 'skill', source: '포톤 런처', noShake: true }); if (K.photonHeal && d > 0) p.heal(d * K.photonHeal, true); } }
    if (K.passion && !t.dead) { Combat.damage(p, t, K.passion + p.sp * K.passionSp, { type: 'skill', source: '열정 - 순환', noShake: true }); p.passionT = this.PASSION.dur; }
    if (K.onset && ch) {
      if (!(p.onsetCd > 0)) { p.onsetCd = this.ONSET.every; p.onsetT = this.ONSET.dur; if (!p.onsetSp) { p.onsetSp = this.ONSET.sp; p.sp += p.onsetSp; } }
      else p.onsetCd = Math.max(0, p.onsetCd - this.ONSET.aaCut);
    }
    this.onHitAny(p, t);
  },
  // 개별 스킬 피해 직후 (onSkillDamage에서 부름) — k: 스킬 키
  onSkill2(p, e, k) {
    const K = this.k(p); if (!e || e.dead) return;
    const ch = this.isChar(e);
    if (K.warmup && ch) { p.warmN = Math.min(this.WARMUP.max, (p.warmN || 0) + 1); p.warmT = this.WARMUP.dur; if (p.warmN >= this.WARMUP.max) p.addMsBuff(this.WARMUP.ms, this.WARMUP.dur, false, 'warmup'); }
    if (K.rift && k === 'R' && ch && !(e.riftCd && e.riftCd[p.id] > Game.time)) { (e.riftCd = e.riftCd || {})[p.id] = Game.time + this.RIFT.cd; e.rift = { t: this.RIFT.dur, src: p, acc: 0 }; }
    if (K.cohesion && ch && !(p.cohCd > 0) && this.mark(p, '_coh', this.COHESION.win) >= this.COHESION.need) { p._coh = []; p.cohCd = this.COHESION.cd; (p.itemPending = p.itemPending || []).push({ kind: 'cohesion', t: this.COHESION.delay, target: e }); }
    if (K.breeze && ch) p.addMsBuff(this.BREEZE.ms, this.BREEZE.dur, false, 'breeze');
    this.onHitAny(p, e);
  },
  // 평타·개별 스킬 공통 (적 실험체)
  onHitAny(p, e) {
    const K = this.k(p); if (!this.isChar(e)) return;
    if (K.dazzle) { p.dazzleN = Math.min(this.DAZZLE.max, (p.dazzleN || 0) + 1); p.addMsBuff(this.DAZZLE.ms * p.dazzleN, this.DAZZLE.dur, false, 'dazzle'); p.dazzleT = this.DAZZLE.dur; }
    if (K.rudra && !(p.rudraCd > 0) && this.mark(p, '_rudra', this.RUDRA.win) >= this.RUDRA.need) {
      p._rudra = []; p.rudraCd = this.RUDRA.cd; p.rudraT = this.RUDRA.dur; p.addMsBuff(this.RUDRA.ms, this.RUDRA.dur, false, 'rudra');
      if (!p.rudraAd) { p.rudraAd = p.ad * this.RUDRA.ad; p.ad += p.rudraAd; }
    }
    if (K.gale && !(p.galeCd > 0) && this.mark(p, '_gale', this.GALE.win) >= this.GALE.need) { p._gale = []; p.galeCd = this.GALE.cd; p.galeT = this.GALE.dur; p.galeAcc = 0; }
  },
  // 스킬 사용(onCast에서 부름)
  onCast2(p, k) {
    const K = this.k(p);
    if (K.awaken && k === 'R' && !(p.awakeCd > 0)) { p.awakeCd = this.AWAKEN.cd; p.awakeT = this.AWAKEN.dur; if (!p.awakePen) { p.awakePen = this.AWAKEN.pen; p.penPct += p.awakePen; } }
    if (K.master && k === 'D' && !(p.masterCd > 0)) { p.masterCd = this.MASTER.cd; (p.itemPending = p.itemPending || []).push({ kind: 'master', t: this.MASTER.delay }); }
  },
  asMul2(p) { return (p.passionT > 0 ? 1 + this.k(p).passionAs : 1) * (p.onsetT > 0 ? 1 + this.ONSET.as : 1); },
  msFlat(u) { const K = this.k(u); return K.stepMs && u.steps > 0 ? K.stepMs * u.steps / this.STEP.max : 0; },
  damageMul2(src, tgt, type) {
    let m = 1;
    if (type === 'skill' && src && src.warmN > 0 && this.k(src).warmup && this.isChar(tgt)) m *= 1 + this.WARMUP.per * src.warmN;
    if (tgt.rift && tgt.rift.t > 0) m *= 1 + this.RIFT.taken;   // 차원 불안정: 받는 피해 증가
    return m;
  },
  // 매 스텝
  tick2(u, dt) {
    const K = this.k(u);
    for (const k of ['flashCd', 'rudraCd', 'rudraT', 'dazzleT', 'warmT', 'passionT', 'galeCd', 'cohCd', 'onsetCd', 'onsetT', 'masterCd', 'awakeCd', 'awakeT']) if (u[k] > 0) u[k] = Math.max(0, u[k] - dt);
    if (u.rudraAd && !(u.rudraT > 0)) { u.ad -= u.rudraAd; u.rudraAd = 0; }
    if (u.dazzleN && !(u.dazzleT > 0)) u.dazzleN = 0;
    if (u.warmN && !(u.warmT > 0)) u.warmN = 0;
    if (u.onsetSp && !(u.onsetT > 0)) { u.sp -= u.onsetSp; u.onsetSp = 0; }
    if (u.awakePen && !(u.awakeT > 0)) { u.penPct -= u.awakePen; u.awakePen = 0; }
    // 가벼운 발걸음: 이동 거리만큼 중첩
    if (K.step) { const last = u._stepPos || u.pos, d = V.dist(last, u.pos); u._stepPos = V.copy(u.pos); if (d > 0 && d < 3) { u.stepAcc = (u.stepAcc || 0) + d; while (u.stepAcc >= K.step) { u.stepAcc -= K.step; u.steps = Math.min(this.STEP.max, (u.steps || 0) + 1); } } }
    // 돌풍: 0.5초마다 주변
    if (u.galeT > 0) { u.galeAcc = (u.galeAcc || 0) + dt; while (u.galeAcc >= this.GALE.tick) { u.galeAcc -= this.GALE.tick; for (const e of Game.enemies(u)) if (V.dist(e.pos, u.pos) <= this.RANGE.gale + e.r) Combat.damage(u, e, this.GALE.base + u.sp * this.GALE.sp + e.maxHp * this.GALE.hp, { type: 'skill', source: '돌풍', aoe: true, noShake: true, tick: true }); } }
    // 차원 불안정: 매초 피해 (대상 쪽)
    if (u.rift) { const R = u.rift; R.t -= dt; R.acc += dt; while (R.acc >= 1 && !u.dead) { R.acc -= 1; Combat.damage(R.src, u, this.RIFT.base + R.src.sp * this.RIFT.sp, { type: 'skill', source: '차원 균열', tick: true, noShake: true }); } if (R.t <= 1e-9 || u.dead) u.rift = null; }
    // 명경지수: 5초간 안 맞으면 매초 보호막
    if (K.calm && !u.dead) {
      const C = this.CALM, lv = this.lvl(u), max = C.max + C.maxLv * lv + u.sp * C.maxSp;
      if (Game.time - (u.lastHurtT ?? -99) >= C.wait) { u.calmAcc = (u.calmAcc || 0) + dt; while (u.calmAcc >= 1) { u.calmAcc -= 1; u.shield = Math.min(max, (u.shield || 0) + C.per + C.perLv * lv); u.shieldT = Math.max(u.shieldT || 0, 1.5); } }
      else u.calmAcc = 0;
    }
    // 격동: 전투 중 2.5m 안에 적이 2초 있으면 주위 피해
    if (K.turbulence && !u.dead && Rest.inCombat(u)) {
      const near = Game.enemies(u).some(e => this.isChar(e) && V.dist(e.pos, u.pos) <= this.RANGE.turbulence + e.r);
      u.turbT = near ? (u.turbT || 0) + dt : 0;
      if (u.turbT >= this.TURB.need) {
        u.turbT = 0; const bonus = Math.max(0, u.maxHp - (u.baseHpAtLv || u.maxHp)), dmg = this.TURB.base + bonus * this.TURB.bonusHp + this.TURB.perLv * this.lvl(u);
        FX.ring(u.pos, 0.3, this.RANGE.turbulence, '#ffd166', 0.3, 0.1);
        for (const e of Game.enemies(u)) if (V.dist(e.pos, u.pos) <= this.RANGE.turbulence + e.r) Combat.damage(u, e, dmg, { type: 'skill', source: '격동', aoe: true, noShake: true });
      }
    }
  },
  // 예약 효과 (tick의 itemPending에서 부름)
  pending2(u, P) {
    if (P.kind === 'cohesion') { if (P.target && !P.target.dead) { P.target.addSlow(this.COHESION.slow, this.COHESION.dur); FX.ring(P.target.pos, 0.2, 1.2, '#ff8fd8', 0.3, 0.08); } return true; }
    if (P.kind === 'master') {
      const M = this.MASTER, dmg = M.base + u.sp * M.sp + M.perLv * this.lvl(u);
      FX.ring(u.pos, 0.3, this.RANGE.master, '#9fd8ff', 0.35, 0.12);
      for (const e of Game.enemies(u)) if (V.dist(e.pos, u.pos) <= this.RANGE.master + e.r) { Combat.damage(u, e, dmg, { type: 'skill', source: '달인', aoe: true }); e.addSlow(M.slow, M.dur); }
      return true;
    }
    return false;
  },
});
