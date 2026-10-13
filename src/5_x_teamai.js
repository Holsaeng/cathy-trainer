
// ============================== 팀 AI (AI 팀 대전용) ==============================
// 근거: docs/er_notes_teamfight.md — 디시 「이터니티 구도공략」 시리즈·스쿼드 포지션 공략·나무위키 + LoL 아레나 원리([MOBA]), 수치는 대부분 추정
//   역할: frontline(앞라인: 캐시 > 다니엘 > 아야 > 리오 > 나딘 > 카티야) · flanker(측면: 다니엘) · poke(3선: 사거리 긴 원딜) · carry(2선)
//   대상 점수(5-2): 잃은 체력 · 딜러 · CC 연계 · 플레이어/앞라인이 치는 대상 · 필(아군 원딜에 붙은 근접) · 킬각 · 사거리 · 앞라인 너머 다이브 금지 · 무적/보호막
//   대상 유지(5-3): 15점 이상 높을 때만, 최소 1.2초 — 근접이 붙으면(원딜)·킬각이면 즉시 전환
//   움직임(6장): 개인 후퇴(체력 30%/25%) · 팀 후퇴(체크리스트 ≤ 1 + 수적 열세) · 핑퐁(어그로 교대) · 혼자 싸우지 않기 · 추격 한계 8m · 재집결
//   난이도(10장 제안): 쉬움 = 집중 공격만 / 보통 = + 진입 체크리스트·필·다이브 금지 / 어려움 = + 핑퐁·측면 대기
CONFIG.teamAI = {
  spread: 2.4,                      // 시작 위치 간격(m)
  w: { hp: 40, carry: 25, cc: 30, slow: 10, focus: 25, peel: 20, kill: 15, dist: 2, dive: 35, guard: 20, flank: 15, threat: 30, revenge: 10, pingpong: 25, danger: 30, stay: 15 },
  // 영상 학습(브라우저로 직접 시청, docs/er_notes_teamfight.md 12장): danger = 「프리딜을 못 견디는 상대」(피해량 ÷ 유효 체력이 큰 쪽) · stay = 동료가 빈사라 남아서 딜하는 상대 캐리
  ultHoldDist: 7,                   // 아군이 대상에서 이보다 멀면 궁 아낌(마무리·위기 제외) — 네브짱 「우리 팀이 멀면 함부로 박으면 안 된다」
  spentRetreat: { foeHp: 0.7, myHp: 0.6 },   // 핵심 스킬(R·E)을 다 쓴 뒤 멀쩡한 적이 오면 빠짐 — 네브짱 「궁·블링크 다 쓴 상태에서 다른 팀이 오면 과감하게 버린다」
  hold: 1.2, switchMargin: 15,      // 대상 유지: 최소 1.2초, 15점 이상 높아야 전환
  focusTtl: 2.0,                    // 콜러(플레이어·앞라인)가 친 대상 유지 시간
  peelDist: 3.5, threatDist: 3.0,   // 필 거리 · 원딜에게 근접이 붙었다고 보는 거리
  lowHp: { ranged: 0.30, melee: 0.25 },
  pingpong: { window: 1.5, pct: 0.15, takeoverHp: 0.60 },
  spacingMax: 6.0,                  // 아군 최근접이 이보다 멀고 적 2명 이상이 6m 안이면 합류
  chaseDist: 8.0,                   // 아군 중심에서 이보다 먼 적은 쫓지 않음
  regroup: 10, regroupBack: 4.0,    // 혼자 떨어지면 합류 · 후퇴 지점(아군 중심에서 적 반대 4m)
  edgeLimit: 12.0,                  // 원딜이 원형 투기장 중심에서 넘지 않을 반지름
  diveScore: 2, retreatScore: 1,    // 4항목 체크리스트(체력 합·핵심 쿨·인원·위치): 팔 짧은 팀은 이 이상이면 진입 · 이 이하면 후퇴
  isolate: 5.0,                     // 적이 자기 팀 중심에서 이만큼 떨어지면 고립
  huntDist: { ahead: 1.5, even: 4.5 },   // 적이 안 보일 때 추정 위치까지 둘 거리: 수적 우위 → 파고들어 찾음 · 동수 → 시야 닿게 좁힘 · 열세 → 1:1 기본(7m) 유지
  reachMargin: 0.5,                 // 팔 길이(팀 최대 사거리) 비교 여유 — 짧은 팀이 먼저 진입(dive), 긴 팀은 받아침(hold) · 햄찌 「상대가 팔이 긴 교전은 대치를 오래 하면 손해」
};
const TeamAI = {
  focus: {},   // 팀별 집중 대상 {u, t} — 콜러가 마지막으로 친 적
  reset() { this.focus = {}; },
  isMelee(u) { return !!u && (u.melee || (u.kind === 'player' && !u.ranged)); },
  isCarry(u) { return u && (u.role === 'carry' || u.role === 'poke'); },
  heroes(t) { return Game.units.filter(u => isHero(u) && u.team === t && !u.dead); },
  mates(u) { return Game.units.filter(a => a !== u && a.team === u.team && !a.dead && isHero(a)); },
  center(arr) { return arr.length ? arr.reduce((s, a) => V.add(s, V.mul(a.pos, 1 / arr.length)), { x: 0, y: 0 }) : null; },
  // 역할 배정 (2-3)
  assign(t) {
    const us = Game.units.filter(u => isHero(u) && u.team === t), key = u => u.motifKey || u.charKey || 'cathy';
    const order = ['alonso', 'cathy', 'daniel', 'aya', 'rio', 'nadine', 'katja', 'chloe'], poke = ['katja', 'rio', 'nadine', 'aya', 'chloe'];
    for (const u of us) u.role = null;
    const melee = us.filter(u => this.isMelee(u)), cathy = melee.find(u => key(u) === 'cathy'), tank = melee.find(u => key(u) === 'alonso');
    const front = tank || cathy || (melee.length === 1 && us.length > 1 && !us.some(u => key(u) === 'aya') ? melee[0] : null) || us.filter(u => !this.isMelee(u)).sort((a, b) => order.indexOf(key(a)) - order.indexOf(key(b)))[0] || melee[0];
    if (front) front.role = 'frontline';
    for (const u of melee) if (!u.role) u.role = 'flanker';
    const ranged = us.filter(u => !u.role);
    const pk = ranged.sort((a, b) => poke.indexOf(key(a)) - poke.indexOf(key(b)))[0];
    for (const u of ranged) u.role = u === pk && ranged.length > 1 ? 'poke' : 'carry';
    if (us.length === 2 && pk && ranged.length === 1) pk.role = key(pk) === 'katja' ? 'poke' : 'carry';
  },
  // 피해 기록: 압박 판정(핑퐁) + 콜러의 집중 대상
  onDamage(src, tgt, dmg) {
    if (!tgt || !isHero(tgt) || dmg <= 0) return;
    const now = Game.time; (tgt.dmgLog = (tgt.dmgLog || []).filter(e => now - e.t < 3)).push({ t: now, d: dmg, src });
    if (src && isHero(src) && src.team !== tgt.team) {
      const caller = (Game.player && Game.player.team === src.team && !Game.player.dead) ? Game.player : this.heroes(src.team).find(u => u.role === 'frontline');
      if (src === caller) this.focus[src.team] = { u: tgt, t: now };
      src.lastFight = now; tgt.lastFight = now;
    }
  },
  pressured(u) {
    const P = CONFIG.teamAI.pingpong, now = Game.time, log = (u.dmgLog || []).filter(e => now - e.t <= P.window);
    const dmg = log.reduce((s, e) => s + e.d, 0), att = new Set(log.map(e => e.src && e.src.id)).size;
    return dmg >= u.maxHp * P.pct || att >= 2;
  },
  // 4항목 체크리스트 (4-2): 체력 합 · 핵심 쿨 · 인원 · 위치
  checklist(t) {
    const us = this.heroes(t), them = this.heroes(1 - t); if (!us.length || !them.length) return { score: 4, us: us.length, them: them.length };
    const ehp = arr => arr.reduce((s, u) => s + Math.max(0, u.hp) * (1 + (u.def || 0) / 100), 0);
    let s = 0;
    if (ehp(us) >= ehp(them)) s++;
    const keyUp = u => ['E', 'R'].some(k => foeCd(u, k) <= 0.5), keyDown = u => ['E', 'R'].some(k => foeCd(u, k) > 1.5 && foeCd(u, k) < 99);
    if (us.some(keyUp) && them.some(keyDown)) s++;
    if (us.length >= them.length) s++;
    const tc = this.center(them), rd = Geo.round();
    if (them.some(u => V.dist(u.pos, tc) > CONFIG.teamAI.isolate) || (rd && them.some(u => V.dist(u.pos, rd.c) > rd.r - 3))) s++;
    return { score: s, us: us.length, them: them.length };
  },
  // ---------- 대상 고르기 (5-2 · 5-3) ----------
  pickFoe(ai, es, cur) {
    const T = CONFIG.teamAI, W = T.w, easy = ai.diffKey === 'easy', now = Game.time;
    const alive = es.filter(u => !u.dead); if (!alive.length) return null;
    const vis = alive.filter(u => Vision.visible(ai, u)); if (!vis.length) return cur && !cur.dead ? cur : null;
    const mates = this.mates(ai), carries = mates.filter(a => !this.isMelee(a)).concat(this.isMelee(ai) ? [] : [ai]);
    const F = this.focus[ai.team], lead = Game.player && Game.player.team === ai.team && !Game.player.dead ? Game.player : null;
    const focusU = lead && lead.attackTarget && !lead.attackTarget.dead && isHero(lead.attackTarget) ? lead.attackTarget : F && now - F.t <= T.focusTtl && !F.u.dead ? F.u : null;   // 플레이어가 찍은 대상 > 콜러가 마지막으로 친 대상
    const melee = this.isMelee(ai), range = melee ? 3 : ai.aaRange(), efront = alive.filter(u => u.role === 'frontline');
    const est = u => ai.ad * (1 + (ai.critChance || 0) * 0.75) * 3 * 100 / (100 + (u.def || 0));
    const pressedMate = ai.diffKey === 'hard' ? mates.find(a => this.pressured(a)) : null;
    const dps = u => Math.max(1, (u.ad || 0) * (u.curAs ? u.curAs() : u.atkSpd ? u.atkSpd() : (u.as || 1)) * (1 + (u.critChance || 0) * 0.75) + (u.sp || 0) * 0.35);
    const ehpOf = u => Math.max(1, u.hp) * (1 + (u.def || 0) / 100) + (u.shield || 0), dangerMax = Math.max(...vis.map(u => dps(u) / ehpOf(u)));
    const score = u => {
      const d = V.dist(ai.pos, u.pos), gap = d - u.r - (melee ? ai.r : 0); let s = W.hp * (1 - u.hp / u.maxHp);
      if (this.isCarry(u)) s += W.carry;
      if (u.stun > 0 || u.root > 0 || u.fear > 0) s += W.cc; else if (u.slows && u.slows.length) s += W.slow;
      if (u === focusU) s += W.focus;
      s -= W.dist * Math.max(0, gap - range);
      if (!easy) {
        if (this.isMelee(u) && carries.some(a => V.dist(a.pos, u.pos) < T.peelDist)) s += W.peel * (ai.role === 'frontline' ? 2 : 1);   // 필: 아군 원딜에 붙은 근접
        if (est(u) >= u.hp && gap <= range + 0.5) s += W.kill * (Sphere.pressing(ai) ? CONFIG.sphere.ai.killMul : 1);   // 폭발 타이머: 처치 관여 +7초                                                                          // 킬각
        if (ai.role !== 'flanker' && efront.some(f => f !== u && V.dist(ai.pos, f.pos) < d && Geo.segDist(f.pos, ai.pos, u.pos) < 3)) s -= W.dive;   // 앞라인 너머 다이브 금지
        if (ai.role === 'flanker' && this.isCarry(u)) s += W.flank + 20 * (1 - u.hp / u.maxHp);                                        // 측면: 체력 낮은 원딜
        if (!melee && this.isMelee(u) && d < T.threatDist + u.r) s += W.threat;                                                          // 원딜에게 붙은 근접 → 그걸 침
      }
      if (u.untargetable > 0 || (u.shield || 0) > u.maxHp * 0.15) s -= 20;
      if (!easy) {
        s += W.danger * (dps(u) / ehpOf(u)) / dangerMax;   // 프리딜을 못 견디는 상대 먼저 · 단단하고 딜 약한 상대는 뒤로
        if (this.isCarry(u) && this.heroes(u.team).some(m => m !== u && m.hp / m.maxHp < 0.25)) s += W.stay;   // 동료가 빈사 → 남아서 딜하는 캐리(스킬이 잘 맞음)
      }
      if (ai.lastHitBy && ai.lastHitBy.u === u && now - ai.lastHitBy.t < 2.5) s += W.revenge;
      if (pressedMate && (pressedMate.dmgLog || []).some(e => e.src === u && now - e.t < T.pingpong.window)) s += W.pingpong;   // 핑퐁: 아군을 치던 적의 어그로를 가져옴
      return s;
    };
    let best = null, bs = -Infinity; for (const u of vis) { const s = score(u); if (s > bs) { bs = s; best = u; } }
    // 대상 유지: 지금 대상이 보이고 살아 있으면 15점 이상 높거나 1.2초가 지나야 전환 — 근접이 붙음·킬각은 즉시
    if (cur && best !== cur && vis.includes(cur)) {
      const cs = score(cur), urgent = (!melee && this.isMelee(best) && V.dist(ai.pos, best.pos) < T.threatDist + best.r) || est(best) >= best.hp;
      if (!urgent && (now - (ai.foeSince || 0) < T.hold || bs < cs + T.switchMargin)) return cur;
    }
    if (best !== cur) ai.foeSince = now;
    return best;
  },
  // ---------- 팀 움직임 (6장) — RangedDuelist.think에서 키트 스킬 판단 전에 ----------
  think(ai, p, d) {
    const T = CONFIG.teamAI, easy = ai.diffKey === 'easy', mates = this.mates(ai);
    if (!mates.length || ai.kiteT > 0) return false;
    const foes = Game.units.filter(u => isHero(u) && u.team !== ai.team && u.team !== 2 && !u.dead && Vision.visible(ai, u));
    const c = this.center(mates), hpR = ai.hp / ai.maxHp, melee = this.isMelee(ai);
    const fc = foes.length ? this.center(foes) : null;
    const back = () => { const away = fc ? V.norm(V.sub(c, fc)) : V.norm(V.sub(c, ai.pos)); return Geo.pushOut(V.add(c, V.mul(away, T.regroupBack)), ai.r); };
    const go = (q, t, why) => { ai.moveTarget = q; ai.kiteT = t; ai.teamMove = why; ai.stats[why] = (ai.stats[why] || 0) + 1; return true; };
    // ① 개인 후퇴: 체력이 낮고 적이 사거리 안 → 아군 쪽(뒤)으로
    if (Sphere.stance(ai) === 'push' && hpR > 0.15) return false;   // 타이머가 적은 팀: 물러나면 먼저 터짐 → 끝까지 교전
    const stall = Sphere.stance(ai) === 'stall', low = (melee ? T.lowHp.melee : T.lowHp.ranged) + (stall ? 0.15 : 0);   // 버팀: 일찍 빠짐
    if (hpR < low && foes.some(f => V.dist(f.pos, ai.pos) < (this.isMelee(f) ? 4 : (f.aaRange ? f.aaRange() : 6)) + 1)) return go(back(), 0.7, 'retreats');
    if (easy) return false;
    // ② 팀 후퇴: 체크리스트 ≤ 1 이고 수적 열세
    const CL = this.checklist(ai.team);
    if (CL.score <= T.retreatScore && CL.us < CL.them && hpR < 0.7 && fc && V.dist(ai.pos, fc) < 9) return go(back(), 0.6, 'retreats');
    // ②-2 핵심 스킬을 다 쓴 상태(R·E 쿨)에서 멀쩡한 적이 가까이 → 빠짐
    const SR = T.spentRetreat, spent = foeCd(ai, 'R') > 3 && foeCd(ai, 'E') > 2;
    if (spent && hpR < SR.myHp && foes.some(f => f.hp / f.maxHp > SR.foeHp && V.dist(f.pos, ai.pos) < 7)) return go(back(), 0.6, 'spentRetreats');
    // ③ 혼자 싸우지 않기: 아군이 멀고 적 2명 이상이 가까움
    const nearest = Math.min(...mates.map(a => V.dist(a.pos, ai.pos)));
    if (nearest > T.spacingMax && foes.filter(f => V.dist(f.pos, ai.pos) < 6).length >= 2) return go(Geo.pushOut(V.lerp(ai.pos, c, 0.7), ai.r), 0.5, 'regroups');
    // ④ 추격 한계: 아군 중심에서 8m 넘게 도망간 적은 쫓지 않음(사거리 밖일 때)
    const fleeing = p && p.vel && V.dot(p.vel, V.sub(p.pos, c)) > 0.5;   // 아군 중심에서 멀어지는 쪽으로 움직이는 중
    if (p && !p.dead && fleeing && stall && d > (melee ? 3 : ai.aaRange()) + 0.5) return go(Geo.pushOut(V.lerp(ai.pos, c, 0.5), ai.r), 0.5, 'chaseStops');   // 버팀: 도망가는 적은 안 쫓음(시간은 우리 편)
    if (p && !p.dead && fleeing && V.dist(p.pos, c) > T.chaseDist && d > (melee ? 3 : ai.aaRange()) + 1 && p.hp / p.maxHp > 0.2) return go(Geo.pushOut(V.lerp(ai.pos, c, 0.5), ai.r), 0.5, 'chaseStops');
    // ⑤ 재집결: 근처에 적이 없는데 혼자 멀리 떨어짐
    if (V.dist(ai.pos, c) > T.regroup && (!p || p.dead || d > 9)) return go(Geo.pushOut(V.lerp(ai.pos, c, 0.6), ai.r), 0.5, 'regroups');
    return false;
  },
  // 안 보이는 적 찾기: 수적 우위면 추정 위치로 파고듦(3:1로 대치만 하다 끝나지 않게)
  huntDist(ai) {
    const H = CONFIG.teamAI.huntDist, us = this.heroes(ai.team).length, them = this.heroes(1 - ai.team).length;
    return us > them ? H.ahead : us === them ? H.even : CONFIG.rangedAI.hunt.safeDist;
  },
  // 팀 자세: 팔 길이(살아 있는 실험체의 최대 사거리)가 짧은 팀은 먼저 진입(dive), 긴 팀은 받아침(hold)
  reach(t) { return Math.max(0, ...this.heroes(t).map(u => this.isMelee(u) ? 3 : (u.aaRange ? u.aaRange() : u.aaCfg ? u.aaCfg().range : 5))); },
  stance(t) { return this.reach(t) < this.reach(1 - t) - CONFIG.teamAI.reachMargin ? 'dive' : 'hold'; },
  // 궁 아끼기: 아군이 대상 근처에 없으면(마무리·위기 아니면) R을 쓰지 않음
  holdUlt(ai, p) {
    if (ai.diffKey === 'easy' || !p || p.dead || Sphere.stance(ai) === 'push') return false;
    const mates = this.mates(ai); if (!mates.length) return false;
    if (p.hp / p.maxHp < 0.35 || ai.hp / ai.maxHp < 0.4) return false;
    return !mates.some(a => V.dist(a.pos, p.pos) < CONFIG.teamAI.ultHoldDist);
  },
  // 측면(다니엘) 진입 허락: 아군이 먼저 교전 중 · 수적 우위 · 대상 고립 · 대상 빈사 · 팔이 짧은 팀(dive) (쉬움은 항상)
  mayEngage(ai, p) {
    if (ai.diffKey === 'easy' || !this.mates(ai).length) return true;
    const ss = Sphere.stance(ai); if (ss === 'push') return true; if (ss === 'stall' && p.hp / p.maxHp > 0.3) return false;   // 폭발 타이머 운영
    const now = Game.time, mates = this.mates(ai), CL = this.checklist(ai.team);
    if (this.stance(ai.team) === 'dive' && CL.score >= CONFIG.teamAI.diveScore) return true;
    if (mates.some(a => now - (a.lastFight || -99) < 2 && V.dist(a.pos, p.pos) < 8)) return true;
    if (CL.us > CL.them || p.hp / p.maxHp < 0.4) return true;
    const pm = this.heroes(p.team).filter(u => u !== p), pc = this.center(pm);
    return !pc || V.dist(p.pos, pc) > CONFIG.teamAI.isolate;
  },
  // 자리 점수 감점: 원딜은 원형 투기장 가장자리(중심 12m 밖)로 밀리지 않기
  spotPenalty(ai, q) {
    const rd = Geo.round(); if (!rd || this.isMelee(ai)) return 0;
    const r = V.dist(q, rd.c); return r > CONFIG.teamAI.edgeLimit ? (r - CONFIG.teamAI.edgeLimit) * 2.5 : 0;
  },
};
// 팀 대전 모드에 연결
Object.assign(Modes.team, {
  pickFoe(ai, es, cur) { return TeamAI.pickFoe(ai, es, cur); },
  teamThink(ai, p, d) { return TeamAI.think(ai, p, d); },
  onDamage(src, tgt, dmg) { TeamAI.onDamage(src, tgt, dmg); },
  mayEngage(ai, p) { return TeamAI.mayEngage(ai, p); },
  spotPenalty(ai, q) { return TeamAI.spotPenalty(ai, q); },
  holdUlt(ai, p) { return TeamAI.holdUlt(ai, p); },
  huntDist(ai) { return TeamAI.huntDist(ai); },
});
