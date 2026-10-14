
// ============================== AI 비형 (브루저 · 결투·팀 대전 상대·아군) ==============================
// 스킬 효과는 플레이어와 같은 BihyungCore(3_z_rangedy_bihyung.js). 여기서는 「언제 쓰나」만 정함 — 근거: 나무위키 콤보·평가 + Yutility 비형 가이드(docs/er_notes_playables.md 14장)
//   · 진입 W → E: W로 둔화·보호막(내가 범위 안)을 먼저 깔고 E 도발 → 도발 중 평타 · Q · 풀스윙(벽 쪽이면 벽꿍 기절)
//   · Q는 평타 강화라 붙어 있을 때 바로 · Q2는 재사용 창(1.5초 뒤)에 · 패시브(신력)를 끊기지 않게 평타를 쉬지 않음
//   · R은 단독 진입기로 아끼고: 주변 적 2명 이상 착지 · 결투에서 상대 빈사·내 체력 낮을 때 마무리·버티기(추가 체력 · 피해 감소)
Kits.bihyung = {
  init(ai) {
    const K = ai.kitCfg;
    ai.bh = { K, color: ai.motif.color, S: NullStats, L: k => ai.L(k), level: () => ai.level || 1,
      hit: (u, amt, k, o) => ai.hitP(u, amt * ai.diff.dmgMul, Object.assign({ name: (K[k] && K[k].name) || k }, o)),
      foes: () => Game.units.filter(u => u.team !== ai.team && u.team !== 2 && !u.dead && u.kind !== 'ward' && !(u.untargetable > 0)),
      cdStart: k => { ai.cds[k] = ai.pick(K[k].cd, k); }, cdSet: (k, v) => { ai.cds[k] = v; } };
    BihyungCore.attach(ai);
  },
  fireAA(ai, p) { ai.aaLand(p); return true; },   // 근접 평타
  onAAHit(ai, u) { BihyungCore.onAA(ai, u); },
  update(ai, dt) { BihyungCore.update(ai, dt); },
  // 풀스윙 방향 뒤에 벽이 가까운가(벽꿍 각)
  wallBehind(p, dir, dist) { const t = Geo.rayHit(p.pos, dir, dist, p.r); return t !== Infinity; },
  think(ai, p, d) {
    const K = ai.kitCfg, hpR = ai.hp / ai.maxHp, pHp = p.hp / p.maxHp, gap = d - ai.r - p.r;
    const foes = ai.bh.foes().filter(u => isHero(u)), taunted = p.taunt > 0 && p.tauntBy === ai;
    // Q2: 재사용 창이 열리면 바로(다음 평타 3연타)
    if (BihyungCore.qReady2(ai) && gap <= ai.aaRange() + 0.6) { BihyungCore.qCast(ai); return false; }
    // R: 착지 지점 주변 적 2명 이상 · 결투 마무리(상대 빈사) · 내가 몰릴 때(추가 체력·피해 감소)
    if (ai.cds.R <= 0 && d <= K.R.range + K.R.core) {
      const land = V.copy(p.pos), around = foes.filter(u => V.dist(u.pos, land) <= K.R.r + u.r).length;
      if (around >= 2 || (pHp < 0.4 && ai.diffKey !== 'easy') || (hpR < 0.35 && gap < 2)) {
        BihyungCore.rStart(ai, land);
        ai.startChannel(K.R.leap, { onTick: (dt, a) => { if (BihyungCore.rStep(ai, dt)) a.stop = true; }, onEnd: () => { if (ai.bhR) BihyungCore.rStep(ai, 99); }, tele: { kind: 'circle', pos: land, r: K.R.r } });
        return true;
      }
    }
    // W: 사거리 7m — 상대 예측 위치에, 가까우면 내 쪽까지 덮어 보호막도 (도발·속박 중이면 확정)
    if (ai.cds.W <= 0 && d <= K.W.range + 0.5) {
      const pred = taunted || p.root > 0 || p.stun > 0 ? V.copy(p.pos) : ai.predict(p, K.W.delay * 0.6);
      const pt = gap < 2 ? V.lerp(ai.pos, pred, 0.6) : pred;   // 붙어 있으면 둘 다 범위 안
      ai.startCast(K.W.windup, () => { BihyungCore.wCast(ai, Geo.pushOut(pt, 0.2)); Sfx.play('throw'); }, { kind: 'circle', pos: pt, r: K.W.r, color: ai.motif.color });
      return true;
    }
    // E: 2.5~5.3m 안 — 돌진해 처음 부딪힌 적 도발 (W 둔화 뒤면 거의 확정)
    if (ai.cds.E <= 0 && gap >= K.E.min - 0.8 && gap <= K.E.max - 0.3 && !(p.unstoppable > 0)) {
      const E = K.E, dir = ai.aimDir(p, E.windup, E.speed); ai.cds.E = ai.pick(E.cd, 'E');
      ai.startCast(E.windup, () => {
        const st = BihyungCore.eStart(ai, dir, d + 0.6); Sfx.play('dash');
        ai.startChannel(1, { onTick: (dt, a) => { if (BihyungCore.eStep(ai, st, dt)) a.stop = true; } });
      }, { kind: 'line', dir, len: E.max, width: E.width });
      return true;
    }
    // 풀스윙: 도발·속박 중이거나 뒤에 벽(벽꿍) · 붙어 있을 때
    if (ai.cds.D <= 0 && gap <= K.D.range + 0.2) {
      const dir = V.norm(V.sub(p.pos, ai.pos));
      if (taunted || p.root > 0 || this.wallBehind(p, dir, K.D.knock) || (hpR < 0.4 && ai.diffKey !== 'easy')) {
        ai.cds.D = K.D.cd[0];   // 쿨 고정
        ai.startCast(K.D.windup, () => { ai.facing = V.ang(dir); BihyungCore.dSwing(ai, V.norm(V.sub(p.pos, ai.pos))); }, { kind: 'cone', dir, len: K.D.range + ai.r, angle: K.D.angle });
        return true;
      }
    }
    // Q: 붙으면 바로 강화 평타
    if (ai.cds.Q <= 0 && !ai.bhQ && !ai.bhQ2 && gap <= ai.aaRange() + 0.4) { BihyungCore.qCast(ai); return false; }
    return false;
  },
  kite() {},   // 브루저: 평타 뒤 물러나지 않음
  move(ai, p, d) { if (d > ai.aaRange() + p.r + ai.r - 0.1) ai.moveTarget = Geo.pushOut(V.copy(p.pos), ai.r); else ai.moveTarget = null; },
  draw(ai, ctx) { if (Vision.visible(Game.player, ai) || ai.team === myTeam()) BihyungCore.draw(ai, ctx); },
};
