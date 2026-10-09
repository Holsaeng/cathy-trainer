
// ============================== 장비 고유 효과 ==============================
// 장비(Builds.resolve → unit.pasK)에 따라 캐시의 스킬·평타·피해·회복에 붙는 효과. 수치는 12.5 툴팁(1_z_items.js · docs/er_notes_items.md)
//   의념(월식·호루스의 눈): 스킬 사용 → 3초 충전: 공속 +40%, 다음 평타가 스증 비례 추가 스킬 피해 (쿨 2초)
//   부패(핏빛 망토 등): 스킬 피해 → 3초간 매초 대상 최대 체력 비례 스킬 피해 (1스택, 다시 걸면 갱신)
//   파열(타나토스·환영도-새벽): 스킬 피해 → 0.8초 뒤 대상 위치 광역 폭발 60 + 레벨×3 + 스증 25% (쿨 8초, 반경 ⚠ 2.5m 가정)
//   집행자(악의·비색 단검-새벽): 대상 체력 40% 이하면 스킬 피해 +15%
//   치유 감소: 피해를 주면 대상 치유 4초간 감소 (전설 20%·초월 30%, 캐시 패시브의 치유 감소와 중첩 없이 큰 값)
//   「적 실험체에게」 효과는 연습용으로 허수아비에도 적용
const ItemFx = {
  NIAN: { dur: 3, as: 0.4, cd: 2 }, ROT: { dur: 3 }, RUPTURE: { delay: 0.8, cd: 8, base: 60, perLv: 3, sp: 0.25, r: 2.5 }, EXEC: { hp: 0.4, mul: 1.15 }, TASER: { range: 8, need: 3, base: 30, sp: 0.2, mark: 5, mul: 1.1, cd: 10 }, CURSE: { dur: 4, base: 25, sp: 0.1, imm: 8, aaCut: 1, cd: 2 }, HEALCUT: { dur: 4 },
  isChar(u) { return u && ['player', 'ranged', 'melee', 'dummy'].includes(u.kind); },
  k(u) { return (u && u.pasK) || {}; },
  // 스킬 사용(QWERD) 직후
  onCast(p, k) { if (this.k(p).nianSp && !(p.nianCd > 0)) p.nianT = this.NIAN.dur; this.onCast2(p, k); },
  asMul(p) { return (p.nianT > 0 && this.k(p).nianSp ? 1 + this.NIAN.as : 1) * this.asMul2(p); },
  // 평타 적중 직후
  onAA(p, t) {
    if (t && t.curseImm > 0) t.curseImm = Math.max(0, t.curseImm - this.CURSE.aaCut);   // 저주: 평타 맞을 때마다 재저주 대기 1초 감소
    this.onAATaser(p, t);
    this.onAA2(p, t);   // 섬광·발걸음·포톤·열정·개시·현란함·신속·돌풍 (3_y_itemfx2.js)
    const K = this.k(p); if (!K.nianSp || !(p.nianT > 0) || !t || t.dead) return;
    p.nianT = 0; p.nianCd = this.NIAN.cd;
    Combat.damage(p, t, p.sp * K.nianSp, { type: 'skill', source: '의념', noShake: true });
    FX.burst(t.pos, '#c9a4ff', 8, 4); FX.ring(t.pos, 0.2, 0.9, '#c9a4ff', 0.25, 0.06);
  },
  onAATaser(p, t) {
    const K = this.k(p), T = this.TASER; if (!K.taser || !t || t.dead || p.taserCd > 0 || !this.isChar(t)) return;
    if (((p.taserNear || {})[t.id] || 0) < T.need) return;
    p.taserCd = T.cd;
    Combat.damage(p, t, T.base + p.sp * T.sp, { type: 'skill', source: '테이저 건', noShake: true });
    if (!t.dead) t.taserMark = { by: p.id, t: T.mark };   // 적중한 뒤 표식 (이 추가 피해에는 +10% 안 붙음)
    FX.burst(t.pos, '#9fd8ff', 10, 5); FX.ring(t.pos, 0.2, 1.0, '#9fd8ff', 0.25, 0.06);
  },
  // 캐시 개별 스킬 피해 직후 (skillHit)
  onSkillDamage(p, e, k) {
    const K = this.k(p); if (!e || e.dead) return;
    this.onSkill2(p, e, k);   // 예열·차원 균열·응집·순풍·현란함·신속·돌풍
    if (K.rotHp) e.rot = { t: this.ROT.dur, per: e.maxHp * (K.rotHp + p.sp * K.rotSp), src: p, acc: 0 };
    if (K.curse && !(p.curseCd > 0) && !e.curse && !(e.curseImm > 0)) { p.curseCd = this.CURSE.cd; e.curse = { t: this.CURSE.dur, src: p, dmg: this.CURSE.base + p.sp * this.CURSE.sp }; }
    if (K.rupture && !(p.ruptCd > 0) && this.isChar(e)) { p.ruptCd = this.RUPTURE.cd; (p.itemPending = p.itemPending || []).push({ kind: 'rupture', t: this.RUPTURE.delay, target: e, pos: V.copy(e.pos) }); }
  },
  // 모든 피해: 집행자 배율
  damageMul(src, tgt, type) {
    const K = this.k(src);
    let m = K.executor && type === 'skill' && tgt.maxHp > 0 && tgt.hp / tgt.maxHp <= this.EXEC.hp ? this.EXEC.mul : 1;
    if (type === 'skill' && tgt.taserMark && tgt.taserMark.t > 0 && src && tgt.taserMark.by === src.id) m *= this.TASER.mul;   // 테이저 건 표식
    return m * this.damageMul2(src, tgt, type);
  },
  // 모든 피해 뒤: 치유 감소
  onDamage(src, tgt) {
    tgt.lastHurtT = Game.time;   // 명경지수: 마지막으로 맞은 시각
    const K = this.k(src); if (!K.healCut || tgt.dead) return;
    tgt.healCutT = this.HEALCUT.dur; tgt.healCutPct = Math.max(tgt.healCutT > 0 && tgt.healCutPct || 0, K.healCut);
  },
  healMul(u) { const a = u.healRed > 0 ? CONFIG.passive.healReduction : 0, b = u.healCutT > 0 ? (u.healCutPct || 0) : 0; return 1 - Math.max(a, b); },
  // 매 스텝 (tickStatus): 타이머·부패 틱·파열 폭발
  tick(u, dt) {
    for (const k of ['nianT', 'nianCd', 'ruptCd', 'healCutT', 'taserCd', 'curseCd', 'curseImm']) if (u[k] > 0) u[k] = Math.max(0, u[k] - dt);
    if (u.taserMark && (u.taserMark.t -= dt) <= 0) u.taserMark = null;
    if (this.k(u).taser) {   // 테이저 건: 8m 안에 머문 시간(대상별)
      const N = u.taserNear = u.taserNear || {}, seen = {};
      for (const e of Game.enemies(u)) if (this.isChar(e) && V.dist(e.pos, u.pos) <= this.TASER.range) { seen[e.id] = (N[e.id] || 0) + dt; }
      u.taserNear = seen;
    }
    if (u.curse && (u.curse.t -= dt) <= 0) { const C = u.curse; u.curse = null; u.curseImm = this.CURSE.imm; if (!u.dead) Combat.damage(C.src, u, C.dmg, { type: 'true', source: '저주', noShake: true }); }
    if (u.rot) {
      const R = u.rot; R.acc += dt; R.t -= dt;
      while (R.acc >= 1 && !u.dead) { R.acc -= 1; Combat.damage(R.src, u, R.per, { type: 'skill', source: '부패', tick: true, noShake: true }); }
      if (R.t <= 1e-9 || u.dead) u.rot = null;
    }
    this.tick2(u, dt);
    if (u.itemPending && u.itemPending.length) {
      for (const P of u.itemPending) {
        if ((P.t -= dt) > 0) continue;
        P.done = true;
        if (this.pending2(u, P)) continue;
        if (P.kind === 'rupture') {
          const at = P.target && !P.target.dead ? V.copy(P.target.pos) : P.pos, R = this.RUPTURE, lvl = (u.build && u.build.level) || 1;
          FX.ring(at, 0.3, R.r, '#ff7b3b', 0.35, 0.14); FX.burst(at, '#ff7b3b', 18, 6);
          for (const e of Game.enemies(u)) if (V.dist(e.pos, at) <= R.r + e.r) Combat.damage(u, e, R.base + R.perLv * lvl + u.sp * R.sp, { type: 'skill', source: '파열', aoe: true });
        }
      }
      u.itemPending = u.itemPending.filter(P => !P.done);
    }
  },
};
