
// ============================== AI: 표적 이동 패턴 ==============================
function threatens(u, pr, range) {
  const rel = V.sub(u.pos, pr.pos), along = V.dot(rel, pr.dir);
  if (along < 0 || along > range) return false;
  return Math.abs(rel.x * pr.dir.y - rel.y * pr.dir.x) < u.r + pr.width / 2 + 0.35;
}
const AI = {
  line(u) { const a = u.ai; if (!u.moveTarget) { a.dir = -(a.dir || 1); u.moveTarget = { x: a.dir > 0 ? a.x1 : a.x0, y: a.y }; } },
  zigzag(u, dt) { const a = u.ai; a.t = (a.t || 0) - dt; if (a.t <= 0 || !u.moveTarget) { a.t = rand(0.5, 1.0); u.moveTarget = { x: rand(a.x0, a.x1), y: rand(a.y0, a.y1) }; } },
  strafe(u, dt) { const a = u.ai; a.ang = (a.ang || 0) + dt * a.speed / a.R; u.moveTarget = { x: a.cx + Math.cos(a.ang) * a.R, y: a.cy + Math.sin(a.ang) * a.R }; },
  wander(u, dt) { const a = u.ai; a.t = (a.t || 0) - dt; if (a.t <= 0) { a.t = rand(0.8, 1.6); u.moveTarget = Geo.pushOut({ x: u.spawn.x + rand(-1.3, 1.3), y: u.spawn.y + rand(-1.3, 1.3) }, u.r); } },
  // 투사체를 보고 일정 확률로 옆으로 피하는 표적
  dodger(u, dt) {
    const a = u.ai;
    for (const pr of Game.projectiles) {
      if (pr.team === u.team || pr.dead || pr.seen.has(u.id)) continue;
      if (threatens(u, pr, 6)) { pr.seen.add(u.id); if (Math.random() < a.dodge) { a.dodgeT = a.react; a.dodgePr = pr; } }
    }
    if (a.dodgeT > 0) {
      a.dodgeT -= dt;
      if (a.dodgeT <= 0 && a.dodgePr) {
        const pr = a.dodgePr, rel = V.sub(u.pos, pr.pos), side = (pr.dir.x * rel.y - pr.dir.y * rel.x) >= 0 ? 1 : -1;
        u.moveTarget = Geo.pushOut(V.add(u.pos, V.mul(V.perp(pr.dir), 1.8 * side)), u.r); a.t = 0.6; a.dodgePr = null;
        return;
      }
    }
    AI.zigzag(u, dt);
  },
};

// ============================== AI: 1:1 결투 상대 ==============================
class Duelist extends Unit {
  constructor(x, y, diffKey) {
    const E = CONFIG.enemy, p = Game.player;
    super({ team: 1, x, y, r: E.r, hp: Math.round(p.maxHp * E.hpMul), def: p.build.def * E.defMul, ms: E.ms, color: E.color, name: E.name, kind: 'duelist', facing: Math.PI });
    this.diff = E.difficulty[diffKey]; this.diffKey = diffKey; this.ad = p.ad * E.adMul; this.as = E.as;
    this.cds = { s1: 2, s2: 4, s3: 0 }; this.aaCd = 0; this.act = null; this.thinkT = 0.5; this.dodgeQ = null;
    this.healing = null; this.healAcc = 0; this.healTxtT = 0; this.attacking = false;
    this.stats = { dodges: 0, s1Hits: 0, s1Casts: 0 };
  }
  update(dt) {
    this.tickStatus(dt); if (this.dead) return;
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.aaCd -= dt;
    if (this.healing) {   // 재생 — 치명적 외상의 치유 감소 적용
      const h = Math.min(dt, this.healing.t); this.healing.t -= dt;
      this.healAcc += this.heal(this.healing.rate * h, true);
      if (this.healing.t <= 0) this.healing = null;
    }
    this.healTxtT -= dt;
    if (this.healTxtT <= 0 && this.healAcc > 1) { FX.text(this.pos, '+' + Math.round(this.healAcc) + (this.healRed > 0 ? ' (치유감소)' : ''), '#5dff9a', 12); this.healAcc = 0; this.healTxtT = 0.5; }
    if (this.forced || this.stun > 0) { this.act = null; this.vel = { x: 0, y: 0 }; return; }
    if (this.act) { this.updateAct(dt); return; }
    this.watchThreats(dt);
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = this.diff.react * (0.7 + Math.random() * 0.6); this.think(); if (this.act) return; }
    const p = Game.player;
    if (this.attacking && p && !p.dead) {
      const d = V.dist(this.pos, p.pos) - p.r - this.r;
      if (d <= CONFIG.enemy.range) { this.moveTarget = null; if (this.aaCd <= 0) { this.act = { type: 'aa', t: 0, dur: CONFIG.enemy.aaWindup }; return; } }
      else if (this.canMove()) this.moveTarget = V.copy(p.pos);
    }
    this.moveStep(dt);
  }
  // 날아오는 수쳐를 감지 → 반응 시간 후 회피
  watchThreats(dt) {
    for (const pr of Game.projectiles) {
      if (pr.team === this.team || pr.dead || pr.seen.has(this.id)) continue;
      if (threatens(this, pr, 9)) { pr.seen.add(this.id); if (!this.dodgeQ && Math.random() < this.diff.dodge) this.dodgeQ = { t: this.diff.react * 0.9, pr }; }
    }
    if (!this.dodgeQ) return;
    this.dodgeQ.t -= dt;
    if (this.dodgeQ.t > 0) return;
    const pr = this.dodgeQ.pr; this.dodgeQ = null;
    if (pr.dead || !this.canMove()) return;
    const rel = V.sub(this.pos, pr.pos), side = (pr.dir.x * rel.y - pr.dir.y * rel.x) >= 0 ? 1 : -1, pd = V.mul(V.perp(pr.dir), side);
    this.stats.dodges++; this.attacking = false;
    if (this.cds.s2 <= 0 && (this.diffKey === 'hard' || Math.random() < 0.3)) this.startDash(pd, 3);
    else { this.moveTarget = Geo.pushOut(V.add(this.pos, V.mul(pd, 2.2)), this.r); this.thinkT = 0.5; }
  }
  think() {
    const p = Game.player; if (!p || p.dead) return;
    const E = CONFIG.enemy, d = V.dist(this.pos, p.pos), hpR = this.hp / this.maxHp, pR = p.hp / p.maxHp;
    if (hpR < 0.4 && this.cds.s3 <= 0 && !this.healing) {
      this.healing = { t: E.s3.dur, rate: this.maxHp * E.s3.healPct / E.s3.dur }; this.cds.s3 = E.s3.cd; FX.text(this.pos, E.s3.name, '#5dff9a', 14, { bold: true });
    }
    // 어려움: 캐시의 이동기(Q/점멸)·E 쿨타임을 보고 진입 여부 결정
    let engage = true;
    if (this.diff.kite) {
      engage = p.skills.Q.cd > 1.5 || p.skills.F.cd > 1.5 || p.skills.E.cd > 2 || pR < 0.4 || hpR > pR + 0.3;
      this.kiteT = (this.kiteT || 0) + this.diff.react;   // 너무 오래 견제만 하면 4초간 진입
      if (this.kiteT > 8) { this.commitT = 4; this.kiteT = 0; }
      if (this.commitT > 0) { this.commitT -= this.diff.react; engage = true; }
      if (engage) this.kiteT = 0;
    }
    if (this.diffKey === 'hard' && hpR < 0.25 && pR > 0.5 && this.cds.s2 <= 0 && this.canMove()) { this.startDash(V.norm(V.sub(this.pos, p.pos)), E.s2.dist); return; }
    if (this.cds.s1 <= 0 && d < E.s1.range && Math.random() < 0.85) { this.startS1(p); return; }
    if (engage) {
      if (d > E.range + this.r + p.r + 0.1) {
        if (this.cds.s2 <= 0 && d > 3 && d < E.s2.dist + 1.5 && this.canMove() && (this.diffKey !== 'easy' || Math.random() < 0.4)) { this.startDash(V.norm(V.sub(p.pos, this.pos)), Math.min(E.s2.dist, d - 1.2)); return; }
        this.moveTarget = V.copy(p.pos);
      }
      this.attacking = true;
    } else {   // 카이팅: 수쳐 사거리 바깥 유지
      this.attacking = false;
      const want = CONFIG.skills.E.range + 1.0, away = V.norm(V.sub(this.pos, p.pos)), side = Math.random() < 0.5 ? 1 : -1;
      if (d < want - 0.4) this.moveTarget = Geo.pushOut(V.add(this.pos, V.add(V.mul(away, 2), V.mul(V.perp(away), side * 1.2))), this.r);
      else if (d > want + 1.5) this.moveTarget = Geo.pushOut(V.add(p.pos, V.mul(away, want)), this.r);
      else this.moveTarget = Geo.pushOut(V.add(this.pos, V.mul(V.perp(away), side * 1.5)), this.r);
    }
  }
  startS1(p) {
    const E = CONFIG.enemy.s1, tt = E.windup + V.dist(this.pos, p.pos) / E.speed;
    const pred = V.add(p.pos, V.mul(p.vel, tt * this.diff.lead));
    const ang = V.ang(V.sub(pred, this.pos)) + (Math.random() - 0.5) * 2 * this.diff.aimErr;
    this.act = { type: 's1', t: 0, dur: E.windup, dir: V.fromAng(ang) }; this.cds.s1 = E.cd; this.stats.s1Casts++; this.moveTarget = null;
  }
  startDash(dir, dist) {
    const len = Geo.clampDash(this.pos, dir, dist, this.r);
    this.act = { type: 'dash', t: 0, dur: CONFIG.enemy.s2.time, from: V.copy(this.pos), to: V.add(this.pos, V.mul(dir, len)) };
    this.cds.s2 = CONFIG.enemy.s2.cd; this.moveTarget = null;
  }
  updateAct(dt) {
    const a = this.act, p = Game.player, E = CONFIG.enemy; a.t += dt;
    if (a.type === 'aa') {
      if (p && !p.dead) this.facing = V.ang(V.sub(p.pos, this.pos));
      if (a.t >= a.dur) {
        this.act = null; this.aaCd = 1 / this.as;
        if (p && !p.dead && V.dist(this.pos, p.pos) - p.r - this.r <= E.range + 0.4) { Combat.damage(this, p, this.ad * this.diff.dmgMul, { type: 'normal', source: '적 평타' }); FX.burst(p.pos, '#b56cff', 6, 3); }
      }
    } else if (a.type === 's1') {
      this.facing = V.ang(a.dir);
      if (a.t >= a.dur) { this.act = null; this.fireS1(a.dir); }
    } else if (a.type === 'dash') {
      const k = Math.min(1, a.t / a.dur), prev = V.copy(this.pos);
      this.pos = V.lerp(a.from, a.to, k); FX.trail(prev, this.pos, '#9b6bff', 0.4, 0.25);
      if (k >= 1) this.act = null;
    }
  }
  fireS1(dir) {
    const E = CONFIG.enemy.s1; Sfx.play('throw');
    Game.projectiles.push(new Projectile({
      team: 1, owner: this, kind: 'spear', pos: V.copy(this.pos), dir, speed: E.speed, range: E.range, width: E.width,
      onUnit: (pr, u) => { Combat.damage(this, u, (this.ad * E.adRatio + E.flat) * this.diff.dmgMul, { type: 'skill', source: '적 스킬' }); u.addSlow(E.slow, E.slowDur); this.stats.s1Hits++; FX.burst(u.pos, '#b56cff', 10, 5); return 'stop'; },
    }));
  }
}

// ============================== AI: 원거리 딜러 결투 상대 (공통 움직임 + 캐릭터별 키트) ==============================
// 움직임은 유튜브 원딜 강의 반영: ① 쏘고 움직이기 ② 좌우 무빙(캐시 E 예고선) ③ 앞뒤 무빙(E 사거리 밖으로) ④ 압박 후 뒤로
//                              ⑤ 벽·좁은 곳 회피(벽꿍 수쳐) ⑥ 위험 스킬이 남아 있으면 이동기 아끼기
// 스킬 사용은 Kits[캐릭터]가 담당 (src/4b_kits.js, 수치는 CONFIG.rangedKits)
function wallClearance(q) {
  let c = Math.min(q.x, q.y, CONFIG.world.w - q.x, CONFIG.world.h - q.y);
  for (const w of CONFIG.walls) { const dx = Math.max(w.x - q.x, 0, q.x - (w.x + w.w)), dy = Math.max(w.y - q.y, 0, q.y - (w.y + w.h)); c = Math.min(c, Math.hypot(dx, dy)); }
  return c;
}
class RangedDuelist extends Duelist {
  constructor(x, y, diffKey, motifKey, stageKey) {
    super(x, y, diffKey);
    const M = CONFIG.rangedMotifs[motifKey], RA = CONFIG.rangedAI;
    const st = RA.stages[stageKey] ? stageKey : (RA.stages[Game.buildId] ? Game.buildId : 'mid'), si = ['early', 'mid', 'late'].indexOf(st), S0 = RA.stages[st];
    this.motif = M; this.motifKey = motifKey; this.kind = 'ranged';
    this.stage = st; this.level = S0.level; this.lv = S0.skillLv; this.stacks = S0.stacks;
    this.maxHp = this.hp = S0.hp; this.def = S0.def; this.baseMs = S0.ms || this.baseMs;
    this.ad = M.ad[si]; this.sp = M.sp[si]; this.as = M.as[si]; this.critChance = M.crit[si]; this.pen = M.pen[si];
    this.bonusAd = Math.max(0, this.ad - S0.baseAd);
    this.name = `${M.name} Lv${S0.level} (${M.weapon})`; this.color = M.color;
    this.kitCfg = CONFIG.rangedKits[motifKey]; this.kit = Kits[motifKey];
    this.cds = { Q: 1.2, W: 2.5, E: 3, R: 4, D: 5 };
    this.asBuffs = []; this.noAA = 0; this.objs = []; this.pendingShots = []; this.chans = [];
    this.side = Math.random() < 0.5 ? 1 : -1; this.kiteT = 0; this.castSeen = -1;
    Object.assign(this.stats, { kites: 0, sideSteps: 0 });
    if (this.kit.init) this.kit.init(this);
  }
  // ---------- 수치 도우미 ----------
  L(k) { return this.lv[k] || 1; }
  pick(v, k) { return Array.isArray(v) ? lv(v, this.L(k)) : (v || 0); }
  // 피해 = base[레벨] + 공격력×ad + 추가공격력×bad + 스킬증폭×sp (난이도 배율 적용)
  calc(o, k) { return (this.pick(o.base, k) + this.ad * this.pick(o.ad, k) + this.bonusAd * this.pick(o.bad, k) + this.sp * this.pick(o.sp, k)) * this.diff.dmgMul; }
  penNow() { return this.kit.pen ? this.kit.pen(this) : this.pen; }
  curAs() { let b = 0; for (const a of this.asBuffs) b += a.p; return Math.max(0.2, (this.as + (this.kit.asFlat ? this.kit.asFlat(this) : 0)) * (1 + b)); }
  addAs(p, dur, tag) { if (tag) this.asBuffs = this.asBuffs.filter(a => a.tag !== tag); this.asBuffs.push({ p, t: dur, tag }); }
  aaRange() { return this.kit.aaRange ? this.kit.aaRange(this) : this.motif.aaRange; }
  cathyThreat(p) { return ['Q', 'E', 'R'].filter(k => p.skills[k].lv > 0 && p.skills[k].cd <= 0.8).length; }
  predict(p, t) { return V.add(p.pos, V.mul(p.vel, t * this.diff.lead)); }
  aimDir(p, windup, speed) { const d = V.dist(this.pos, p.pos), pred = this.predict(p, windup + d / speed); return V.fromAng(V.ang(V.sub(pred, this.pos)) + (Math.random() - 0.5) * 2 * this.diff.aimErr); }
  // 적에게 스킬 피해 (키트 onHit 훅 → 카이츄·잿빛 사신·아야 쿨감 등)
  hitP(u, amount, o = {}) {
    if (!u || u.dead) return;
    Combat.damage(this, u, amount, Object.assign({ type: 'skill', source: '적 ' + (o.name || '스킬'), pen: this.penNow() }, o));
    this.stats.s1Hits++; if (this.kit.onHit) this.kit.onHit(this, u, o);
  }
  shoot(o) {
    const pr = new Projectile({ team: 1, owner: this, kind: 'shot', color: o.color || this.motif.color, len: o.len || 1, pos: V.copy(o.from || this.pos), dir: o.dir,
      speed: o.speed, range: o.range, width: o.width, onUnit: (pr, u) => { o.onHit(u, pr); return o.pierce ? 'continue' : 'stop'; } });
    if (o.home) { pr.homeTarget = o.home; pr.homeTurn = 80; pr.range = 999; }   // 대상 지정(회피 불가)
    Game.projectiles.push(pr); return pr;
  }
  startCast(dur, onFire, tele) { this.act = { type: 'cast', t: 0, dur, onFire, tele }; this.moveTarget = null; }
  startChannel(dur, o) { this.act = { type: 'channel', t: 0, dur, onTick: o.onTick, onEnd: o.onEnd, tele: o.tele, cancelIfClose: o.cancelIfClose }; this.moveTarget = null; }
  dashTo(dir, dist, time, passWalls, name) {
    const len = passWalls ? Geo.passLanding(this.pos, dir, dist, this.r) : Geo.clampDash(this.pos, dir, dist, this.r);
    this.act = { type: 'dash', t: 0, dur: time, from: V.copy(this.pos), to: V.add(this.pos, V.mul(dir, len)) }; this.moveTarget = null;
    if (name) FX.text(this.pos, name, this.motif.color, 12, { bold: true });
  }
  onDamaged(dmg, src) { if (this.kit.onDamaged) this.kit.onDamaged(this, dmg, src); }
  // ---------- 매 스텝 ----------
  update(dt) {
    this.tickStatus(dt); if (this.dead) return;
    for (const k in this.cds) this.cds[k] = Math.max(0, this.cds[k] - dt);
    this.aaCd -= dt; if (this.noAA > 0) this.noAA -= dt;
    this.asBuffs = this.asBuffs.filter(a => (a.t -= dt) > 0);
    for (const c of this.chans) { c.t += dt; if (c.onTick) c.onTick(dt, c); if (c.t >= c.dur || c.stop) { c.done = true; if (c.onEnd) c.onEnd(c); } }
    this.chans = this.chans.filter(c => !c.done);
    if (this.kit.update) this.kit.update(this, dt);
    for (const ps of this.pendingShots) if ((ps.t -= dt) <= 0) { ps.fn(); ps.done = true; }
    this.pendingShots = this.pendingShots.filter(ps => !ps.done);
    if (this.forced || this.stun > 0) { if (this.act && this.act.type === 'channel' && this.act.onEnd) this.act.onEnd(this.act, true); this.act = null; this.vel = { x: 0, y: 0 }; return; }
    this.watchThreats(dt);
    this.watchCathyCast(dt);
    if (this.act) { this.updateAct(dt); return; }
    const p0 = Game.player; this.seesP = !p0 || Vision.visible(this, p0);
    if (p0 && this.seesP) this.lastSeen = V.copy(p0.pos);
    if (!this.seesP) {   // 부쉬 속 캐시: 보이지 않으니 공격 불가 — 마지막으로 본 위치에서 거리 벌리기
      if ((this.thinkT -= dt) <= 0) { this.thinkT = 0.4; const ls = this.lastSeen || p0.pos;
        if (V.dist(this.pos, ls) < 6.5) this.moveTarget = this.pickSpot({ pos: ls }, 7.5, 1.8); else if (Math.random() < 0.25) this.moveTarget = this.pickSpot({ pos: ls }, 7.5, 1.2); }
      this.moveStep(dt); return;
    }
    this.thinkT -= dt;
    if (this.thinkT <= 0) { this.thinkT = this.diff.react * (0.7 + Math.random() * 0.6); this.think(); if (this.act) return; }
    const p = Game.player;
    if (this.kiteT > 0) { this.kiteT -= dt; this.moveStep(dt); return; }   // ① 쏘고 움직이는 중
    if (p && !p.dead && this.canAct() && this.aaCd <= 0 && this.noAA <= 0 && !this.castDodge && !this.dodgeQ && V.dist(this.pos, p.pos) - p.r <= this.aaRange()) {
      this.moveTarget = null; this.act = { type: 'aa', t: 0, dur: CONFIG.rangedAI.aaWindup / Math.max(1, this.curAs()) }; return;
    }
    this.moveStep(dt);
  }
  // ② 좌우 무빙: 캐시 E 선딜(예고선)을 보고 옆으로
  watchCathyCast(dt) {
    const p = Game.player;
    if (this.castDodge && (this.castDodge.t -= dt) <= 0) this.doSideStep();
    if (!p || !p.cast || p.cast.phase !== 'windup' || p.cast.k !== 'E' || p.cast.id === this.castSeen || !Vision.visible(this, p)) return;
    this.castSeen = p.cast.id;
    if (Math.random() < Math.min(0.95, this.diff.dodge + 0.15)) this.castDodge = { t: this.diff.react * 0.8, dir: p.cast.dir };
  }
  sideDir(dir) {
    const rel = V.sub(this.pos, Game.player.pos), sd = (dir.x * rel.y - dir.y * rel.x) >= 0 ? 1 : -1;
    let pd = V.mul(V.perp(dir), sd); if (wallClearance(V.add(this.pos, V.mul(pd, 2))) < 0.8) pd = V.mul(pd, -1);   // 벽 쪽이면 반대로
    return pd;
  }
  doSideStep() {
    const c = this.castDodge; this.castDodge = null; if (!c || !this.canMove()) return;
    if (this.act) { if (this.act.type === 'aa') this.act = null; else return; }   // 평타 선딜은 끊고 피함 (시전·돌진 중엔 불가)
    const pd = this.sideDir(c.dir);
    if (this.kit.dodge && this.kit.dodge(this, pd)) { this.stats.sideSteps++; return; }   // 이동기로 회피(아야 무빙턴 등)
    this.moveTarget = Geo.pushOut(V.add(this.pos, V.mul(pd, 2.0)), this.r); this.kiteT = 0.55; this.stats.sideSteps++;
  }
  watchThreats(dt) {
    for (const pr of Game.projectiles) {
      if (pr.team === this.team || pr.dead || pr.seen.has(this.id)) continue;
      if (threatens(this, pr, 9)) { pr.seen.add(this.id); if (!this.dodgeQ && Math.random() < this.diff.dodge) this.dodgeQ = { t: this.diff.react * 0.9, pr }; }
    }
    if (!this.dodgeQ || (this.dodgeQ.t -= dt) > 0) return;
    const pr = this.dodgeQ.pr; this.dodgeQ = null;
    if (pr.dead || !this.canMove()) return;
    if (this.act) { if (this.act.type === 'aa') this.act = null; else return; }
    const pd = this.sideDir(pr.dir); this.stats.dodges++;
    if ((this.diffKey === 'hard' || Math.random() < 0.3) && this.kit.dodge && this.kit.dodge(this, pd)) return;
    this.moveTarget = Geo.pushOut(V.add(this.pos, V.mul(pd, 2.2)), this.r); this.kiteT = 0.45;
  }
  think() {
    const p = Game.player; if (!p || p.dead) return;
    const RA = CONFIG.rangedAI, d = V.dist(this.pos, p.pos);
    // ⑥ 위협(캐시가 붙음 / Q·R 돌진) → 키트별 이탈·반격 (벽 쪽은 피해서)
    const close = d < (this.diffKey === 'hard' ? 3.6 : 2.8), diving = p.cast && (p.cast.k === 'Q' || p.cast.k === 'R') && d < 7;
    if ((close || (diving && this.diffKey !== 'easy')) && (this.diffKey !== 'easy' || Math.random() < 0.5)) {
      const away = V.norm(V.sub(this.pos, p.pos)); let best = away, bs = -Infinity;
      for (let i = -2; i <= 2; i++) {
        const dir = V.fromAng(V.ang(away) + i * 0.45), q = V.add(this.pos, V.mul(dir, 3));
        const sc = -Math.max(0, RA.wallAvoid - wallClearance(q)) * 3 + V.dist(q, p.pos) * 0.5;
        if (sc > bs) { bs = sc; best = dir; }
      }
      if (this.kit.escape && this.kit.escape(this, p, best, d)) return;
    }
    if (this.canAct() && this.kit.think && this.kit.think(this, p, d)) { this.stats.s1Casts++; return; }
    // ④ 압박: 사거리 밖이면 쏠 수 있는 거리까지 들어감
    if (this.kiteT <= 0 && d > this.aaRange() - 0.2) this.moveTarget = this.pickSpot(p, this.aaRange() - 0.4, 2.2);
  }
  // 후보 지점 점수화: 원하는 거리 유지 + 벽 회피 + 좌우 무빙 선호
  pickSpot(p, want, step) {
    const RA = CONFIG.rangedAI, base = V.ang(V.sub(this.pos, p.pos)); let best = null, bs = -Infinity;
    if (Math.random() < 0.12) this.side *= -1;
    for (let i = 0; i < 16; i++) {
      const q = Geo.pushOut(V.add(this.pos, V.mul(V.fromAng(base + i * Math.PI / 8), step)), this.r);
      const dq = V.dist(q, p.pos), da = angDiff(V.ang(V.sub(q, p.pos)), base), sideOk = Math.sign(da) === this.side ? 0.4 : 0;
      const sc = -Math.abs(dq - want) * 2 - Math.max(0, RA.wallAvoid - wallClearance(q)) * 3 + Math.min(Math.abs(da), 0.6) + sideOk + Math.random() * 0.2;
      if (sc > bs) { bs = sc; best = q; }
    }
    return best;
  }
  // ① 쏜 직후 무빙: ③ 캐시 E·Q가 준비돼 있으면 E 사거리 밖으로(앞뒤), 아니면 좌우로
  startKite(p) {
    const RA = CONFIG.rangedAI, t = Math.max(0.15, (1 / this.curAs() - RA.aaWindup) * RA.kiteMoveRatio);
    const danger = p.skills.E.cd <= 0.8 || p.skills.Q.cd <= 0.8;
    const want = danger ? Math.max(RA.eThreatRange + 0.4, this.aaRange()) : this.aaRange() - 0.3;
    this.moveTarget = this.pickSpot(p, want, clamp(this.speed() * t, 0.8, 2.4)); this.kiteT = t; this.stats.kites++;
  }
  // 기본 평타 피해(치명 판정 포함) — 키트가 aaDamage로 덮어쓸 수 있음
  aaDamage(u) { const crit = Math.random() < this.critChance; return { amount: this.ad * (crit ? 1.75 : 1) * this.diff.dmgMul, crit }; }
  fireAA(p) {
    const M = this.motif, dir = V.norm(V.sub(this.predict(p, V.dist(this.pos, p.pos) / M.aaSpeed * 0.5), this.pos));
    if (this.kit.fireAA && this.kit.fireAA(this, p, dir)) return;
    this.shoot({ dir, speed: M.aaSpeed, range: this.aaRange() + 1.2, width: 0.25, len: 0.5, onHit: u => this.aaLand(u) });
  }
  aaLand(u, ratio = 1) {
    const r = this.kit.aaDamage ? this.kit.aaDamage(this, u) : this.aaDamage(u);
    Combat.damage(this, u, r.amount * ratio, { type: 'normal', source: '적 평타', crit: r.crit, pen: this.penNow() });
    if (this.kit.onAAHit) this.kit.onAAHit(this, u);
  }
  updateAct(dt) {
    const a = this.act, p = Game.player; a.t += dt;
    if (a.type === 'aa') {
      if (p && !p.dead) this.facing = V.ang(V.sub(p.pos, this.pos));
      if (a.t >= a.dur) {
        this.act = null; this.aaCd = 1 / this.curAs() - a.dur;   // 공격 간격 = 1/공속 (선딜 포함)
        if (p && !p.dead) { this.fireAA(p); Sfx.play('aa'); this.startKite(p); }
      }
    } else if (a.type === 'cast') {
      if (a.tele && a.tele.dir) this.facing = V.ang(a.tele.dir);
      if (a.t >= a.dur) { this.act = null; a.onFire(); if (!this.act && p && !p.dead && this.kiteT <= 0) this.startKite(p); }
    } else if (a.type === 'channel') {
      if (a.onTick) a.onTick(dt, a);
      if (a.cancelIfClose && p && V.dist(this.pos, p.pos) < a.cancelIfClose) { this.act = null; if (a.onEnd) a.onEnd(a, true); return; }
      if (a.t >= a.dur || a.stop) { this.act = null; if (a.onEnd) a.onEnd(a, false); }
    } else super.updateAct(dt);   // dash
  }
  // 월드 그리기: 시전 예고선 + 키트 오브젝트 + 평타 사거리
  drawExtra(ctx) {
    const M = this.motif, a = this.act;
    if (a && a.tele && !this.dead) {
      const T = a.tele, k = clamp(a.t / Math.max(0.01, a.dur), 0, 1), col = T.color || M.color;
      ctx.save(); ctx.globalAlpha = 0.15 + 0.45 * k; ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = 0.04;
      if (T.kind === 'line') Draw.oRect(ctx, this.pos, V.ang(T.dir), T.len, T.width);
      else if (T.kind === 'cone') { const h = T.angle / 2 * Math.PI / 180, an = V.ang(T.dir); ctx.beginPath(); ctx.moveTo(this.pos.x, this.pos.y); ctx.arc(this.pos.x, this.pos.y, T.len, an - h, an + h); ctx.closePath(); ctx.fill(); }
      else if (T.kind === 'circle') { Draw.circle(ctx, T.pos.x, T.pos.y, T.r); ctx.fill(); ctx.globalAlpha = 0.9; ctx.stroke(); }
      ctx.restore();
    }
    if (this.kit.draw) this.kit.draw(this, ctx);
    if (!this.dead) { ctx.strokeStyle = M.color + '33'; ctx.lineWidth = 0.03; Draw.circle(ctx, this.pos.x, this.pos.y, this.aaRange()); ctx.stroke(); }
  }
}

// ============================== 통계 ==============================
const Stats = {
  reset() {
    Object.assign(this, {
      t: 0, inputs: 0, casts: {}, hits: {}, hitKeys: new Set(), dmgBy: {}, dealtTotal: 0, takenTotal: 0, timeline: [],
      aaHits: 0, waste: {}, mistakes: {}, criticals: 0, eDouble: 0, eWall: 0, enhAA: 0,
      comboAtt: 0, comboOk: 0, streak: 0, bestStreak: 0, shots: 0, shotHits: 0, movingHits: 0, leadHits: 0,
      hitPositions: [], kills: 0, playerHits: 0,
    });
  },
  tick(dt) { this.t += dt; },
  input() { this.inputs++; },
  cast(k) { this.casts[k] = (this.casts[k] || 0) + 1; },
  hit(k, id) { const key = k + ':' + id; if (this.hitKeys.has(key)) return false; this.hitKeys.add(key); this.hits[k] = (this.hits[k] || 0) + 1; return true; },
  dealt(src, d) { this.dmgBy[src] = (this.dmgBy[src] || 0) + d; this.dealtTotal += d; const i = Math.floor(this.t); this.timeline[i] = (this.timeline[i] || 0) + d; },
  mistake(txt) { this.mistakes[txt] = (this.mistakes[txt] || 0) + 1; FX.toast('⚠ ' + txt, '#ffb347'); },
  // 스킬샷 연속 명중 (Q/W/E)
  resolveShot(k, hit) {
    if (!['Q', 'W', 'E'].includes(k)) return;
    this.shots++;
    if (hit) { this.shotHits++; this.streak++; this.bestStreak = Math.max(this.bestStreak, this.streak); Events.emit('streak', { n: this.streak }); }
    else this.streak = 0;
  },
  // 교전 중(적 8m 이내)인데 쿨이 돌아 있는 스킬을 안 쓴 시간
  trackWaste(p, dt) {
    if (!Game.nearestEnemy(p.pos, 8)) return;
    for (const k of SKILL_KEYS) {
      const s = p.skills[k];
      if (s.lv <= 0 || s.cd > 0 || (p.cast && p.cast.k === k)) continue;
      if (k === 'D' && (p.daggerReady > 0 || p.dualRecast > 0)) continue;
      this.waste[k] = (this.waste[k] || 0) + dt;
    }
  },
  recentDps(sec = 5) { const i1 = Math.floor(this.t); let s = 0; for (let i = Math.max(0, i1 - sec + 1); i <= i1; i++) s += this.timeline[i] || 0; return s / Math.min(sec, Math.max(1, this.t)); },
  totalCasts() { let c = 0, h = 0; for (const k of SKILL_KEYS) { c += this.casts[k] || 0; h += this.hits[k] || 0; } return { c, h }; },
  apm() { return this.inputs / Math.max(1 / 60, this.t / 60); },
  snapshot() { return JSON.parse(JSON.stringify({ casts: this.casts, hits: this.hits, dealt: this.dealtTotal, taken: this.takenTotal, mistakes: this.mistakes })); },
};
Stats.reset();
