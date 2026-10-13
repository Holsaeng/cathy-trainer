
// ============================== AI 알론소 (퓨어 탱커 · 결투·팀 대전 상대·아군) ==============================
// 스킬 효과는 플레이어와 같은 AlonsoCore(3_z_rangedy_alonso.js). 여기서는 「언제 쓰나」만 정함 — 근거: 나무위키 알론소 콤보·평가(docs/er_notes_playables.md 11장)
//   · 기본 콤보 E → Q → 평타(무기 스킬): 속박된 동안 Q를 맞히고 평타로 기절 → 상황 봐서 R로 진형 붕괴 / W로 받아치기
//   · Q는 견제·추격용(맞힌 적을 바라보면 빨라짐) · E는 대상이 4.75m 안이고 이동기로 빠지기 어려울 때
//   · W: 앞에서 집중 공격을 받을 때(원딜 포화) — 뒤는 못 막음 · R: 주변 적 2명 이상 또는 근접전에서 체력이 깎일 때(회복 + 당기기)
//   · 팀 대전: 앞라인(frontline) — 아군 원딜에게 붙은 적을 먼저 잡음(TeamAI 필)
Kits.alonso = {
  init(ai) {
    const K = ai.kitCfg;
    ai.al = { K, color: ai.motif.color, S: NullStats, L: k => ai.L(k), level: () => ai.level || 1,
      hit: (u, amt, k, o) => ai.hitP(u, amt * ai.diff.dmgMul, Object.assign({ name: (K[k] && K[k].name) || k }, o)),
      foes: () => Game.units.filter(u => u.team !== ai.team && u.team !== 2 && !u.dead && u.kind !== 'ward' && !(u.untargetable > 0)),
      cdStart: k => { ai.cds[k] = ai.pick(K[k].cd, k); }, cdSet: (k, v) => { ai.cds[k] = v; } };
    AlonsoCore.attach(ai);
  },
  // 근접 평타: 투사체 없이 즉시 · 연결된 적이면 기절
  fireAA(ai, p) { ai.aaLand(p); return true; },
  aaDamage(ai) { return { amount: ai.ad * ai.diff.dmgMul, crit: false }; },
  onAAHit(ai, u) { AlonsoCore.pop(ai, u); },
  onDamaged(ai) { AlonsoCore.onDamaged(ai); },
  update(ai, dt) {
    AlonsoCore.update(ai, dt);
    if (ai.alR && (ai.stun > 0 || ai.fear > 0 || ai.silence > 0 || !ai.act || ai.act.type !== 'channel')) { AlonsoCore.rEnd(ai, true); if (ai.act && ai.act.type === 'channel') ai.act = null; }
  },
  think(ai, p, d) {
    const K = ai.kitCfg, hpR = ai.hp / ai.maxHp, foes = ai.al.foes().filter(u => isHero(u)), near = foes.filter(u => V.dist(u.pos, ai.pos) <= K.R.r + u.r);
    if (ai.alW && (ai.alW.t > 1.9 || d > K.W.len + 1)) { AlonsoCore.wEnd(ai); return false; }   // 방패 마무리(파동을 다 쏜 뒤)
    // D 어퍼컷: 연결된 적이 가까우면 바로 기절
    if (ai.cds.D <= 0 && ai.alMark && ai.alMark.u === p && d <= K.D.range + K.D.hop + p.r + ai.r) { this.uppercut(ai, p); return false; }
    // R: 주변 적 2명 이상 · 혼자라도 근접전에서 체력이 깎였을 때
    if (ai.cds.R <= 0 && (near.length >= 2 || (near.length === 1 && hpR < 0.55 && d < 3))) {
      ai.cds.R = ai.pick(K.R.cd, 'R'); AlonsoCore.rStart(ai);
      ai.startChannel(K.R.dur, { onTick: (dt, a) => { if (!ai.alR) { a.stop = true; return; } if (AlonsoCore.rTick(ai, dt)) a.stop = true; else if (ai.diffKey !== 'easy' && a.t > 1.2 && !ai.al.foes().some(u => isHero(u) && V.dist(u.pos, ai.alR.c) <= K.R.r + u.r)) a.stop = true; },
        onEnd: (a, cancelled) => { if (ai.alR) AlonsoCore.rEnd(ai, cancelled); }, tele: { kind: 'circle', pos: V.copy(ai.pos), r: K.R.r } });
      return true;
    }
    // E: 4.75m 안 → 0.8초 뒤 돌진 + 속박 (바로 다음에 Q → 평타 기절)
    if (ai.cds.E <= 0 && d <= K.E.range + p.r && !(p.unstoppable > 0)) {
      const E = K.E; ai.cds.E = ai.pick(E.cd, 'E'); FX.text(p.pos, E.name, ai.motif.color, 13, { bold: true });
      ai.startCast(E.windup, () => {
        if (!AlonsoCore.eValid(ai, p)) { ai.cds.E *= 1 - E.refund; FX.text(ai.pos, '슬램 취소', '#aaa', 11); return; }
        const to = V.sub(p.pos, ai.pos), dd = V.len(to), reach = ai.r + p.r + 0.05;
        ai.unstoppable = Math.max(ai.unstoppable, 0.35);
        ai.act = { type: 'dash', t: 0, dur: Math.max(0.05, (dd - reach) / E.dashSpeed), from: V.copy(ai.pos), to: Geo.pushOut(V.sub(p.pos, V.mul(V.norm(to), reach)), ai.r) };
        AlonsoCore.eLand(ai, p);
      }, { kind: 'circle', pos: V.copy(ai.pos), r: E.cancel, color: ai.motif.color });
      return true;
    }
    // Q: 견제·추격 (속박·기절 중인 적엔 거의 확정)
    if (ai.cds.Q <= 0 && d <= K.Q.range - 0.3 && !ai.alMark) {
      const Q = K.Q, dir = ai.aimDir(p, Q.windup, Q.speed); ai.cds.Q = ai.pick(Q.cd, 'Q');
      ai.startCast(Q.windup, () => { Sfx.play('throw'); ai.shoot({ dir, speed: Q.speed, range: Q.range, width: Q.width, len: 0.8, color: '#7fd7ff', onHit: u => AlonsoCore.qHit(ai, u) }); }, { kind: 'line', dir, len: Q.range, width: Q.width });
      return true;
    }
    // W: 앞에서 맞고 있을 때 (원거리 상대에게 다가가는 중이거나 체력이 깎일 때)
    if (ai.cds.W <= 0 && !ai.alW && d < K.W.len + 2 && (hpR < 0.8 || !TeamAI.isMelee(p))) { AlonsoCore.wStart(ai, V.norm(V.sub(p.pos, ai.pos))); return false; }
    return false;
  },
  uppercut(ai, p) {
    const D = ai.kitCfg.D; ai.cds.D = ai.pick(D.cd, 'D'); const to = V.sub(p.pos, ai.pos), d = V.len(to);
    if (d > ai.r + p.r + D.range) ai.pos = Geo.pushOut(V.add(ai.pos, V.mul(to, (d - ai.r - p.r - 0.2) / d)), ai.r);
    ai.facing = V.ang(to); AlonsoCore.dHit(ai, p); Sfx.play('aa');
  },
  kite() {},   // 탱커는 평타 뒤 물러나지 않음
  // 탱커: 떨어지지 않고 붙음 (평타 거리까지)
  move(ai, p, d) { if (d > ai.aaRange() + p.r + ai.r - 0.1) ai.moveTarget = Geo.pushOut(V.copy(p.pos), ai.r); else ai.moveTarget = null; },
  draw(ai, ctx) { if (Vision.visible(Game.player, ai) || ai.team === myTeam()) AlonsoCore.draw(ai, ctx); },
};
