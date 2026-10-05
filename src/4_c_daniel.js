
// ============================== 근거리 암살자 키트: 다니엘 (단검) ==============================
// 스킬 수치: CONFIG.rangedKits.daniel (나무위키) / 판단: CONFIG.meleeAI (네브짱 '장인초대석' 다니엘 랭킹 1위 강의)
//  stalk  : 정면 싸움 금지 — Q 사거리 근처(6m)에서 서성이며(부쉬 선호) 캐시의 E(수쳐)·Q가 빠지거나 체력이 깎이길 기다림
//  engage : 망토(이속) → E 은신 돌진 → 그림자 평타(건너편 순간이동) → Q(중앙) + W 표식 → 단검(뒤로 순간이동) → 평타 → R 걸작
//           궁 이후 도망치는 캐시를 쫓을 수 있게 E는 가능하면 아낌 · E 사거리가 모자라면 늑대를 그림자 평타로 경유
//  retreat: 체력이 낮고 궁이 빠졌으면 빠졌다가 다시 서성이기
Kits.daniel = {
  init(ai) {
    Object.assign(ai, { mode: 'stalk', modeT: 0, qShots: 0, shadowT: 0, cloakT: 0, lastHitT: 99, mark: null, shadow: null, aaTarget: null, engageHits: 0 });
    Object.assign(ai.stats, { engages: 0, rUses: 0, wolfHops: 0, markPops: 0 });
  },
  K(ai) { return ai.kitCfg; },
  aaRange(ai) { return ai.shadowT > 0 ? ai.kitCfg.E.aaRange : ai.motif.aaRange; },
  setMode(ai, m) { if (ai.mode !== m) { ai.mode = m; ai.modeT = 0; if (m === 'engage') ai.stats.engages++; } },

  // ---------- 매 스텝 ----------
  update(ai, dt) {
    const K = ai.kitCfg, p = Game.player;
    ai.modeT += dt; ai.lastHitT += dt;
    // P 고독한 예술가: 밤에 시야·이동 속도 증가
    ai.sightMul = Vision.night ? 1 + ai.pick(K.P.sight, 'P') : 1;
    if (Vision.night) ai.addMsBuff(ai.pick(K.P.ms, 'P'), 0.25, false, 'danP');
    if (ai.shadowT > 0) { ai.shadowT -= dt; if (ai.shadowT <= 0) ai.stealthT = 0; }
    if (ai.cloakT > 0) { ai.cloakT -= dt; if (ai.cloakT <= 0) ai.cds.D = ai.pick(K.D.cd, 'D'); }   // 단검(2차) 안 쓰면 쿨 시작
    if (ai.qShots > 0 && !ai.asBuffs.some(a => a.tag === 'danQ')) ai.qShots = 0;
    if (ai.mark) {
      const M = ai.mark; M.t += dt;
      if (M.target.dead || M.t > K.W.ready + K.W.popWindow) ai.mark = null;
      else if (M.target === p) Vision.reveals.push({ team: ai.team, pos: V.copy(p.pos), r: 2, t: 0.05 });   // 표식 대상 주변 2m 시야 (부쉬·암시야 속도 보임)
    }
    for (const o of ai.objs) { o.t += dt; if (!o.done && o.t >= o.dur) { o.done = true; this.qLand(ai, o); } }
    ai.objs = ai.objs.filter(o => o.t < o.dur + 0.25);
    if (ai.mode === 'engage' && ai.thinkT > ai.diff.react * 0.5) ai.thinkT = ai.diff.react * 0.5;   // 콤보 중에는 판단을 빠르게
  },
  // R 걸작: 그림자 속(대상에 붙어 대상 지정 불가) — 일반 행동을 대신함
  preempt(ai, dt) {
    const S = ai.shadow; if (!S) return false;
    const K = ai.kitCfg.R, u = S.target; S.t += dt;
    if (!u.dead) ai.pos = V.copy(u.pos);
    ai.untargetable = ai.invuln = 0.1; ai.stealthT = 0.05; ai.vel = { x: 0, y: 0 };
    const every = K.dur / K.ticks;
    while (S.n < K.ticks && S.t >= every * (S.n + 1) - 1e-6) { S.n++; if (!u.dead) ai.hitP(u, ai.calc(K.tick, 'R'), { name: K.name, noShake: true }); }
    if (S.t >= K.dur || u.dead) this.exitShadow(ai);
    return true;
  },
  exitShadow(ai) {
    const S = ai.shadow, K = ai.kitCfg.R, u = S.target; ai.shadow = null;
    if (!u.dead) { ai.hitP(u, ai.calc(K.last, 'R'), { name: K.name + ' (마무리)' }); FX.xslash(u.pos, ai.motif.color, 3); Sfx.play('ult'); }
    // 빠져나오는 방향: 계속 싸울 거면 캐시 등 뒤(벽 반대), 도망칠 거면 반대쪽
    const away = ai.hp / ai.maxHp < CONFIG.meleeAI.lowHp && u.hp / u.maxHp > 0.35;
    let best = null, bs = -Infinity;
    for (let i = 0; i < 12; i++) {
      const dir = V.fromAng(i * Math.PI / 6), q = V.add(u.pos, V.mul(dir, K.exit));
      const sc = wallClearance(q) * 1.2 + (away ? V.dist(q, u.pos) : -Math.abs(angDiff(i * Math.PI / 6, (u.facing ?? 0) + Math.PI))) + Math.random() * 0.2;
      if (sc > bs) { bs = sc; best = dir; }
    }
    ai.untargetable = ai.invuln = K.exitTime; ai.stealthT = 0;
    ai.dashTo(best, K.exit, K.exitTime, false);
    if (away) this.setMode(ai, 'retreat');
  },

  // ---------- 피해 훅: 영감 축적·폭발, 최근 피해(궁 조건) ----------
  dealt(ai, u, dmg, o) {
    if (u !== Game.player) return;
    ai.lastHitT = 0; u.blindT = 0;   // 다니엘에게 맞으면 시야 감소 해제
    const M = ai.mark, W = ai.kitCfg.W; if (!M || M.target !== u || (o && o.markPop)) return;
    if (M.t >= W.ready) {   // 영감의 대상 공격 → 폭발
      ai.mark = null; ai.stats.markPops++;
      const acc = M.acc; Combat.damage(ai, u, acc, { type: 'true', source: '적 영감 (축적)' });
      ai.hitP(u, ai.calc(W, 'W'), { name: W.name + ' 폭발', markPop: true }); u.addSlow(W.slow, W.slowDur);
      FX.burst(u.pos, '#d9a8ff', 24, 7, 0.6); FX.ring(u.pos, 0.3, 1.8, '#d9a8ff', 0.4); FX.text(u.pos, '영감 폭발 ' + Math.round(acc), '#d9a8ff', 14, { bold: true });
    } else M.acc += dmg * (ai.pick(W.acc, 'W') + ai.bonusAd * W.accBad) / 100;
  },
  onHit(ai, u, o, dmg) { this.dealt(ai, u, dmg || 0, o); },
  onAAHit(ai, u, dmg) {
    this.dealt(ai, u, dmg || 0);
    if (ai.qShots > 0 && --ai.qShots <= 0) ai.asBuffs = ai.asBuffs.filter(a => a.tag !== 'danQ');
  },

  // ---------- 평타: 근접 즉시 판정 / 그림자 돌진 중이면 대상 건너편으로 순간이동 ----------
  fireAA(ai, p) {
    const t = ai.aaTarget && !ai.aaTarget.dead ? ai.aaTarget : p; ai.aaTarget = null;
    const K = ai.kitCfg.E, d = V.dist(ai.pos, t.pos) - t.r - ai.r;
    if (ai.shadowT > 0 && d <= K.aaRange + 0.3) {
      const dir = V.norm(V.sub(t.pos, ai.pos)), from = V.copy(ai.pos);
      ai.pos = Geo.pushOut(V.add(t.pos, V.mul(dir, t.r + ai.r + 0.15)), ai.r);
      FX.burst(from, '#4b3a66', 14, 2.5, 0.6, 0.14); FX.trail(from, ai.pos, '#7d5cb8', 0.25, 0.25);
      ai.shadowT = 0; ai.stealthT = 0;
      if (t === p) { ai.aaLand(t); ai.hitP(t, ai.calc(K, 'E'), { name: K.name }); }
      else { Combat.damage(ai, t, ai.ad, { type: 'normal', source: '적 평타' }); ai.stats.wolfHops++; FX.text(ai.pos, '그림자 경유', ai.motif.color, 11); }
      return true;
    }
    if (d <= ai.motif.aaRange + 0.35) { ai.aaLand(t); FX.slash(ai.pos, V.ang(V.sub(t.pos, ai.pos)), 1.3, 0.6, ai.motif.color, 0.15); }
    return true;
  },
  kite(ai, p) {   // 근접: 쏘고 빠지기 대신 계속 붙어 있음 (도망 모드 제외)
    if (ai.mode === 'retreat') { ai.moveTarget = ai.pickSpot(p, 9, 2.2); return; }
    ai.moveTarget = Geo.pushOut(ai.predict(p, 0.15), ai.r);
  },

  // ---------- 스킬 ----------
  castQ(ai, pt) {
    const K = ai.kitCfg.Q, dir = V.norm(V.sub(pt, ai.pos)), dist = Math.min(K.range, V.dist(ai.pos, pt));
    const pos = V.add(ai.pos, V.mul(dir, dist));
    ai.cds.Q = ai.pick(K.cd, 'Q'); ai.stealthT = 0;   // 다른 스킬을 쓰면 은신 해제
    ai.objs.push({ kind: 'scissor', pos, dir, t: 0, dur: K.windup });   // 무빙 캐스팅: 시전 중에도 계속 이동
    Vision.act(ai, 'skill');
    FX.text(ai.pos, K.name, ai.motif.color, 12, { bold: true }); Sfx.play('throw');
  },
  qLand(ai, o) {
    const K = ai.kitCfg.Q, apex = V.sub(o.pos, V.mul(o.dir, K.front)); let hit = false;
    for (const u of Game.units) {
      if (u.dead || u.team === ai.team || u.untargetable > 0) continue;
      if (!Geo.inSector(apex, V.ang(o.dir), K.len, K.angle / 2 * Math.PI / 180, u.pos, u.r)) continue;
      const center = V.dist(u.pos, o.pos) <= K.centerR + u.r;
      if (u === Game.player) { ai.hitP(u, ai.calc(center ? K.center : K, 'Q'), { name: K.name + (center ? ' (중앙)' : '') }); hit = true; }
      else Combat.damage(ai, u, ai.calc(K, 'Q'), { type: 'skill', source: '적 ' + K.name });
      if (center) u.addSlow(K.slow, K.slowDur);
    }
    FX.slash(apex, V.ang(o.dir), K.len, K.angle / 2 * Math.PI / 180, '#9d6bff', 0.3);
    if (hit) { ai.addAs(ai.pick(K.asBuff, 'Q'), K.asDur, 'danQ'); ai.qShots = K.asShots; }
  },
  castW(ai, u) {
    const K = ai.kitCfg.W; ai.cds.W = K.cd; ai.stealthT = 0;
    ai.mark = { target: u, t: 0, acc: 0 }; u.blindT = K.blind; u.blindR = K.blindR;
    FX.text(u.pos, '영감 표식', '#d9a8ff', 13, { bold: true }); FX.ring(u.pos, 1.2, 0.4, '#d9a8ff', 0.4); Sfx.play('throw');
    Vision.act(ai, 'skill');
  },
  castE(ai, dir, dist) {
    const K = ai.kitCfg.E; ai.cds.E = ai.pick(K.cd, 'E');
    FX.burst(ai.pos, '#4b3a66', 18, 2.5, 0.7, 0.16); Vision.noise(ai, 'skill');   // 은신 연기 + 시전 소리(상대는 이것으로 진입을 눈치챔)
    ai.dashTo(dir, Math.min(K.dist, dist ?? K.dist), K.time, false);
    ai.stealthT = ai.pick(K.stealth, 'E'); ai.shadowT = K.shadowDur; ai.revealT = 0;
    FX.text(ai.pos, K.name, ai.motif.color, 12, { bold: true });
  },
  cloak(ai) {   // 망토와 단검 1차: 1초 이속
    const K = ai.kitCfg.D; ai.cloakT = K.recast; ai.addMsBuff(ai.pick(K.ms, 'D'), K.msDur, false, 'danD');
    FX.text(ai.pos, '망토', ai.motif.color, 12, { bold: true }); FX.burst(ai.pos, '#6e5a99', 8, 3, 0.4);
  },
  dagger(ai, u) {   // 2차: 대상 뒤로 순간이동 + 피해·둔화
    const K = ai.kitCfg.D, dir = V.norm(V.sub(u.pos, ai.pos)), from = V.copy(ai.pos);
    ai.cloakT = 0; ai.cds.D = ai.pick(K.cd, 'D'); ai.stealthT = 0; ai.shadowT = 0;
    ai.pos = Geo.pushOut(V.add(u.pos, V.mul(dir, u.r + ai.r + K.behind * 0.3)), ai.r);
    FX.trail(from, ai.pos, '#b07cff', 0.2, 0.25);
    ai.hitP(u, ai.calc(K, 'D') + u.hp * K.curHp * ai.diff.dmgMul, { name: '단검' }); u.addSlow(ai.pick(K.slow, 'D'), K.slowDur);
  },
  canR(ai, p, d) { const K = ai.kitCfg.R; return ai.cds.R <= 0 && ai.lastHitT <= K.recent && d - p.r - ai.r <= K.range && !p.dead; },
  castR(ai, p) {
    const K = ai.kitCfg.R; ai.cds.R = ai.pick(K.cd, 'R'); ai.act = null; ai.moveTarget = null; ai.shadowT = 0;
    ai.shadow = { target: p, t: 0, n: 0 }; p.silence = Math.max(p.silence, K.silence); ai.stats.rUses++;
    if (p.cast && p.cast.phase === 'windup' && p.cancelCast) p.cancelCast(false);   // 침묵: 시전 중이던 스킬 취소
    FX.text(p.pos, K.name + ' — 침묵', ai.motif.color, 15, { bold: true }); FX.ring(p.pos, 1.5, 0.3, '#2a1840', 0.4); Sfx.play('ult');
  },

  // ---------- 판단 ----------
  burst(ai, p) {   // 지금 들어가면 넣을 수 있는 대략적인 피해(방어력 반영)
    const K = ai.kitCfg, mit = 100 / (100 + p.def * (1 - ai.pen)), aa = ai.ad * (1 + ai.critChance * 0.75) * (1 + ai.aaAmp) * ai.diff.dmgMul;
    let s = aa * 3;
    if (ai.cds.Q <= 1) s += ai.calc(K.Q.center, 'Q') + aa * 2;
    if (ai.cds.E <= 0) s += ai.calc(K.E, 'E');
    if (ai.cds.D <= 0 || ai.cloakT > 0) s += ai.calc(K.D, 'D') + p.hp * K.D.curHp;
    if (ai.cds.R <= 0) s += ai.calc(K.R.tick, 'R') * K.R.ticks + ai.calc(K.R.last, 'R');
    return s * mit;
  },
  think(ai, p, d) {
    const K = ai.kitCfg, MA = CONFIG.meleeAI, dk = ai.diffKey, gap = d - p.r - ai.r;
    const myHp = ai.hp / ai.maxHp, herHp = p.hp / p.maxHp;
    const herE = p.skills.E.lv > 0 && p.skills.E.cd <= 0.8, herQ = p.skills.Q.lv > 0 && p.skills.Q.cd <= 0.8;
    // --- 모드 전환 ---
    if (ai.mode !== 'retreat' && myHp < MA.lowHp && ai.cds.R > 0 && herHp > myHp + 0.1 && dk !== 'easy') this.setMode(ai, 'retreat');
    if (ai.mode === 'retreat' && (myHp > MA.engageHp || (ai.modeT > 4 && gap > 8))) this.setMode(ai, 'stalk');
    if (ai.mode === 'stalk') {
      const killable = this.burst(ai, p) >= p.hp * (dk === 'hard' ? 0.85 : 1.0);
      const opening = !herE || (!herQ && dk !== 'easy') || herHp < 0.4;   // 캐시의 수쳐(E)·돌진(Q)이 빠진 순간 = 진입각
      const tools = ai.cds.E <= 0 || ai.cds.D <= 0;
      const forced = gap < 2.0;                                               // 캐시가 먼저 붙으면 맞받아침
      if (forced || (tools && (killable || (opening && (ai.cds.R <= 0 || herHp < 0.5)))) || (dk === 'easy' && ai.modeT > 6)) this.setMode(ai, 'engage');
    }
    if (ai.mode === 'engage' && ai.modeT > 3 && gap > 6 && ai.cds.E > 0 && ai.cds.D > 0 && ai.cloakT <= 0) this.setMode(ai, 'stalk');   // 놓쳤으면 다시 서성이기
    if (!ai.canAct()) return false;

    // --- 공통: 걸작 회피(캐시 E·R 선딜을 대상 지정 불가로 피함) ---
    // 걸작은 사실상 2초 무적 → 캐시가 스킬(특히 E·R, 진입 중엔 Q·W도)을 시전하는 순간 들어가서 피함
    if (p.cast && p.cast.phase === 'windup' && this.canR(ai, p, d) && dk !== 'easy' &&
        (['E', 'R'].includes(p.cast.k) || (ai.mode === 'engage' && ['Q', 'W'].includes(p.cast.k) && Math.random() < (dk === 'hard' ? 0.8 : 0.5)))) { this.castR(ai, p); return true; }

    if (ai.mode === 'engage') return this.combo(ai, p, d, gap);
    if (ai.mode === 'stalk') {
      // Q 견제: 캐시 E가 빠졌을 때만(맞받아치기 어려움), 사거리 7m + 가위 앞부분 1.75m
      // (진입 도구가 다 있으면 Q는 콤보용으로 아낌)
      if (ai.cds.Q <= 0 && (ai.cds.R > 8 || ai.cds.E > 3) && d <= K.Q.range + K.Q.front * 0.6 && d > 4 && (!herE || Math.random() < 0.25) && Math.random() < (dk === 'easy' ? 0.3 : 0.7)) { this.castQ(ai, ai.predict(p, K.Q.windup)); return true; }
      // 어려움: 난전용 W 선표식 — 4초 뒤 진입해서 터뜨림
      if (dk === 'hard' && ai.cds.W <= 0 && d <= K.W.range && !herE && ai.cds.R <= 0) { this.castW(ai, p); this.setMode(ai, 'engage'); return true; }
    }
    return false;
  },
  combo(ai, p, d, gap) {
    const K = ai.kitCfg;
    // 마무리/표식 폭발/위기 → 걸작
    if (this.canR(ai, p, d)) {
      const R = K.R, rDmg = (ai.calc(R.tick, 'R') * R.ticks + ai.calc(R.last, 'R')) * 100 / (100 + p.def);
      const markReady = ai.mark && ai.mark.t >= K.W.ready - 0.3;
      if (markReady || p.hp <= rDmg * 1.15 || ai.hp / ai.maxHp < 0.45 || ai.modeT > (ai.diffKey === 'hard' ? 2.2 : 2.8)) { this.castR(ai, p); return true; }
    }
    // 단검(2차): 망토 후 3초 안, 붙어 있을 때
    if (ai.cloakT > 0 && gap <= K.D.range && ai.lastHitT < 3) { this.dagger(ai, p); return true; }
    // 첫 타가 들어간 뒤: Q(중앙) + W 표식
    if (ai.lastHitT < 1.5 && gap <= 2.2) {
      if (ai.cds.Q <= 0) { this.castQ(ai, p.pos); return true; }
      if (ai.cds.W <= 0 && !ai.mark) { this.castW(ai, p); return true; }
      if (ai.cds.D <= 0 && ai.cloakT <= 0) { this.cloak(ai); return true; }   // 망토 → 다음 판단에 단검
    }
    // 진입: 망토(이속) → E 은신 돌진 → 그림자 평타
    if (gap > K.E.aaRange - 0.2 && ai.shadowT <= 0) {
      if (ai.cds.D <= 0 && ai.cloakT <= 0 && gap > 4) { this.cloak(ai); return true; }
      // E: 3m 돌진 + 그림자 평타 3m → 6m 안이면 닿음. 궁 이후 추격용으로 아끼라는 조언 → 이미 붙어 있으면 안 씀
      if (ai.cds.E <= 0 && gap <= K.E.dist + K.E.aaRange) { this.castE(ai, V.norm(V.sub(p.pos, ai.pos)), Math.max(0.5, gap - 1.5)); return true; }
      // 사거리가 모자라면 늑대를 그림자 평타로 경유(강의 팁)
      if (ai.cds.E <= 0 && gap <= K.E.dist + K.E.aaRange * 2 + 1) {
        const wolf = Game.units.find(u => u.kind === 'animal' && !u.dead && V.dist(u.pos, ai.pos) <= K.E.dist + K.E.aaRange && V.dist(u.pos, p.pos) < d - 1);
        if (wolf) { this.castE(ai, V.norm(V.sub(wolf.pos, ai.pos)), Math.max(0.5, V.dist(ai.pos, wolf.pos) - 1.5)); ai.hopWolf = wolf; return true; }
      }
    }
    return false;
  },
  // 이동: 서성이기(부쉬 선호, 캐시 E 사거리 밖) / 추격 / 후퇴
  move(ai, p, d) {
    const MA = CONFIG.meleeAI;
    if (ai.hopWolf && ai.shadowT > 0 && !ai.hopWolf.dead) {   // 늑대 경유 중: 늑대에게 그림자 평타
      const w = ai.hopWolf; if (V.dist(ai.pos, w.pos) - w.r - ai.r <= ai.kitCfg.E.aaRange && ai.aaCd <= 0) { ai.aaTarget = w; ai.act = { type: 'aa', t: 0, dur: 0.05 }; ai.hopWolf = null; return; }
      ai.moveTarget = V.copy(w.pos); return;
    }
    ai.hopWolf = null;
    if (ai.mode === 'engage') { ai.moveTarget = Geo.pushOut(ai.predict(p, 0.25), ai.r); return; }
    if (ai.mode === 'retreat') { ai.moveTarget = ai.pickSpot(p, 10, 2.4); return; }
    // stalk: 캐시와 6m 근처를 유지하며 좌우로 서성임, 근처 부쉬가 있으면 숨어서 기다림
    const gap = d - p.r - ai.r, safe = CONFIG.rangedAI.eThreatRange;
    if (gap < MA.stalk - MA.stalkBand) { ai.moveTarget = ai.pickSpot(p, MA.stalk + 0.5, 1.8); return; }   // 너무 가까우면 먼저 빠짐(수쳐 사거리 밖)
    let best = null, bs = -Infinity;
    (CONFIG.bushes || []).forEach(b => {
      const c = { x: b.x + b.w / 2, y: b.y + b.h / 2 }, dc = V.dist(c, p.pos);
      if (Geo.segDist(p.pos, ai.pos, c) < safe) return;   // 가는 길이 캐시 수쳐 사거리를 지나가면 제외
      const sc = -Math.abs(dc - MA.stalk) * 1.2 - V.dist(c, ai.pos) * 0.3;
      if (dc > safe && dc < MA.stalk + 4 && sc > bs) { bs = sc; best = c; }
    });
    if (best && bs > -MA.bushPrefer * 2 && V.dist(best, ai.pos) > 0.6) { ai.moveTarget = Geo.pushOut(V.add(best, { x: (Math.random() - 0.5) * 0.6, y: (Math.random() - 0.5) * 0.6 }), ai.r); return; }
    if (best && V.dist(best, ai.pos) <= 0.6) { ai.moveTarget = null; return; }   // 부쉬에서 대기
    ai.moveTarget = ai.pickSpot(p, MA.stalk, 1.4);
  },
  dodge(ai) {   // 투사체·수쳐 회피: 붙어 있고 궁이 되면 걸작으로 피함, 아니면 걸어서
    const p = Game.player, d = V.dist(ai.pos, p.pos);
    if (ai.diffKey !== 'easy' && this.canR(ai, p, d) && ai.mode === 'engage') { this.castR(ai, p); return true; }
    return false;
  },
  // 안 보일 때: 공통 추적(추정 위치에서 7m 유지 — 부쉬 속 캐시의 수쳐·Q 사거리 밖)을 쓰고, 그림자 가위로 부쉬를 찌름
  checkBush(ai, est) {
    const K = ai.kitCfg.Q;
    if (ai.cds.Q <= 0 && V.dist(ai.pos, est) <= K.range + K.front * 0.5) { this.castQ(ai, est); return true; }
    return false;
  },
  // ---------- 그리기 ----------
  draw(ai, ctx) {
    const K = ai.kitCfg.Q;
    for (const o of ai.objs) {   // 그림자 가위 예고: 지정 위치 부채꼴 + 중앙
      if (o.kind !== 'scissor' || o.done) continue;
      const apex = V.sub(o.pos, V.mul(o.dir, K.front)), an = V.ang(o.dir), h = K.angle / 2 * Math.PI / 180, k = clamp(o.t / o.dur, 0, 1);
      ctx.save(); ctx.globalAlpha = 0.12 + 0.3 * k; ctx.fillStyle = '#9d6bff';
      ctx.beginPath(); ctx.moveTo(apex.x, apex.y); ctx.arc(apex.x, apex.y, K.len, an - h, an + h); ctx.closePath(); ctx.fill();
      ctx.globalAlpha = 0.5; ctx.fillStyle = '#d9a8ff'; Draw.circle(ctx, o.pos.x, o.pos.y, K.centerR * k); ctx.fill(); ctx.restore();
    }
    const p = Game.player;
    if (ai.mark && !ai.mark.target.dead) {   // 영감 표식: 4초 뒤 활성(밝아짐)
      const M = ai.mark, ready = M.t >= ai.kitCfg.W.ready, u = M.target;
      KU.ring(ctx, u.pos, u.r + 0.35, ready ? '#ffd1ff' : '#b07cff', ready ? 0.9 : 0.5, !ready);
      if (!ready) { ctx.save(); ctx.globalAlpha = 0.8; ctx.strokeStyle = '#d9a8ff'; ctx.lineWidth = 0.08; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.5, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * M.t / ai.kitCfg.W.ready); ctx.stroke(); ctx.restore(); }
    }
    if (ai.shadow) { KU.fill(ctx, p.pos, p.r + 0.3, '#2a1840', 0.55); KU.ring(ctx, p.pos, p.r + 0.3 + 0.1 * Math.sin(Game.time * 20), '#b07cff', 0.9); }   // 걸작: 캐시 그림자 속
  },
};
