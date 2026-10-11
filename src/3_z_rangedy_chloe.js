
// ============================== 플레이어블: 클로에 (암기) + 인형 니나 ==============================
// 클로에 = 원거리 실험체 틀(RangedPlayer + PKits.chloe) · AI 클로에 = RangedDuelist + Kits.chloe(4_d_chloe_ai.js)
// 니나 = 클로에를 따라다니는 별도 유닛(Doll, kind 'doll' — 실험체 판정 아님). 니나·스킬 효과는 ChloeCore를 플레이어·AI가 함께 씀
//   주인(o)은 o.ch(어댑터)로 쿨·피해·대상만 알려 줌 → 같은 규칙으로 동작
// 수치: CONFIG.rangedKits.chloe (나무위키 2026-10-05 + 12.2 버프) · 근거 docs/er_notes_playables.md 10장 · ⚠ = 출처 없는 추정값
// 니나 조종(플레이어): Alt + 우클릭(또는 휠 클릭) — 적 = 그 적 공격 · 클로에 = 따라다니기만(공격 안 함) · 바닥 = 그 지점으로(도착 전엔 클로에 명령 무시)
//   기본: 클로에가 평타하는 대상을 같이 공격 · 클로에에게서 10m 넘게 떨어지면 클로에 옆으로 순간이동
//   소멸: 일정 시간 뒤 클로에 현재 체력 20%를 써서 니나 최대 체력 80%로 부활 · 죽어 있는 동안 Q·R 불가, E 재사용 불가, W 에어본 없음

class Doll extends Unit {
  constructor(owner) {
    const K = CONFIG.rangedKits.chloe;
    super({ team: owner.team, x: owner.pos.x - 0.6, y: owner.pos.y + 0.8, r: K.P.r, hp: 1000, def: 0, ms: owner.baseMs, color: '#f7c6dc', name: '니나', kind: 'doll', facing: owner.facing });
    Geo.pushOut(this.pos, this.r);
    Object.assign(this, { owner, K, mode: 'follow', goal: null, order: null, aaCd: 0, swing: null, dash: null, asB: 0, msB: 0, respawnT: 0, busyT: 0 });
    this.refresh(true);
  }
  // 통계: 니나의 공격은 클로에 이름으로 넣으므로(클로에 기록) 니나 자체 통계(받은 피해 등)는 버림 — Unit 기본(NullStats)
  // 니나 능력치 = 클로에의 (60% + 레벨당 2%) + 패시브 레벨별 추가
  ratio() { const P = this.K.P; return Math.min(1, P.ratio + P.ratioLv * this.owner.ch.level()); }
  refresh(full) {
    const o = this.owner, P = this.K.P, k = this.ratio(), L = o.ch.L('P'), hp0 = this.maxHp;
    this.ad = o.ad * k + lv(P.bonusAd, L); this.def = o.def * k + lv(P.bonusDef, L);
    this.critChance = (o.critChance || 0) * k; this.sp = (o.sp || 0) * k; this.penPct = o.ch.pen() * k;
    this.maxHp = Math.round(o.maxHp * k + lv(P.bonusHp, L)); this.regen = o.regen || 0;
    if (full) this.hp = this.maxHp; else if (hp0 && hp0 !== this.maxHp) this.hp = Math.min(this.maxHp, this.hp * this.maxHp / hp0);
  }
  speed() { const o = this.owner; return (o.baseMs + ItemFx.msFlat(o)) * (1 + this.msB) * this.msMul(); }   // 클로에 이속에 비례
  atkSpd() { return this.K.P.as * (1 + this.asB); }
  canMove() { return super.canMove() && !this.dash && !(this.busyT > 0); }   // busyT: W 내려찍기 준비(제자리)
  foes() { return Game.units.filter(u => u.team !== this.team && u.team !== 2 && !u.dead && u.kind !== 'ward' && !(u.untargetable > 0)); }
  // 클로에 옆(약간 뒤) 자리
  followSpot() {
    const o = this.owner, back = V.fromAng(o.facing + Math.PI * 0.75);
    return Geo.pushOut(V.add(o.pos, V.mul(back, this.K.P.follow)), this.r);
  }
  teleportNear() { this.pos = this.followSpot(); this.moveTarget = null; this.swing = null; FX.ring(this.pos, 0.2, 0.9, this.color, 0.35); }
  update(dt) {
    this.tickStatus(dt); if (this.dead) return;
    const o = this.owner, P = this.K.P;
    if (o.dead) { this.hp = 0; this.dead = true; return; }
    if (this.aaCd > 0) this.aaCd -= dt;
    if (this.busyT > 0) { this.busyT -= dt; this.vel = { x: 0, y: 0 }; return; }
    // E2 돌진: 클로에 쪽으로 날아가며 경로의 적에게 피해 (지형 통과)
    const D = this.dash;
    if (D) {
      D.t += dt; const k = Math.min(1, D.t / D.dur), prev = V.copy(this.pos); this.pos = V.lerp(D.from, D.to, k);
      for (const u of this.foes()) if (!D.hit.has(u.id) && Geo.segDist(u.pos, prev, this.pos) <= u.r + D.width / 2) { D.hit.add(u.id); if (D.onHit) D.onHit(u); }
      if (k >= 1) { this.dash = null; Geo.pushOut(this.pos, this.r); }
      return;
    }
    if (V.dist(this.pos, o.pos) > P.leash) { this.teleportNear(); if (this.mode === 'point') this.mode = 'idle'; }   // 10m 넘게 떨어지면 클로에 옆으로
    // 평타 휘두르기(선딜 → 타격)
    if (this.swing) {
      const S = this.swing; S.t += dt;
      if (!this.canAct() || S.target.dead) this.swing = null;
      else if (S.t >= P.windup / Math.max(0.5, this.atkSpd())) { this.swing = null; this.aaCd = 1 / this.atkSpd(); if (V.dist(this.pos, S.target.pos) - S.target.r - this.r <= P.range + 0.6) ChloeCore.ninaHit(o, this, S.target); }
    }
    // 대상: 명령한 적 > 클로에가 평타하는 대상 (지점 이동 중·클로에 지정이면 공격 안 함)
    let tgt = null;
    if (this.mode === 'enemy') { const t = this.order; if (!t || t.dead || t.untargetable > 0 || !Vision.visible(o, t)) this.mode = 'idle'; else tgt = t; }
    if (this.mode === 'follow' || this.mode === 'idle') tgt = o.ch.target();
    if (this.mode === 'point') { this.moveTarget = this.goal; if (V.dist(this.pos, this.goal) < 0.2) { this.mode = 'idle'; this.moveTarget = null; } }
    else if (tgt) {
      const d = V.dist(this.pos, tgt.pos) - tgt.r - this.r; this.facing = V.ang(V.sub(tgt.pos, this.pos));
      if (d <= P.range) { this.moveTarget = null; if (!this.swing && this.aaCd <= 0 && this.canAct()) this.swing = { t: 0, target: tgt }; }
      else this.moveTarget = V.copy(tgt.pos);
    } else if (this.mode === 'follow' || this.mode === 'self') {
      const s = this.followSpot(); this.moveTarget = V.dist(this.pos, s) > 0.5 ? s : null;
    } else this.moveTarget = null;
    this.moveStep(dt);
  }
}

// ============================== 클로에 공통 규칙 (플레이어·AI) ==============================
// 주인 o의 어댑터 o.ch: K · L(k) · hit(u, 양, 키, 옵션) · foes() · cdStart(k) · cdMul(k, 배) · cdSet(k, 값) · level() · pen() · target() · noAA(초) · color · S
const ChloeCore = {
  attach(o) {
    Object.assign(o, { nina: null, spin: null, eRe: null, link: null, chPick: null, traps: [], lastAAT: null, chT: [], chSeq: 0 });
    o.nina = new Doll(o); Game.units.push(o.nina);
    o.linkFn = () => o.link && o.nina && !o.nina.dead ? { u: o.nina, hit: o.ch.K.R.hitShare, share: o.ch.K.R.linkShare } : null;
    o.nina.linkFn = () => o.link && !o.dead ? { u: o, hit: o.ch.K.R.hitShare, share: o.ch.K.R.linkShare } : null;
  },
  up(o) { return !!(o.nina && !o.nina.dead); },
  later(o, t, fn) { o.chT.push({ t, fn }); },
  // 니나 평타: 클로에가 2번 이상 평타한 대상이면 찌르기 추가 피해(표식 터뜨림)
  ninaHit(o, n, u) {
    const crit = rnd() < n.critChance, mul = o.diff ? o.diff.dmgMul : 1;
    Combat.damage(o, u, n.ad * (crit ? 1.75 : 1) * mul, { type: 'normal', source: o.diff ? '적 니나' : 'Nina', crit, pen: n.penPct });
    FX.burst(u.pos, n.color, 4, 3);
    const P = o.ch.K.P;
    if (u.chloeBy === o && u.chloeMarks >= P.marks && Game.time - u.chloeT < 5) { u.chloeMarks = 0; o.ch.hit(u, lv(P.stab, o.ch.L('P')) + n.ad * P.stabAd, 'P', { pen: n.penPct, hid: 'P:' + Game.time }); FX.text(u.pos, '찌르기', n.color, 12, { bold: true }); }
  },
  onAAHit(o, u) {
    o.lastAAT = { u, t: Game.time };
    u.chloeMarks = (u.chloeBy === o && Game.time - (u.chloeT || -99) < 5 ? u.chloeMarks || 0 : 0) + 1; u.chloeBy = o; u.chloeT = Game.time;
  },
  e2Ready(o) { return !!(o.eRe && Game.time - o.eRe.t0 >= o.ch.K.E.recastAfter && this.up(o)); },
  // ---------- 스킬 효과 ----------
  // Q 공격 명령: 니나 주변 반경 2.5m 베기 + 둔화 (0.2초 뒤 판정, 클로에 행동은 막지 않음, 니나 평타 초기화)
  q(o) {
    const n = o.nina, Q = o.ch.K.Q; if (!this.up(o)) return false;
    o.ch.cdStart('Q'); n.swing = null; n.aaCd = 0; const cid = ++o.chSeq, l = o.ch.L('Q');
    FX.ring(n.pos, 0.3, Q.radius, n.color, 0.25);
    this.later(o, Q.delay, () => {
      if (n.dead) return; FX.ring(n.pos, Q.radius * 0.6, Q.radius, '#ffffff', 0.25); let hit = false;
      for (const u of n.foes()) if (V.dist(u.pos, n.pos) <= Q.radius + u.r) { hit = true; o.ch.hit(u, lv(Q.base, l) + n.ad * Q.ninaAd, 'Q', { pen: n.penPct, hid: 'Q:' + cid }); u.addSlow(lv(Q.slow, l), Q.slowDur); }
      o.ch.S.resolveShot('Q', hit);
    });
    return true;
  },
  // W 1단계: 3초 회전 (주변 고정 피해 · 둔화, 평타 불가 · Q·E만 사용 가능)
  w1(o) { o.spin = { t: o.ch.K.W.spin, acc: 0, id: ++o.chSeq, t0: Game.time }; FX.text(o.pos, o.ch.K.W.name, o.ch.color, 12, { bold: true }); Sfx.play('click'); },
  // W 2단계: 지점(6.5m)에 칼날 자수 → 니나 순간이동 내려찍기(에어본) → 자수가 클로에 쪽으로 튕김
  w2(o, aim) {
    const W = o.ch.K.W, l = o.ch.L('W'), d = Math.min(W.range, V.dist(o.pos, aim)), dir = d > 0.05 ? V.norm(V.sub(aim, o.pos)) : V.fromAng(o.facing);
    const pt = Geo.pushOut(V.add(o.pos, V.mul(dir, d)), 0.2), id = o.spin ? o.spin.id : ++o.chSeq; o.spin = null; o.ch.cdStart('W'); Sfx.play('throw'); o.facing = V.ang(dir);
    FX.text(pt, '칼날 자수', o.ch.color, 12, { bold: true });
    this.later(o, W.throwTime, () => {
      FX.ring(pt, 0.3, W.r, o.ch.color, 0.3); let hit = false;
      for (const u of o.ch.foes()) if (V.dist(u.pos, pt) <= W.r + u.r) { hit = true; o.ch.hit(u, lv(W.base, l) + o.ad * W.ad, 'W', { hid: 'W2:' + id }); u.addSlow(lv(W.slow, l), W.slowDur); }
      o.ch.S.resolveShot('W', hit);
      const n = o.nina; if (!this.up(o) || n.root > 0 || n.stun > 0) return;   // 니나가 이동 방해를 받았으면 내려찍기 없음
      n.pos = V.copy(pt); n.dash = null; n.swing = null; n.moveTarget = null; n.busyT = W.slamDelay; FX.ring(pt, 0.2, 1, n.color, 0.3);
      this.later(o, W.slamDelay, () => {
        if (n.dead) return; FX.ring(n.pos, 0.5, W.slamR, '#ffffff', 0.35);
        for (const u of n.foes()) if (V.dist(u.pos, n.pos) <= W.slamR + u.r) { o.ch.hit(u, lv(W.slam, l) + n.ad * W.slamAd, 'W', { pen: n.penPct, hid: 'W3:' + id }); if (u.applyCC('stun', W.airborne)) { u.airborneT = Game.time + W.airborne; FX.text(u.pos, '에어본', '#ffd166', 12, { bold: true }); } }
        const back = V.dist(o.pos, n.pos) > 0.1 ? V.norm(V.sub(o.pos, n.pos)) : { x: 1, y: 0 };
        o.chPick = { pos: Geo.pushOut(V.add(n.pos, V.mul(back, Math.min(W.bounce, V.dist(o.pos, n.pos)))), 0.2), t: W.pickLife };
      });
    });
  },
  // E 1단계 경로 피해 (돌진 시작점 → 끝점)
  e1Hits(o, from, to) { const E = o.ch.K.E, cid = ++o.chSeq; for (const u of o.ch.foes()) if (Geo.segDist(u.pos, from, to) <= u.r + E.width / 2) o.ch.hit(u, lv(E.base, o.ch.L('E')) + o.ad * E.ad, 'E', { hid: 'E:' + cid }); },
  // E 2단계: 니나가 클로에 쪽으로 최대 7m 돌진 · 적중 시 Q 쿨 초기화
  e2(o) {
    const E = o.ch.K.E, l = o.ch.L('E'), n = o.nina; o.eRe = null; o.ch.cdStart('E');
    const d = Math.min(E.ninaDist, V.dist(n.pos, o.pos)), dir = d > 0.05 ? V.norm(V.sub(o.pos, n.pos)) : V.fromAng(o.facing), cid = ++o.chSeq; let reset = false;
    n.swing = null; n.dash = { from: V.copy(n.pos), to: V.add(n.pos, V.mul(dir, Math.max(0.5, d))), t: 0, dur: Math.max(0.05, d / E.ninaSpeed), width: E.ninaWidth, hit: new Set(),
      onHit: u => { o.ch.hit(u, lv(E.ninaBase, l) + n.ad * E.ninaAd, 'E', { pen: n.penPct, hid: 'E2:' + cid }); if (!reset && (isHero(u) || u.kind === 'dummy')) { reset = true; o.ch.cdSet('Q', 0); FX.text(o.pos, 'Q 초기화', '#ffd166', 12, { bold: true }); } } };
    FX.text(n.pos, '니나 돌진', n.color, 12, { bold: true });
  },
  // R 생명 공유: 5초 링크 — 피해 분담(맞은 쪽 70% + 다른 쪽 60%) · 둘 다 체력이 다 떨어져야 사망 · 연결선 고정 피해 · W·E 남은 쿨 30% 감소
  r(o) {
    const R = o.ch.K.R; o.ch.cdStart('R'); o.link = { t: R.dur, acc: 0, contact: {}, id: ++o.chSeq };
    for (const k of ['W', 'E']) o.ch.cdMul(k, 1 - R.cdCut);
    FX.text(o.pos, R.name, '#ffd166', 14, { bold: true }); Sfx.play('ult');
  },
  // D 마름쇠 투척: 지점(5m)에 6초 마름쇠
  d(o, aim) {
    const D = o.ch.K.D, l = o.ch.L('D'), dd = Math.min(D.range, V.dist(o.pos, aim)), dir = dd > 0.05 ? V.norm(V.sub(aim, o.pos)) : V.fromAng(o.facing), pos = Geo.pushOut(V.add(o.pos, V.mul(dir, dd)), 0.2);
    o.traps.push({ pos, r: D.r, life: D.life, n: {}, last: {}, id: ++o.chSeq, dmg: lv(D.base, l) + (o.bonusAd || 0) * D.bad + (o.sp || 0) * lv(D.sp, l) });
    FX.ring(pos, 0.3, D.r, o.ch.color, 0.3); Sfx.play('throw');
  },
  // ---------- 매 스텝 ----------
  update(o, dt) {
    const K = o.ch.K, n = o.nina;
    for (const q of o.chT) if ((q.t -= dt) <= 0 && !q.done) { q.done = true; if (!o.dead) q.fn(); }
    o.chT = o.chT.filter(q => !q.done);
    // 니나 소멸 → 부활 (클로에 현재 체력 20% 소모, 니나 최대 체력 80%)
    if (n && n.dead && !o.dead) {
      n.respawnT += dt;
      if (n.respawnT >= lv(K.P.respawn, o.ch.L('P'))) {
        n.respawnT = 0; n.resetState(); n.refresh(true); n.hp = n.maxHp * K.P.respawnHp; n.mode = 'follow'; n.order = null; n.teleportNear();
        o.hp = Math.max(1, o.hp - o.hp * K.P.respawnCost); FX.text(n.pos, '니나 부활', n.color, 13, { bold: true });
      }
    }
    if (n && !n.dead && Math.floor(Game.time * 2) !== Math.floor((Game.time - dt) * 2)) n.refresh(false);   // 0.5초마다 능력치 갱신(버프 반영)
    // W 인형극 회전: 주변 고정 피해 + 둔화, 평타 불가 · 3초 안에 안 던지면 쿨 50% 반환
    const S = o.spin;
    if (S) {
      const W = K.W; S.t -= dt; S.acc += dt; o.ch.noAA(0.15);
      if (S.acc >= W.tickEvery) {
        S.acc -= W.tickEvery; const amt = (lv(W.tick, o.ch.L('W')) + o.ad * W.tickAd) * W.tickEvery;
        for (const u of o.ch.foes()) if (V.dist(u.pos, o.pos) <= W.spinR + u.r) { o.ch.hit(u, amt, 'W', { type: 'true', hid: 'W:' + S.id, tick: true }); u.addSlow(W.spinSlow, W.tickEvery + 0.1); }
      }
      if (S.t <= 0 || o.stun > 0 || o.silence > 0 || o.dead) { o.spin = null; o.ch.cdStart('W'); o.ch.cdMul('W', W.refund); }
    }
    if (o.chPick && ((o.chPick.t -= dt) <= 0 || V.dist(o.chPick.pos, o.pos) <= K.W.pickR)) {   // 튕겨 나온 칼날 자수 줍기 → 이속
      if (o.chPick.t > 0) { o.addMsBuff(K.W.ms, K.W.msDur, false, 'chloeW'); FX.text(o.pos, '자수 회수', o.ch.color, 11); }
      o.chPick = null;
    }
    // E 재사용 시간 끝 → 쿨 시작
    if (o.eRe && (Game.time > o.eRe.until || o.dead)) { o.eRe = null; o.ch.cdStart('E'); }
    // R 생명 공유: 니나 공속·이속 · 연결선 고정 피해(오래 닿을수록 증가) · 한쪽이 죽으면 체력이 바닥난 다른 쪽도
    const L = o.link, R = K.R, lr = o.ch.L('R');
    if (n) { n.asB = L ? lv(R.as, lr) : 0; n.msB = L ? lv(R.ms, lr) : 0; }
    if (L) {
      L.t -= dt; L.acc += dt;
      if (L.acc >= R.tick && n && !n.dead) {
        L.acc -= R.tick;
        for (const u of o.ch.foes()) {
          if (Geo.segDist(u.pos, o.pos, n.pos) <= u.r + 0.15) { const c = (L.contact[u.id] = (L.contact[u.id] || 0) + R.tick), dps = lerp(lv(R.lineMin, lr), lv(R.lineMax, lr), clamp(c / R.ramp, 0, 1)); o.ch.hit(u, dps * R.tick, 'R', { type: 'true', hid: 'R:' + L.id, tick: true }); }
          else L.contact[u.id] = 0;
        }
      }
      if (n && o.dead !== n.dead) { const alive = o.dead ? n : o; if (alive.hp <= 1.01) Combat.kill(null, alive); }
      if (L.t <= 0 || !n || n.dead || o.dead) o.link = null;
    }
    // D 마름쇠: 밟은 적에게 피해(밟을 때마다 45% 감소) + 둔화
    const Dk = K.D;
    for (const z of o.traps) {
      z.life -= dt;
      for (const u of o.ch.foes()) {
        if (u.kind === 'ward' || V.dist(u.pos, z.pos) > z.r + u.r * 0.5) continue;
        if (Game.time - (z.last[u.id] ?? -99) < Dk.rehit) continue;
        const cnt = z.n[u.id] || 0; z.n[u.id] = cnt + 1; z.last[u.id] = Game.time;
        o.ch.hit(u, z.dmg * Math.pow(1 - Dk.decay, cnt), 'D', { hid: 'D:' + z.id }); u.addSlow(lv(Dk.slow, o.ch.L('D')), Dk.slowDur);
      }
    }
    o.traps = o.traps.filter(z => z.life > 0);
  },
  // ---------- 그리기 (2D 세계) ----------
  draw(o, ctx) {
    const K = o.ch.K, n = o.nina, col = o.ch.color;
    for (const z of o.traps) { ctx.save(); ctx.globalAlpha = 0.25 * Math.min(1, z.life); ctx.fillStyle = '#c9cfd8'; Draw.circle(ctx, z.pos.x, z.pos.y, z.r); ctx.fill(); ctx.restore(); for (let i = 0; i < 7; i++) { const a = i * 2.4 + z.id, q = V.add(z.pos, V.mul(V.fromAng(a), z.r * (0.25 + (i % 3) * 0.25))); KU.fill(ctx, q, 0.07, '#e6e9ef', 0.9); } }
    if (o.spin) { KU.ring(ctx, o.pos, K.W.spinR, col, 0.6, true); ctx.save(); ctx.strokeStyle = '#ffe9a8'; ctx.lineWidth = 0.05; ctx.globalAlpha = 0.7; ctx.beginPath(); ctx.arc(o.pos.x, o.pos.y, K.W.spinR * 0.8, Game.time * 9, Game.time * 9 + 1.2); ctx.stroke(); ctx.restore(); }
    if (o.chPick) KU.fill(ctx, o.chPick.pos, 0.22, '#ffd166', 0.9);
    if (n && !n.dead && (n.team === myTeam() || Vision.visible(Game.player, n))) {
      if (o.link) { ctx.save(); ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 0.12; ctx.globalAlpha = 0.6 + 0.3 * Math.sin(Game.time * 12); ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.lineTo(n.pos.x, n.pos.y); ctx.stroke(); ctx.restore(); }
      else { ctx.save(); ctx.strokeStyle = 'rgba(255,190,220,.25)'; ctx.lineWidth = 0.025; ctx.setLineDash([0.12, 0.12]); ctx.beginPath(); ctx.moveTo(o.pos.x, o.pos.y); ctx.lineTo(n.pos.x, n.pos.y); ctx.stroke(); ctx.restore(); }   // 재봉실(조종 줄)
      if (this.e2Ready(o) && o === Game.player) { ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = n.color; Draw.oRect(ctx, n.pos, V.ang(V.sub(o.pos, n.pos)), Math.min(K.E.ninaDist, V.dist(n.pos, o.pos)), K.E.ninaWidth); ctx.restore(); }
      if (n.mode === 'point' && n.goal && o === Game.player) KU.ring(ctx, n.goal, 0.3, n.color, 0.6);
    }
    for (const u of Game.units) if (u.chloeBy === o && u.chloeMarks > 0 && !u.dead && Game.time - u.chloeT < 5) for (let i = 0; i < Math.min(K.P.marks, u.chloeMarks); i++) KU.fill(ctx, V.add(u.pos, { x: -0.15 + i * 0.3, y: -u.r - 0.25 }), 0.08, '#ff8ab8', 0.95);   // 2타 표식
  },
};

// ============================== 플레이어 키트 ==============================
PKits.chloe = {
  short: { Q: '공격', W: '인형극', E: '리퍼', R: '생명', D: '마름쇠' },
  noAim: ['Q', 'W', 'R'],   // W 재입력(던지기)은 커서 지점
  def: { E: { dash: true }, D: { moveCancel: false } },
  label(p, k) { if (k === 'W' && p.spin) return '던지기'; if (k === 'E' && ChloeCore.e2Ready(p)) return '니나!'; return this.short[k]; },
  init(p) {
    p.ch = { K: p.K, color: p.color,
      L: k => p.L(k), hit: (u, amt, k, o) => p.hitS(u, amt, k, o), foes: () => p.foes(), level: () => p.build.level || 1, pen: () => p.penPct || 0,
      cdStart: k => p.startCd(k), cdMul: (k, m) => { const s = p.skills[k]; s.cd *= m; if (k === 'W' && m < 1 && !p.link) s.cdMax = s.cd; }, cdSet: (k, v) => { p.skills[k].cd = v; },
      noAA: t => { p.noAA = Math.max(p.noAA, t); }, target: () => this.target(p) };
    Object.defineProperty(p.ch, 'S', { get: () => p.S });
    ChloeCore.attach(p);
    p.petCmd = (pt, t) => this.command(p, pt, t);
  },
  // 니나가 같이 칠 대상: 클로에의 평타 대상(또는 방금 평타한 대상)
  target(p) {
    const ok = u => u && !u.dead && u.team !== p.team && u.kind !== 'ward' && !(u.untargetable > 0) && Vision.visible(p, u);
    if (ok(p.attackTarget)) return p.attackTarget;
    if (p.lastAAT && Game.time - p.lastAAT.t < 2.5 && ok(p.lastAAT.u)) return p.lastAAT.u;
    return null;
  },
  // 니나 명령 (Alt + 우클릭)
  command(p, pt, t) {
    const n = p.nina; if (!n || n.dead) { FX.toastFor(p, '니나가 없습니다 (부활 대기)', '#aaa'); return; }
    if (t && t.team !== p.team && !t.dead) { n.mode = 'enemy'; n.order = t; FX.mark(t.pos, '#ff8ab8'); }
    else if (V.dist(pt, p.pos) < p.r + 0.4) { n.mode = 'self'; n.order = null; FX.text(p.pos, '니나: 따라와', n.color, 11); }
    else { n.mode = 'point'; n.goal = Geo.pushOut(V.copy(pt), n.r); n.order = null; FX.mark(n.goal, '#ff8ab8'); }
  },
  onAAHit(p, u) { ChloeCore.onAAHit(p, u); },
  recast(p, k) { return (k === 'W' && !!p.spin) || (k === 'E' && ChloeCore.e2Ready(p)); },
  busy(p, k) { if (p.spin && !['Q', 'E', 'W'].includes(k)) { FX.toastFor(p, '인형극 중에는 Q·E만 쓸 수 있습니다', '#aaa'); return true; } return false; },
  update(p, dt) { ChloeCore.update(p, dt); },
  cast: {
    Q(p) { if (!ChloeCore.up(p)) { FX.toastFor(p, '니나가 없어 공격 명령을 쓸 수 없습니다', '#aaa'); return false; } ChloeCore.q(p); p.instantUsed('Q'); return true; },
    W(p, aim) { if (p.spin) { ChloeCore.w2(p, aim); return true; } ChloeCore.w1(p); p.instantUsed('W'); return true; },
    E(p, aim) {
      const E = p.K.E;
      if (p.eRe) {
        if (!ChloeCore.e2Ready(p)) { FX.toastFor(p, ChloeCore.up(p) ? '니나 돌진 준비 중' : '니나가 없어 재사용할 수 없습니다', '#aaa'); return false; }
        ChloeCore.e2(p); p.instantUsed('E'); return true;
      }
      const dir = p.dirTo(aim), from = V.copy(p.pos);
      p.dash('E', dir, E.dist, E.time, 0.99, q => ChloeCore.e1Hits(q, from, q.pos));
      p.eRe = { t0: Game.time, until: Game.time + E.window }; FX.text(p.pos, E.name, p.color, 12, { bold: true }); Sfx.play('blink'); return true;
    },
    R(p) {
      if (PKits.chloe.busy(p, 'R')) return false;
      if (!ChloeCore.up(p)) { FX.toastFor(p, '니나가 없어 생명 공유를 쓸 수 없습니다', '#aaa'); return false; }
      ChloeCore.r(p); p.instantUsed('R'); return true;
    },
    D(p, aim) {
      const D = p.K.D; if (PKits.chloe.busy(p, 'D')) return false;
      p.beginCast('D', aim, { windup: () => D.windup, recovery: () => 0.05, fire(q, c) { q.startCd('D'); ChloeCore.d(q, c.aim); } }, {});
      return true;
    },
  },
  shape(p, k) {
    const K = p.K;
    if (k === 'W') return p.spin ? { kind: 'circle', range: K.W.range, r: K.W.r } : { kind: 'self', r: K.W.spinR };
    if (k === 'E') return p.eRe ? null : { kind: 'dash', len: K.E.dist };
    if (k === 'D') return { kind: 'circle', range: K.D.range, r: K.D.r };
    return null;
  },
  draw(p, ctx) { ChloeCore.draw(p, ctx); },
  hud(p) {
    const n = p.nina, b = [];
    if (!n || n.dead) b.push([`니나 부활 ${fmt(Math.max(0, lv(p.K.P.respawn, p.L('P')) - (n ? n.respawnT : 0)), 1)}초`, '#8a93a6']);
    else b.push([`니나 ${Math.round(n.hp)}/${n.maxHp}${n.mode === 'self' ? ' · 따라오기' : n.mode === 'point' ? ' · 이동' : n.mode === 'enemy' ? ' · 공격' : ''}`, n.color]);
    if (p.spin) b.push([`인형극 ${fmt(p.spin.t, 1)} (W: 던지기)`, p.color]);
    if (p.eRe) b.push([ChloeCore.e2Ready(p) ? `E: 니나 돌진 ${fmt(p.eRe.until - Game.time, 1)}` : 'E 재사용 준비…', '#ffffff']);
    if (p.link) b.push([`생명 공유 ${fmt(p.link.t, 1)}`, '#ffd166']);
    if (p.chPick) b.push(['자수 줍기 → 이속', '#ffd166']);
    return b;
  },
};
