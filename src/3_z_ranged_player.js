
// ============================== 플레이어블: 원거리 실험체 (아야 · 리오 · 나딘 · 카티야) ==============================
// 캐시의 조작 흐름(Cathy: 명령·선입력·시전 상태 기계·평타 쫓아가기)을 그대로 쓰고, 평타를 유도 투사체로, 스킬을 실험체 키트(PKits)로 바꿈
// 수치: CONFIG.rangedKits (12.5 라이브 기준, 근거 docs/er_notes_playables.md) / 능력치: CONFIG.rangedMotifs + CONFIG.rangedAI.stages (AI와 같은 값)
// 조작 규칙(노트 각 장 「플레이어 조작 구현 메모」):
//   대상 지정(아야 Q)은 사거리 밖이면 다가가서 시전 · 재입력 스킬(아야 W 중단, 리오 R 강한 화살, 나딘 Q 발사·W 두 번째 덫·E 와이어 이동, 카티야 D 발사)
//   무기 스킬(D)·리오 Q는 쿨감 무시
class RangedPlayer extends Cathy {
  constructor(x, y, key) {
    super(x, y, null);   // 장비 없음(AI와 같은 실측 능력치)
    const M = CONFIG.rangedMotifs[key], RA = CONFIG.rangedAI, st = ['early', 'mid', 'late'].includes(Game.buildId) ? Game.buildId : 'mid', si = ['early', 'mid', 'late'].indexOf(st), S0 = RA.stages[st];
    this.charKey = key; this.ranged = true; this.motif = M; this.name = M.name; this.color = M.color; this.weapon = M.weapon; this.usesTrauma = false;
    this.maxHp = this.hp = M.hp ? M.hp[si] : S0.hp; this.def = M.def ? M.def[si] : S0.def; this.baseMs = (M.ms ? M.ms[si] : S0.ms) || this.baseMs; this.baseHpAtLv = 900 + 76 * (S0.level - 1);
    this.ad = M.ad[si]; this.sp = M.sp[si]; this.as = M.as[si]; this.critChance = M.crit[si]; this.penPct = M.pen[si]; this.aaAmp = M.aaAmp ? M.aaAmp[si] : 0;
    this.bonusAd = Math.max(0, this.ad - (M.baseAd ? M.baseAd[si] : S0.baseAd)); this.cdr = 0; this.stacks = S0.stacks;
    this.build = Object.assign({}, this.build, { level: S0.level });
    const L = M.skillLv ? M.skillLv[si] : S0.skillLv; this.plv = L.P || 1;
    for (const k of ['Q', 'W', 'E', 'R', 'D']) this.skills[k].lv = L[k] || 1;
    this.K = CONFIG.rangedKits[key]; this.kit = PKits[key];
    Object.assign(this, { asBuffs: [], noAA: 0, chans: [], pend: [], chase: null, zones: [] });
    if (this.kit.init) this.kit.init(this);
  }
  // ---------- 수치 ----------
  L(k) { return k === 'P' ? this.plv : this.skills[k].lv; }
  calc(o, k) { const L = this.L(k); return lv(o.base || 0, L) + this.ad * lv(o.ad || 0, L) + this.bonusAd * lv(o.bad || 0, L) + this.sp * lv(o.sp || 0, L); }
  penNow() { return this.kit.pen ? this.kit.pen(this) : this.penPct; }
  skillDef(k) {
    if (k === 'F') return super.skillDef('F');
    const d = this.K[k] || {}, x = (this.kit.def && this.kit.def[k]) || {};
    return Object.assign({ short: this.kit.label ? this.kit.label(this, k) : this.kit.short[k] }, d, { fixedCd: k === 'D' || !!x.fixedCd }, x);
  }
  baseAaCfg() { return { label: this.weapon, range: this.kit.aaRange ? this.kit.aaRange(this) : this.motif.aaRange, windupRatio: CONFIG.rangedAI.aaWindup, backRatio: 0.12, critMul: 1.75, hits: 1, hitRatio: 1 }; }
  atkSpd() { let b = 0; for (const a of this.asBuffs) b += a.p; return Math.max(0.2, (this.as + (this.kit.asFlat ? this.kit.asFlat(this) : 0)) * (1 + b)) * (this.lightWing ? 1 + CONFIG.tactical.lightwing.as : 1) * ItemFx.asMul(this); }
  aaWindupTime() { return CONFIG.rangedAI.aaWindup / Math.max(1, this.atkSpd()); }   // AI 원딜과 같은 선딜
  addAs(p, dur, tag) { if (tag) this.asBuffs = this.asBuffs.filter(a => a.tag !== tag); this.asBuffs.push({ p, t: dur, tag }); }
  passiveMoveBoost() {}   // 캐시 패시브 없음
  // ---------- 공용 도우미 ----------
  dirTo(aim) { return V.dist(aim, this.pos) > 0.05 ? V.norm(V.sub(aim, this.pos)) : V.fromAng(this.facing); }
  ptIn(aim, r) { const d = Math.min(r, V.dist(this.pos, aim)), q = V.add(this.pos, V.mul(this.dirTo(aim), d)); q.x = clamp(q.x, 0.3, CONFIG.world.w - 0.3); q.y = clamp(q.y, 0.3, CONFIG.world.h - 0.3); return q; }
  foes() { return Game.units.filter(u => u.team !== this.team && !u.dead && u.kind !== 'ward' && !(u.untargetable > 0)); }
  // 스킬 피해: 통계(적중) + 키트 적중 훅(아야 P 쿨 감소·리오 카이츄 등)
  hitS(u, amt, k, o = {}) {
    if (!u || u.dead) return 0;
    const dmg = Combat.damage(this, u, amt, Object.assign({ type: 'skill', source: k, pen: this.penNow() }, o));
    if (u.kind !== 'animal') this.S.hit(k, o.hid || (k + ':' + this.castSeq));
    if (this.kit.onHit) this.kit.onHit(this, u, o, dmg);
    Events.emit('skillHit', { k, target: u });
    return dmg;
  }
  // 투사체: only = 그 대상에게만 맞음(대상 지정 탄), home = 유도
  shot(o) {
    const pr = new Projectile({ team: this.team, owner: this, kind: 'shot', color: o.color || this.color, len: o.len || 0.6, pos: V.copy(o.from || this.pos), dir: o.dir, speed: o.speed, range: o.range, width: o.width || 0.3, wallPad: o.wallPad,
      onUnit: (pr, u) => { if (o.only && u !== o.only) return 'continue'; if (o.heroOnly && !isHero(u) && u.kind !== 'dummy') return 'continue'; const r = o.onHit(u, pr); return r === 'continue' || o.pierce ? 'continue' : 'stop'; } });
    if (o.onWall) pr.onWall = o.onWall;
    if (o.home) { pr.homeTarget = o.home; pr.homeTurn = 80; pr.range = o.range || V.dist(this.pos, o.home.pos) + 8; }
    Game.projectiles.push(pr); return pr;
  }
  after(t, fn) { this.pend.push({ t, fn }); }
  // 커서 아래 적(대상 지정)
  targetAt(aim, k) {
    const t = Game.pickEnemyAt(aim, CONFIG.input.pickRadius, this);
    if (!t || t.kind === 'ward') { this.S.mistake(`${this.skillDef(k).name}: 대상 지정 실패 (커서 위에 적 없음)`); Sfx.playFor(this, 'error'); return null; }
    return t;
  }
  // 사거리 밖 대상 지정: 다가가서 시전 (다른 명령을 내리면 취소)
  chaseCast(k, t, range, fn) {
    if (V.dist(this.pos, t.pos) - t.r - this.r <= range) { fn(); return true; }
    this.chase = { k, t, range, fn }; this.attackTarget = null; this.attackMove = null; this.moveTarget = V.copy(t.pos); return true;
  }
  cmdMove(pt) { this.chase = null; super.cmdMove(pt); }
  cmdAttack(t) { this.chase = null; super.cmdAttack(t); }
  cmdStop() { this.chase = null; super.cmdStop(); }
  // 재입력·즉시 처리(시전 중에도): 카티야 저격 발사 등
  cmdSkill(k, aim) {
    if (this.kit.instant && !this.dead && this.kit.instant(this, k, aim)) { this.S.input(); return; }
    super.cmdSkill(k, aim);
  }
  recastReady(k) { return !!(this.kit.recast && this.kit.recast(this, k)); }
  instantKey(k) { return (this.kit.noAim || []).includes(k) || this.recastReady(k); }
  // 그리기용 조준점(내 캐릭터면 지금 커서, 아니면 마지막 명령 좌표)
  aimPt() { return (this === Game.player && typeof Input !== 'undefined' && Input.world) || this.cursor || V.add(this.pos, V.fromAng(this.facing)); }
  // 시전 상태 기계: 짧은 돌진·도약 (시전 중 이동 불가)
  dash(k, dir, dist, time, wallPass, onEnd) {
    this.beginCast(k, V.add(this.pos, dir), { windup: () => 0, recovery: () => 0.03,
      fire: (p, c) => { const len = wallPass ? Geo.passDash(p.pos, dir, dist, p.r, wallPass) : Geo.clampDash(p.pos, dir, dist, p.r); c.data.from = V.copy(p.pos); c.data.to = Geo.pushOut(V.add(p.pos, V.mul(dir, len)), p.r); },
      tick: (p, c) => { const kk = Math.min(1, c.t / Math.max(0.01, time)); p.pos = V.lerp(c.data.from, c.data.to, kk); if (kk >= 1 && onEnd) { onEnd(p); } return kk >= 1; } }, {});
  }
  // ---------- 시전 ----------
  tryCast(k, aim) {
    if (k === 'F') return super.tryCast(k, aim);
    const s = this.skills[k], def = this.skillDef(k);
    if (this.recastReady(k) && this.canAct()) return this.kit.cast[k](this, aim);   // 재입력(쿨 중에도)
    if (!s || s.lv <= 0) { FX.toastFor(this, `${def.name}: 아직 배우지 않았습니다`, '#aaa'); return false; }
    if (!this.canAct()) return false;
    if (this.silence > 0) { FX.toastFor(this, '침묵 — 스킬 사용 불가', '#b07cff'); Sfx.playFor(this, 'error'); return false; }
    if (s.cd > 0) { this.cdError(k); return false; }
    if (def.dash && this.root > 0) { FX.toastFor(this, '속박 중에는 이동기를 쓸 수 없습니다'); return false; }
    this.chase = null;
    const ok = this.kit.cast[k](this, aim);
    if (ok) { Vision.act(this, 'skill'); this.breakStealth(); }
    return ok;
  }
  breakStealth() { this.stealthT = 0; }
  // 즉시 효과 스킬(시전 과정 없음): 통계·행동 이벤트
  instantUsed(k) { this.S.cast(k); Events.emit('action', { k }); }
  // 캐시의 강화 평타 처리는 쓰지 않음
  fireCast() {
    const c = this.cast; c.phase = 'active'; c.t = 0; c.origin = V.copy(this.pos);
    c.data.snap = {}; for (const e of Game.enemies(this)) c.data.snap[e.id] = V.copy(e.pos);
    if (!c.data.noStat) this.S.cast(c.k); Vision.act(this, 'skill');
    c.impl.fire(this, c);
    Events.emit('action', { k: c.k });
  }
  // ---------- 평타: 유도 투사체 (대상에게만 맞음, 지형 무시) ----------
  aaHit(t) {
    const cfg = this.aaCfg();
    if (!(this.kit.fireAA && this.kit.fireAA(this, t))) {
      const dir = V.norm(V.sub(t.pos, this.pos));
      this.shot({ dir, speed: this.motif.aaSpeed || 24, home: t, only: t, width: 0.25, len: 0.5, onHit: u => this.aaLand(u) });
    }
    this.S.aaHits++; this.lastAA = { time: Game.time }; Vision.act(this, 'attack');
    Events.emit('action', { k: 'AA' }); Sfx.play('aa'); Tactical.onAA(this, t);
    this.aa.phase = 'back'; this.aa.t = 0; this.aa.dur = cfg.backRatio / this.atkSpd();
  }
  // 평타 착탄: 치명(1.75 + 치명 피해) × 기본 공격 증폭 — 리오는 키트가 따로 계산
  aaLand(u, ratio = 1, extra = {}) {
    const crit = this.kit.noCrit ? false : rnd() < this.critChance, mul = this.kit.aaMul ? this.kit.aaMul(this, u) : (crit ? 1.75 + (this.critDmg || 0) : 1);
    const dmg = Combat.damage(this, u, this.ad * ratio * mul * (1 + this.aaAmp), Object.assign({ type: 'normal', source: 'AA', crit, pen: this.penNow() }, extra));
    FX.burst(u.pos, crit ? '#ff9f9f' : '#ffffff', 5, 3);
    if (this.kit.onAAHit) this.kit.onAAHit(this, u, dmg);
    return dmg;
  }
  onDamaged(dmg, src) { if (this.kit.onDamaged) this.kit.onDamaged(this, dmg, src); }
  // ---------- 매 스텝 ----------
  update(dt) {
    this.asBuffs = this.asBuffs.filter(a => (a.t -= dt) > 0);
    if (this.noAA > 0) { this.noAA -= dt; this.aaCd = Math.max(this.aaCd, 0.02); if (this.aa.phase === 'windup') this.aa.phase = 'none'; }   // 평타 불가(쿨을 길게 올리지 않고 막기만)
    for (const c of this.chans) { c.t += dt; if (c.onTick) c.onTick(dt, c); if (c.t >= c.dur || c.stop) { c.done = true; if (c.onEnd) c.onEnd(c); } }
    this.chans = this.chans.filter(c => !c.done);
    for (const q of this.pend) if ((q.t -= dt) <= 0 && !q.done) { q.done = true; if (!this.dead) q.fn(); }
    this.pend = this.pend.filter(q => !q.done);
    if (this.kit.update) this.kit.update(this, dt);
    // 대상 지정 스킬: 사거리에 들어오면 시전
    const C = this.chase;
    if (C && !this.dead) {
      if (C.t.dead || !Vision.visible(this, C.t) || C.t.untargetable > 0) this.chase = null;
      else if (!this.cast && this.canAct() && V.dist(this.pos, C.t.pos) - C.t.r - this.r <= C.range) { this.chase = null; this.moveTarget = null; if (this.skills[C.k].cd <= 0 && this.silence <= 0) C.fn(); }
      else if (!this.cast) this.moveTarget = V.copy(C.t.pos);
    }
    super.update(dt);
  }
  // ---------- 그리기 ----------
  drawExtra(ctx) { if (this.kit.draw) this.kit.draw(this, ctx); }
  hudBuffs() { return this.kit.hud ? this.kit.hud(this) : []; }
  // 조준 미리보기: 키트의 모양 정의 {kind: line|cone|circle|target|self|dash|back|trap, ...}
  drawShape(ctx, k, aim, alpha) {
    const S = this.kit.shape && this.kit.shape(this, k); if (!S) return false;
    const dir = this.dirTo(aim), ang = V.ang(dir);
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = this.color; ctx.strokeStyle = this.color; ctx.lineWidth = 0.05;
    const ring = r => { ctx.save(); ctx.globalAlpha = 0.5; Draw.circle(ctx, this.pos.x, this.pos.y, r); ctx.stroke(); ctx.restore(); };
    if (S.range) ring(S.range);
    if (S.kind === 'line') Draw.oRect(ctx, this.pos, ang, S.len, S.width);
    else if (S.kind === 'cone') { const h = S.angle / 2 * Math.PI / 180; ctx.beginPath(); ctx.moveTo(this.pos.x, this.pos.y); ctx.arc(this.pos.x, this.pos.y, S.len, ang - h, ang + h); ctx.closePath(); ctx.fill(); }
    else if (S.kind === 'circle') { const c = this.ptIn(aim, S.range || 99); Draw.circle(ctx, c.x, c.y, S.r); ctx.fill(); ctx.globalAlpha = Math.min(1, alpha * 3); ctx.stroke(); }
    else if (S.kind === 'self') { Draw.circle(ctx, this.pos.x, this.pos.y, S.r); ctx.fill(); }
    else if (S.kind === 'dash' || S.kind === 'back') { const d = S.kind === 'back' ? V.mul(dir, -1) : dir; Draw.oRect(ctx, this.pos, V.ang(d), S.len, 0.6); if (S.cone) { const h = S.cone.angle / 2 * Math.PI / 180; ctx.beginPath(); ctx.moveTo(this.pos.x, this.pos.y); ctx.arc(this.pos.x, this.pos.y, S.cone.len, ang - h, ang + h); ctx.closePath(); ctx.fill(); } }
    else if (S.kind === 'target') { const t = Game.pickEnemyAt(aim, CONFIG.input.pickRadius, this); if (t) { ctx.globalAlpha = 0.85; Draw.circle(ctx, t.pos.x, t.pos.y, t.r + 0.25); ctx.stroke(); } }
    else if (S.kind === 'trap') { const c = this.ptIn(aim, S.range), q = KU.trapPts(c, dir, S); ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (const v of q) ctx.lineTo(v.x, v.y); ctx.closePath(); ctx.fill(); }
    ctx.restore(); return true;
  }
}
const PKits = {};   // 실험체별 플레이어 키트 (3_z_ranged_kits.js)
