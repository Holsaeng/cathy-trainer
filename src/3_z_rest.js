
// ============================== 휴식 (X) ==============================
// 나무위키 가이드: 자리에 앉아 휴식, 도중에 시야 감소(공식 패치 노트: 낮 8.5→7.5m, 밤 3.4→3m ~ 6.4→6m)
//  1단계 3초: 최대 체력 10%·기력 20% / 2단계 3초: 15%·25% / 3단계 4초: 30%·30% (3단계는 계속 반복)
//  비전투 상태면 0.5초마다 최대 체력·기력 2% 추가 회복 / 직접 피해(지속 피해 제외)·방해 효과·행동 시 취소 / 종료 후 1초 쿨다운
const Rest = {
  stageOf(u) { return Math.min(u.rest.stage, CONFIG.rest.stages.length - 1); },
  inCombat(u) { return Game.time - (u.combatT ?? -99) < CONFIG.rest.combatDur; },
  can(u) { return !u.dead && !u.rest && (u.restCd || 0) <= 0 && u.canAct() && u.canMove() && !u.cast && !(u.act && u.act.type !== 'aa'); },
  start(u, quiet) {
    if (!Rest.can(u)) { if (!quiet && u === Game.player && (u.restCd || 0) > 0) FX.toast(`휴식 재사용 대기 ${fmt(u.restCd, 1)}초`, '#aaa'); return false; }
    u.rest = { stage: 0, t: 0, acc: 0, accT: 0.5, tick: 0 };
    u.moveTarget = null; u.vel = { x: 0, y: 0 }; if (u.act) u.act = null;
    if (u.attackTarget !== undefined) u.attackTarget = null; if (u.attackMove !== undefined) u.attackMove = null; if (u.aa) u.aa.phase = 'none';
    if (!quiet || u === Game.player) FX.text(u.pos, '휴식', '#9fe0ff', 12, { bold: true });
    return true;
  },
  stop(u, why) {
    if (!u.rest) return;
    if (u.rest.acc > 1) FX.text(u.pos, '+' + Math.round(u.rest.acc), '#5dff9a', 12);
    u.rest = null; u.restCd = CONFIG.rest.cd;
    if (why && (u === Game.player || Vision.visible(Game.player, u))) FX.text(u.pos, '휴식 취소 · ' + why, '#ffb347', 11);
  },
  // 직접 피해를 받거나 입히면 전투 상태 (지속 피해 제외)
  onDamage(src, tgt, o) {
    if (o.tick) return;
    tgt.combatT = Game.time; if (src) src.combatT = Game.time;
    if (tgt.rest) Rest.stop(tgt, '피격');
  },
  update(u, dt) {
    if (u.restCd > 0) u.restCd = Math.max(0, u.restCd - dt);
    const R = u.rest; if (!R) return;
    if (u.dead) { u.rest = null; return; }
    // 방해 효과
    if (u.stun > 0 || u.root > 0 || u.fear > 0 || u.forced || u.silence > 0 || (u.slows && u.slows.length)) { Rest.stop(u, '방해 효과'); return; }
    const C = CONFIG.rest, S = C.stages[Rest.stageOf(u)];
    R.t += dt;
    let hp = u.maxHp * S.hp / S.dur * dt, sp = (u.maxSt || 0) * S.sp / S.dur * dt;
    if (!Rest.inCombat(u) && (R.tick += dt) >= C.bonusEvery) { R.tick -= C.bonusEvery; hp += u.maxHp * C.bonus; sp += (u.maxSt || 0) * C.bonus; }   // 비전투 추가 회복
    R.acc += u.heal(hp, true);
    if (u.maxSt) u.st = Math.min(u.maxSt, u.st + sp);
    if ((R.accT -= dt) <= 0) { R.accT = 0.5; if (R.acc > 1 && (u === Game.player || Vision.visible(Game.player, u))) FX.text(u.pos, '+' + Math.round(R.acc), '#5dff9a', 11); R.acc = 0; }
    if (R.t >= S.dur) { R.t -= S.dur; if (R.stage < C.stages.length - 1) { R.stage++; if (u === Game.player) FX.text(u.pos, `휴식 ${R.stage + 1}단계`, '#9fe0ff', 11, { bold: true }); } }
  },
  // 머리 위 표시: 단계 + 진행 고리
  draw(ctx, u) {
    const R = u.rest; if (!R) return;
    const S = CONFIG.rest.stages[Rest.stageOf(u)], k = clamp(R.t / S.dur, 0, 1), y = u.pos.y - u.r - 0.25;
    ctx.save(); ctx.strokeStyle = 'rgba(159,224,255,.25)'; ctx.lineWidth = 0.07; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.22); ctx.stroke();
    ctx.strokeStyle = '#9fe0ff'; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke();
    ctx.fillStyle = '#9fe0ff'; ctx.font = 'bold 0.36px sans-serif'; ctx.textAlign = 'center'; ctx.fillText(`Zz ${Rest.stageOf(u) + 1}`, u.pos.x, y - 0.1);
    ctx.restore();
  },
};
