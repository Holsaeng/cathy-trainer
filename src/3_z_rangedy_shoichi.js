
// ============================== 플레이어블: 쇼이치 (단검 · 암살자) ==============================
// 플레이어 = 실험체 키트 틀(RangedPlayer + PKits.shoichi, 근접 평타) · AI = RangedDuelist + Kits.shoichi(4_d_shoichi_ai.js)
// 스킬 효과는 ShoichiCore를 플레이어·AI가 함께 씀 (주인 o의 어댑터 o.sh: K · L · hit · foes · cdStart · cdSet · cdGet · shot · level · color · S)
// 수치: CONFIG.rangedKits.shoichi (나무위키 + 공식 스킬 영상) · 근거 docs/er_notes_playables.md 15장 · ⚠ = 출처 없는 추정값
//   핵심 = 바닥 단검: 스킬(일반 Q·W 제외)이 단검을 남김 → 주우면(걸어서·W 경로) 5m 안 적에게 투척(협상 표식 대상 우선) · W로 주우면 W 쿨 초기화
//   P 부당거래: 스킬 적중마다 5초 중첩(최대 5) → 다음 평타 추가 피해 + 적 뒤에 단검
//   Q 표리: 앞 찌르기 → 적중 시 쿨 3초 감소 + 10초 동안 다음 Q 강화(부채꼴 + 정면에 단검)
//   W 비약: 적(등 뒤로) 또는 내 단검으로 순간 이동, 경로의 적에게 피해 · 단검을 주우면 쿨 초기화
//   E 협상: 뒤로 물러나며 단검 투척 → 피해 + 둔화 + 5초 표식(던진 단검 피해 +25%, 맞을 때마다 E 쿨 1초 감소, 처치 시 쿨 90% 감소) · 대상 뒤에 단검(0.75초 뒤 떨어짐)
//   R 무자비: 0.3초 휘두르기 → 주변 2.5m 피해 + 둔화 → 고정 방향 4곳에 단검 투척(경로 피해) → 단검 4개
//   D 망토와 단검(단검 무기 스킬): 1차 이속 → 3초 안 2차 대상 뒤로 이동 + 현재 체력 비례 피해 + 둔화

const ShoichiCore = {
  attach(o) {
    Object.assign(o, { shDags: [], shSeq: 0, shStk: 0, shStkT: 0, shQ2: 0, shMark: null, shD: null, shT: [] });
  },
  later(o, t, fn) { o.shT.push({ t, fn }); },
  isFoeUnit(u) { return isHero(u) || u.kind === 'dummy'; },
  // ---------- P 부당거래 중첩 ----------
  stack(o, u) {
    if (!u || !this.isFoeUnit(u)) return;
    const P = o.sh.K.P, was = o.shStk; o.shStk = Math.min(P.max, o.shStk + 1); o.shStkT = P.stackDur;
    if (was < P.max && o.shStk >= P.max) FX.ring(o.pos, o.r, o.r + 0.6, '#ff4d4d', 0.3, 0.1);
  },
  // 스킬 피해 + 중첩 (투척 단검은 중첩 X)
  skillHit(o, u, amt, k, opt, stack = true) { if (!u || u.dead) return; o.sh.hit(u, amt, k, opt); if (stack) this.stack(o, u); },
  // ---------- 바닥 단검 ----------
  spawn(o, pos, fall = 0) {
    const D = o.sh.K.dagger, p = Geo.pushOut(V.copy(pos), 0.25);
    p.x = clamp(p.x, 0.4, CONFIG.world.w - 0.4); p.y = clamp(p.y, 0.4, CONFIG.world.h - 0.4);
    o.shDags.push({ pos: p, land: fall, t: D.life + fall, id: ++o.shSeq }); o.sh.S.count('shDagOn');   // 코칭: 깔린 단검 수
    if (fall <= 0) FX.ring(p, 0.1, D.pickR, '#ff6b6b', 0.25, 0.08);
  },
  landed(d) { return d.land <= 0; },
  // 줍기: W 쿨 초기화 + 5m 안 적에게 투척(표식 대상 우선)
  pick(o, d) {
    const i = o.shDags.indexOf(d); if (i < 0) return; o.shDags.splice(i, 1);
    const DK = o.sh.K.dagger, P = o.sh.K.P, lP = o.sh.L('P');
    o.sh.cdSet('W', 0); o.sh.S.count('shPick');
    FX.burst(d.pos, '#ff9f9f', 6, 3);
    const foes = o.sh.foes().filter(u => V.dist(u.pos, o.pos) <= DK.throwR + u.r && Vision.visible(o, u));
    const M = o.shMark, t = (M && foes.includes(M.u)) ? M.u : foes.sort((a, b) => V.dist(a.pos, o.pos) - V.dist(b.pos, o.pos))[0];
    if (!t) return;
    const amt = lv(P.dagger, lP) + (o.sp || 0) * P.daggerSp;
    const pr = o.sh.shot({ from: V.copy(d.pos), dir: V.norm(V.sub(t.pos, d.pos)), speed: DK.throwSpeed, range: 99, home: t, only: t, width: 0.3, len: 0.6, color: '#ff6b6b', onHit: u => {
      const marked = o.shMark && o.shMark.u === u;
      this.skillHit(o, u, amt * (marked ? 1 + o.sh.K.E.markAmp : 1), 'P', { name: '부당거래 단검' }, false);
      if (marked) { o.shMark.t = o.sh.K.E.markDur; o.sh.cdSet('E', Math.max(0, o.sh.cdGet('E') - o.sh.K.E.markCut)); }
    } });
    if (pr) pr.look = 'knife';
  },
  // ---------- 평타 적중: 5중첩이면 추가 피해 + 적 뒤 단검 ----------
  aaHit(o, u) {
    const P = o.sh.K.P; if (o.shStk < P.max || !this.isFoeUnit(u) || u.dead) return;
    const l = o.sh.L('P'); o.shStk = 0; o.shStkT = 0; o.sh.S.count('shPassive');
    o.sh.hit(u, lv(P.base, l) + (o.sp || 0) * P.sp + u.maxHp * lv(P.hpPct, l), 'P', { name: '부당거래' });
    FX.ring(u.pos, 0.2, 1.1, '#ff4d4d', 0.3, 0.12); FX.text(u.pos, '부당거래', '#ff6b6b', 12, { bold: true });
    this.spawn(o, V.add(u.pos, V.mul(V.norm(V.sub(u.pos, o.pos)), u.r + P.behind)), P.fall);
  },
  // ---------- Q 표리 ----------
  qCast(o, dir) {
    const Q = o.sh.K.Q, l = o.sh.L('Q'), enh = o.shQ2 > 0, a = V.ang(dir), amt = lv(Q.base, l) + (o.sp || 0) * Q.sp; let hit = false;
    for (const u of o.sh.foes()) {
      const inA = enh ? Geo.inSector(o.pos, a, Q.len2 + o.r, Q.angle2 / 2 * Math.PI / 180, u.pos, u.r)
        : (() => { const rel = V.sub(u.pos, o.pos), al = V.dot(rel, dir), s = Math.abs(rel.x * dir.y - rel.y * dir.x); return al >= -u.r && al <= Q.len + o.r + u.r && s <= Q.width / 2 + u.r; })();
      if (!inA) continue; this.skillHit(o, u, amt, 'Q'); if (this.isFoeUnit(u)) hit = true;
    }
    if (enh) FX.slash(o.pos, a, Q.len2 + o.r, Q.angle2 / 2 * Math.PI / 180, '#ff4d4d', 0.22, o.r * 0.5);
    else FX.slash(o.pos, a, Q.len + o.r, 0.3, '#ff9f9f', 0.16, o.r * 0.5);
    o.sh.cdStart('Q');
    if (enh) { o.shQ2 = 0; this.spawn(o, V.add(o.pos, V.mul(dir, Q.front))); }   // 강화 Q: 정면에 단검(얇은 벽 너머 가능 — 벽 안이면 밖으로 밀어냄)
    if (hit) { o.sh.cdSet('Q', Math.max(0, o.sh.cdGet('Q') - Q.cut)); o.shQ2 = Q.enhDur; }
    return hit;
  },
  // ---------- W 비약: 순간 이동 + 경로 피해 + 경로의 단검 줍기 ----------
  // to = { dagger } 또는 { unit }
  wGo(o, to) {
    const W = o.sh.K.W, l = o.sh.L('W'), from = V.copy(o.pos);
    let dest;
    if (to.dagger) dest = V.copy(to.dagger.pos);
    else { const u = to.unit, dir = V.dist(u.pos, from) > 0.05 ? V.norm(V.sub(u.pos, from)) : V.fromAng(o.facing); dest = Geo.pushOut(V.add(u.pos, V.mul(dir, u.r + o.r + W.behind - 0.5)), o.r); }
    o.sh.cdStart('W'); o.sh.S.count('shW');
    const amt = lv(W.base, l) + (o.sp || 0) * W.sp; let hitHero = false;
    for (const u of o.sh.foes()) if (Geo.segDist(u.pos, from, dest) <= W.width / 2 + u.r) { this.skillHit(o, u, amt, 'W'); if (isHero(u) || u.kind === 'dummy') hitHero = true; }
    if (hitHero) o.sh.S.count('shWHit');
    o.pos = dest; o.facing = V.ang(V.sub(dest, from)); o.moveTarget = null;
    FX.trail(from, dest, '#7fa8ff', 0.6, 0.3); FX.burst(dest, '#9fc0ff', 8, 4);
    for (const d of o.shDags.slice()) if (this.landed(d) && Geo.segDist(d.pos, from, dest) <= o.sh.K.dagger.pickR + 0.2) this.pick(o, d);
    return hitHero;
  },
  // ---------- E 협상 ----------
  eFire(o, dir) {
    const E = o.sh.K.E, l = o.sh.L('E'), amt = lv(E.base, l) + (o.sp || 0) * E.sp;
    o.sh.cdStart('E');
    const pr = o.sh.shot({ dir, speed: E.speed, range: E.range, width: E.width, len: 0.7, color: '#ff6b6b', onHit: u => {
      this.skillHit(o, u, amt, 'E'); u.addSlow(lv(E.slow, l), E.slowDur);
      if (this.isFoeUnit(u)) { o.shMark = { u, t: E.markDur }; FX.text(u.pos, '협상', '#ff6b6b', 12, { bold: true }); o.sh.S.count('shE'); }
      this.spawn(o, V.add(u.pos, V.mul(dir, u.r + E.behind)), E.fall);
    } });
    if (pr) pr.look = 'knife';
  },
  // ---------- R 무자비 ----------
  rFire(o) {
    const R = o.sh.K.R, l = o.sh.L('R'), c = V.copy(o.pos);
    FX.ring(c, 0.4, R.r, '#ff4d4d', 0.35, 0.16); FX.slash(c, o.facing, R.r, Math.PI, '#ff6b6b', 0.25, 0.5);
    if (o === Game.player) FX.addShake(4);
    for (const u of o.sh.foes()) if (V.dist(u.pos, c) <= R.r + u.r) { this.skillHit(o, u, lv(R.base, l) + (o.sp || 0) * R.sp, 'R'); u.addSlow(R.slow, R.slowDur); }
    R.angles.forEach((deg, i) => this.later(o, R.gap * i, () => {
      const dir = V.fromAng(deg * Math.PI / 180), len = Geo.clampDash(c, dir, R.dRange, 0.2), blocked = len < R.dRange - 0.1, end = V.add(c, V.mul(dir, len));
      FX.trail(c, end, '#ff6b6b', 0.25, 0.2);
      for (const u of o.sh.foes()) if (Geo.segDist(u.pos, c, end) <= R.dWidth / 2 + u.r) this.skillHit(o, u, lv(R.dBase, l) + (o.sp || 0) * R.dSp, 'R', { name: '무자비 단검' });
      this.spawn(o, blocked ? V.copy(o.pos) : end, 0.12);   // 벽에 막히면 발밑에(벽궁)
    }));
  },
  // ---------- D 망토와 단검 2차: 대상 뒤로 + 현재 체력 비례 ----------
  dHit(o, u) {
    const D = o.sh.K.D, l = o.sh.L('D'), from = V.copy(o.pos), dir = V.dist(u.pos, from) > 0.05 ? V.norm(V.sub(u.pos, from)) : V.fromAng(o.facing);
    o.pos = Geo.pushOut(V.add(u.pos, V.mul(dir, u.r + o.r + 0.2)), o.r); o.facing = V.ang(V.mul(dir, -1));
    FX.trail(from, o.pos, '#b18cff', 0.3, 0.25);
    this.skillHit(o, u, lv(D.dmg, l) + (o.bonusAd || 0) * D.bad + (o.sp || 0) * D.sp + u.hp * D.curHp, 'D');
    u.addSlow(lv(D.slow, l), D.slowDur);
    for (const d of o.shDags.slice()) if (this.landed(d) && V.dist(d.pos, o.pos) <= o.sh.K.dagger.pickR + o.r) this.pick(o, d);   // 대상 뒤 단검 바로 줍기
  },
  // ---------- 매 스텝 ----------
  update(o, dt) {
    const K = o.sh.K;
    for (const q of o.shT) if ((q.t -= dt) <= 0 && !q.done) { q.done = true; if (!o.dead) q.fn(); }
    o.shT = o.shT.filter(q => !q.done);
    if (o.shStkT > 0 && (o.shStkT -= dt) <= 0) o.shStk = 0;
    if (o.shQ2 > 0) o.shQ2 = Math.max(0, o.shQ2 - dt);
    const M = o.shMark;
    if (M) { if (M.u.dead) { o.sh.cdSet('E', o.sh.cdGet('E') * (1 - K.E.killCut)); o.shMark = null; } else if ((M.t -= dt) <= 0) o.shMark = null; }
    if (o.shD && (o.shD.t -= dt) <= 0) { o.shD = null; o.sh.cdStart('D'); }
    for (const d of o.shDags) { if (d.land > 0 && (d.land -= dt) <= 0) FX.ring(d.pos, 0.1, K.dagger.pickR, '#ff6b6b', 0.25, 0.08); d.t -= dt; }
    o.shDags = o.shDags.filter(d => d.t > 0);
    if (!o.dead) for (const d of o.shDags.slice()) if (this.landed(d) && V.dist(d.pos, o.pos) <= K.dagger.pickR + o.r * 0.5) this.pick(o, d);   // 걸어서 줍기
  },
  // ---------- 그리기 ----------
  draw(o, ctx, mine) {
    const K = o.sh.K, T = Game.time;
    for (const d of o.shDags) {
      if (!mine && !Vision.pointVisible(d.pos)) continue;
      if (!this.landed(d)) { const k = clamp(1 - d.land / 0.75, 0, 1); ctx.save(); ctx.strokeStyle = '#ff6b6b'; ctx.globalAlpha = 0.5; ctx.lineWidth = 0.06; ctx.setLineDash([0.12, 0.1]); Draw.circle(ctx, d.pos.x, d.pos.y, K.dagger.pickR * (1.6 - 0.6 * k)); ctx.stroke(); ctx.restore(); continue; }   // 떨어지는 중
      if (mine) { ctx.save(); ctx.strokeStyle = '#7fa8ff'; ctx.globalAlpha = 0.16; ctx.lineWidth = 0.05; Draw.circle(ctx, d.pos.x, d.pos.y, K.W.range); ctx.stroke(); ctx.restore(); }   // 이 단검에서 W가 닿는 거리
      const fade = d.t < 1.5 ? 0.4 + 0.4 * Math.sin(T * 14) : 0.9;
      KU.fill(ctx, d.pos, K.dagger.pickR, '#3d6dff', 0.18); KU.ring(ctx, d.pos, K.dagger.pickR, '#7fa8ff', fade, false);
      ctx.save(); ctx.strokeStyle = '#ff4d4d'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.moveTo(d.pos.x - 0.12, d.pos.y + 0.18); ctx.lineTo(d.pos.x + 0.12, d.pos.y - 0.18); ctx.stroke(); ctx.restore();   // 꽂힌 단검
    }
    if (o.shStk >= K.P.max) KU.ring(ctx, o.pos, o.r + 0.18, '#ff4d4d', 0.55 + 0.35 * Math.sin(T * 10), false);   // 5중첩: 발밑 붉은 오라(다음 평타 강화)
    if (o.shQ2 > 0) KU.ring(ctx, o.pos, o.r + 0.32, '#ff9f9f', 0.5, true);   // 강화 Q 준비(가방이 붉게)
    const M = o.shMark;
    if (M && !M.u.dead && (mine || Vision.visible(Game.player, M.u))) { const u = M.u; KU.ring(ctx, u.pos, u.r + 0.3, '#ff6b6b', 0.85, false); ctx.save(); ctx.strokeStyle = '#ff6b6b'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * clamp(M.t / K.E.markDur, 0, 1)); ctx.stroke(); ctx.restore(); }
  },
};

// ============================== 플레이어 키트 ==============================
PKits.shoichi = {
  short: { Q: '표리', W: '비약', E: '협상', R: '무자비', D: '망토' },
  noAim: ['R'],
  def: { W: { moveCancel: false }, E: { moveCancel: false }, R: { moveCancel: false }, D: { moveCancel: false } },
  label(p, k) { if (k === 'Q' && p.shQ2 > 0) return '표리 강화'; if (k === 'D' && p.shD) return '단검'; return this.short[k]; },
  init(p) {
    p.melee = true;
    p.sh = { K: p.K, color: p.color, L: k => p.L(k), hit: (u, amt, k, o) => p.hitS(u, amt, k, o), foes: () => p.foes(), level: () => p.build.level || 1,
      cdStart: k => p.startCd(k), cdSet: (k, v) => { p.skills[k].cd = v; }, cdGet: k => p.skills[k].cd, shot: o => p.shot(o) };
    Object.defineProperty(p.sh, 'S', { get: () => p.S });
    ShoichiCore.attach(p);
  },
  fireAA(p, t) { p.aaLand(t); return true; },   // 근접 평타
  onAAHit(p, u) { ShoichiCore.aaHit(p, u); },
  reset(p) { ShoichiCore.attach(p); },
  recast(p, k) { return k === 'D' && !!p.shD; },
  // E 뒤로 빠지는 동작(0.3초 뒤) 중 W·R·D = 캔슬
  instant(p, k, aim) {
    if (p.cast && p.cast.k === 'E' && p.cast.phase === 'recovery' && ['W', 'R', 'D'].includes(k)) { p.cast = null; return false; }
    return false;
  },
  update(p, dt) { ShoichiCore.update(p, dt); },
  // W 대상: 커서 근처(1.2m) 내 단검 우선 → 커서 위 적
  wTarget(p, aim) {
    const W = p.K.W, ds = p.shDags.filter(d => ShoichiCore.landed(d) && V.dist(d.pos, p.pos) <= W.range + 0.3 && V.dist(d.pos, aim) <= W.pickAim).sort((a, b) => V.dist(a.pos, aim) - V.dist(b.pos, aim));
    if (ds.length) return { dagger: ds[0] };
    const u = Game.pickEnemyAt(aim, CONFIG.input.pickRadius, p);
    if (u && u.kind !== 'ward' && !(u.untargetable > 0) && Vision.visible(p, u) && V.dist(p.pos, u.pos) - u.r <= W.range) return { unit: u };
    return null;
  },
  cast: {
    Q(p, aim) {
      const Q = p.K.Q;
      p.beginCast('Q', aim, { windup: () => Q.windup, recovery: () => 0.1, fire(q, c) { ShoichiCore.qCast(q, c.dir); Sfx.play('slash', q.pos); } }, {});
      return true;
    },
    // W: 단검(커서 근처) 또는 적에게 순간 이동 — 시전 시간 없음
    W(p, aim) {
      const to = PKits.shoichi.wTarget(p, aim);
      if (!to) { FX.toastFor(p, '비약: 사거리(5.5m) 안의 단검이나 적을 지정하세요', '#aaa'); Sfx.playFor(p, 'error'); return false; }
      ShoichiCore.wGo(p, to); p.instantUsed('W'); Sfx.play('blink'); return true;
    },
    // E: 커서 방향 투척 → 뒤로 물러남(0.3초 뒤 다른 스킬로 캔슬)
    E(p, aim) {
      const E = p.K.E;
      p.beginCast('E', aim, { windup: () => E.windup, recovery: () => E.lock,
        fire(q, c) { ShoichiCore.eFire(q, c.dir); Sfx.play('throw'); const back = V.mul(c.dir, -1); c.data.from = V.copy(q.pos); c.data.to = V.add(q.pos, V.mul(back, Geo.clampDash(q.pos, back, E.back, q.r))); },
        tick(q, c) { const k = Math.min(1, c.t / E.backTime); q.pos = V.lerp(c.data.from, c.data.to, k); return k >= 1; } }, {});
      return true;
    },
    // R: 제자리 0.3초 휘두르기 → 주변 피해 + 단검 4개
    R(p) {
      const R = p.K.R;
      p.beginCast('R', p.pos, { windup: () => R.windup, recovery: () => 0.1, start(q) { FX.text(q.pos, R.name, q.color, 14, { bold: true }); }, fire(q) { q.startCd('R'); ShoichiCore.rFire(q); Sfx.play('ult'); } }, {});
      return true;
    },
    // D 망토와 단검: 1차 = 이속 1초(3초 안 재입력) · 2차 = 대상(2.5m) 뒤로
    D(p, aim) {
      const D = p.K.D;
      if (!p.shD) { p.shD = { t: D.window }; p.addMsBuff(lv(D.ms, p.L('D')), D.msDur, false, 'shD'); p.instantUsed('D'); FX.text(p.pos, '망토', p.color, 12, { bold: true }); Sfx.play('blink'); return true; }
      const t = p.targetAt(aim, 'D'); if (!t) return false;
      return p.chaseCast('D', t, D.range, () => {
        p.beginCast('D', t.pos, { windup: () => D.windup, recovery: () => 0.1, fire(q) { if (t.dead) return; ShoichiCore.dHit(q, t); q.shD = null; q.startCd('D'); Sfx.play('aa'); } }, {});
      });
    },
  },
  shape(p, k) {
    const K = p.K;
    if (k === 'Q') return p.shQ2 > 0 ? { kind: 'cone', len: K.Q.len2 + p.r, angle: K.Q.angle2 } : { kind: 'line', len: K.Q.len + p.r, width: K.Q.width };
    if (k === 'W') return { kind: 'circle', range: K.W.range, r: 0.5 };
    if (k === 'E') return { kind: 'line', len: K.E.range, width: K.E.width };
    if (k === 'R') return { kind: 'self', r: K.R.r };
    if (k === 'D') return p.shD ? { kind: 'target', range: K.D.range } : null;
    return null;
  },
  draw(p, ctx) { ShoichiCore.draw(p, ctx, true); },
  hud(p) {
    const K = p.K, b = [[p.shStk >= K.P.max ? '부당거래 5 — 다음 평타 강화' : `부당거래 ${p.shStk}/${K.P.max}`, p.shStk >= K.P.max ? '#ff6b6b' : '#8a93a6']];
    const n = p.shDags.filter(d => ShoichiCore.landed(d)).length; if (n) b.push([`단검 ${n}개 (W로 주우면 쿨 초기화)`, '#7fa8ff']);
    if (p.shQ2 > 0) b.push([`표리 강화 ${fmt(p.shQ2, 1)}`, '#ff9f9f']);
    if (p.shMark) b.push([`협상 표식 ${fmt(p.shMark.t, 1)}`, '#ff6b6b']);
    if (p.shD) b.push([`망토 → 단검(D) ${fmt(p.shD.t, 1)}`, '#b18cff']);
    return b;
  },
};
