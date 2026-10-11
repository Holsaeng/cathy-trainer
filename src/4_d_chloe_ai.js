
// ============================== AI 클로에 (결투·팀 대전 상대·아군) ==============================
// 니나·스킬 효과는 플레이어와 같은 ChloeCore(3_z_rangedy_chloe.js). 여기서는 「언제 쓰나」만 정함
// 판단 근거: 네브짱 「클로에 랭킹 1위 랭크 꿀팁 강의」(docs/er_notes_playables.md 10장)
//   · 평타 원딜: 기본은 평타 + 니나가 같은 대상을 침(Q는 니나 주변에 적이 있을 때)
//   · Q → E2 → Q: 니나–클로에–적 일렬이면 E2(적중 시 Q 초기화) → Q 한 번 더
//   · W1(회전) → 다가오면 W2(던지기 → 니나 내려찍기 에어본) · 도주 = E1 후 걷기(쫓아오는 적에게 E2)
//   · R 생명 공유: 위기(체력 낮음)·니나가 죽기 직전 — 광역 피해를 둘 다 맞으면 손해라 몰려 있을 땐 아낌 · 근접 상대가 붙으면 마름쇠
Kits.chloe = {
  init(ai) {
    const K = ai.kitCfg;
    ai.ch = { K, color: ai.motif.color, S: NullStats,
      L: k => ai.L(k), hit: (u, amt, k, o) => ai.hitP(u, amt * ai.diff.dmgMul, Object.assign({ name: (K[k] && K[k].name) || k }, o)),
      foes: () => Game.units.filter(u => u.team !== ai.team && u.team !== 2 && !u.dead && u.kind !== 'ward' && !(u.untargetable > 0)),
      level: () => ai.level || 1, pen: () => ai.pen || 0,
      cdStart: k => { ai.cds[k] = ai.pick(K[k].cd, k); }, cdMul: (k, m) => { ai.cds[k] *= m; }, cdSet: (k, v) => { ai.cds[k] = v; },
      noAA: t => { ai.noAA = Math.max(ai.noAA, t); }, target: () => this.target(ai) };
    ChloeCore.attach(ai);
  },
  // 니나가 칠 대상: 지금 싸우는 상대(보이고 가까우면)
  target(ai) { const f = ai.foe; return f && !f.dead && !(f.untargetable > 0) && Vision.visible(ai, f) && V.dist(ai.pos, f.pos) < 8 ? f : null; },
  onAAHit(ai, u) { ChloeCore.onAAHit(ai, u); },
  update(ai, dt) { ChloeCore.update(ai, dt); },
  think(ai, p, d) {
    const K = ai.kitCfg, n = ai.nina, up = ChloeCore.up(ai), hard = ai.diffKey === 'hard', hpR = ai.hp / ai.maxHp;
    // W2: 회전 중 상대가 사거리 안 → 예측 지점에 던지기 (자수 + 니나 내려찍기까지의 시간만큼 앞을 봄)
    if (ai.spin) {
      if (Game.time - ai.spin.t0 >= 0.35 && d <= K.W.range + 0.5) { const lead = K.W.throwTime + (up ? K.W.slamDelay * 0.6 : 0); ChloeCore.w2(ai, ai.predict(p, lead)); }
      return false;
    }
    // E2: 니나가 클로에에게 날아오는 길에 상대가 있으면 → 적중 시 Q 초기화
    if (ChloeCore.e2Ready(ai)) {
      const E = K.E, dist = Math.min(E.ninaDist, V.dist(n.pos, ai.pos)), end = V.add(n.pos, V.mul(V.norm(V.sub(ai.pos, n.pos)), dist));
      if (Geo.segDist(p.pos, n.pos, end) <= p.r + E.ninaWidth / 2 + 0.15 || Game.time > ai.eRe.until - 0.3) { ChloeCore.e2(ai); return false; }
    }
    // Q: 니나 주변에 상대 (클로에 행동은 막지 않음)
    if (up && ai.cds.Q <= 0 && V.dist(n.pos, p.pos) <= K.Q.radius + p.r - 0.15) { ChloeCore.q(ai); return false; }
    // R 생명 공유: 위기이거나 니나가 곧 죽을 때 (근거리 교전 중)
    if (up && ai.cds.R <= 0 && d < 6.5 && (hpR < 0.45 || n.hp / n.maxHp < 0.3 || (hard && p.hp / p.maxHp < 0.45 && d < 5))) { ChloeCore.r(ai); return false; }
    // W1 회전: 상대가 던지기 사거리 안
    if (ai.cds.W <= 0 && d < K.W.range - 0.3) { ChloeCore.w1(ai); return false; }
    // D 마름쇠: 근접 상대가 다가오면 앞길에 / 아니면 가끔 발밑에
    if (ai.cds.D <= 0 && d < K.D.range + 0.5 && (TeamAI.isMelee(p) ? d < 4.5 : rnd() < 0.35)) {
      const D = K.D, at = ai.predict(p, D.windup + 0.4);
      ai.startCast(D.windup, () => ChloeCore.d(ai, at), { kind: 'circle', pos: at, r: D.r });
      return true;
    }
    // E1 진입: 상대 체력이 낮고 평타 사거리 조금 밖이면 붙어서 마무리 (니나가 뒤에 있으면 E2가 따라옴)
    if (ai.cds.E <= 0 && !ai.eRe && up && hpR > 0.5 && p.hp / p.maxHp < 0.35 && d > ai.aaRange() && d < ai.aaRange() + K.E.dist - 0.5) {
      this.dashE(ai, V.norm(V.sub(p.pos, ai.pos))); return true;
    }
    return false;
  },
  dashE(ai, dir) {
    const E = ai.kitCfg.E, from = V.copy(ai.pos); ai.dashTo(dir, E.dist, E.time, true, E.name);
    ChloeCore.e1Hits(ai, from, ai.act && ai.act.to ? ai.act.to : from); ai.eRe = { t0: Game.time, until: Game.time + E.window }; Sfx.play('blink');
  },
  // 위급: E1로 빠지기 (쫓아오면 E2로 니나가 날아와 경로의 적을 침)
  escape(ai, p, dir) {
    if (ai.cds.E <= 0 && !ai.eRe) { this.dashE(ai, dir); return true; }
    if (ChloeCore.e2Ready(ai)) { ChloeCore.e2(ai); return false; }
    return false;
  },
  draw(ai, ctx) { if (Vision.visible(Game.player, ai) || ai.team === myTeam()) ChloeCore.draw(ai, ctx); },
};
