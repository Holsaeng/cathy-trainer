
// ============================== 휴식 (X) — 시즌 12 규칙 ==============================
// 공식 12.0 패치노트(2026-08-06) "휴식 시스템 개편":
//  · 전투 상태와 무관하게 언제든 시작 · 3단계 캐스팅 — 각 단계가 끝날 때 회복량이 한 번에 적용, 도중 취소 시 진행 중 단계는 회복 없음
//    1단계 3초: 최대 체력 15% / 2단계 3초: 15% / 3단계 4초: 50%  · 모든 단계가 끝나도 휴식 모션은 유지(추가 회복 없음)
//  · 단계가 끝나기 0.25초 이내에 이동을 입력하면 그 단계 회복을 마친 뒤 이동
//  · 취소: X 재입력·이동 명령·피해·군중 제어 → 1초 재사용 대기
//  · 휴식 중 체력바에 캐스팅 바·예상 회복량 표시(적에게도 보임) / 시야 감소: 낮 8.5→7.5m, 밤 0.4m (공식 1.0.0)
const Rest = {
  stageOf(u) { return Math.min(u.rest.stage, CONFIG.rest.stages.length - 1); },
  done(u) { return u.rest && u.rest.stage >= CONFIG.rest.stages.length; },
  inCombat(u) { return Game.time - (u.combatT ?? -99) < CONFIG.rest.combatDur; },
  can(u) { return !u.dead && !u.rest && (u.restCd || 0) <= 0 && u.canAct() && u.canMove() && !u.cast && !(u.act && u.act.type !== 'aa'); },
  // 다음 단계 완료 시 회복량(예상)
  nextHeal(u) { if (!u.rest || Rest.done(u)) return 0; return Math.min(u.maxHp - u.hp, u.maxHp * CONFIG.rest.stages[Rest.stageOf(u)].hp); },
  start(u, quiet) {
    if (!Rest.can(u)) { if (!quiet && u === Game.player && (u.restCd || 0) > 0) FX.toast(`휴식 재사용 대기 ${fmt(u.restCd, 1)}초`, '#aaa'); return false; }
    u.rest = { stage: 0, t: 0 };
    u.moveTarget = null; u.vel = { x: 0, y: 0 }; if (u.act) u.act = null;
    if (u.attackTarget !== undefined) u.attackTarget = null; if (u.attackMove !== undefined) u.attackMove = null; if (u.aa) u.aa.phase = 'none';
    if (!quiet || u === Game.player) FX.text(u.pos, '휴식', '#9fe0ff', 12, { bold: true });
    return true;
  },
  // 단계 완료: 그 단계 회복량을 한 번에
  complete(u) {
    const S = CONFIG.rest.stages[u.rest.stage], h = u.heal(u.maxHp * S.hp, true);
    if (h > 0.5 && (u === Game.player || Vision.visible(Game.player, u))) FX.text(u.pos, `+${Math.round(h)} (휴식 ${u.rest.stage + 1}단계)`, '#5dff9a', 12, { bold: true });
    u.rest.stage++; u.rest.t = 0;
  },
  // voluntary = 본인이 이동·공격·스킬·X로 끝냄 (0.25초 유예 적용)
  stop(u, why, voluntary) {
    const R = u.rest; if (!R) return;
    if (voluntary && !Rest.done(u) && CONFIG.rest.stages[R.stage].dur - R.t <= CONFIG.rest.grace) Rest.complete(u);   // 단계 끝나기 직전 입력 → 회복 후 이동
    u.rest = null; u.restCd = CONFIG.rest.cd;
    if (why && (u === Game.player || Vision.visible(Game.player, u))) FX.text(u.pos, '휴식 취소 · ' + why, '#ffb347', 11);
  },
  // 피해를 받으면 전투 상태 + 휴식 취소 (패치노트: "피해를 받으면 휴식이 취소")
  onDamage(src, tgt, o) {
    if (!o.tick) { tgt.combatT = Game.time; if (src) src.combatT = Game.time; }
    if (tgt.rest) Rest.stop(tgt, '피격');
  },
  update(u, dt) {
    if (u.restCd > 0) u.restCd = Math.max(0, u.restCd - dt);
    const R = u.rest; if (!R) return;
    if (u.dead) { u.rest = null; return; }
    if (u.stun > 0 || u.root > 0 || u.fear > 0 || u.forced || u.silence > 0 || (u.slows && u.slows.length)) { Rest.stop(u, '군중 제어'); return; }
    if (Rest.done(u)) return;   // 모든 단계 완료 — 모션만 유지
    R.t += dt;
    if (R.t >= CONFIG.rest.stages[R.stage].dur) Rest.complete(u);
  },
  // 체력바 아래 캐스팅 바 + 예상 회복량 (아군·적 모두 보임)
  draw(ctx, u) {
    const R = u.rest; if (!R) return;
    const done = Rest.done(u), S = done ? null : CONFIG.rest.stages[R.stage], k = done ? 1 : clamp(R.t / S.dur, 0, 1);
    const w = 1.5, x = u.pos.x - w / 2, y = u.pos.y + u.r + 0.22;
    ctx.save();
    ctx.strokeStyle = 'rgba(159,224,255,.35)'; ctx.lineWidth = 0.06; Draw.circle(ctx, u.pos.x, u.pos.y, u.r + 0.18); ctx.stroke();
    ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(x - 0.03, y - 0.03, w + 0.06, 0.2);
    ctx.fillStyle = done ? '#5d7d8c' : '#9fe0ff'; ctx.fillRect(x, y, w * k, 0.14);
    ctx.font = 'bold 0.3px sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = '#9fe0ff';
    ctx.fillText(done ? '휴식 완료' : `휴식 ${R.stage + 1}단계  +${Math.round(Rest.nextHeal(u))}`, u.pos.x, y + 0.48);
    ctx.restore();
  },
};
