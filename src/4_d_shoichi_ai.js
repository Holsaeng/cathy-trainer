
// ============================== AI 쇼이치 (암살자 · 결투·팀 대전 상대·아군) ==============================
// 스킬 효과는 플레이어와 같은 ShoichiCore(3_z_rangedy_shoichi.js). 여기서는 「언제 쓰나」만 정함 — 근거: 나무위키 콤보·평가 + 유저 플레이(농루트 가이드·네브짱 랭크) (docs/er_notes_playables.md 15장)
//   · W는 단검을 줍는 기술: 적을 긁으며 지나가는 단검 → 적 근처(투척 5m) 단검 → 그다음에 적 몸으로 · 단검을 주우면 W 쿨 초기화라 연쇄
//   · 진입은 E(표식·둔화 + 대상 뒤 단검) → W, 붙으면 R(단검 4개) → 단검마다 W · 강화 Q는 미리 장전해 원하는 방향에 단검
//   · 혼자 먼저 궁 금지: R은 대상이 2.5m 안이고 내 체력이 충분하거나 상대가 빈사일 때
//   · 쉬움: 단검 연쇄를 거의 안 함(적에게 W만 · 단검은 걸어서) · R 가끔
Kits.shoichi = {
  init(ai) {
    const K = ai.kitCfg;
    ai.sh = { K, color: ai.motif.color, S: NullStats, L: k => ai.L(k), level: () => ai.level || 1,
      hit: (u, amt, k, o) => ai.hitP(u, amt * ai.diff.dmgMul, Object.assign({ name: (K[k] && K[k].name) || k }, o)),
      foes: () => Game.units.filter(u => u.team !== ai.team && u.team !== 2 && !u.dead && u.kind !== 'ward' && !(u.untargetable > 0)),
      cdStart: k => { ai.cds[k] = ai.pick(K[k].cd, k); }, cdSet: (k, v) => { ai.cds[k] = v; }, cdGet: k => ai.cds[k] || 0, shot: o => ai.shoot(o) };
    ShoichiCore.attach(ai);
  },
  fireAA(ai, p) { ai.aaLand(p); return true; },   // 근접 평타
  onAAHit(ai, u) { ShoichiCore.aaHit(ai, u); },
  update(ai, dt) { ShoichiCore.update(ai, dt); },
  // W 대상 고르기: 적을 긁는 단검 > 적 근처 단검(투척) > 적
  wPick(ai, p, easy) {
    const K = ai.kitCfg, W = K.W, ds = ai.shDags.filter(d => ShoichiCore.landed(d) && V.dist(d.pos, ai.pos) <= W.range);
    let best = null, bs = 0;
    if (!easy) for (const d of ds) {
      const through = Geo.segDist(p.pos, ai.pos, d.pos) <= W.width / 2 + p.r, near = V.dist(d.pos, p.pos) <= K.dagger.throwR;
      const s = (through ? 3 : 0) + (near ? 1 : 0) - V.dist(d.pos, p.pos) * 0.05;
      if (s > bs) { bs = s; best = d; }
    }
    if (best && bs >= 1) return { dagger: best };
    return null;
  },
  think(ai, p, d) {
    const K = ai.kitCfg, hpR = ai.hp / ai.maxHp, pHp = p.hp / p.maxHp, gap = d - ai.r - p.r, easy = ai.diffKey === 'easy';
    // W: 단검 연쇄(적을 긁는 단검 우선) → 아니면 적에게 진입(이미 붙어 있으면 아낌)
    if (ai.cds.W <= 0) {
      const to = this.wPick(ai, p, easy);
      if (to) { ShoichiCore.wGo(ai, to); return false; }
      if (gap <= K.W.range - 0.2 && gap > 1.6 && (hpR > 0.35 || pHp < 0.3) && Vision.visible(ai, p)) { ShoichiCore.wGo(ai, { unit: p }); return false; }
    }
    // R: 붙어 있고(2.5m) 버틸 체력이 있거나 상대 빈사 — 단검 4개를 깔아 W 연쇄
    if (ai.cds.R <= 0 && gap <= K.R.r - 0.4 && (hpR > 0.45 || pHp < 0.35) && (!easy || rnd() < 0.35)) {
      ai.cds.R = ai.pick(K.R.cd, 'R'); FX.text(ai.pos, K.R.name, ai.motif.color, 14, { bold: true });
      ai.startCast(K.R.windup, () => { ShoichiCore.rFire(ai); Sfx.play('ult'); }, { kind: 'circle', pos: V.copy(ai.pos), r: K.R.r });
      return true;
    }
    // E: 5.8m 직선 — 표식·둔화 + 대상 뒤 단검 (너무 붙으면 뒤로 빠지는 동작이 손해라 1.2m 밖)
    if (ai.cds.E <= 0 && gap <= K.E.range - 0.4 && gap >= 1.2) {
      const E = K.E, dir = ai.aimDir(p, E.windup, E.speed);
      ai.startCast(E.windup, () => {
        ShoichiCore.eFire(ai, dir); Sfx.play('throw');
        const back = V.mul(dir, -1), to = V.add(ai.pos, V.mul(back, Geo.clampDash(ai.pos, back, E.back, ai.r)));
        ai.act = { type: 'dash', t: 0, dur: E.backTime, from: V.copy(ai.pos), to };
      }, { kind: 'line', dir, len: E.range, width: E.width });
      return true;
    }
    // Q: 앞 찌르기(강화면 부채꼴 + 정면 단검)
    const qLen = ai.shQ2 > 0 ? K.Q.len2 : K.Q.len;
    if (ai.cds.Q <= 0 && gap <= qLen - 0.2) {
      const dir = V.norm(V.sub(p.pos, ai.pos));
      ai.startCast(K.Q.windup, () => { ShoichiCore.qCast(ai, V.norm(V.sub(p.pos, ai.pos))); }, ai.shQ2 > 0 ? { kind: 'cone', dir, len: K.Q.len2 + ai.r, angle: K.Q.angle2 } : { kind: 'line', dir, len: K.Q.len + ai.r, width: K.Q.width });
      return true;
    }
    // D 망토와 단검: 멀면 1차(이속)로 추격 · 2.5m 안이면 2차(대상 뒤로)
    if (ai.cds.D <= 0 && !easy) {
      if (!ai.shD && gap > 3 && gap < 8) { ai.shD = { t: K.D.window }; ai.addMsBuff(lv(K.D.ms, ai.L('D')), K.D.msDur, false, 'shD'); return false; }
      if (ai.shD && gap <= K.D.range) { ShoichiCore.dHit(ai, p); ai.shD = null; ai.cds.D = ai.pick(K.D.cd, 'D'); return false; }
    }
    return false;
  },
  kite() {},   // 암살자: 평타 뒤 물러나지 않음
  // 이동: W가 없으면 적 근처(투척 거리) 단검을 걸어서 주움 · 아니면 적에게 붙음
  move(ai, p, d) {
    const K = ai.kitCfg;
    if (ai.cds.W > 0) {
      const dg = ai.shDags.filter(x => ShoichiCore.landed(x) && V.dist(x.pos, ai.pos) <= 4.5 && V.dist(x.pos, p.pos) <= K.dagger.throwR).sort((a, b) => V.dist(a.pos, ai.pos) - V.dist(b.pos, ai.pos))[0];
      if (dg) { ai.moveTarget = V.copy(dg.pos); return; }
    }
    if (d > ai.aaRange() + p.r + ai.r - 0.1) ai.moveTarget = Geo.pushOut(V.copy(p.pos), ai.r); else ai.moveTarget = null;
  },
  draw(ai, ctx) { ShoichiCore.draw(ai, ctx, ai.team === myTeam()); },
};
