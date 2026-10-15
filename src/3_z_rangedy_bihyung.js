
// ============================== 플레이어블: 비형 (방망이 · 브루저) ==============================
// 플레이어 = 실험체 키트 틀(RangedPlayer + PKits.bihyung, 근접 평타) · AI = RangedDuelist + Kits.bihyung(4_d_bihyung_ai.js)
// 스킬 효과는 BihyungCore를 플레이어·AI가 함께 씀 (주인 o의 어댑터 o.bh: K · L · hit · foes · cdStart · cdSet · level · color · S)
// 수치: CONFIG.rangedKits.bihyung (나무위키 + 공식 영상) · 근거 docs/er_notes_playables.md 14장 · ⚠ = 출처 없는 추정값
//   P 도깨비 불: 평타 10 · 스킬 30씩 신력 → 100이면 4초 장판(반경 3m, 초당 피해 + 대상 최대 체력 %) + 둔화 저항 · 적 실험체를 치면 시간 초기화
//   Q 뚝딱!: 다음 평타 강화(추가 피해 + 회복) → 1.5초 뒤 4초 안에 재사용 = 강화 평타 + 0.2초 간격 2회 추가(25% 평타 + 추가 피해, 70%는 주변 2m)
//   W 천벌 받아라!: 7m 안 지점에 1.5초 뒤 폭발(반경 2.75m, 피해 + 둔화) · 비형이 범위 안이면 보호막 · 이속 · 신력
//   E 내기 한판!: 2.5~5.3m 돌진(10m/s) — 처음 부딪힌 적에게 피해 + 도발
//   R 신명나게 놀아보자!: 5m 안 지점으로 약 1.2초 도약(오를 때 면역 → 공중 저지 불가) · 받는 피해 30% 감소 · 15초 추가 체력 · 착지 반경 4.5m 피해·둔화(중앙 2m는 30% 더)
//   D 풀스윙(방망이): 0.42초 뒤 앞 180° 2m — 피해 + 바라보는 방향으로 밀침 → 벽에 부딪히면 추가 피해 + 기절

const BihyungCore = {
  attach(o) {
    Object.assign(o, { bhG: 0, bhAura: 0, bhAuraAcc: 0, bhQ: null, bhQ2: null, bhW: [], bhR: null, bhHp: null, bhT: [], bhD: null, lift: 0, slowRes: 0 });
    o.ccGuard = type => !!(o.bhR && o.bhR.t < o.bh.K.R.immune);   // R 오르는 동안 방해 효과 면역
    o.dmgMulFrom = () => o.bhR ? 1 - o.bh.K.R.reduce : 1;          // R 쓰는 동안 받는 피해 30% 감소
  },
  later(o, t, fn) { o.bhT.push({ t, fn }); },
  isFoeUnit(u) { return isHero(u) || u.kind === 'dummy'; },
  // ---------- P 도깨비 불 ----------
  gain(o, n) {
    if (o.bhAura > 0) return;
    o.bhG = Math.min(o.bh.K.P.max, o.bhG + n);
    if (o.bhG >= o.bh.K.P.max) { o.bh.S.count('bhAura'); o.bhG = 0; o.bhAura = o.bh.K.P.dur; o.bhAuraAcc = 0; FX.ring(o.pos, 0.5, o.bh.K.P.r, '#3fd0c9', 0.4); FX.text(o.pos, o.bh.K.P.name, '#3fd0c9', 13, { bold: true }); Sfx.play('blink', o.pos); }
  },
  refresh(o, u) { if (o.bhAura > 0 && u && this.isFoeUnit(u)) o.bhAura = o.bh.K.P.dur; },   // 적 실험체를 치면 장판 시간 초기화 (일반 야생 동물은 X)
  // 스킬 피해 + 신력 30 + 장판 초기화
  skillHit(o, u, amt, k, opt) { if (!u || u.dead) return; o.bh.hit(u, amt, k, opt); this.gain(o, o.bh.K.P.gainSkill); this.refresh(o, u); },
  // ---------- 평타 적중: 신력 10 · Q 강화 ----------
  // ---------- 보이는 효과 (판정과 무관) ----------
  // 방망이 타격: 휘두른 호 + 맞은 자리 불꽃 · 뚝딱!(Q 강화)은 분홍으로 크게 + 화면 흔들림
  batFx(o, u, big) {
    const to = V.sub(u.pos, o.pos), a = V.ang(to), col = big ? '#ff6b9d' : '#ffe2a8';
    FX.slash(o.pos, a, o.r + (big ? 1.6 : 1.15), big ? 1.0 : 0.6, col, big ? 0.22 : 0.12, o.r + (big ? 0.3 : 0.5));
    const at = V.sub(u.pos, V.mul(V.norm(to), u.r * 0.5)); FX.burst(at, col, big ? 14 : 6, big ? 6 : 4);
    if (big) { FX.ring(at, 0.1, 1.2, col, 0.3, 0.12); if (o === Game.player || u === Game.player) FX.addShake(6); }
  },
  onAA(o, u) {
    if (!u || u.dead) return;
    this.batFx(o, u, !!o.bhQ);
    this.gain(o, o.bh.K.P.gainAA); this.refresh(o, u);
    const st = o.bhQ; if (!st) return;
    o.bhQ = null; const Q = o.bh.K.Q, l = o.bh.L('Q');
    this.skillHit(o, u, lv(Q.base, l) + o.ad * lv(Q.ad, l), 'Q');
    if (st.stage === 1) {
      o.heal(o.maxHp * lv(Q.heal, l)); o.bhQ2 = { t: 0 }; FX.text(o.pos, '뚝딱!', o.bh.color, 12, { bold: true });   // 1.5초 뒤부터 4초 안에 재사용
    } else {
      o.heal(o.maxHp * lv(Q.heal2, l)); FX.text(o.pos, '뚝딱! 뚝딱!', o.bh.color, 13, { bold: true });
      for (let i = 1; i <= 2; i++) this.later(o, Q.gap * i, () => {   // 0.2초 간격 2회 추가 (평타 판정 25% + 추가 피해, 그 70%는 주변 2m)
        if (u.dead || o.dead) return;
        const ex = lv(Q.extra, l) + o.ad * lv(Q.extraAd, l);
        o.bh.hit(u, o.ad * (1 + (o.aaAmp || 0)) * Q.extraAA, 'Q', { type: 'normal' }); this.gain(o, o.bh.K.P.gainAA);
        this.skillHit(o, u, ex, 'Q');
        for (const v of o.bh.foes()) if (v !== u && V.dist(v.pos, u.pos) <= Q.aoeR + v.r) o.bh.hit(v, ex * Q.aoe, 'Q');
        FX.burst(u.pos, '#ff6b9d', 8, 4); FX.ring(u.pos, 0.3, Q.aoeR, '#ff6b9d', 0.25, 0.08); FX.slash(o.pos, V.ang(V.sub(u.pos, o.pos)) + (i % 2 ? 0.5 : -0.5), o.r + 1.5, 0.8, '#ff6b9d', 0.15, o.r + 0.3); o.bhSwing = (o.bhSwing || 0) + 1;   // 추가 타격: 주변 2m 표시 · 한 번 더 휘두름
      });
      o.bh.cdStart('Q');
    }
  },
  // Q 사용: 강화 평타 준비 (재사용 가능하면 2단계)
  qReady2(o) { return !!(o.bhQ2 && o.bhQ2.t >= o.bh.K.Q.recastAfter); },
  qCast(o) {
    const Q = o.bh.K.Q;
    if (this.qReady2(o)) { o.bhQ2 = null; o.bhQ = { stage: 2, t: Q.buffDur }; o.bh.S.count('bhQ2'); return true; }   // 코칭: 뚝딱! 2단계 사용
    if (o.bhQ || o.bhQ2) return false;
    o.bhQ = { stage: 1, t: Q.buffDur }; o.bh.cdSet('Q', 999); o.bh.S.count('bhQ1');   // 다 쓸 때까지 쿨 잠금
    return true;
  },
  // ---------- W 천벌 받아라! ----------
  wCast(o, pt) { const W = o.bh.K.W; o.bhW.push({ pos: V.copy(pt), t: W.delay }); FX.ring(pt, 0.3, W.r, '#3fd0c9', W.delay, 0.08); o.bh.cdStart('W'); },
  wBlow(o, w) {
    const W = o.bh.K.W, l = o.bh.L('W');
    FX.ring(w.pos, 0.4, W.r, '#5ff0e6', 0.4); FX.burst(w.pos, '#5ff0e6', 16, 6); Sfx.play('slam', w.pos);
    for (const u of o.bh.foes()) if (V.dist(u.pos, w.pos) <= W.r + u.r) { this.skillHit(o, u, lv(W.base, l) + o.ad * W.ad + u.maxHp * lv(W.hpPct, l), 'W'); u.addSlow(W.slow, W.slowDur); }
    if (V.dist(o.pos, w.pos) <= W.r + o.r) {   // 비형이 범위 안: 보호막 · 이속 · 신력
      o.shield = Math.max(o.shield, lv(W.shield, l) + o.maxHp * W.shieldHp); o.shieldT = W.shieldDur;
      o.addMsBuff(W.ms, W.msDur, false, 'bhW'); this.gain(o, o.bh.K.P.gainSkill); FX.text(o.pos, '보호막', '#5ff0e6', 12, { bold: true });
    }
  },
  // ---------- E 내기 한판! — 돌진 한 스텝 (처음 부딪힌 적: 피해 + 도발) ----------
  eStart(o, dir, aimDist) { const E = o.bh.K.E; return { dir: V.copy(dir), left: clamp(aimDist, E.min, E.max), done: false }; },
  eStep(o, st, dt) {
    const E = o.bh.K.E; if (st.done) return true;
    const step = Math.min(st.left, E.speed * dt), from = V.copy(o.pos), to = Geo.pushOut(V.add(o.pos, V.mul(st.dir, step)), o.r);
    for (const u of o.bh.foes()) if (Geo.segDist(u.pos, from, V.add(from, V.mul(st.dir, step + o.r))) <= u.r + E.width / 2) {
      const l = o.bh.L('E'); this.skillHit(o, u, lv(E.base, l) + o.ad * E.ad, 'E');
      if (u.applyTaunt && u.applyTaunt(lv(E.taunt, l), o)) { FX.text(u.pos, '도발', '#ffd166', 12, { bold: true }); if (isHero(u) || u.kind === 'dummy') o.bh.S.count('bhTaunt'); }   // 코칭: 도발 성공
      FX.ring(u.pos, 0.2, 1.5, '#ffd166', 0.35, 0.14); FX.burst(u.pos, '#ffd166', 12, 5); if (o === Game.player || u === Game.player) FX.addShake(5);
      st.done = true; return true;
    }
    FX.trail(from, to, o.bh.color, 0.7, 0.3); o.pos = to; o.facing = V.ang(st.dir); st.left -= step;
    if (st.left <= 0.001 || V.dist(from, to) < step * 0.3) { st.done = true; return true; }   // 끝까지 · 벽에 막힘
    return false;
  },
  // ---------- R 신명나게 놀아보자! ----------
  rStart(o, pt) {
    const R = o.bh.K.R, l = o.bh.L('R'), to = Geo.pushOut(V.add(o.pos, V.mul(V.norm(V.sub(pt, o.pos)), Math.min(R.range, V.dist(o.pos, pt)))), o.r);
    o.bhR = { t: 0, from: V.copy(o.pos), to }; o.unstoppable = Math.max(o.unstoppable, R.unstop);
    const add = lv(R.bonusHp, l); if (o.bhHp) { o.maxHp -= o.bhHp.amt; o.hp = Math.min(o.hp, o.maxHp); }
    o.bhHp = { amt: add, t: R.bonusDur }; o.maxHp += add; o.hp += add;   // 도깨비 감투: 15초 추가 체력
    FX.text(o.pos, R.name, o.bh.color, 14, { bold: true }); Sfx.play('ult'); o.bh.cdStart('R');
  },
  rStep(o, dt) {
    const S = o.bhR, R = o.bh.K.R; if (!S) return true; S.t += dt;
    const k = clamp(S.t / R.leap, 0, 1); o.pos = V.lerp(S.from, S.to, k); o.facing = V.ang(V.sub(S.to, S.from));
    o.lift = Math.sin(Math.PI * k) * 2.2;   // 3D 높이(보이는 것만): 포물선 도약
    if (S.t < R.leap) return false;
    o.bhR = null; o.lift = 0; const l = o.bh.L('R');
    FX.ring(S.to, 0.5, R.r, '#ff6b9d', 0.45, 0.2); FX.ring(S.to, 0.2, R.core, '#ffd166', 0.35, 0.14); FX.burst(S.to, '#ff6b9d', 24, 7); FX.addShake(8); Sfx.play('slam', S.to);
    for (const u of o.bh.foes()) {
      const d = V.dist(u.pos, S.to); if (d > R.r + u.r) continue;
      const mul = d <= R.core + u.r ? R.coreMul : 1;
      this.skillHit(o, u, (lv(R.base, l) + (o.bonusAd || 0) * R.bad + u.maxHp * R.hpPct) * mul, 'R'); u.addSlow(R.slow * mul, R.slowDur);
    }
    return true;
  },
  // ---------- D 풀스윙 (방망이 무기 스킬) ----------
  dAim(o, dir) { o.bhD = { dir: V.copy(dir), t: 0 }; },   // 0.42초 준비: 휘두를 부채꼴이 차오름
  dSwing(o, dir) {
    const D = o.bh.K.D, l = o.bh.L('D'); o.bhD = null; o.bhSwing = (o.bhSwing || 0) + 1;
    if (o.bh.foes().some(u => u.taunt > 0 && u.tauntBy === o && Geo.inSector(o.pos, V.ang(dir), D.range + o.r, D.angle / 2 * Math.PI / 180, u.pos, u.r))) o.bh.S.count('bhTauntD');   // 코칭: 도발 중인 적을 풀스윙
    FX.slash(o.pos, V.ang(dir), D.range + o.r + 0.3, D.angle / 2 * Math.PI / 180, '#ffd166', 0.3, o.r + 0.2); Sfx.play('slash', o.pos);
    for (const u of o.bh.foes()) {
      if (!Geo.inSector(o.pos, V.ang(dir), D.range + o.r, D.angle / 2 * Math.PI / 180, u.pos, u.r)) continue;
      this.skillHit(o, u, lv(D.base, l) + (o.bonusAd || 0) * D.bad + (o.sp || 0) * lv(D.sp, l), 'D');
      if (u.dead) continue;
      FX.burst(u.pos, '#ffd166', 12, 6); FX.trail(u.pos, V.add(u.pos, V.mul(dir, D.knock)), '#ffd166', 0.5, 0.3);   // 밀려나는 길
      KU.knock(u, dir, D.knock, D.knockTime, () => {   // 벽꿍: 추가 피해 + 기절
        this.skillHit(o, u, lv(D.wallBase, l) + (o.bonusAd || 0) * D.wallBad + (o.sp || 0) * D.wallSp, 'D');
        if (u.applyCC('stun', lv(D.stun, l))) FX.text(u.pos, '벽꿍 기절!', '#ffffff', 15, { bold: true }); FX.addShake(7); FX.ring(u.pos, 0.2, 1.6, '#ffffff', 0.35, 0.16); FX.burst(u.pos, '#ffffff', 16, 6);
      });
    }
  },
  // ---------- 매 스텝 ----------
  update(o, dt) {
    const K = o.bh.K, l = o.bh.L('P');
    for (const q of o.bhT) if ((q.t -= dt) <= 0 && !q.done) { q.done = true; if (!o.dead) q.fn(); }
    o.bhT = o.bhT.filter(q => !q.done);
    for (const w of o.bhW) if ((w.t -= dt) <= 0 && !w.done) { w.done = true; if (!o.dead) this.wBlow(o, w); }
    o.bhW = o.bhW.filter(w => !w.done);
    if (o.bhD && (o.bhD.t += dt) > K.D.windup + 0.2) o.bhD = null;
    // Q: 강화 평타 대기 · 재사용 창 — 끝나면 쿨 시작
    if (o.bhQ && (o.bhQ.t -= dt) <= 0) { o.bhQ = null; o.bh.cdStart('Q'); }
    if (o.bhQ2 && (o.bhQ2.t += dt) > K.Q.recastAfter + K.Q.window) { o.bhQ2 = null; o.bh.cdStart('Q'); }
    // P 장판: 초당 피해 · 둔화 저항
    o.slowRes = o.bhAura > 0 ? lv(K.P.slowRes, l) : 0;
    if (o.bhAura > 0) {
      const C = o.bh.S.counts; if (C) C.bhAuraT = (C.bhAuraT || 0) + dt;   // 코칭: 장판 유지 시간
      o.bhAura -= dt; o.bhAuraAcc += dt;
      if (o.bhAuraAcc >= K.P.tick) {
        o.bhAuraAcc -= K.P.tick;
        FX.ring(o.pos, K.P.r * 0.5, K.P.r, '#3fd0c9', 0.35, 0.08);   // 장판 피해 맥박
        for (const u of o.bh.foes()) if (V.dist(u.pos, o.pos) <= K.P.r + u.r) o.bh.hit(u, (lv(K.P.base, l) + (o.bonusAd || 0) * K.P.bad + u.maxHp * lv(K.P.hpPct, l)) * K.P.tick, 'P', { tick: true });
      }
      if (o.bhAura <= 0) o.bhAura = 0;
    }
    // R 추가 체력 끝
    if (o.bhHp && (o.bhHp.t -= dt) <= 0) { o.maxHp -= o.bhHp.amt; o.hp = Math.min(o.hp, o.maxHp); o.bhHp = null; }
  },
  draw(o, ctx) {
    const K = o.bh.K, T = Game.time, CY = '#3fd0c9', PK = '#ff6b9d', top = -Math.PI / 2;
    const arc = (c, r, k, col, w, al) => { ctx.save(); ctx.strokeStyle = col; ctx.globalAlpha = al; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(c.x, c.y, r, top, top + Math.PI * 2 * k); ctx.stroke(); ctx.restore(); };
    // P: 장판(굵은 경계 + 바깥으로 번지는 고리) · 평소엔 발밑 신력 게이지(0~100)
    if (o.bhAura > 0) {
      KU.fill(ctx, o.pos, K.P.r, CY, 0.08 + 0.05 * Math.sin(T * 9));
      ctx.save(); ctx.strokeStyle = CY; ctx.globalAlpha = 0.75; ctx.lineWidth = 0.12; Draw.circle(ctx, o.pos.x, o.pos.y, K.P.r); ctx.stroke();
      const f = (T * 1.2) % 1; ctx.globalAlpha = 0.4 * (1 - f); ctx.lineWidth = 0.07; Draw.circle(ctx, o.pos.x, o.pos.y, K.P.r * (0.35 + 0.65 * f)); ctx.stroke(); ctx.restore();
      arc(o.pos, o.r + 0.42, o.bhAura / K.P.dur, CY, 0.1, 0.9);
    } else if (o.bhG > 0) { arc(o.pos, o.r + 0.42, 1, CY, 0.08, 0.18); arc(o.pos, o.r + 0.42, o.bhG / K.P.max, CY, 0.08, 0.75); }
    // Q: 강화 평타 대기 = 분홍 고리(맥동) · 2단계 대기 = 남은 시간 · 재사용 창 = 점선 + 남은 창
    if (o.bhQ) { KU.ring(ctx, o.pos, o.r + 0.2, PK, 0.6 + 0.35 * Math.sin(T * 10), false); arc(o.pos, o.r + 0.2, o.bhQ.t / K.Q.buffDur, PK, 0.12, 0.9); if (o.bhQ.stage === 2) KU.ring(ctx, o.pos, o.r + 0.32, PK, 0.6, false); }
    else if (o.bhQ2) { const ready = o.bhQ2.t >= K.Q.recastAfter; KU.ring(ctx, o.pos, o.r + 0.2, PK, ready ? 0.5 : 0.2, true); if (ready) arc(o.pos, o.r + 0.2, 1 - (o.bhQ2.t - K.Q.recastAfter) / K.Q.window, PK, 0.1, 0.85); }
    // W: 떨어질 자리 — 굵은 경계 + 차오르는 원 · 비형이 범위 안이면 밝게(보호막 받는 자리)
    for (const w of o.bhW) {
      const inside = V.dist(o.pos, w.pos) <= K.W.r + o.r, k = 1 - w.t / K.W.delay;
      ctx.save(); ctx.strokeStyle = '#5ff0e6'; ctx.globalAlpha = inside ? 0.95 : 0.65; ctx.lineWidth = inside ? 0.16 : 0.1; Draw.circle(ctx, w.pos.x, w.pos.y, K.W.r); ctx.stroke(); ctx.restore();
      KU.fill(ctx, w.pos, K.W.r * k, '#5ff0e6', 0.12 + 0.12 * k);
    }
    // E 도발: 도발당한 적과 이어진 선
    for (const u of o.bh.foes()) if (u.taunt > 0 && u.tauntBy === o) {
      ctx.save(); ctx.strokeStyle = '#ffd166'; ctx.globalAlpha = 0.5 + 0.3 * Math.sin(T * 14); ctx.lineWidth = 0.08; ctx.setLineDash([0.2, 0.12]); ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.lineTo(u.pos.x, u.pos.y); ctx.stroke(); ctx.restore();
      KU.ring(ctx, u.pos, u.r + 0.25, '#ffd166', 0.8, false);
    }
    // R: 착지 자리 — 경계 + 가운데(30% 더) + 도약 진행만큼 차오름 · 지금 있는 자리의 그림자
    if (o.bhR) {
      const k = clamp(o.bhR.t / K.R.leap, 0, 1);
      ctx.save(); ctx.strokeStyle = PK; ctx.globalAlpha = 0.85; ctx.lineWidth = 0.14; Draw.circle(ctx, o.bhR.to.x, o.bhR.to.y, K.R.r); ctx.stroke(); ctx.restore();
      KU.fill(ctx, o.bhR.to, K.R.r * k, PK, 0.15); KU.ring(ctx, o.bhR.to, K.R.core, '#ffd166', 0.8, false); KU.fill(ctx, o.bhR.to, K.R.core, '#ffd166', 0.1 + 0.15 * k);
      KU.fill(ctx, o.pos, o.r * (1 - 0.4 * Math.sin(Math.PI * k)), '#000000', 0.35);
    }
    // D 풀스윙 준비(0.42초): 휘두를 부채꼴이 차오름
    if (o.bhD) {
      const D = K.D, a0 = V.ang(o.bhD.dir), h = D.angle / 2 * Math.PI / 180, R = D.range + o.r, k = clamp(o.bhD.t / D.windup, 0, 1);
      ctx.save(); ctx.fillStyle = '#ffd166'; ctx.strokeStyle = '#ffd166';
      ctx.globalAlpha = 0.12; ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.arc(o.pos.x, o.pos.y, R, a0 - h, a0 + h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.lineWidth = 0.06; ctx.stroke();
      ctx.globalAlpha = 0.3; ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.arc(o.pos.x, o.pos.y, R * k, a0 - h, a0 + h); ctx.closePath(); ctx.fill(); ctx.restore();
    }
  },
};

// ============================== 플레이어 키트 ==============================
PKits.bihyung = {
  short: { Q: '뚝딱', W: '천벌', E: '내기', R: '신명', D: '풀스윙' },
  noAim: ['Q'],   // Q: 다음 평타 강화(재입력 = 2단계)
  def: { E: { moveCancel: false }, R: { moveCancel: false }, D: { moveCancel: false } },
  label(p, k) { if (k === 'Q' && BihyungCore.qReady2(p)) return '뚝딱 2'; return this.short[k]; },
  init(p) {
    p.melee = true;
    p.bh = { K: p.K, color: p.color, L: k => p.L(k), hit: (u, amt, k, o) => p.hitS(u, amt, k, o), foes: () => p.foes(), level: () => p.build.level || 1,
      cdStart: k => p.startCd(k), cdSet: (k, v) => { p.skills[k].cd = v; } };
    Object.defineProperty(p.bh, 'S', { get: () => p.S });
    BihyungCore.attach(p);
  },
  // 근접 평타: 투사체 없이 즉시
  fireAA(p, t) { p.aaLand(t); return true; },
  onAAHit(p, u) { BihyungCore.onAA(p, u); },
  reset(p) { if (p.bhHp) { p.maxHp -= p.bhHp.amt; p.hp = Math.min(p.hp, p.maxHp); } Object.assign(p, { bhG: 0, bhAura: 0, bhAuraAcc: 0, bhQ: null, bhQ2: null, bhW: [], bhR: null, bhHp: null, bhT: [], bhD: null, lift: 0, slowRes: 0 }); },
  recast(p, k) { return k === 'Q' && BihyungCore.qReady2(p); },
  instant(p, k) { if (k === 'Q' && BihyungCore.qReady2(p)) { BihyungCore.qCast(p); p.instantUsed('Q'); return true; } return false; },
  update(p, dt) {
    BihyungCore.update(p, dt);
    if (p.bhR && !(p.cast && p.cast.k === 'R')) BihyungCore.rStep(p, 99);   // 도약 시전이 끊기면(저지 불가 0.9초 뒤 기절 등) 남은 도약을 바로 마무리(착지) — 면역·피해 감소·공중 상태가 남지 않게
  },
  cast: {
    Q(p) { if (!BihyungCore.qCast(p)) return false; p.instantUsed('Q'); if (p.attackTarget == null) { const e = Game.nearestEnemy(p.pos, p.aaCfg().range + p.r + 0.8, p); if (e) p.attackTarget = e; } return true; },
    // W: 7m 안 지점 → 1.5초 뒤 폭발
    W(p, aim) {
      const W = p.K.W, pt = p.ptIn(aim, W.range);
      p.beginCast('W', pt, { windup: () => W.windup, recovery: () => 0.05, fire(q) { BihyungCore.wCast(q, pt); Sfx.play('throw'); } }, {});
      return true;
    },
    // E: 커서 방향 2.5~5.3m 돌진 → 처음 부딪힌 적 도발
    E(p, aim) {
      const E = p.K.E, dir = p.dirTo(aim), dist = V.dist(p.pos, aim);
      p.beginCast('E', aim, { windup: () => E.windup, recovery: () => 0.1,
        fire(q, c) { q.startCd('E'); c.data.st = BihyungCore.eStart(q, dir, dist); Sfx.play('dash'); },
        tick(q, c, dt) { return BihyungCore.eStep(q, c.data.st, dt) || c.t > 1; } }, {});
      return true;
    },
    // R: 5m 안 지점으로 도약
    R(p, aim) {
      p.beginCast('R', aim, { windup: () => 0, recovery: () => 0.15,
        fire(q) { BihyungCore.rStart(q, aim); },
        tick(q, c, dt) { return BihyungCore.rStep(q, dt); } }, {});
      return true;
    },
    // D 풀스윙: 0.42초 뒤 커서 방향 180°
    D(p, aim) {
      const D = p.K.D, dir = p.dirTo(aim); BihyungCore.dAim(p, dir);
      p.beginCast('D', aim, { windup: () => D.windup, recovery: () => 0.1, fire(q) { q.startCd('D'); q.facing = V.ang(dir); BihyungCore.dSwing(q, dir); } }, {});
      return true;
    },
  },
  shape(p, k) {
    const K = p.K;
    if (k === 'W') return { kind: 'circle', range: K.W.range, r: K.W.r };
    if (k === 'E') return { kind: 'line', len: K.E.max, width: K.E.width };
    if (k === 'R') return { kind: 'circle', range: K.R.range, r: K.R.r };
    if (k === 'D') return { kind: 'cone', len: K.D.range + p.r, angle: K.D.angle };
    return null;
  },
  draw(p, ctx) { BihyungCore.draw(p, ctx); },
  hud(p) {
    const K = p.K, b = [[p.bhAura > 0 ? `도깨비 불 ${fmt(p.bhAura, 1)}초` : `신력 ${Math.round(p.bhG)}/${K.P.max}`, p.bhAura > 0 ? '#3fd0c9' : '#8a93a6']];
    if (p.bhQ) b.push([p.bhQ.stage === 2 ? '뚝딱! 2단계 — 다음 평타' : '뚝딱! — 다음 평타', '#ff6b9d']);
    else if (p.bhQ2) b.push([BihyungCore.qReady2(p) ? `Q 재사용 ${fmt(K.Q.recastAfter + K.Q.window - p.bhQ2.t, 1)}초` : `Q 재사용 대기 ${fmt(K.Q.recastAfter - p.bhQ2.t, 1)}`, '#ff6b9d']);
    if (p.bhHp) b.push([`도깨비 감투 +${p.bhHp.amt} (${fmt(p.bhHp.t, 0)}초)`, p.color]);
    return b;
  },
};
