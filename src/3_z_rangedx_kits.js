
// ============================== 플레이어 원거리 키트 (아야 · 리오 · 나딘 · 카티야) ==============================
// 각 키트: short(HUD 이름) · def(스킬 정의 덧붙임) · init · update · cast{Q,W,E,R,D} · recast(재입력 가능?) · instant(시전 중에도 즉시) · shape(조준 미리보기) · draw · hud
//          aaRange · asFlat · pen · fireAA · aaMul · noCrit · onAAHit · onHit · onDamaged
// 수치는 CONFIG.rangedKits(12.5), 조작은 docs/er_notes_playables.md 「플레이어 조작 구현 메모」. ⚠ 출처 없는 시간·폭은 AI와 같은 추정값

// ---------------- 아야 (권총) ----------------
PKits.aya = {
  short: { Q: '2연발', W: '고정', E: '무빙턴', R: '공포탄', D: '리로드' },
  noAim: ['D'],
  def: { E: { dash: true }, R: { moveCancel: false } },
  init(p) { p.pCd = 0; p.reload = 0; p.ayaW = null; },
  update(p, dt) { if (p.pCd > 0) p.pCd -= dt; },
  // P 아야의 정의: 피격 시 보호막(25초, 쿨감 무시) · 공격(평타·스킬)이 맞을 때마다 쿨 1초 감소
  onDamaged(p) {
    if (p.pCd > 0 || p.dead) return; const P = p.K.P;
    p.shield = Math.max(p.shield, p.calc(P, 'P')); p.shieldT = P.dur; p.pCd = P.cd; FX.text(p.pos, P.name, p.color, 12, { bold: true });
  },
  onHit(p) { p.pCd = Math.max(0, p.pCd - p.K.P.perHit); },
  onAAHit(p) {
    p.pCd = Math.max(0, p.pCd - p.K.P.perHit);
    if (p.reload > 0 && --p.reload === 0) p.asBuffs = p.asBuffs.filter(a => a.tag !== 'reload');   // 무빙 리로드: 평타 2회 공속 +70%
  },
  recast(p, k) { return k === 'W' && !!p.ayaW; },
  cast: {
    // Q 2연발: 대상 지정 6.5m(밖이면 다가감) — 1발 = 기본 공격(공 110%, 치명 가능) · 2발 = 스킬 피해, 1발이 나가면 2발은 반드시 발사. 시전 중 이동 불가, 공속 1 이상이면 빨라짐
    Q(p, aim) {
      const t = p.targetAt(aim, 'Q'); if (!t) return false;
      return p.chaseCast('Q', t, p.K.Q.range, () => {
        const Q = p.K.Q;
        p.beginCast('Q', t.pos, { windup: q => Q.windup / Math.max(1, q.atkSpd()), recovery: () => 0.06,
          fire(q) {
            q.startCd('Q'); q.facing = V.ang(V.sub(t.pos, q.pos)); Sfx.play('throw');
            const go = (r, onHit) => q.shot({ dir: V.norm(V.sub(t.pos, q.pos)), speed: 30, home: t, only: t, width: 0.3, len: 0.5, onHit });
            go(1, u => q.aaLand(u, Q.first));
            q.after(Q.gap, () => go(2, u => q.hitS(u, q.calc(Q, 'Q'), 'Q')));
            q.addAs(lv(Q.asBuff, q.L('Q')), Q.asDur, 'ayaQ');
            FX.text(q.pos, Q.name, q.color, 12, { bold: true });
          } }, {});
      });
    },
    // W 고정 사격: 누른 순간의 방향으로 2.2초 연사, 이동 가능 · W 재입력 = 중단 · 기본 6발, 추가 공속 20%마다 +1(최대 10)
    W(p, aim) {
      if (p.ayaW) { p.ayaW.stop = true; FX.text(p.pos, '사격 중단', '#aaa', 11); return true; }
      const W = p.K.W, dir = p.dirTo(aim), n = clamp(Math.round(W.shots + (p.atkSpd() - 1) * 5), W.shots, W.maxShots); let fired = 0;
      p.startCd('W'); p.noAA = W.dur; p.instantUsed('W'); const cid = ++p.castSeq;
      FX.text(p.pos, W.name, p.color, 12, { bold: true });
      p.ayaW = { t: 0, dur: W.dur, dir, onTick: (dt, c) => { while (fired < n && c.t >= (fired / n) * W.dur) { fired++; Sfx.play('aa');
        p.shot({ dir: c.dir, speed: W.speed, range: W.range, width: W.width, len: 0.45, onHit: u => { p.hitS(u, p.calc(W, 'W'), 'W', { hid: 'W:' + cid }); } }); } },
        onEnd: () => { p.ayaW = null; p.noAA = 0; } };
      p.chans.push(p.ayaW); return true;
    },
    // E 무빙턴: 커서 방향 4m 대시(벽 넘기 가능), Q·W 남은 쿨 감소
    E(p, aim) {
      const E = p.K.E, r = lv(E.qwReduce, p.L('E'));
      p.dash('E', p.dirTo(aim), E.dist, E.time, 0.5); p.startCd('E');
      for (const k of ['Q', 'W']) p.skills[k].cd *= 1 - r;
      FX.text(p.pos, E.name, p.color, 12, { bold: true }); Sfx.play('blink'); return true;
    },
    // R 공포탄: 0.66초 뒤 주변 4.5m 피해 + 공포 (시전 중 이동 불가)
    R(p, aim) {
      const R = p.K.R;
      p.beginCast('R', aim, { windup: () => R.delay, recovery: () => 0.05,
        start(q) { FX.text(q.pos, R.name, q.color, 13, { bold: true }); },
        fire(q) {
          q.startCd('R'); Sfx.play('ult'); FX.ring(q.pos, 0.5, R.radius, '#ffffff', 0.4, 0.12); FX.addShake(6);
          for (const u of q.foes()) if (V.dist(u.pos, q.pos) <= R.radius + u.r) { q.hitS(u, q.calc(R, 'R'), 'R', { aoe: true }); if (u.applyFear && u.applyFear(R.fear, q.pos)) FX.text(u.pos, '공포!', '#b18cff', 16, { bold: true }); }
        } }, {});
      return true;
    },
    // D 무빙 리로드: 1초 이속(평타 불가, 스킬 가능) → 다음 평타 2회 공속 +70%
    D(p) {
      const D = p.K.D; p.startCd('D'); p.addMsBuff(lv(D.ms, p.L('D')), D.dur, false, 'reload'); p.noAA = D.dur; p.instantUsed('D');
      p.after(D.dur, () => { p.reload = D.asShots; p.addAs(D.asBuff, 5, 'reload'); });
      FX.text(p.pos, D.name, p.color, 12, { bold: true }); Sfx.play('blink'); return true;
    },
  },
  shape(p, k) {
    const K = p.K;
    return { Q: { kind: 'target', range: K.Q.range + p.r }, W: { kind: 'line', len: K.W.range, width: K.W.width }, E: { kind: 'dash', len: K.E.dist }, R: { kind: 'self', r: K.R.radius } }[k] || null;
  },
  draw(p, ctx) { if (p.ayaW) { ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = p.color; Draw.oRect(ctx, p.pos, V.ang(p.ayaW.dir), p.K.W.range, p.K.W.width); ctx.restore(); } },
  hud(p) {
    const b = []; if (p.pCd > 0) b.push([`정의 ${Math.ceil(p.pCd)}`, '#8a93a6']); else b.push(['정의 준비', '#5aa9ff']);
    if (p.ayaW) b.push(['고정 사격 (W: 중단)', p.color]); if (p.reload > 0) b.push([`리로드 ×${p.reload}`, '#ffd166']);
    if (p.asBuffs.some(a => a.tag === 'ayaQ')) b.push(['2연발 공속↑', '#9fd8ff']); return b;
  },
};

// ---------------- 리오 (활) ----------------
PKits.rio = {
  short: { Q: '활 교체', W: '하나레', E: '비상', R: '연사', D: '곡사' },
  noAim: ['Q'],
  def: { Q: { fixedCd: true }, R: { moveCancel: false } },
  label(p, k) { if (k === 'Q') return p.stance === 'short' ? '→화궁' : '→단궁'; if (k === 'R') return p.rRecast ? '강화살!' : p.stance === 'short' ? '연사' : '정사필중'; return this.short[k]; },
  init(p) { p.stance = 'long'; p.kc = 0; p.kcReady = false; p.rRecast = null; },
  noCrit: true,
  // P 카이: 평타 치명 없음 — 항상 ×(1.02 + 치명확률 × (0.75 + 치명 피해)) · 방관 = 2/5/8% + 치명확률 × 10%
  aaMul(p) { return 1.02 + p.critChance * (0.75 + (p.critDmg || 0)); },
  pen(p) { const P = p.K.P; return lv(P.pen, p.plv) + p.critChance * P.penPerCrit; },
  asFlat(p) { return p.stance === 'long' ? -p.K.Q.long.asPenalty : 0; },
  aaRange(p) { const Q = p.K.Q; return p.stance === 'short' ? Q.short.range : 6.3 + 0.05 * (p.L('Q') - 1) + (p.kcReady ? Q.longRange : 0); },   // 화궁 6.3~6.5m(Q 레벨)
  gainKc(p) { if (p.kcReady) return; if (++p.kc >= p.K.Q.stacks) { p.kcReady = true; p.kc = 0; FX.text(p.pos, '카이츄', p.color, 11, { bold: true }); } },
  fullKc(p) { p.kc = 0; p.kcReady = true; },
  // 평타: 단궁 = 주 화살 36% + 추가 2발 35% / 화궁 = 102% 1발 — 카이츄 강화(단궁 이속·공속, 화궁 사거리+0.4·잃은 체력 1%당 0.3%)
  fireAA(p, t) {
    const Q = p.K.Q, ready = p.kcReady, dir = V.norm(V.sub(t.pos, p.pos));
    if (ready) { p.kcReady = false; if (p.stance === 'short') { p.addMsBuff(lv(Q.shortMs, p.L('Q')), Q.buffDur, true, 'rioQ'); p.addAs(lv(Q.shortAs, p.L('Q')), Q.buffDur, 'rioQ'); } }
    const land = (u, ratio, main) => {
      const miss = main && ready && p.stance === 'long' ? 1 + clamp(1 - u.hp / u.maxHp, 0, 1) * 100 * Q.longMissing / 100 : 1;
      p.aaLand(u, ratio * miss); if (main) this.gainKc(p);
    };
    if (p.stance === 'short') {
      p.shot({ dir, speed: 26, home: t, only: t, len: 0.5, onHit: u => land(u, Q.short.ratio, true) });
      for (const s of [-1, 1]) p.shot({ dir: V.fromAng(V.ang(dir) + s * 0.06), speed: 26, home: t, only: t, len: 0.4, onHit: u => land(u, Q.short.extraRatio, false) });
    } else p.shot({ dir, speed: 24, home: t, only: t, len: 0.8, onHit: u => land(u, Q.long.ratio, true) });
    return true;
  },
  onAAHit() {},
  onHit(p, u, o) {
    if (o.kc !== false && isHero(u)) this.gainKc(p);
    if (o.hanare) for (const k of ['Q', 'E', 'R', 'D']) p.skills[k].cd = Math.max(0, p.skills[k].cd - p.K.W.cdReduce);   // 하나레 적중: 다른 스킬 쿨 1초 감소
  },
  update(p, dt) {
    const foes = p.foes();
    for (const z of p.zones) {   // 단궁 하나레 바람(이속 감소) · 곡사 착탄
      z.t += dt;
      if (z.type === 'wind') for (const u of foes) if (V.dist(u.pos, z.pos) <= z.r + u.r * 0.5) u.addSlow(z.slow, 0.1);
      if (z.type === 'arc' && !z.hit && z.t >= z.delay) {
        z.hit = true; const D = p.K.D;
        for (const u of foes) { const dd = V.dist(u.pos, z.pos); if (dd <= D.radius + u.r * 0.5) { const inner = dd <= D.innerR; p.hitS(u, p.calc(inner ? { base: D.inner, bad: D.innerBad, sp: D.innerSp } : D, 'D'), 'D', { aoe: true, hid: 'D:' + z.id }); u.addSlow(D.slow, D.slowDur); } }
        Vision.reveals.push({ team: p.team, pos: V.copy(z.pos), r: D.radius, t: 1 });   // 착탄 지점 시야
        FX.ring(z.pos, 0.5, D.radius, p.color, 0.35, 0.12); FX.burst(z.pos, p.color, 16, 5);
      }
    }
    p.zones = p.zones.filter(z => z.type === 'wind' ? z.t < z.dur : !z.hit);
    if (p.rRecast && (p.rRecast.t -= dt) <= 0) this.strong(p, null);   // 연사 강한 화살: 유예가 끝나면 자동 발사
  },
  recast(p, k) { return k === 'R' && !!p.rRecast; },
  cast: {
    // Q 카에유미: 단궁 ↔ 화궁 전환 (0.8초, 쿨감 무시) — 연사 재사용 대기 중이면 취소
    Q(p) {
      const Q = p.K.Q; p.stance = p.stance === 'short' ? 'long' : 'short'; p.startCd('Q'); p.instantUsed('Q');
      if (p.rRecast) { p.rRecast = null; FX.text(p.pos, '연사 취소', '#aaa', 11); }
      FX.text(p.pos, p.stance === 'short' ? '단궁' : '화궁', p.color, 12, { bold: true }); Sfx.play('click'); return true;
    },
    // W 하나레: 단궁 = 7.5m 부채꼴 5발(같은 대상 반복 20%, 바람 장판) / 화궁 = 10.5m 직선 관통(첫 대상 + 뒤 대상 추가 피해, 둔화)
    W(p, aim) {
      const W = p.K.W, short = p.stance === 'short';
      p.beginCast('W', aim, { windup: () => 0.2, recovery: () => 0.05,
        fire(q, c) {
          q.startCd('W'); Sfx.play('throw'); const dir = c.dir, cid = c.id;
          if (!short) {
            let first = null;
            q.shot({ dir, speed: W.long.speed, range: W.long.range, width: W.long.width, len: 1.4, pierce: true, onHit: u => {
              if (!first) { first = u; q.hitS(u, q.calc(W.long, 'W'), 'W', { hanare: true, hid: 'W:' + cid }); }
              else q.hitS(u, q.calc(W.long.behind, 'W'), 'W', { kc: false, hid: 'W:' + cid });
              u.addSlow(W.long.slow, W.long.slowDur);
            } });
          } else {
            const landed = {};
            for (let i = 0; i < W.short.arrows; i++) {
              const a = V.ang(dir) + ((i / (W.short.arrows - 1)) - 0.5) * W.short.spread * Math.PI / 180;
              q.after(i * 0.06, () => q.shot({ dir: V.fromAng(a), speed: 30, range: W.short.range, width: W.short.width, len: 0.6, onHit: u => {
                const n = landed[u.id] = (landed[u.id] || 0) + 1, first = n === 1;
                q.hitS(u, q.calc(W.short, 'W') * (first ? 1 : W.short.repeat), 'W', { hanare: first && Object.keys(landed).length === 1, kc: first && Object.keys(landed).length === 1, hid: 'W:' + cid });
                if (first) q.zones.push({ type: 'wind', pos: V.copy(u.pos), r: W.short.zoneR, t: 0, dur: W.short.zoneDur, slow: W.short.slow });
              } }));
            }
          }
        } }, {});
      return true;
    },
    // E 비상: 커서 방향 5m 도약 → 착지 때 평타 사거리 안 적(최대 3, 커서에 가까운 순)에게 화살, 카이츄 최대
    E(p, aim) {
      const E = p.K.E; p.startCd('E'); FX.text(p.pos, E.name, p.color, 12, { bold: true }); Sfx.play('blink');
      p.dash('E', p.dirTo(aim), E.leap, E.leapTime, 0, q => {
        const S = q.stance === 'short' ? E.short : E.long, n = q.stance === 'short' ? E.short.arrows : 1, cid = q.castSeq;
        const ts = q.foes().filter(u => isHero(u) || u.kind === 'dummy').filter(u => V.dist(q.pos, u.pos) - u.r <= PKits.rio.aaRange(q) + 0.5 && Vision.visible(q, u)).sort((a, b) => V.dist(a.pos, aim) - V.dist(b.pos, aim)).slice(0, 3);
        for (const t of ts) for (let i = 0; i < n; i++) q.shot({ dir: V.fromAng(V.ang(V.sub(t.pos, q.pos)) + (i - (n - 1) / 2) * 0.05), speed: 28, home: t, only: t, len: 0.6, onHit: u => {
          q.hitS(u, q.calc(S, 'E'), 'E', { kc: false, hid: 'E:' + cid });
          if (q.stance === 'long') for (const v of q.foes()) if (V.dist(v.pos, u.pos) <= 2 + v.r) q.hitS(v, q.calc({ base: E.long.aoe, ad: E.long.aoeAd }, 'E'), 'E', { kc: false, aoe: true, hid: 'E:' + cid });
        } });
        PKits.rio.fullKc(q);
      });
      return true;
    },
    // R: 단궁 연사(8.5m 3연발 + 재입력 강한 화살 4m 넉백·벽꿍 기절, 3초 지나면 자동) / 화궁 정사필중(0.6초 고정 → 무제한 직선, 실험체만, 0.8초 뒤 강화)
    R(p, aim) {
      if (p.rRecast) { PKits.rio.strong(p, aim); return true; }
      const R = p.K.R;
      if (p.stance === 'short') {
        const S = R.short;
        p.beginCast('R', aim, { windup: () => 0.15, recovery: () => 0.05,
          fire(q, c) {
            q.startCd('R'); PKits.rio.fullKc(q); FX.text(q.pos, '연사', q.color, 13, { bold: true }); const dir = c.dir, cid = c.id;
            for (let i = 0; i < S.arrows; i++) q.after(i * 0.1, () => q.shot({ dir, speed: 32, range: S.range, width: S.width, len: 0.8, onHit: u => { q.hitS(u, q.calc(S, 'R'), 'R', { hid: 'R:' + cid }); KU.knock(u, dir, S.push, 0.08); } }));
            q.rRecast = { t: S.recast.grace, dir, ready: Game.time + 0.15 + S.arrows * 0.1 + 0.1 };   // 3연발이 다 나간 뒤부터 강한 화살
          } }, {});
      } else {
        const L = R.long;
        p.beginCast('R', aim, { windup: () => L.windup, recovery: () => 0.1,
          start(q) { FX.text(q.pos, '정사필중', q.color, 13, { bold: true }); },
          fire(q, c) {
            q.startCd('R'); PKits.rio.fullKc(q); Sfx.play('ult'); const cid = c.id;
            q.shot({ dir: c.dir, speed: L.speed, range: 60, width: L.width, len: 2, color: '#ffffff', heroOnly: true, onHit: (u, pr) => {
              const boosted = pr.traveled > L.speed * L.boostAfter;
              q.hitS(u, q.calc(L, 'R') * (boosted ? 1 + L.boost : 1), 'R', { hid: 'R:' + cid }); u.addSlow(L.slow, L.slowDur * (boosted ? 2 : 1));
              if (boosted) FX.text(u.pos, '강화!', '#ffffff', 13, { bold: true });
            } });
          } }, {});
      }
      return true;
    },
    // D 곡사: 지면 지정 28m, 0.3초 시전 → 1.5초 뒤 화살비 (상대에게도 범위가 보임)
    D(p, aim) {
      const D = p.K.D, pos = p.ptIn(aim, D.range);
      p.beginCast('D', pos, { windup: () => D.windup, recovery: () => 0.1,
        fire(q, c) { q.startCd('D'); q.zones.push({ type: 'arc', pos, t: 0, delay: D.delay, id: c.id }); Sfx.play('throw'); FX.text(q.pos, D.name, q.color, 12, { bold: true }); } }, {});
      return true;
    },
  },
  // 연사 강한 화살: 4m 넉백, 벽에 부딪히면 추가 피해 + 기절 1초
  strong(p, aim) {
    const RC = p.K.R.short.recast, rr = p.rRecast; if (!rr) return;
    if (Game.time < rr.ready) { if (!rr.queued) { rr.queued = true; p.after(rr.ready - Game.time, () => { rr.ready = 0; this.strong(p, aim); }); } return; }   // 3연발 중 재입력 → 다 쏜 뒤 발사
    p.rRecast = null;
    const t = Game.nearestEnemy(p.pos, p.K.R.short.range + 1, p), dir = aim ? p.dirTo(aim) : t ? V.norm(V.sub(t.pos, p.pos)) : rr.dir;
    Sfx.play('ult'); FX.text(p.pos, '강한 화살', '#ffffff', 12, { bold: true }); const cid = ++p.castSeq;
    p.shot({ dir, speed: 34, range: p.K.R.short.range, width: p.K.R.short.width, len: 1.3, color: '#ffffff', onHit: u => {
      p.hitS(u, p.calc(RC, 'R'), 'R', { hid: 'R:' + cid });
      KU.knock(u, dir, RC.knock, 0.25, () => { p.hitS(u, p.calc({ base: RC.wallBase, ad: RC.wallAd }, 'R'), 'R', { hid: 'Rw:' + cid }); u.applyCC('stun', RC.stun); FX.text(u.pos, '벽꿍 기절!', '#ffffff', 16, { bold: true }); FX.addShake(8); });
    } });
  },
  shape(p, k) {
    const K = p.K, s = p.stance === 'short';
    if (k === 'W') return s ? { kind: 'cone', len: K.W.short.range, angle: K.W.short.spread } : { kind: 'line', len: K.W.long.range, width: K.W.long.width };
    if (k === 'E') return { kind: 'dash', len: K.E.leap };
    if (k === 'R') return s ? { kind: 'line', len: K.R.short.range, width: K.R.short.width } : { kind: 'line', len: 30, width: K.R.long.width };
    if (k === 'D') return { kind: 'circle', range: K.D.range, r: K.D.radius };
    return null;
  },
  draw(p, ctx) {
    for (const z of p.zones) {
      if (z.type === 'wind') KU.fill(ctx, z.pos, z.r, '#9fe3b0', 0.25 * (1 - z.t / z.dur));
      else { const k = clamp(z.t / z.delay, 0, 1), D = p.K.D; KU.fill(ctx, z.pos, D.radius, p.color, 0.12 + 0.15 * k); KU.ring(ctx, z.pos, D.radius, p.color, 0.9); KU.fill(ctx, z.pos, D.innerR, '#ffffff', 0.15 + 0.2 * k); }
    }
  },
  hud(p) {
    const b = [[p.stance === 'short' ? '단궁 (4.85m)' : `화궁 (${fmt(this.aaRange(p), 2)}m)`, p.color], [p.kcReady ? '카이츄 준비!' : `카이츄 ${'●'.repeat(p.kc)}${'○'.repeat(p.K.Q.stacks - p.kc)}`, p.kcReady ? '#ffd166' : '#8a93a6']];
    if (p.rRecast) b.push([`강한 화살 R ${fmt(p.rRecast.t, 1)}`, '#ffffff']); return b;
  },
};

// ---------------- 나딘 (석궁) ----------------
PKits.nadine = {
  short: { Q: '황소의 눈', W: '덫', E: '와이어', R: '늑대', D: '강노' },
  noAim: ['Q', 'R'],
  def: { D: { moveCancel: false } },
  label(p, k) { if (k === 'Q' && p.charge) return '발사!'; if (k === 'W' && p.trapA) return '덫 2'; if (k === 'E' && p.wire) return '이동!'; return this.short[k]; },
  init(p) { Object.assign(p, { charge: null, traps: [], trapA: null, wire: null, wolfT: 0, wolfN: 0, mark: null, lastP: {} }); },
  recast(p, k) { return (k === 'Q' && !!p.charge) || (k === 'W' && !!p.trapA) || (k === 'E' && !!p.wire); },
  wireAs(p, dur) { const E = p.K.E; p.addAs(lv(E.as, p.L('E')) + p.sp * 0.0005, dur, 'wire'); },
  // R 늑대: 평타 3번마다 대상에게 늑대 (시작 즉시 2중첩 → 첫 평타에도) + 야성
  onAAHit(p, u) {
    if (p.wolfT > 0 && ++p.wolfN >= p.K.R.every) { p.wolfN = 0; const R = p.K.R; p.hitS(u, p.calc(R, 'R') + p.stacks, 'R', { hid: 'R:' + Game.time }); u.addSlow(R.slow, R.slowDur); FX.burst(u.pos, '#c9c9c9', 14, 6); FX.text(u.pos, '늑대!', '#e0e0e0', 13, { bold: true }); }
    this.markHit(p, u);
  },
  onHit(p, u, o) { if (!o.mark) this.markHit(p, u); },
  // 강노 표식: 대상에게 평타·스킬이 맞을 때마다 폭발 0.5초 앞당김 + 피해 증가
  markHit(p, u) { const m = p.mark; if (!m || m.u !== u) return; const M = p.K.D.mark; m.t -= M.cut; m.bonus += lv(M.inc, p.L('D')) + p.bonusAd * lv(M.incBad, p.L('D')) + p.sp * (M.incSp || 0); },
  update(p, dt) {
    const K = p.K, foes = p.foes().filter(u => u.kind !== 'animal');
    if (p.wolfT > 0) p.wolfT -= dt;
    // Q 충전: 이속 서서히 −20%, 평타 불가, CC를 받으면 취소(쿨 50% 반환), 최대 충전 1초 뒤 자동 발사(⚠ 출처 없음)
    const C = p.charge;
    if (C) {
      C.t += dt; const Q = K.Q; p.noAA = 0.15; p.addMsBuff(-Q.chargeSlow * Math.min(1, C.t / Q.charge), 0.1, false, 'charge');
      if (p.stun > 0 || p.fear > 0 || p.forced || p.silence > 0 || p.dead) { p.charge = null; p.skills.Q.cd = p.skills.Q.cdMax = Q.cd * Q.refund; FX.text(p.pos, '충전 취소', '#aaa', 11); }
      else if (C.t >= Q.charge + 1) this.fireQ(p, p.cursor || V.add(p.pos, V.fromAng(p.facing)));
    }
    // W 첫 덫: 5초 안에 두 번째를 못 던지면 사라짐(⚠) — 쿨 시작
    if (p.trapA && (p.trapA.t -= dt) <= 0) { p.trapA = null; p.startCd('W'); }
    // 덫 연결선을 지나간 적: 피해 + 이속 감소 + 5초 노출 (이미 이 덫에 둔화 중이면 30%)
    for (const u of foes) { const lp = p.lastP[u.id]; if (lp) for (const tr of p.traps) {
      if (tr.used || !(KU.segCross(lp, u.pos, tr.a, tr.b) || Geo.segDist(u.pos, tr.a, tr.b) < u.r * 0.5)) continue;
      tr.used = true; const W = K.W, again = u.trapSlowT > Game.time;
      p.hitS(u, p.calc(W, 'W') * (again ? 0.3 : 1), 'W', { hid: 'W:' + tr.id }); u.addSlow(lv(W.slow, p.L('W')), W.slowDur); u.trapSlowT = Game.time + W.slowDur;
      u.revealT = Math.max(u.revealT || 0, 5);
      FX.text(u.pos, '덫!', p.color, 15, { bold: true });
    } }
    p.traps = p.traps.filter(tr => !tr.used && (tr.life -= dt) > 0);
    for (const u of foes) p.lastP[u.id] = V.copy(u.pos);
    // E 와이어: 7초 · 11m 넘게 멀어지거나 CC를 받으면 끊김
    if (p.wire && ((p.wire.t -= dt) <= 0 || V.dist(p.pos, p.wire.pos) > K.E.breakDist || p.stun > 0 || p.root > 0 || p.fear > 0)) { p.wire = null; p.asBuffs = p.asBuffs.filter(a => a.tag !== 'wire'); }
    // 강노 표식 폭발
    if (p.mark && (p.mark.t -= dt) <= 0) { const M = K.D.mark, m = p.mark, u = m.u; p.mark = null; if (!u.dead) { p.hitS(u, p.calc(M, 'D') + m.bonus, 'D', { mark: true, hid: 'Dm:' + Game.time }); FX.burst(u.pos, p.color, 18, 6); } }
  },
  fireQ(p, aim) {
    const Q = p.K.Q, C = p.charge; if (!C) return; p.charge = null;
    const k = clamp(C.t / Q.charge, 0, 1), rng = lerp(Q.range[0], Q.range[1], k), dir = p.dirTo(aim);
    const base = lv(Q.min, p.L('Q')) + p.bonusAd * Q.minBad + p.sp * Q.minSp, amt = base * lerp(1, Q.maxMul, k) + p.stacks, cid = ++p.castSeq;
    p.startCd('Q'); p.S.cast('Q'); Vision.act(p, 'skill'); Sfx.play('throw'); Events.emit('action', { k: 'Q' }); p.facing = V.ang(dir);
    let hit = false; const pr = p.shot({ dir, speed: Q.speed, range: rng, width: Q.width, len: 1.2 + k, onHit: u => { hit = true; p.hitS(u, amt, 'Q', { hid: 'Q:' + cid }); } });
    pr.onDone = () => p.S.resolveShot('Q', hit);
    FX.text(p.pos, `${Q.name} ${Math.round(k * 100)}%`, p.color, 12, { bold: true });
  },
  cast: {
    // Q 황소의 눈: 첫 입력 = 충전 시작(최대 2초, 사거리 7→14m·피해 최대 2배) / 재입력 = 커서 방향 발사
    Q(p, aim) {
      if (p.charge) { PKits.nadine.fireQ(p, aim); return true; }
      p.charge = { t: 0 }; FX.text(p.pos, '충전…', p.color, 12, { bold: true }); return true;
    },
    // W 다람쥐 덫: 1단계 = 커서 위치(7m)에 덫 / 5초 안 2단계 = 첫 덫에서 5m 안에 두 번째 → 연결(최대 3세트)
    W(p, aim) {
      const W = p.K.W;
      if (p.trapA) {
        const a = p.trapA.pos, d = Math.min(W.link, V.dist(a, aim)), b = Geo.pushOut(V.add(a, V.mul(V.dist(aim, a) > 0.05 ? V.norm(V.sub(aim, a)) : { x: 1, y: 0 }, d)), 0.2);
        p.trapA = null; p.traps.push({ a, b, life: W.life, id: ++p.castSeq });
        while (p.traps.length > W.sets) p.traps.shift();
        p.startCd('W'); p.instantUsed('W'); Sfx.play('click'); FX.text(b, '연결', p.color, 12, { bold: true }); return true;
      }
      const a = Geo.pushOut(p.ptIn(aim, W.range), 0.2); p.trapA = { pos: a, t: 5 }; Sfx.play('click'); FX.text(a, W.name, p.color, 12, { bold: true }); return true;
    },
    // E 원숭이 와이어: 1단계 = 커서 위치(7m)에 와이어, 걸려 있는 동안 공속 / 재입력 = 와이어로 이동(이후 3초 공속 유지)
    E(p, aim) {
      const E = p.K.E;
      if (p.wire) {
        const to = Geo.pushOut(V.copy(p.wire.pos), p.r), dir = V.norm(V.sub(to, p.pos)), dist = V.dist(p.pos, to); p.wire = null; PKits.nadine.wireAs(p, E.after);
        p.dash('E', dir, dist, E.zipTime, 0.99); FX.text(p.pos, '와이어 이동', p.color, 12, { bold: true }); return true;
      }
      const pos = Geo.pushOut(p.ptIn(aim, E.range), 0.3); p.wire = { pos, t: E.life }; p.startCd('E'); p.instantUsed('E'); PKits.nadine.wireAs(p, E.life);
      FX.text(p.pos, E.name, p.color, 12, { bold: true }); Sfx.play('click'); return true;
    },
    // R 늑대 맹습: 10초
    R(p) { const R = p.K.R; p.startCd('R'); p.wolfT = R.dur; p.wolfN = R.every - 1; p.instantUsed('R'); FX.text(p.pos, R.name, p.color, 13, { bold: true }); Sfx.play('ult'); return true; },
    // D 강노: 0.3초 → 7.5m·45° 부채꼴 관통 — 피해 + 40% 둔화 + 4초 뒤 폭발 표식(첫 대상)
    D(p, aim) {
      const D = p.K.D;
      p.beginCast('D', aim, { windup: () => D.windup, recovery: () => 0.05,
        fire(q, c) {
          q.startCd('D'); Sfx.play('throw'); FX.slash(q.pos, c.ang, D.range, D.angle / 2 * Math.PI / 180, q.color, 0.25); let hit = false;
          for (const u of q.foes()) if (Geo.inSector(q.pos, c.ang, D.range, D.angle / 2 * Math.PI / 180, u.pos, u.r)) {
            q.hitS(u, q.calc(D, 'D'), 'D', { mark: true, hid: 'D:' + c.id }); u.addSlow(D.slow, D.slowDur);
            if (!hit && (isHero(u) || u.kind === 'dummy')) { hit = true; q.mark = { u, t: D.mark.time, bonus: 0 }; }
          }
          q.S.resolveShot('D', hit);
        } }, {});
      return true;
    },
  },
  shape(p, k) {
    const K = p.K;
    if (k === 'Q') { const r = p.charge ? lerp(K.Q.range[0], K.Q.range[1], clamp(p.charge.t / K.Q.charge, 0, 1)) : K.Q.range[0]; return { kind: 'line', len: r, width: K.Q.width }; }
    if (k === 'W') return { kind: 'circle', range: K.W.range, r: 0.3 };
    if (k === 'E') return p.wire ? null : { kind: 'circle', range: K.E.range, r: 0.35 };
    if (k === 'D') return { kind: 'cone', len: K.D.range, angle: K.D.angle };
    return null;
  },
  draw(p, ctx) {
    for (const tr of p.traps) { ctx.save(); ctx.strokeStyle = p.color; ctx.lineWidth = 0.07; ctx.setLineDash([0.25, 0.15]); ctx.beginPath(); ctx.moveTo(tr.a.x, tr.a.y); ctx.lineTo(tr.b.x, tr.b.y); ctx.stroke(); ctx.restore(); KU.fill(ctx, tr.a, 0.25, p.color, 0.8); KU.fill(ctx, tr.b, 0.25, p.color, 0.8); }
    if (p.trapA) { KU.fill(ctx, p.trapA.pos, 0.25, p.color, 0.8); KU.ring(ctx, p.trapA.pos, p.K.W.link, p.color, 0.35, true); }
    if (p.wire) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(p.pos.x, p.pos.y); ctx.lineTo(p.wire.pos.x, p.wire.pos.y); ctx.stroke(); ctx.restore(); KU.ring(ctx, p.wire.pos, 0.35, '#ffffff', 0.8); }
    if (p.mark && !p.mark.u.dead) { const u = p.mark.u, k = clamp(p.mark.t / p.K.D.mark.time, 0, 1); ctx.save(); ctx.strokeStyle = p.color; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); ctx.restore(); }
    if (p.charge) { const Q = p.K.Q, k = clamp(p.charge.t / Q.charge, 0, 1), dir = p.dirTo(p.aimPt()); ctx.save(); ctx.globalAlpha = 0.2 + 0.3 * k; ctx.fillStyle = p.color; Draw.oRect(ctx, p.pos, V.ang(dir), lerp(Q.range[0], Q.range[1], k), Q.width); ctx.restore(); }
    if (p.wolfT > 0) KU.ring(ctx, p.pos, p.r + 0.3, '#d0d0d0', 0.5, true);
  },
  hud(p) {
    const b = [[`야성 ${p.stacks}`, '#e0a35a']];
    if (p.charge) b.push([`충전 ${Math.round(clamp(p.charge.t / p.K.Q.charge, 0, 1) * 100)}% (Q: 발사)`, p.color]);
    if (p.trapA) b.push([`덫 2 (W) ${fmt(p.trapA.t, 1)}`, p.color]); if (p.traps.length) b.push([`덫 ${p.traps.length}세트`, '#8a93a6']);
    if (p.wire) b.push([`와이어 (E: 이동) ${fmt(p.wire.t, 1)}`, '#ffffff']); if (p.wolfT > 0) b.push([`늑대 ${fmt(p.wolfT, 1)} · ${p.wolfN}/${p.K.R.every}`, '#d0d0d0']);
    return b;
  },
};

// ---------------- 카티야 (저격총) ----------------
PKits.katja = {
  short: { Q: '조준 사격', W: '포착', E: '접근 금지', R: '정밀 조준', D: '저격' },
  def: { E: { dash: true, moveCancel: false }, R: { channel: true }, Q: { moveCancel: false } },
  label(p, k) { if (k === 'D' && p.snipe) return `발사 ${p.snipe.fired + 1}/3`; return this.short[k]; },
  init(p) { p.psT = 0; p.snipe = null; },
  update(p, dt) { if (p.psT > 0) p.psT -= dt; },
  // P 잿빛 사신: Q·E 사용 후 5초 안의 다음 평타에 추가 스킬 피해
  onAAHit(p, u) { if (p.psT <= 0) return; p.psT = 0; const P = p.K.P; p.hitS(u, lv(P.base, p.plv) + p.ad * lv(P.ad, p.plv), 'P', { hid: 'P:' + Game.time }); FX.text(u.pos, P.name, p.color, 11, { bold: true }); },
  recast(p, k) { return k === 'D' && !!p.snipe; },
  // 저격 모드 중 D = 즉시 발사(시전 중이라도)
  instant(p, k, aim) { if (k !== 'D' || !p.snipe) return false; PKits.katja.snipeShot(p, aim); return true; },
  snipeShot(p, aim) {
    const S = p.snipe, K = p.K.D; if (!S || S.t < K.aim || Game.time - S.last < K.gap || S.fired >= K.shots) return;
    const dead = S.fired === K.shots - 1, SS = dead ? K.dead : K.shot, dir = p.dirTo(aim), cid = ++p.castSeq; S.fired++; S.last = Game.time; p.facing = V.ang(dir);
    Sfx.play(dead ? 'ult' : 'throw'); p.S.cast('D'); Events.emit('action', { k: 'D' });
    let hit = false;
    const pr = p.shot({ dir, speed: K.speed, range: K.range, width: K.width, len: 1.6, color: dead ? '#ff4d4d' : p.color, onHit: u => {
      hit = true; let amt = p.calc(SS, 'D'); if (dead) amt *= 1 + clamp(1 - u.hp / u.maxHp, 0, 1) * (K.dead.missMax - 1);   // 데드아이: 잃은 체력 비례 최대 2배
      p.hitS(u, amt, 'D', { hid: 'D:' + cid }); if (!dead) u.addSlow(K.shot.slow, K.shot.slowDur);
      Vision.reveals.push({ team: p.team, pos: V.copy(u.pos), r: 3, t: 2 });
    } });
    pr.onDone = () => p.S.resolveShot('D', hit);
    if (S.fired >= K.shots) S.end = true;
  },
  cast: {
    // Q 조준 사격: 11m 직선, 첫 대상만, 날아간 거리에 비례해 피해(최대 +50%), 적중 시 4초 공속 / P 창 켜짐
    Q(p, aim) {
      const Q = p.K.Q;
      p.beginCast('Q', aim, { windup: () => Q.windup, recovery: () => 0.05,
        fire(q, c) {
          q.startCd('Q'); q.psT = q.K.P.window; Sfx.play('throw'); let hit = false;
          const pr = q.shot({ dir: c.dir, speed: Q.speed, range: Q.range, width: Q.width, len: 1.1, onHit: (u, pr) => {
            hit = true; const k = clamp(pr.traveled / Q.range, 0, 1), L = q.L('Q'), amt = lerp(lv(Q.min, L) + q.ad * Q.minAd, lv(Q.max, L) + q.ad * Q.maxAd, k);
            q.hitS(u, amt, 'Q', { hid: 'Q:' + c.id }); q.addAs(lv(Q.asBuff, L), Q.asDur, 'katjaQ'); FX.burst(u.pos, q.color, 10, 5);
          } });
          pr.onDone = () => q.S.resolveShot('Q', hit);
        } }, {});
      return true;
    },
    // W 목표물 포착: 지면 지정 23m — 날아가는 동안 근처 적 1초 노출, 도착하면 반경 4.5m 3초 시야
    W(p, aim) {
      const W = p.K.W, to = p.ptIn(aim, W.range), from = V.copy(p.pos), dur = V.dist(from, to) / W.speed;
      p.startCd('W'); p.instantUsed('W'); Sfx.play('throw'); FX.text(p.pos, W.name, p.color, 12, { bold: true }); FX.trail(from, to, '#9fd8ff', 0.12, dur + 0.2);
      for (let s = 0.1; s < dur; s += 0.1) { const at = V.lerp(from, to, s / dur); p.after(s, () => { Vision.reveals.push({ team: p.team, pos: at, r: 1.5, t: 0.1 }); for (const u of p.foes()) if (isHero(u) && V.dist(u.pos, at) <= 1.5 + u.r) u.revealT = Math.max(u.revealT || 0, 1); }); }
      p.after(dur, () => { Vision.reveals.push({ team: p.team, pos: to, r: W.radius, t: W.dur }); FX.ring(to, 0.5, W.radius, '#9fd8ff', 0.5, 0.08);
        for (const w of Game.units) if (w.kind === 'ward' && !w.dead && w.team !== p.team && V.dist(w.pos, to) <= W.radius) w.hp = 1; });
      return true;
    },
    // E 접근 금지: 전방 4.5m·30° 사격(둔화, 맞히면 이속 +40%) → 커서 반대 방향으로 4m 도약(벽 넘기 가능), 도약 직전까지 CC 무시
    E(p, aim) {
      const E = p.K.E;
      p.beginCast('E', aim, { windup: () => E.windup, recovery: () => 0,
        start(q) { q.unstoppable = E.windup + 0.05; },
        fire(q, c) {
          q.startCd('E'); q.psT = q.K.P.window; Sfx.play('throw'); FX.slash(q.pos, c.ang, E.range, E.angle / 2 * Math.PI / 180, q.color, 0.25); let hit = false;
          for (const u of q.foes()) if (Geo.inSector(q.pos, c.ang, E.range, E.angle / 2 * Math.PI / 180, u.pos, u.r)) { hit = true; q.hitS(u, q.calc(E, 'E'), 'E', { hid: 'E:' + c.id }); u.addSlow(lv(E.slow, q.L('E')), E.slowDur); }
          if (hit) q.addMsBuff(E.msBuff, E.msDur, false, 'katjaE');
          q.S.resolveShot('E', hit);
          const back = V.mul(c.dir, -1), len = Geo.passDash(q.pos, back, E.leap, q.r, 0.5); c.data.from = V.copy(q.pos); c.data.to = Geo.pushOut(V.add(q.pos, V.mul(back, len)), q.r);
          FX.text(q.pos, E.name, q.color, 12, { bold: true });
        },
        tick(q, c) { const k = Math.min(1, c.t / E.leapTime); q.pos = V.lerp(c.data.from, c.data.to, k); return k >= 1; } }, {});
      return true;
    },
    // R 정밀 조준: 지면 지정 23m, 0.8초 스캔(제자리 고정 · CC면 끊김) → 사다리꼴 안 적 실험체(최대 3)에게 가까운 순서로 회피 불가 탄, 대상 없으면 쿨 35% 반환
    R(p, aim) {
      const R = p.K.R, pos = p.ptIn(aim, R.range);
      p.beginCast('R', pos, { windup: () => R.scan, recovery: () => 0.1,
        start(q, c) { c.data.pos = pos; c.data.axis = q.dirTo(pos); FX.text(q.pos, R.name, q.color, 13, { bold: true }); q.revealT = Math.max(q.revealT || 0, R.scan + 0.3); },
        fire(q, c) {
          const ts = KU.inTrap(c.data.pos, c.data.axis, R, q.foes().filter(u => isHero(u) || u.kind === 'dummy')).slice(0, R.max);   // 실험체(연습용 허수아비 포함)
          q.startCd('R');
          if (!ts.length) { q.skills.R.cd *= 1 - R.refund; FX.text(q.pos, '스캔 실패', '#8a93a6', 12); return; }
          Sfx.play('ult');
          ts.forEach((u, i) => q.after(i * 0.15, () => { const S = R.shots[i] || R.shots[0];
            q.shot({ dir: V.norm(V.sub(u.pos, q.pos)), speed: R.speed, home: u, only: u, width: 0.5, len: 1.8, color: '#ff4d4d', onHit: v => { q.hitS(v, q.calc(S, 'R'), 'R', { hid: 'R:' + c.id + ':' + i }); FX.burst(v.pos, '#ff4d4d', 18, 7); FX.addShake(6); } }); }));
        } }, {});
      return true;
    },
    // D 저격: 제자리 고정 10초 모드 — 정신 집중(0.55초 ⚠) 뒤 D를 누를 때마다 커서 방향 발사(간격 0.25초), 3발째 데드아이 · 이동하면 해제, 0발이면 쿨 50% 반환
    D(p, aim) {
      const K = p.K.D;
      p.beginCast('D', aim, { windup: () => 0, recovery: () => 0.05,
        fire(q, c) { c.data.noStat = true; q.snipe = { t: 0, fired: 0, last: -99 }; FX.text(q.pos, K.name, q.color, 13, { bold: true }); q.noAA = K.mode; },
        tick(q, c, dt) {
          const S = q.snipe; if (!S) return true; S.t += dt; q.noAA = 0.2;
          if (S.end || S.t >= K.mode || q.pendingMove || q.stun > 0 || q.silence > 0) {
            q.snipe = null; q.noAA = 0; q.startCd('D'); if (S.fired === 0) q.skills.D.cd *= 0.5;
            return true;
          }
          return false;
        } }, {});
      return true;
    },
  },
  shape(p, k) {
    const K = p.K;
    if (k === 'Q') return { kind: 'line', len: K.Q.range, width: K.Q.width };
    if (k === 'W') return { kind: 'circle', range: K.W.range, r: K.W.radius };
    if (k === 'E') return { kind: 'back', len: K.E.leap, cone: { len: K.E.range, angle: K.E.angle } };
    if (k === 'R') return { kind: 'trap', range: K.R.range, len: K.R.len, w0: K.R.w0, w1: K.R.w1 };
    if (k === 'D') return { kind: 'line', len: K.D.range, width: K.D.width };
    return null;
  },
  draw(p, ctx) {
    if (p.snipe) { const K = p.K.D, dir = p.dirTo(p.aimPt()), ready = p.snipe.t >= K.aim; ctx.save(); ctx.globalAlpha = ready ? 0.45 : 0.2; ctx.fillStyle = p.snipe.fired === K.shots - 1 ? '#ff4d4d' : p.color; Draw.oRect(ctx, p.pos, V.ang(dir), K.range, K.width); ctx.restore(); }
    if (p.cast && p.cast.k === 'R' && p.cast.data.pos) { const R = p.K.R, q = KU.trapPts(p.cast.data.pos, p.cast.data.axis, R), k = clamp(p.cast.t / R.scan, 0, 1); ctx.save(); ctx.globalAlpha = 0.15 + 0.35 * k; ctx.fillStyle = '#ff4d4d'; ctx.beginPath(); ctx.moveTo(q[0].x, q[0].y); for (const v of q) ctx.lineTo(v.x, v.y); ctx.closePath(); ctx.fill(); ctx.restore(); }
  },
  hud(p) {
    const b = []; if (p.psT > 0) b.push([`잿빛 사신 ${fmt(p.psT, 1)}`, p.color]);
    if (p.snipe) b.push([p.snipe.t < p.K.D.aim ? '저격 집중…' : `저격 모드 ${fmt(p.K.D.mode - p.snipe.t, 1)} · D 발사 ${p.snipe.fired}/3`, '#ff4d4d']);
    if (p.asBuffs.some(a => a.tag === 'katjaQ')) b.push(['조준 공속↑', '#c58bff']); return b;
  },
};
