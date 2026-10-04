
// ============================== 엔티티: 기본 유닛 ==============================
let UID = 0;
class Unit {
  constructor(o) {
    this.id = ++UID; this.team = o.team ?? 1; this.name = o.name || ''; this.kind = o.kind || 'unit';
    this.pos = { x: o.x, y: o.y }; this.spawn = { x: o.x, y: o.y }; this.r = o.r || 0.5;
    this.maxHp = o.hp || 1000; this.hp = this.maxHp; this.def = o.def || 0; this.baseMs = o.ms ?? 3.5;
    this.color = o.color || '#888'; this.facing = o.facing ?? Math.PI; this.infinite = !!o.infinite; this.respawn = !!o.respawn;
    this.brain = o.brain || null; this.ai = o.ai || {};
    this.resetState();
  }
  resetState() {
    this.hp = this.maxHp; this.dead = false; this.deathT = 0;
    this.moveTarget = null; this.vel = { x: 0, y: 0 }; this.root = 0; this.stun = 0; this.slows = []; this.msBuffs = [];
    this.unstoppable = 0; this.forced = null; this.shield = 0; this.shieldT = 0; this.trauma = 0; this.traumaT = 0;
    this.crit = 0; this.healRed = 0; this.flash = 0; this.invuln = 0; this.rMaxMark = -99; this.fear = 0; this.fearFrom = null;
  }
  revive() { this.resetState(); this.pos = V.copy(this.spawn); FX.ring(this.pos, 0.2, 1.2, '#8a93a6', 0.4); }
  msMul() {
    let s = 0; for (const sl of this.slows) s = Math.max(s, sl.p);
    let b = 0; for (const m of this.msBuffs) b += m.p * (m.decay ? m.t / m.dur : 1);
    return Math.max(0.1, (1 - s) * (1 + b));
  }
  speed() { return this.baseMs * this.msMul(); }
  applyCC(type, dur) {
    if (this.dead || this.unstoppable > 0) return false;
    this[type] = Math.max(this[type], dur);
    if (type === 'stun') this.moveTarget = null;
    return true;
  }
  addSlow(p, dur) { if (this.unstoppable > 0) return; this.slows.push({ p, t: dur }); }
  addMsBuff(p, dur, decay, tag) { if (tag) this.msBuffs = this.msBuffs.filter(m => m.tag !== tag); this.msBuffs.push({ p, t: dur, dur, decay, tag }); }
  canMove() { return !this.dead && this.stun <= 0 && this.root <= 0 && !this.forced && this.baseMs > 0; }
  canAct() { return !this.dead && this.stun <= 0 && this.fear <= 0 && !this.forced; }
  // 공포: 시전자 반대 방향으로 걸어서 도망, 평타·스킬 불가
  applyFear(dur, from) { if (this.dead || this.unstoppable > 0) return false; this.fear = Math.max(this.fear, dur); this.fearFrom = V.copy(from); return true; }
  heal(a, silent) {
    if (this.dead) return 0;
    if (this.healRed > 0) a *= 1 - CONFIG.passive.healReduction;
    const before = this.hp; this.hp = Math.min(this.maxHp, this.hp + a);
    const h = this.hp - before; if (!silent && h > 0.5) FX.text(this.pos, '+' + Math.round(h), '#5dff9a', 12);
    return h;
  }
  tickStatus(dt) {
    const dec = k => { if (this[k] > 0) this[k] = Math.max(0, this[k] - dt); };
    ['root', 'stun', 'unstoppable', 'invuln', 'flash', 'healRed', 'crit', 'fear'].forEach(dec);
    if (this.traumaT > 0) { this.traumaT -= dt; if (this.traumaT <= 0) this.trauma = 0; }
    if (this.shieldT > 0) { this.shieldT -= dt; if (this.shieldT <= 0) this.shield = 0; }
    this.slows = this.slows.filter(s => (s.t -= dt) > 0);
    this.msBuffs = this.msBuffs.filter(m => (m.t -= dt) > 0);
    if (this.forced) {   // 강제 이동(끌려감)
      const f = this.forced; f.t += dt; const k = Math.min(1, f.t / f.dur);
      this.pos = V.lerp(f.from, f.to, k);
      if (k >= 1) { Geo.pushOut(this.pos, this.r); const cb = f.onEnd; this.forced = null; if (cb) cb(); }
    }
  }
  moveStep(dt) {
    if (!this.moveTarget || !this.canMove()) { this.vel = { x: 0, y: 0 }; return; }
    // 경유점(벽 모서리)은 도착할 때까지 유지 → 진동 방지
    if (this.wp && (!this.wpFor || V.dist(this.wpFor, this.moveTarget) > 0.8)) this.wp = null;
    if (!this.wp) { const g = Geo.detour(this.pos, this.moveTarget, this.r); if (g !== this.moveTarget) { this.wp = g; this.wpFor = V.copy(this.moveTarget); } }
    const goal = this.wp || this.moveTarget;
    const to = V.sub(goal, this.pos), d = V.len(to), sp = this.speed() * dt;
    if (d <= sp || d < 0.01) {
      this.pos = V.copy(goal); this.vel = { x: 0, y: 0 };
      if (this.wp) this.wp = null; else this.moveTarget = null;
    }
    else { const dir = V.mul(to, 1 / d); this.pos = V.add(this.pos, V.mul(dir, sp)); this.vel = V.mul(dir, this.speed()); this.facing = V.ang(dir); }
    Geo.pushOut(this.pos, this.r);
  }
  update(dt) {
    this.tickStatus(dt); if (this.dead) return;
    if (this.brain && this.canAct()) this.brain(this, dt);
    this.moveStep(dt);
  }
}

// ============================== 플레이어: 캐시 ==============================
class Cathy extends Unit {
  constructor(x, y) {
    const b = CONFIG.builds[Game.buildId];
    super({ team: 0, x, y, r: 0.5, hp: b.hp, def: b.def, ms: b.ms, color: CONFIG.theme.accent, name: '캐시', kind: 'player', facing: 0 });
    this.build = b; this.weapon = Settings.weapon;
    this.ad = b.ad; this.bonusAd = b.bonusAd; this.sp = b.sp; this.critChance = b.crit; this.cdr = b.cdr;
    this.as = +(b.as * (CONFIG.basicAttack[this.weapon].asMul || 1)).toFixed(2);   // 무기별 공속 보정(쌍검은 느림)
    this.pendingHits = [];
    this.maxSt = b.stamina; this.st = b.stamina;
    this.skills = {};
    for (const k of ['Q', 'W', 'E', 'R', 'D', 'F']) this.skills[k] = { lv: k === 'F' ? 1 : b.skill[k], cd: 0, cdMax: 1, reduced: false };
    this.cast = null; this.aa = { phase: 'none', t: 0, dur: 0 }; this.aaCd = 0;
    this.attackTarget = null; this.attackMove = null; this.enhanced = 0; this.buffer = null;
    this.daggerReady = 0; this.dualRecast = 0; this.lastAA = null; this.shieldBoostUsed = false; this.castSeq = 0; this.pendingMove = null;
  }
  skillDef(k) { return k === 'D' ? CONFIG.skills[this.weapon === 'dagger' ? 'D_dagger' : 'D_dual'] : CONFIG.skills[k]; }
  skillLabel(k) { return k + ' ' + this.skillDef(k).name; }
  startCd(k) {
    const def = this.skillDef(k), s = this.skills[k];
    s.cd = s.cdMax = lv(def.cd, s.lv) * (def.fixedCd ? 1 : 1 - this.cdr) * Game.cdMul; s.reduced = false;
  }
  aaCfg() { return CONFIG.basicAttack[this.weapon]; }
  aaWindupTime() { return this.enhanced > 0 ? CONFIG.basicAttack.enhanced.windup / Math.max(1, this.as) : this.aaCfg().windupRatio / this.as; }
  validTarget(t) { return t && !t.dead && Game.units.includes(t); }

  // ---------- 명령 (Input에서 호출) ----------
  cmdMove(pt) {
    Stats.input(); FX.mark(pt, '#5dff9a');
    this.attackTarget = null; this.attackMove = null;
    const dest = Geo.pushOut(V.copy(pt), this.r);
    if (this.cast) {
      const c = this.cast;
      if (c.phase === 'windup') {
        const def = this.skillDef(c.k);
        if (def.channel) { FX.toast('정신집중 중에는 움직일 수 없습니다', '#8a93a6'); return; }   // R: 이동 입력 무시
        const canCancel = CONFIG.input.moveCancelsWindup && def.moveCancel !== false;
        if (canCancel) { this.cancelCast(true); this.moveTarget = dest; } else this.pendingMove = dest;   // 수쳐 등 발사형은 끊기지 않고 발사 후 이동
        return;
      }
      if (c.phase === 'active') { this.pendingMove = dest; return; }
      if (c.phase === 'recovery') this.endCast();
    }
    this.breakAA(true);
    this.moveTarget = dest;
  }
  cmdAttack(t) {
    Stats.input(); FX.mark(t.pos, '#ff5d5d');
    if (this.cast && this.cast.phase === 'recovery') this.endCast();
    if (this.attackTarget !== t && this.aa.phase === 'windup') this.aa.phase = 'none';
    this.attackTarget = t; this.attackMove = null; this.moveTarget = null;
  }
  cmdAttackMove(pt) {
    Stats.input(); FX.mark(pt, '#ffb347');
    if (this.cast && this.cast.phase === 'recovery') this.endCast();
    this.breakAA(false);
    this.attackTarget = null; this.attackMove = Geo.pushOut(V.copy(pt), this.r); this.moveTarget = V.copy(this.attackMove);
  }
  cmdStop() {
    Stats.input();
    this.moveTarget = null; this.attackTarget = null; this.attackMove = null;
    this.breakAA(false);
    if (this.cast && this.cast.phase === 'recovery') this.endCast();
  }
  cmdSkill(k, aim) {
    Stats.input();
    if (this.dead) return;
    const busy = (this.cast && this.cast.phase !== 'recovery') || this.forced || this.stun > 0;
    if (busy) { this.buffer = { k, aim: V.copy(aim), time: performance.now() }; return; }
    this.tryCast(k, aim);
  }
  // 평타 모션 중단: 선딜(windup) 중 이동하면 평타가 취소됨
  breakAA(countMistake) {
    if (this.aa.phase === 'windup' && countMistake && this.aa.t > this.aa.dur * 0.35) Stats.mistake('평타 선딜 중 이동 → 평타 취소');
    this.aa.phase = 'none';
  }

  // ---------- 시전 ----------
  tryCast(k, aim) {
    const s = this.skills[k], def = this.skillDef(k);
    if (!s || s.lv <= 0) { FX.toast(`${def.name}: 아직 배우지 않았습니다`, '#aaa'); return false; }
    if (!this.canAct()) return false;
    if (k === 'F') { if (s.cd > 0) { this.cdError(k); return false; } this.interruptForCast(); this.blink(aim); return true; }
    if (k === 'D') return this.tryWeapon(aim);
    if (s.cd > 0) { this.cdError(k); return false; }
    if ((k === 'Q' || k === 'R') && this.root > 0) { FX.toast('속박 중에는 돌진할 수 없습니다'); return false; }
    const cost = def.stamina || 0; if (this.st < cost) { FX.toast('스태미나 부족', '#4aa3ff'); return false; }
    this.st -= cost;
    this.beginCast(k, aim, Impl[k], { cost });
    return true;
  }
  cdError(k) { Sfx.play('error'); HUD.flash(k); }
  tryWeapon(aim) {
    const s = this.skills.D, def = this.skillDef('D');
    if (this.weapon === 'dagger') {
      if (this.daggerReady > 0) {   // 2차: 대상 지정 이동
        const t = Game.pickEnemyAt(aim, CONFIG.input.pickRadius);
        if (!t) { Stats.mistake('단검 D: 대상 지정 실패 (커서 위에 적 없음)'); Sfx.play('error'); return false; }
        if (V.dist(this.pos, t.pos) - t.r > def.range) { Stats.mistake('단검 D: 사거리 밖 시전'); Sfx.play('error'); FX.toast('사거리 밖 (2.5m)'); return false; }
        this.beginCast('D', t.pos, Impl.Ddagger, { target: t }); return true;
      }
      if (s.cd > 0) { this.cdError('D'); return false; }
      // 1차: 유틸 — 이동 속도 증가 + 3초 내 재사용 가능 (TODO: 실제 1차 효과 확인)
      this.daggerReady = def.duration; this.addMsBuff(lv(def.msBoost, s.lv), def.msDur || def.duration, false, 'dagger');   // 망토: 1초 이속 증가
      this.enhanced = CONFIG.basicAttack.enhanced.timeout;   // 무기 스킬 사용 → 강화 평타
      FX.ring(this.pos, 0.3, 1.5, '#5ff0e6', 0.45, 0.1);
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.random(); FX.slash(this.pos, a, 1.3, 0.7, '#5ff0e6', 0.4, 0.7); }
      FX.burst(this.pos, '#7fb2ff', 14, 3); Sfx.play('blink'); Events.emit('action', { k: 'D1' });
      return true;
    }
    if (this.dualRecast > 0) { this.beginCast('D', aim, Impl.Ddual2, {}); return true; }
    if (s.cd > 0) { this.cdError('D'); return false; }
    this.beginCast('D', aim, Impl.Ddual1, {}); return true;
  }
  blink(aim) {
    const def = CONFIG.skills.F, dir = V.norm(V.sub(aim, this.pos)), dist = Math.min(def.dist, V.dist(this.pos, aim));
    const from = V.copy(this.pos); this.pos = Geo.pushOut(V.add(this.pos, V.mul(dir, dist)), this.r);
    FX.burst(from, '#ffffff', 12, 3); FX.ring(this.pos, 0.2, 1, '#ffffff', 0.3); Sfx.play('blink');
    this.moveTarget = null; this.startCd('F'); Events.emit('action', { k: 'F' });
  }
  interruptForCast() {
    if (this.cast && this.cast.phase === 'recovery') this.endCast();
    this.aa.phase = 'none';
  }
  beginCast(k, aim, impl, extra) {
    this.interruptForCast();
    const dir = V.dist(aim, this.pos) > 0.05 ? V.norm(V.sub(aim, this.pos)) : V.fromAng(this.facing);
    const c = { k, impl, phase: 'windup', t: 0, aim: V.copy(aim), dir, ang: V.ang(dir), windup: impl.windup(this), recovery: impl.recovery(this),
      id: ++this.castSeq, hitAny: false, traumaSet: new Set(), data: Object.assign({}, extra), cost: extra.cost || 0 };
    this.cast = c; this.facing = c.ang; this.moveTarget = null; this.pendingMove = null;
    if (impl.start) impl.start(this, c);
    if (c.windup <= 0) this.fireCast();
  }
  fireCast() {
    const c = this.cast; c.phase = 'active'; c.t = 0; c.origin = V.copy(this.pos);
    c.data.snap = {}; for (const e of Game.enemies()) c.data.snap[e.id] = V.copy(e.pos);
    Stats.cast(c.k);
    const qwer = 'QWERD'.includes(c.k);   // 시즌 12: 무기 스킬 사용 후에도 강화 평타 발동
    if (qwer && this.enhanced > 0) Stats.mistake('강화 평타를 쓰지 않고 다음 스킬 연계');
    c.impl.fire(this, c);
    if (qwer) this.enhanced = CONFIG.basicAttack.enhanced.timeout;   // Q 지속 효과: 스킬 사용 후 다음 평타 강화
    Events.emit('action', { k: c.impl.action || c.k });
  }
  cancelCast(mistake) {
    const c = this.cast; if (!c) return;
    if (mistake) Stats.mistake(`${this.skillLabel(c.k)} 선딜 중 이동 입력으로 캔슬됨`);
    this.st = Math.min(this.maxSt, this.st + c.cost); this.cast = null;
  }
  endCast() {
    const c = this.cast; this.cast = null;
    if (c && c.impl.end && !c.ended) { c.ended = true; c.impl.end(this, c); }
    if (this.pendingMove) { this.moveTarget = this.pendingMove; this.pendingMove = null; }
  }
  updateCast(dt) {
    const c = this.cast; c.t += dt;
    if (c.phase === 'windup') { if (c.t >= c.windup) this.fireCast(); return; }
    if (c.phase === 'active') {
      const done = c.impl.tick ? c.impl.tick(this, c, dt) : true;
      if (done) { c.phase = 'recovery'; c.t = 0; if (c.impl.end) { c.ended = true; c.impl.end(this, c); } if (c.recovery <= 0 || this.pendingMove) this.endCast(); }   // 이동 입력이 대기 중이면 후딜 없이 바로 이동
      return;
    }
    if (c.phase === 'recovery' && c.t >= c.recovery) this.endCast();
  }

  // ---------- 기본 공격 ----------
  updateAA() {
    const a = this.aa, dt = CONFIG.sim.step;
    if (a.phase === 'windup') {
      if (!this.validTarget(this.attackTarget)) { a.phase = 'none'; return false; }
      this.facing = V.ang(V.sub(this.attackTarget.pos, this.pos)); a.t += dt;
      if (a.t >= a.dur) this.aaHit(this.attackTarget);
      return true;
    }
    if (a.phase === 'back') { a.t += dt; if (a.t >= a.dur) a.phase = 'none'; else return true; }
    if (this.attackMove && !this.validTarget(this.attackTarget)) {
      const e = Game.nearestEnemy(this.pos, CONFIG.input.attackMoveAcquire); if (e) this.attackTarget = e;
    }
    const t = this.attackTarget;
    if (this.validTarget(t)) {
      const d = V.dist(this.pos, t.pos) - t.r - this.r;
      if (d <= this.aaCfg().range) {
        this.moveTarget = null;
        if (this.aaCd <= 0 && this.canAct()) { a.phase = 'windup'; a.t = 0; a.dur = this.instantAA > 0 && this.enhanced > 0 ? 0.02 : this.aaWindupTime(); this.instantAA = 0; this.aaCd = 1 / this.as; }
        return true;
      }
      if (this.canMove()) this.moveTarget = V.copy(t.pos);
      return false;
    } else if (this.attackTarget) this.attackTarget = null;
    if (this.attackMove && !this.moveTarget) this.attackMove = null;
    return false;
  }
  aaHit(t) {
    const cfg = this.aaCfg(), crit = Math.random() < this.critChance, enh = this.enhanced > 0, Q = CONFIG.skills.Q;
    if (enh) {   // 강화 평타: 1회 (쌍검은 공격력 110%)
      Combat.damage(this, t, this.ad * (this.weapon === 'dual' ? Q.dualEnhAd : 1) * (crit ? cfg.critMul : 1), { type: 'normal', source: 'AA', crit });
    } else {     // 일반 평타: 쌍검은 공격력 80% × 2회 (2타는 잠시 뒤)
      Combat.damage(this, t, this.ad * cfg.hitRatio * (crit ? cfg.critMul : 1), { type: 'normal', source: 'AA', crit });
      for (let i = 1; i < (cfg.hits || 1); i++) this.pendingHits.push({ t: cfg.hitGap * i, target: t });
    }
    if (enh) {
      this.enhanced = 0;
      if (!t.dead) Combat.damage(this, t, Math.max(Q.enhMin, this.sp * Q.enhSp), { type: 'skill', source: 'AA+', trauma: true, min: Q.enhMin });
      Stats.enhAA++; Events.emit('enhAA');
      { const d = V.fromAng(this.facing); FX.arc(V.sub(this.pos, V.mul(d, 0.3)), d, 3.4, 0.7, CONFIG.theme.accent, 0.45); FX.burst(t.pos, '#ffffff', 10, 5); FX.addShake(4); }
    }
    Stats.aaHits++; this.lastAA = { time: Game.time };
    Events.emit('action', { k: 'AA', enh });
    FX.burst(t.pos, enh ? '#ff9fb2' : '#ffffff', 6, 3); Sfx.play('aa');
    this.aa.phase = 'back'; this.aa.t = 0; this.aa.dur = cfg.backRatio / this.as;
  }

  // ---------- 매 스텝 ----------
  update(dt) {
    this.tickStatus(dt);
    for (const k in this.skills) { const s = this.skills[k]; s.cd = Math.max(0, s.cd - dt); }
    this.aaCd -= dt;
    this.st = Math.min(this.maxSt, this.st + CONFIG.staminaRegen * dt);
    if (this.enhanced > 0) this.enhanced = Math.max(0, this.enhanced - dt);
    if (this.instantAA > 0) this.instantAA = Math.max(0, this.instantAA - dt);
    // 쌍검 2타: 대상이 살아 있고 사거리 근처면 적중 (치명 별도 판정)
    for (const h of this.pendingHits) {
      if ((h.t -= dt) > 0) continue; h.done = true;
      const t = h.target, cfg = this.aaCfg();
      if (!t || t.dead || this.dead || V.dist(this.pos, t.pos) - t.r - this.r > cfg.range + 0.6) continue;
      const crit = Math.random() < this.critChance;
      Combat.damage(this, t, this.ad * cfg.hitRatio * (crit ? cfg.critMul : 1), { type: 'normal', source: 'AA', crit, noShake: true });
      FX.burst(t.pos, '#ffffff', 4, 3); Sfx.play('aa');
    }
    this.pendingHits = this.pendingHits.filter(h => !h.done);
    if (this.daggerReady > 0) {
      this.daggerReady -= dt;
      if (this.daggerReady <= 0 && !(this.cast && this.cast.impl === Impl.Ddagger)) { this.daggerReady = 0; this.startCd('D'); this.msBuffs = this.msBuffs.filter(m => m.tag !== 'dagger'); }
    }
    if (this.dualRecast > 0) {
      this.dualRecast -= dt;
      if (this.dualRecast <= 0 && !(this.cast && this.cast.impl === Impl.Ddual2)) { this.dualRecast = 0; this.startCd('D'); }
    }
    if (this.dead) return;
    Stats.trackWaste(this, dt);
    this.passiveMoveBoost();
    if (this.forced) return;
    if (this.stun > 0) { if (this.cast && this.cast.phase === 'windup') this.cancelCast(false); this.aa.phase = 'none'; return; }
    if (this.fear > 0) {   // 공포: 시전 취소, 시전자 반대로 걸어감
      if (this.cast && this.cast.phase === 'windup') this.cancelCast(false);
      this.aa.phase = 'none'; this.attackTarget = null; this.buffer = null;
      if (this.fearFrom) this.moveTarget = Geo.pushOut(V.add(this.pos, V.mul(V.norm(V.sub(this.pos, this.fearFrom)), 2)), this.r);
      this.moveStep(dt); return;
    }
    if (this.cast) { this.updateCast(dt); if (this.cast) return; }
    if (this.buffer) {   // 선입력 처리
      const b = this.buffer; this.buffer = null;
      if (performance.now() - b.time <= CONFIG.input.bufferMs) this.tryCast(b.k, b.aim);
      else Stats.mistake('너무 이른 선입력 (입력 씹힘)');
      if (this.cast) return;
    }
    if (this.updateAA()) return;
    this.moveStep(dt);
    if (this.attackMove && !this.moveTarget && !this.attackTarget) this.attackMove = null;
  }
  // 패시브: 보호막 보유 중 외상 대상에게 이동하면 이동 속도 증가 후 감소
  passiveMoveBoost() {
    const P = CONFIG.passive;
    if (this.shield <= 0) return;
    if (this.shieldBoostUsed || !this.moveTarget) return;
    const md = V.norm(V.sub(this.moveTarget, this.pos)), cosA = Math.cos(P.moveBoostAngle * Math.PI / 180);
    for (const e of Game.enemies()) {
      if ((e.trauma > 0 || e.crit > 0) && V.dist(e.pos, this.pos) < 10 && V.dot(md, V.norm(V.sub(e.pos, this.pos))) > cosA) {
        this.addMsBuff(lv(P.moveBoost, Passive.lvl()), P.moveBoostDur, true, 'pboost'); this.shieldBoostUsed = true;
        FX.text(this.pos, '이속↑', CONFIG.theme.accent2, 12); break;
      }
    }
  }
}

// ============================== 스킬 적중 공통 처리 ==============================
function skillHit(p, c, e, amount, o = {}) {
  if (e.dead) return;
  c.hitAny = true;
  const first = Stats.hit(c.k, c.id);
  // 예측샷 판정: 움직이는 대상에게 '현재 위치가 아닌 곳'을 노려 맞췄는가
  if (first && c.data.snap && V.len(e.vel) > 0.6) {
    Stats.movingHits++;
    const s0 = c.data.snap[e.id];
    if (s0 && V.dist(s0, c.origin) > 1.5 && Math.abs(angDiff(V.ang(V.sub(s0, c.origin)), c.ang)) > 0.1) Stats.leadHits++;
  }
  const trauma = o.trauma !== false && !c.traumaSet.has(e.id);   // 외상은 시전당 대상 1회
  if (trauma) c.traumaSet.add(e.id);
  Combat.damage(p, e, amount, { type: 'skill', source: o.source || c.k, trauma });
  Events.emit('skillHit', { k: c.k, target: e });
}

// ============================== 스킬 구현 (선딜 → 발동 → 후딜) ==============================
const S = CONFIG.skills;
const Impl = {
  Q: {
    windup: () => S.Q.windup, recovery: () => S.Q.recovery,
    fire(p, c) {
      const s = p.skills.Q;
      if (s.reduced) { Events.emit('qReset'); FX.text(p.pos, 'Q 재사용!', CONFIG.theme.accent2, 14, { bold: true }); }
      p.startCd('Q');
      const len = S.Q.passWalls ? Geo.passLanding(p.pos, c.dir, S.Q.dashDist, p.r) : Geo.clampDash(p.pos, c.dir, S.Q.dashDist, p.r);
      Object.assign(c.data, { from: V.copy(p.pos), to: V.add(p.pos, V.mul(c.dir, len)), dur: Math.max(0.03, S.Q.dashTime * len / S.Q.dashDist), t: 0, hit: new Set() });
      Sfx.play('dash');
    },
    tick(p, c, dt) {
      const d = c.data; d.t += dt; const k = Math.min(1, d.t / d.dur), prev = V.copy(p.pos);
      p.pos = V.lerp(d.from, d.to, k); FX.trail(prev, p.pos, CONFIG.theme.accent, 0.42, 0.6); FX.trail(prev, p.pos, '#ffe0e6', 0.08, 0.35);
      for (const e of Game.enemies()) {
        if (d.hit.has(e.id)) continue;
        if (Geo.segDist(e.pos, d.from, p.pos) <= e.r + S.Q.hitWidth / 2) {
          d.hit.add(e.id);
          skillHit(p, c, e, lv(S.Q.dmg, p.skills.Q.lv) + p.sp * S.Q.sp);
          FX.burst(e.pos, '#7f9bff', 12, 5); FX.ring(e.pos, 0.1, 0.9, '#9fb4ff', 0.25, 0.08);
        }
      }
      return k >= 1;
    },
    end(p, c) { Stats.resolveShot('Q', c.hitAny); },
  },
  W: {
    windup: () => S.W.windup, recovery: () => S.W.recovery,
    fire(p, c) {
      p.startCd('W'); Sfx.play('slash');
      const half = S.W.angle / 2 * Math.PI / 180, l = p.skills.W.lv;
      FX.slash(p.pos, c.ang, S.W.range, half, CONFIG.theme.accent, 0.6, S.W.innerRange);
      FX.slash(p.pos, c.ang, S.W.innerRange, half * 0.9, '#e8edf5', 0.22, 0.6);
      let inner = 0, outer = 0;
      for (const e of Game.enemies()) {
        if (!Geo.inSector(p.pos, c.ang, S.W.range, half, e.pos, e.r)) continue;
        if (V.dist(p.pos, e.pos) + e.r <= S.W.innerRange) { /* 완전히 안쪽일 때만 안쪽 판정 */ skillHit(p, c, e, lv(S.W.innerDmg, l) + p.sp * S.W.innerSp, { trauma: false }); inner++; FX.trail(V.add(e.pos, V.fromAng(c.ang + 2.2)), V.add(e.pos, V.fromAng(c.ang - 0.9)), '#9fb4ff', 0.08, 0.3); }
        else { skillHit(p, c, e, lv(S.W.outerDmg, l) + p.sp * S.W.outerSp); e.addSlow(S.W.slow, S.W.slowDur); outer++; FX.text(e.pos, '바깥 적중', CONFIG.theme.accent2, 12, { bold: true }); }
      }
      if (inner > 0 && outer === 0) Stats.mistake('W 안쪽 범위만 적중 (외상·둔화 미적용)');
      Stats.resolveShot('W', inner + outer > 0);
    },
  },
  E: {
    windup: () => S.E.windup, recovery: () => S.E.recovery,
    fire(p, c) {
      p.startCd('E'); Sfx.play('throw');
      const l = p.skills.E.lv, dmg = lv(S.E.dmg, l) + p.sp * S.E.sp;
      const near = Game.pickEnemyAt(c.aim, 1.6), oor = near && V.dist(p.pos, near.pos) - near.r > S.E.range;
      Game.projectiles.push(new Projectile({
        team: 0, owner: p, kind: 'needle', pos: V.copy(p.pos), dir: c.dir, speed: S.E.speed, range: S.E.range, width: S.E.width, assist: S.E.hitAssist,
        onUnit: (pr, u) => {
          if (!pr.first) {
            pr.first = u; skillHit(p, c, u, dmg); u.applyCC('root', S.E.root); FX.burst(u.pos, CONFIG.theme.accent2, 8, 4);
            pr.assist = S.E.pierceAssist; pr.wallPad = S.E.wallAssist * 0.5; pr.range += S.E.wallAssist;   // 관통 후 판정은 널널
            // 유도: 진행 방향 기준 각도·거리 안의 가장 가까운 적을 두 번째 대상으로
            const left = pr.range - pr.traveled; let best = null, bd = Infinity;
            for (const e2 of Game.enemies()) {
              if (e2 === u) continue;
              const d2 = V.dist(u.pos, e2.pos); if (d2 > S.E.homingRange || d2 > left + e2.r + 0.5) continue;
              if (Math.abs(angDiff(V.ang(V.sub(e2.pos, u.pos)), V.ang(pr.dir))) > S.E.homingAngle * Math.PI / 180) continue;
              if (d2 < bd) { bd = d2; best = e2; }
            }
            if (best) { pr.homeTarget = best; pr.homeTurn = S.E.homingTurn; pr.range = Math.max(pr.range, pr.traveled + bd + 0.5); }
            return 'continue';
          }
          skillHit(p, c, u, dmg); Impl.E.pull(p, pr.first, u.pos, u, pr.dir); return 'stop';   // 관통: 최대 1명 추가
        },
        onWall: (pr, pt) => { if (pr.first) Impl.E.pull(p, pr.first, pt, null, pr.dir); },
        onDone: pr => { Stats.resolveShot('E', !!pr.first); if (!pr.first && oor) Stats.mistake('E 사거리 밖 시전'); },
      }));
    },
    // 먼저 맞은 적을 나중에 맞은 쪽(적/벽)으로 끌어 충돌 → 추가 피해 + 기절 (외상 없음)
    pull(p, first, point, second, dir) {
      if (first.dead) return;
      const to = second ? V.sub(second.pos, V.mul(V.norm(V.sub(second.pos, first.pos)), first.r + second.r)) : V.sub(point, V.mul(dir, first.r + 0.03));
      const bonus = lv(S.E.bonus, p.skills.E.lv) + p.sp * S.E.bonusSp;
      const impact = () => {
        for (const u of [first, second]) { if (!u || u.dead) continue; Combat.damage(p, u, bonus, { type: 'skill', source: 'E충돌' }); u.applyCC('stun', S.E.stun); }
        FX.blood(first.pos); FX.addShake(9); Sfx.play('stun');
        if (second) { Stats.eDouble++; Events.emit('eDouble'); FX.text(first.pos, '2인 수쳐!', CONFIG.theme.gold, 19, { bold: true }); }
        else { Stats.eWall++; Events.emit('eWall'); FX.text(first.pos, '벽 충돌!', CONFIG.theme.gold, 17, { bold: true }); }
      };
      if (first.unstoppable > 0) { impact(); return; }
      first.root = 0;
      if (second && second.unstoppable <= 0 && !second.forced) {   // 두 번째 대상도 첫 대상 쪽으로 약간 끌려감
        const gap = V.dist(first.pos, second.pos) - first.r - second.r;
        if (gap > 0.05) { const d2 = V.mul(V.norm(V.sub(first.pos, second.pos)), gap * S.E.secondPull); second.forced = { from: V.copy(second.pos), to: Geo.pushOut(V.add(second.pos, d2), second.r), t: 0, dur: S.E.pullTime }; }
      }
      first.forced = { from: V.copy(first.pos), to, t: 0, dur: S.E.pullTime, onEnd: impact };
    },
  },
  R: {
    windup: () => S.R.windup, recovery: () => S.R.recovery,
    start(p, c) { c.data.len = clamp(V.dist(p.pos, c.aim), S.R.minDist, S.R.maxDist); },
    fire(p, c) {
      p.startCd('R'); Sfx.play('ult'); FX.addShake(6);
      const len = Geo.clampDash(p.pos, c.dir, c.data.len, p.r);
      Object.assign(c.data, { from: V.copy(p.pos), to: V.add(p.pos, V.mul(c.dir, len)), len, dur: Math.max(0.08, S.R.dashTime * len / S.R.maxDist), t: 0, hit: new Set() });
      p.unstoppable = c.data.dur + 0.1; p.slows = []; p.root = 0;   // 이동 중 저지 불가
    },
    tick(p, c, dt) {
      const d = c.data; d.t += dt; const k = Math.min(1, d.t / d.dur), prev = V.copy(p.pos);
      p.pos = V.lerp(d.from, d.to, k); FX.trail(prev, p.pos, CONFIG.theme.accent, S.R.width * 0.9, 0.5); FX.trail(prev, p.pos, '#ffd0d8', 0.12, 0.4);
      const l = p.skills.R.lv;
      for (const e of Game.enemies()) {
        if (d.hit.has(e.id) || !Geo.inORect(d.from, c.dir, d.len * k, S.R.width / 2, e.pos, e.r)) continue;
        d.hit.add(e.id);
        const ratio = e.hp / e.maxHp, t = clamp((1 - ratio) / (1 - S.R.maxHpThreshold), 0, 1);   // 잃은 체력 비례
        const amt = lerp(lv(S.R.minDmg, l), lv(S.R.maxDmg, l), t) + p.sp * lerp(S.R.minSp, S.R.maxSp, t);
        if (ratio <= S.R.maxHpThreshold) { e.rMaxMark = Game.time; FX.text(e.pos, '최대 피해!', CONFIG.theme.accent, 17, { bold: true }); }
        if (ratio > 0.7) Stats.mistake('R을 체력 70% 이상 대상에게 사용 (최소 피해 구간)');
        skillHit(p, c, e, amt, { trauma: false });
        if (!e.dead) Passive.critical(e, 'R');
        FX.xslash(e.pos); FX.burst(e.pos, CONFIG.theme.accent, 20, 7);
      }
      return k >= 1;
    },
    end(p, c) {
      const d = c.data;
      Game.zones.push({ type: 'heal', from: d.from, dir: c.dir, len: d.len, width: S.R.width, t: S.R.zoneDur, max: S.R.zoneDur, acc: 0, accT: 0 });
      // 나무위키: 자동 공격 시 궁극기 직후 딜레이 없이 바로 강화 기본 공격
      if (!p.validTarget(p.attackTarget)) { const e = Game.nearestEnemy(p.pos, p.aaCfg().range + p.r + 0.6); if (e) p.attackTarget = e; }
      if (p.validTarget(p.attackTarget)) { p.instantAA = 0.6; p.aaCd = 0; c.recovery = 0; }
      Stats.resolveShot('R', c.hitAny);
    },
  },
  Ddagger: {
    action: 'D', windup: () => S.D_dagger.windup, recovery: () => S.D_dagger.recovery,
    fire(p, c) {
      const def = S.D_dagger, l = p.skills.D.lv, t = c.data.target;
      p.daggerReady = 0; p.msBuffs = p.msBuffs.filter(m => m.tag !== 'dagger'); p.startCd('D');
      if (!t || t.dead) return;
      const dir = V.norm(V.sub(t.pos, p.pos)), prev = V.copy(p.pos);
      p.pos = Geo.pushOut(V.add(t.pos, V.mul(dir, def.behind)), p.r);   // 지형 통과: 대상 건너 1.5m
      p.facing = V.ang(V.mul(dir, -1));
      FX.trail(prev, p.pos, '#9fd8ff', 0.18, 0.25); FX.burst(prev, '#7fb2ff', 10, 3); Sfx.play('blink');
      FX.slash(t.pos, V.ang(V.mul(dir, -1)), 1.5, 1.3, '#ffffff', 0.35, 1.05); FX.burst(t.pos, '#ff8fc8', 18, 6, 0.4, 0.12); FX.ring(t.pos, 0.1, 1.1, '#ff6fae', 0.25, 0.1); FX.addShake(5);
      const cur = t.hp;
      skillHit(p, c, t, lv(def.dmg, l) + p.bonusAd * def.bonusAd + p.sp * def.sp);
      if (!t.dead) Combat.damage(p, t, cur * def.curHpPct, { type: 'true', source: 'D' });
      t.addSlow(lv(def.slow, l), def.slowDur);
      p.attackTarget = t;
    },
  },
  Ddual1: {
    action: 'D', windup: () => 0, recovery: () => S.D_dual.recovery,
    fire(p, c) {
      const len = Geo.clampDash(p.pos, c.dir, S.D_dual.dist, p.r);   // 벽 통과 불가
      Object.assign(c.data, { from: V.copy(p.pos), to: V.add(p.pos, V.mul(c.dir, len)), dur: S.D_dual.time1, t: 0, ticks: 0 });
      Sfx.play('dash');
    },
    tick(p, c, dt) {
      const d = c.data, def = S.D_dual, l = p.skills.D.lv; d.t += dt;
      const k = Math.min(1, d.t / d.dur), prev = V.copy(p.pos), ease = 1 - Math.pow(1 - Math.min(1, k * 1.6), 3);
      p.pos = V.lerp(d.from, d.to, ease); FX.trail(prev, p.pos, '#ff9f43', 0.5, 0.25);
      const want = Math.min(def.hits1, Math.floor(k * def.hits1 + 1e-6));
      while (d.ticks < want) {
        d.ticks++;
        for (const e of Game.enemies()) if (Geo.segDist(e.pos, d.from, p.pos) <= e.r + def.hitWidth / 2) {
          skillHit(p, c, e, lv(def.dmg1, l) + p.bonusAd * lv(def.ad1, l) + p.sp * lv(def.sp1, l)); FX.burst(e.pos, '#ff5d3b', 6, 4);
        }
        const a = d.ticks * 2.3 + Math.random() * 0.6;
        FX.slash(p.pos, a, 1.6, 0.9, d.ticks % 2 ? '#ffb347' : '#ff7b3b', 0.28, 1.15);
        if (d.ticks === def.hits1) { FX.burst(p.pos, '#ff2a3d', 22, 6); FX.addShake(4); }
      }
      return k >= 1;
    },
    end(p, c) { if (c.hitAny) { p.dualRecast = S.D_dual.recastWindow; FX.toast('쌍검 2식 사용 가능 (5초)', '#ff8fa3'); } else p.startCd('D'); },
  },
  Ddual2: {
    action: 'D2', windup: () => 0, recovery: () => S.D_dual.recovery,
    fire(p, c) {
      p.dualRecast = 0;
      const len = Geo.clampDash(p.pos, c.dir, S.D_dual.dist, p.r);
      Object.assign(c.data, { from: V.copy(p.pos), to: V.add(p.pos, V.mul(c.dir, len)), dur: S.D_dual.time2, t: 0, hit: new Set() });
      Sfx.play('dash');
    },
    tick(p, c, dt) {
      const d = c.data, def = S.D_dual, l = p.skills.D.lv; d.t += dt;
      const k = Math.min(1, d.t / d.dur), prev = V.copy(p.pos);
      p.pos = V.lerp(d.from, d.to, k); FX.trail(prev, p.pos, '#ff8f3b', 0.9, 0.35);
      FX.slash(p.pos, c.ang, 1.8, 1.1, '#ffb347', 0.12, 1.3);
      for (const e of Game.enemies()) {
        if (d.hit.has(e.id) || Geo.segDist(e.pos, d.from, p.pos) > e.r + def.hitWidth / 2) continue;
        d.hit.add(e.id); skillHit(p, c, e, lv(def.dmg2, l) + p.bonusAd * lv(def.ad2, l) + p.sp * lv(def.sp2, l)); FX.burst(e.pos, '#ff8f3b', 20, 7); FX.ring(e.pos, 0.2, 1.4, '#ffc857', 0.35, 0.12); FX.addShake(6);
      }
      return k >= 1;
    },
    end(p) { p.startCd('D'); },
  },
};

// ============================== 투사체 ==============================
class Projectile {
  constructor(o) { Object.assign(this, o); this.traveled = 0; this.hit = new Set(); this.seen = new Set(); this.dead = false; this.start = V.copy(o.pos); }
  finish() { if (!this.dead) { this.dead = true; if (this.onDone) this.onDone(this); } }
  update(dt) {
    if (this.homeTarget && !this.homeTarget.dead) {   // 유도: 목표 방향으로 회전
      const want = V.ang(V.sub(this.homeTarget.pos, this.pos)), cur = V.ang(this.dir), d = angDiff(want, cur), mx = (this.homeTurn || 10) * dt;
      this.dir = V.fromAng(cur + clamp(d, -mx, mx));
    }
    const prev = V.copy(this.pos), move = Math.min(this.speed * dt, this.range - this.traveled);
    const tw = this.homeTarget && this.owner && this.owner.team === 1 ? Infinity : Geo.rayHit(prev, this.dir, move, this.width / 2 + (this.wallPad || 0)), segEnd = tw < Infinity ? tw : move;
    // 이번 스텝 경로 위의 유닛을 진행 순서대로 판정
    const cands = [];
    for (const u of Game.units) {
      if (u.dead || u.team === this.team || this.hit.has(u.id)) continue;
      const rel = V.sub(u.pos, prev), along = V.dot(rel, this.dir), perp = Math.abs(rel.x * this.dir.y - rel.y * this.dir.x);
      if (along >= -u.r && along <= segEnd + u.r && perp <= u.r + this.width / 2 + (this.assist || 0)) cands.push({ u, along });
    }
    cands.sort((a, b) => a.along - b.along);
    for (const { u, along } of cands) {
      this.hit.add(u.id);
      if (this.onUnit(this, u) === 'stop') { this.pos = V.add(prev, V.mul(this.dir, Math.max(0, along))); this.finish(); return; }
    }
    this.pos = V.add(prev, V.mul(this.dir, segEnd)); this.traveled += segEnd;
    if (tw < Infinity) { if (this.onWall) this.onWall(this, V.copy(this.pos)); this.finish(); return; }
    if (this.traveled >= this.range - 1e-6) this.finish();
  }
}
