
// ============================== 플레이어블: 다니엘 (단검) ==============================
// 캐시의 조작·시전·평타 흐름(Cathy)을 그대로 쓰고, 스킬 Q·W·E·R과 평타만 다니엘 것으로 교체
// 수치: CONFIG.rangedKits.daniel (나무위키) / 능력치: CONFIG.rangedMotifs.daniel (랭크 영상 HUD 실측, Lv6/12/18)
//  Q 그림자 가위: 지정 위치(7m) 부채꼴, 0.53초 뒤 적중 — 시전 중 이동 가능. 중앙은 강화 피해 + 둔화, 적중 시 다음 평타 3번 공속 증가
//  W 영감: 대상 지정(7m) 표식 — 4초 뒤 활성, 2.5초 안에 공격하면 축적 피해(고정) + 스킬 피해 폭발. 대상 시야 감소, 대상 주변 2m 시야
//  E 그림자 이동: 앞으로 3m 은신 돌진 → 3초간 평타 사거리 3m, 평타 시 대상 건너편으로 순간이동 + 추가 스킬 피해
//  R 걸작: 4초 안에 피해를 준 적(3m) 그림자 속으로 — 0.5초 침묵, 최대 2초 대상 지정 불가 + 지속 피해 4회, 끝나거나 R 재사용 시 커서 쪽으로 빠져나오며 마무리 피해
//  D 망토와 단검: 캐시와 같은 단검 무기 스킬 / P 고독한 예술가: 밤에 시야·이동 속도 증가
const DANIEL_SHORT = { Q: '가위', W: '영감', E: '그림자', R: '걸작' };
class DanielPlayer extends Cathy {
  constructor(x, y) {
    super(x, y, null);   // 장비 없음(다니엘은 실측 능력치) — 판 옵션의 캐시 장비가 섞이지 않게
    const M = CONFIG.rangedMotifs.daniel, st = ['early', 'mid', 'late'].includes(Game.buildId) ? Game.buildId : 'mid', si = ['early', 'mid', 'late'].indexOf(st);
    this.charKey = 'daniel'; this.name = '다니엘'; this.color = M.color; this.weapon = 'dagger'; this.usesTrauma = false;
    this.maxHp = this.hp = M.hp[si]; this.def = M.def[si]; this.baseMs = M.ms[si]; this.baseHpAtLv = 920 + 90 * (CONFIG.rangedAI.stages[st].level - 1);
    this.ad = M.ad[si]; this.bonusAd = Math.max(0, M.ad[si] - M.baseAd[si]); this.sp = 0; this.critChance = M.crit[si]; this.pen = M.pen[si]; this.aaAmp = M.aaAmp[si];
    this.baseAs = M.as[si]; this.as = this.baseAs; this.cdr = [0.15, 0.25, 0.25][si];   // 쿨감: HUD 실측 Lv11~20 25%
    this.build = Object.assign({}, this.build, { level: CONFIG.rangedAI.stages[st].level });
    const L = M.skillLv[si]; this.plv = L.P;
    for (const k of ['Q', 'W', 'E', 'R', 'D']) this.skills[k].lv = L[k];
    this.K = CONFIG.rangedKits.daniel;
    Object.assign(this, { qShots: 0, qT: 0, shadowT: 0, mark: null, lastHitOn: {}, pendingQ: [], shadow: null, qSeq: 0 });
  }
  // ---------- 수치 ----------
  L(k) { return k === 'P' ? this.plv : this.skills[k].lv; }
  calc(o, k) { return lv(o.base, this.L(k)) + this.ad * lv(o.ad || 0, this.L(k)) + this.bonusAd * lv(o.bad || 0, this.L(k)); }
  skillDef(k) {
    if (k === 'D') return CONFIG.skills.D_dagger;
    if (k === 'F') return super.skillDef('F');   // 선택한 전술 스킬
    const d = this.K[k]; return Object.assign({ short: DANIEL_SHORT[k] }, d);
  }
  baseAaCfg() { const b = CONFIG.basicAttack.dagger; return this.shadowT > 0 ? Object.assign({}, b, { range: this.K.E.aaRange }) : b; }
  aaWindupTime() { return CONFIG.basicAttack.dagger.windupRatio / this.atkSpd(); }

  // ---------- 시전 ----------
  tryCast(k, aim) {
    if (k === 'F' || k === 'D') return super.tryCast(k, aim);
    const s = this.skills[k], def = this.skillDef(k);
    if (k === 'R' && this.shadow) { this.shadow.exit = true; return true; }   // R 재사용: 그림자에서 빠져나옴
    if (!s || s.lv <= 0) { FX.toastFor(this, `${def.name}: 아직 배우지 않았습니다`, '#aaa'); return false; }
    if (!this.canAct()) return false;
    if (this.silence > 0) { FX.toastFor(this, '침묵 — 스킬 사용 불가', '#b07cff'); Sfx.playFor(this, 'error'); return false; }
    if (s.cd > 0) { this.cdError(k); return false; }
    if (k === 'Q') return this.castQ(aim);
    if (k === 'W') return this.castW(aim);
    if (k === 'E') { if (this.root > 0) { FX.toastFor(this, '속박 중에는 돌진할 수 없습니다'); return false; } this.beginCast('E', aim, DImpl.E, {}); return true; }
    if (k === 'R') {
      const t = this.rTarget(aim);
      if (!t) { this.S.mistake('걸작: 4초 안에 피해를 준 적이 3m 안에 없음'); Sfx.playFor(this, 'error'); FX.toastFor(this, '걸작: 최근 4초 안에 피해를 준 적에게만 (3m)'); return false; }
      this.beginCast('R', aim, DImpl.R, { target: t }); return true;
    }
    return false;
  }
  // 걸작 중 R 재사용 = 즉시 탈출 (시전 중이라 선입력으로 미루지 않음)
  cmdSkill(k, aim) {
    if (k === 'R' && this.shadow && this.shadow.phase !== 'out') { this.S.input(); this.shadow.exit = true; return; }
    super.cmdSkill(k, aim);
  }
  // 캐시의 강화 평타 처리는 쓰지 않음
  fireCast() {
    const c = this.cast; c.phase = 'active'; c.t = 0; c.origin = V.copy(this.pos);
    c.data.snap = {}; for (const e of Game.enemies(this)) c.data.snap[e.id] = V.copy(e.pos);
    this.S.cast(c.k); if (c.k !== 'E') Vision.act(this, 'skill');
    c.impl.fire(this, c);
    Events.emit('action', { k: c.k });
  }
  breakStealth() { this.stealthT = 0; }
  // Q: 지정 위치에 가위 — 즉시 시전, 0.53초 뒤 적중 (시전 중 이동 가능)
  castQ(aim) {
    const K = this.K.Q, d = Math.min(K.range, V.dist(this.pos, aim)), dir = V.dist(aim, this.pos) > 0.05 ? V.norm(V.sub(aim, this.pos)) : V.fromAng(this.facing);
    this.pendingQ.push({ pos: V.add(this.pos, V.mul(dir, d)), dir, t: 0, dur: K.windup, id: ++this.qSeq });
    this.startCd('Q'); this.S.cast('Q'); Vision.act(this, 'skill'); this.breakStealth();
    FX.text(this.pos, K.name, this.color, 12, { bold: true }); Sfx.play('throw'); Events.emit('action', { k: 'Q' });
    return true;
  }
  qLand(o) {
    const K = this.K.Q, apex = V.sub(o.pos, V.mul(o.dir, K.front)); let hit = false;
    for (const u of Game.enemies(this).concat(Game.units.filter(x => x.kind === 'animal' && !x.dead))) {
      if (u.dead || u.untargetable > 0 || !Geo.inSector(apex, V.ang(o.dir), K.len, K.angle / 2 * Math.PI / 180, u.pos, u.r)) continue;
      const center = V.dist(u.pos, o.pos) <= K.centerR + u.r;
      if (u.kind !== 'animal') { hit = true; this.S.hit('Q', 'dq' + o.id); }
      Combat.damage(this, u, this.calc(center ? K.center : K, 'Q'), { type: 'skill', source: center ? 'Q 중앙' : 'Q' });
      if (center) u.addSlow(K.slow, K.slowDur);
      Events.emit('skillHit', { k: 'Q', target: u });
    }
    this.S.resolveShot('Q', hit);
    FX.slash(apex, V.ang(o.dir), K.len, K.angle / 2 * Math.PI / 180, '#9d6bff', 0.3);
    const rb = Vision.bushAt(o.pos); if (rb >= 0) Vision.rustle(rb, o.pos, 0, true);
    if (hit) { this.qShots = K.asShots; this.qT = K.asDur; this.as = +(this.baseAs * (1 + lv(K.asBuff, this.L('Q')))).toFixed(2); FX.text(this.pos, '공속↑', '#d9a8ff', 12, { bold: true }); }
  }
  // W: 대상 지정 표식
  castW(aim) {
    const K = this.K.W, t = Game.pickEnemyAt(aim, CONFIG.input.pickRadius, this);
    if (!t || t.kind === 'ward') { this.S.mistake('영감: 대상 지정 실패 (커서 위에 적 없음)'); Sfx.playFor(this, 'error'); return false; }
    if (V.dist(this.pos, t.pos) - t.r > K.range) { FX.toastFor(this, `사거리 밖 (${K.range}m)`); Sfx.playFor(this, 'error'); return false; }
    this.mark = { target: t, t: 0, acc: 0 }; t.blindT = K.blind; t.blindR = K.blindR;
    this.startCd('W'); this.S.cast('W'); Vision.act(this, 'skill'); this.breakStealth();
    FX.text(t.pos, '영감 표식', '#d9a8ff', 13, { bold: true }); FX.ring(t.pos, 1.2, 0.4, '#d9a8ff', 0.4); Sfx.play('throw'); Events.emit('action', { k: 'W' });
    this.S.resolveShot('W', true);
    return true;
  }
  rTarget(aim) {
    const K = this.K.R, ok = e => !e.dead && e.kind !== 'ward' && Game.time - (this.lastHitOn[e.id] ?? -99) <= K.recent && V.dist(this.pos, e.pos) - e.r - this.r <= K.range;
    const at = Game.pickEnemyAt(aim, CONFIG.input.pickRadius, this); if (at && ok(at)) return at;
    return Game.visibleEnemies(this).filter(ok).sort((a, b) => V.dist(a.pos, this.pos) - V.dist(b.pos, this.pos))[0] || null;
  }
  // ---------- 피해 훅: 최근 피해(궁 조건)·영감 축적/폭발 ----------
  onDealt(tgt, dmg, o) {
    if (!tgt || tgt.kind === 'ward' || tgt.team === this.team) return;
    this.lastHitOn[tgt.id] = Game.time; tgt.blindT = 0;
    const M = this.mark, W = this.K.W; if (!M || M.target !== tgt || o.markPop || o.tick) return;
    if (M.t >= W.ready) {
      this.mark = null; const acc = M.acc;
      Combat.damage(this, tgt, acc, { type: 'true', source: 'W 축적', markPop: true });
      if (!tgt.dead) Combat.damage(this, tgt, this.calc(W, 'W'), { type: 'skill', source: 'W 폭발', markPop: true });
      tgt.addSlow(W.slow, W.slowDur);
      FX.burst(tgt.pos, '#d9a8ff', 24, 7, 0.6); FX.ring(tgt.pos, 0.3, 1.8, '#d9a8ff', 0.4); FX.text(tgt.pos, '영감 폭발 ' + Math.round(acc), '#d9a8ff', 14, { bold: true });
      this.S.hit('W', 'pop' + Game.time);
    } else M.acc += dmg * (lv(W.acc, this.L('W')) + this.bonusAd * W.accBad) / 100;
  }
  // ---------- 평타: 단검 / 그림자 돌진 중이면 대상 건너편으로 순간이동 + 추가 스킬 피해 ----------
  aaHit(t) {
    const crit = rnd() < this.critChance, cfg = CONFIG.basicAttack.dagger;
    if (this.shadowT > 0) {
      const dir = V.norm(V.sub(t.pos, this.pos)), from = V.copy(this.pos);
      this.pos = Geo.pushOut(V.add(t.pos, V.mul(dir, t.r + this.r + 0.15)), this.r); this.facing = V.ang(V.mul(dir, -1));
      FX.burst(from, '#4b3a66', 14, 2.5, 0.6, 0.14); FX.trail(from, this.pos, '#7d5cb8', 0.25, 0.25);
      this.shadowT = 0; this.breakStealth();
      Combat.damage(this, t, this.ad * (crit ? cfg.critMul : 1) * (1 + this.aaAmp), { type: 'normal', source: 'AA', crit });
      if (!t.dead) Combat.damage(this, t, this.calc(this.K.E, 'E'), { type: 'skill', source: 'E 그림자 평타' });
      this.S.hit('E', 'aa' + Game.time);
    } else Combat.damage(this, t, this.ad * (crit ? cfg.critMul : 1) * (1 + this.aaAmp), { type: 'normal', source: 'AA', crit });
    if (this.qShots > 0 && --this.qShots <= 0) this.as = this.baseAs;
    this.S.aaHits++; this.lastAA = { time: Game.time }; Vision.act(this, 'attack');
    Events.emit('action', { k: 'AA' });
    FX.slash(this.pos, V.ang(V.sub(t.pos, this.pos)), 1.3, 0.6, this.color, 0.15); FX.burst(t.pos, '#ffffff', 6, 3); Sfx.play('aa');
    Tactical.onAA(this, t);
    this.aa.phase = 'back'; this.aa.t = 0; this.aa.dur = cfg.backRatio / this.atkSpd();
  }
  passiveMoveBoost() {}   // 캐시 패시브 없음
  // ---------- 매 스텝 ----------
  update(dt) {
    if (this.qT > 0 && (this.qT -= dt) <= 0) { this.qShots = 0; this.as = this.baseAs; }
    if (this.shadowT > 0 && (this.shadowT -= dt) <= 0) this.breakStealth();
    for (const o of this.pendingQ) { o.t += dt; if (!o.done && o.t >= o.dur) { o.done = true; if (!this.dead) this.qLand(o); } }
    this.pendingQ = this.pendingQ.filter(o => o.t < o.dur + 0.25);
    if (this.mark) {
      const M = this.mark; M.t += dt;
      if (M.target.dead || M.t > this.K.W.ready + this.K.W.popWindow) this.mark = null;
      else Vision.reveals.push({ team: this.team, pos: V.copy(M.target.pos), r: 2, t: 0.05 });   // 표식 대상 주변 2m 시야
    }
    // P 고독한 예술가: 밤에 시야·이동 속도 증가
    const P = this.K.P; this.sightMul = Vision.night ? 1 + lv(P.sight, this.plv) : 1;
    if (Vision.night) this.addMsBuff(lv(P.ms, this.plv), 0.25, false, 'danP');
    super.update(dt);
  }
  // ---------- 그리기 (월드) ----------
  drawExtra(ctx) {
    const K = this.K.Q;
    for (const o of this.pendingQ) {   // 가위 예고
      if (o.done) continue;
      const apex = V.sub(o.pos, V.mul(o.dir, K.front)), an = V.ang(o.dir), h = K.angle / 2 * Math.PI / 180, k = clamp(o.t / o.dur, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.15 + 0.3 * k; ctx.fillStyle = '#9d6bff';
      ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.arc(apex.x, apex.y, K.len, an - h, an + h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.6; ctx.fillStyle = '#d9a8ff'; Draw.circle(ctx, o.pos.x, o.pos.y, K.centerR * k); ctx.fill(); ctx.restore();
    }
    if (this.mark && !this.mark.target.dead) {
      const M = this.mark, ready = M.t >= this.K.W.ready, u = M.target;
      KU.ring(ctx, u.pos, u.r + 0.35, ready ? '#ffd1ff' : '#b07cff', ready ? 0.95 : 0.55, !ready);
      if (!ready) { ctx.save(); ctx.strokeStyle = '#d9a8ff'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * M.t / this.K.W.ready); ctx.stroke(); ctx.restore(); }
    }
    if (this.shadow) { const u = this.shadow.target; KU.fill(ctx, u.pos, u.r + 0.3, '#2a1840', 0.55); KU.ring(ctx, u.pos, u.r + 0.3 + 0.1 * Math.sin(Game.time * 20), this.color, 0.9); }
    if (this.shadowT > 0 && Settings.showRange) KU.ring(ctx, this.pos, this.K.E.aaRange + this.r, '#7d5cb8', 0.5, true);
  }
  // 조준 미리보기
  drawShape(ctx, k, aim, alpha) {
    const dir = V.norm(V.sub(aim, this.pos)), ang = V.ang(dir), K = this.K;
    ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = this.color; ctx.strokeStyle = this.color; ctx.lineWidth = 0.05;
    const ring = r => { ctx.save(); ctx.globalAlpha = 0.5; Draw.circle(ctx, this.pos.x, this.pos.y, r); ctx.stroke(); ctx.restore(); };
    const mark = t => { if (t) { ctx.save(); ctx.globalAlpha = 0.85; ctx.strokeStyle = '#d9a8ff'; Draw.circle(ctx, t.pos.x, t.pos.y, t.r + 0.25); ctx.stroke(); ctx.restore(); } };
    if (k === 'Q') {
      ring(K.Q.range); const d = Math.min(K.Q.range, V.dist(this.pos, aim)), c = V.add(this.pos, V.mul(dir, d)), apex = V.sub(c, V.mul(dir, K.Q.front)), h = K.Q.angle / 2 * Math.PI / 180;
      ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.arc(apex.x, apex.y, K.Q.len, ang - h, ang + h); ctx.closePath(); ctx.fill(); Draw.circle(ctx, c.x, c.y, K.Q.centerR); ctx.stroke();
    } else if (k === 'W') { ring(K.W.range); mark(Game.pickEnemyAt(aim, CONFIG.input.pickRadius, this)); }
    else if (k === 'E') { Draw.oRect(ctx, this.pos, ang, K.E.dist, 0.6); }
    else if (k === 'R') { ring(K.R.range + this.r); mark(this.rTarget(aim)); }
    else { ctx.restore(); return false; }
    ctx.restore(); return true;
  }
}

// 다니엘 시전 구현 (E·R은 캐시와 같은 시전 상태 기계를 사용)
const DImpl = {
  E: {
    windup: () => 0, recovery: () => 0.05,
    fire(p, c) {
      const K = p.K.E, len = Geo.passDash(p.pos, c.dir, K.dist, p.r, K.wallPass);   // 앞으로 3m, 돌진 거리로 닿는 벽은 넘음(벽 중심 규칙)
      c.data.from = V.copy(p.pos); c.data.to = V.add(p.pos, V.mul(c.dir, len));
      p.startCd('E'); p.stealthT = lv(K.stealth, p.L('E')); p.shadowT = K.shadowDur; p.revealT = 0;
      FX.burst(p.pos, '#4b3a66', 18, 2.5, 0.7, 0.16); Vision.noise(p, 'skill'); Sfx.play('blink');
      FX.text(p.pos, K.name, p.color, 12, { bold: true });
    },
    tick(p, c) { const k = Math.min(1, c.t / p.K.E.time); p.pos = V.lerp(c.data.from, c.data.to, k); return k >= 1; },
  },
  R: {
    windup: () => 0, recovery: () => 0,
    fire(p, c) {
      const K = p.K.R, t = c.data.target;
      p.startCd('R'); p.shadow = { target: t, t: 0, n: 0, exit: false }; p.shadowT = 0;
      t.silence = Math.max(t.silence || 0, K.silence);
      if (t.act && t.act.type === 'cast') t.act = null;   // 침묵: AI 시전 취소
      FX.text(t.pos, K.name + ' — 침묵', p.color, 15, { bold: true }); FX.ring(t.pos, 1.5, 0.3, '#2a1840', 0.4); Sfx.play('ult');
    },
    tick(p, c, dt) {
      const S = p.shadow, K = p.K.R; if (!S) return true;
      const u = S.target; S.t += dt;
      if (S.phase === 'out') {   // 빠져나오는 중
        const k = Math.min(1, (S.t - S.outT) / K.exitTime); p.pos = V.lerp(S.from, S.to, k);
        if (k >= 1) { p.shadow = null; return true; }
        return false;
      }
      if (!u.dead) p.pos = V.copy(u.pos);
      p.untargetable = p.invuln = p.unstoppable = 0.1; p.vel = { x: 0, y: 0 };
      const every = K.dur / K.ticks;
      while (S.n < K.ticks && S.t >= every * (S.n + 1) - 1e-6) { S.n++; if (!u.dead) Combat.damage(p, u, p.calc(K.tick, 'R'), { type: 'skill', source: 'R 지속', noShake: true }); }
      if (S.t >= K.dur || S.exit || u.dead) {
        if (!u.dead) { Combat.damage(p, u, p.calc(K.last, 'R'), { type: 'skill', source: 'R 마무리' }); FX.xslash(u.pos, p.color, 3); Sfx.play('ult'); p.S.hit('R', 'r' + Game.time); }
        const cur = p.cursor, dir = cur && V.dist(cur, u.pos) > 0.1 ? V.norm(V.sub(cur, u.pos)) : V.fromAng(p.facing);   // 커서 쪽으로 빠져나옴 (커서 = 마지막 명령 좌표·걸작 중 커서 명령 — 재생해도 같게)
        S.phase = 'out'; S.outT = S.t; S.from = V.copy(p.pos); S.to = V.add(p.pos, V.mul(dir, Geo.clampDash(p.pos, dir, K.exit, p.r)));
        p.untargetable = p.invuln = K.exitTime;
      }
      return false;
    },
  },
};
