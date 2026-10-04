
// ============================== 원딜 캐릭터 키트 (실제 스킬, 수치는 CONFIG.rangedKits) ==============================
// 각 키트: init / update / think(스킬 판단) / escape(위협 시 이탈) / dodge(투사체 회피) / aaRange / aaDamage / fireAA / onAAHit / onHit / draw
const KU = {
  inCone(ai, dir, range, angleDeg, u) { return Geo.inSector(ai.pos, V.ang(dir), range, angleDeg / 2 * Math.PI / 180, u.pos, u.r); },
  // 캐시를 dir 방향으로 밀어냄 — 벽에 닿으면 onWall 호출 (리오 연사 넉백)
  knock(u, dir, dist, time, onWall) {
    if (u.dead || u.unstoppable > 0) return;
    const t = Geo.rayHit(u.pos, dir, dist, u.r), len = t === Infinity ? dist : Math.max(0, t - 0.02);
    u.forced = { from: V.copy(u.pos), to: V.add(u.pos, V.mul(dir, len)), t: 0, dur: time * len / Math.max(0.1, dist) + 0.01, onEnd: t === Infinity ? null : onWall };
  },
  segCross(a1, a2, b1, b2) {   // 선분 교차
    const d = (a2.x - a1.x) * (b2.y - b1.y) - (a2.y - a1.y) * (b2.x - b1.x); if (Math.abs(d) < 1e-9) return false;
    const u = ((b1.x - a1.x) * (b2.y - b1.y) - (b1.y - a1.y) * (b2.x - b1.x)) / d, v = ((b1.x - a1.x) * (a2.y - a1.y) - (b1.y - a1.y) * (a2.x - a1.x)) / d;
    return u >= 0 && u <= 1 && v >= 0 && v <= 1;
  },
  ring(ctx, pos, r, col, alpha, dash) { ctx.save(); ctx.globalAlpha = alpha; ctx.strokeStyle = col; ctx.lineWidth = 0.06; if (dash) ctx.setLineDash([0.2, 0.12]); Draw.circle(ctx, pos.x, pos.y, r); ctx.stroke(); ctx.restore(); },
  fill(ctx, pos, r, col, alpha) { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = col; Draw.circle(ctx, pos.x, pos.y, r); ctx.fill(); ctx.restore(); },
};

// 부쉬 체크용: 추정 지점 방향(약간의 오차)
KU.aimAt = (ai, pt) => V.fromAng(V.ang(V.sub(pt, ai.pos)) + (Math.random() - 0.5) * 2 * ai.diff.aimErr);

const Kits = {
  // ---------------- 카티야 (저격총) ----------------
  katja: {
    init(ai) { ai.psT = 0; },
    update(ai, dt) { if (ai.psT > 0) ai.psT -= dt; },
    // P 잿빛 사신: Q·E 후 5초 안의 다음 평타에 추가 스킬 피해
    onAAHit(ai, u) {
      if (ai.psT <= 0) return; ai.psT = 0; const P = ai.kitCfg.P;
      ai.hitP(u, (ai.pick(P.base, 'P') + ai.ad * ai.pick(P.ad, 'P')) * ai.diff.dmgMul, { name: P.name, noPassive: true });
    },
    think(ai, p, d) {
      const K = ai.kitCfg;
      // R 정밀 조준: 캐시가 멀고 진입이 어려울 때 — 0.8초 스캔(제자리 고정) 후 회피 불가 탄
      if (ai.cds.R <= 0 && d > 7.5 && d < K.R.range && (p.skills.Q.cd > 1 || d > 9.5)) {
        const pos = Geo.pushOut(ai.predict(p, K.R.scan), 0.3);
        ai.cds.R = ai.pick(K.R.cd, 'R');
        ai.startChannel(K.R.scan, { tele: { kind: 'circle', pos, r: K.R.radius, color: '#ff4d4d' }, cancelIfClose: 3.5,
          onEnd: (a, cancelled) => {
            if (cancelled || V.dist(p.pos, pos) > K.R.radius + p.r) { ai.cds.R = ai.pick(K.R.cd, 'R') * (1 - K.R.refund); FX.text(ai.pos, '스캔 실패', '#8a93a6', 12); return; }
            Sfx.play('ult');
            ai.shoot({ dir: V.norm(V.sub(p.pos, ai.pos)), speed: K.R.speed, range: 99, width: 0.5, len: 1.8, color: '#ff4d4d', home: p,
              onHit: u => { ai.hitP(u, (ai.pick(K.R.base, 'R') + ai.ad * K.R.ad) * ai.diff.dmgMul, { name: K.R.name }); FX.burst(u.pos, '#ff4d4d', 18, 7); FX.addShake(6); } });
          } });
        FX.text(ai.pos, K.R.name, ai.motif.color, 13, { bold: true });
        return true;
      }
      // 무기 스킬 저격: 멀리서 제자리 고정 저격 모드 (저지 사격 2발 → 데드아이)
      if (ai.cds.D <= 0 && d > 7.5 && d < K.D.range - 1 && (p.skills.Q.cd > 1 || d > 9)) { this.snipe(ai, p); return true; }
      // Q 조준 사격
      if (ai.cds.Q <= 0 && d <= K.Q.range - 0.5) {
        const dir = ai.aimDir(p, K.Q.windup, K.Q.speed); ai.cds.Q = ai.pick(K.Q.cd, 'Q');
        ai.startCast(K.Q.windup, () => {
          Sfx.play('throw'); ai.psT = ai.kitCfg.P.window;
          ai.shoot({ dir, speed: K.Q.speed, range: K.Q.range, width: K.Q.width, len: 1.1, onHit: (u, pr) => {
            const k = clamp(pr.traveled / K.Q.range, 0, 1), amt = lerp(ai.pick(K.Q.min, 'Q') + ai.ad * K.Q.minAd, ai.pick(K.Q.max, 'Q') + ai.ad * K.Q.maxAd, k) * ai.diff.dmgMul;
            ai.hitP(u, amt, { name: K.Q.name }); ai.addAs(ai.pick(K.Q.asBuff, 'Q'), K.Q.asDur, 'katjaQ'); FX.burst(u.pos, ai.motif.color, 10, 5);
          } });
        }, { kind: 'line', dir, len: K.Q.range, width: K.Q.width });
        return true;
      }
      return false;
    },
    snipe(ai, p) {
      const K = ai.kitCfg.D; let fired = 0, phase = 'aim', t = 0, dir = ai.aimDir(p, K.aim, K.speed);
      ai.cds.D = ai.pick(K.cd, 'D'); FX.text(ai.pos, K.name, ai.motif.color, 13, { bold: true });
      ai.startChannel(K.shots * (K.aim + K.gap) + 0.1, { cancelIfClose: 4.5, tele: { kind: 'line', dir, len: K.range, width: K.width, color: '#ff4d4d' },
        onTick: (dt, a) => {
          t += dt;
          if (phase === 'aim') { dir = V.norm(V.lerp(dir, ai.aimDir(p, K.aim - t, K.speed), 0.15)); a.tele.dir = dir; a.tele.width = K.width * (1.6 - t / K.aim); }
          if (phase === 'aim' && t >= K.aim) {
            const dead = fired === K.shots - 1, S = dead ? K.dead : K.shot; fired++; phase = 'gap'; t = 0; Sfx.play(dead ? 'ult' : 'throw');
            ai.shoot({ dir, speed: K.speed, range: K.range, width: K.width, len: 1.6, color: dead ? '#ff4d4d' : ai.motif.color, onHit: u => {
              let amt = ai.calc(S, 'D'); if (dead) amt *= 1 + clamp(1 - u.hp / u.maxHp, 0, 1) * (K.dead.missMax - 1);   // 데드아이: 잃은 체력 비례 최대 2배
              ai.hitP(u, amt, { name: dead ? '데드아이' : '저지 사격' }); if (!dead) u.addSlow(K.shot.slow, K.shot.slowDur);
            } });
          }
          if (phase === 'gap' && t >= K.gap) { phase = 'aim'; t = 0; if (fired >= K.shots) a.stop = true; }
        },
        onEnd: (a, cancelled) => { if (cancelled && fired === 0) ai.cds.D *= 0.5; } });   // 한 발도 못 쏘고 풀리면 쿨 50% 반환
    },
    checkBush(ai, est) {
      const K = ai.kitCfg, d = V.dist(ai.pos, est);
      if (ai.cds.W <= 0 && d <= K.W.range) {   // 정찰 다트: 착탄 지점 반경 4.5m 시야 3초
        const W = K.W, to = V.copy(est); ai.cds.W = ai.pick(W.cd, 'W');
        ai.startCast(0.2, () => {
          Sfx.play('throw'); FX.trail(ai.pos, to, '#9fd8ff', 0.12, d / W.speed + 0.2);
          ai.pendingShots.push({ t: d / W.speed, fn: () => { Vision.reveals.push({ team: ai.team, pos: to, r: W.radius, t: W.dur }); FX.ring(to, 0.5, W.radius, '#9fd8ff', 0.5, 0.08); } });
        }, { kind: 'line', dir: V.norm(V.sub(to, ai.pos)), len: d, width: 0.3, color: '#9fd8ff' });
        FX.text(ai.pos, W.name, ai.motif.color, 12, { bold: true }); return true;
      }
      if (ai.cds.Q <= 0 && d <= K.Q.range - 0.5) {   // 조준 사격으로 부쉬 찌르기
        const dir = KU.aimAt(ai, est); ai.cds.Q = ai.pick(K.Q.cd, 'Q');
        ai.startCast(K.Q.windup, () => { Sfx.play('throw'); ai.psT = K.P.window;
          ai.shoot({ dir, speed: K.Q.speed, range: K.Q.range, width: K.Q.width, len: 1.1, onHit: (u, pr) => {
            const k = clamp(pr.traveled / K.Q.range, 0, 1); ai.hitP(u, lerp(ai.pick(K.Q.min, 'Q') + ai.ad * K.Q.minAd, ai.pick(K.Q.max, 'Q') + ai.ad * K.Q.maxAd, k) * ai.diff.dmgMul, { name: K.Q.name }); } });
        }, { kind: 'line', dir, len: K.Q.range, width: K.Q.width });
        return true;
      }
      return false;
    },
    // E 접근 금지: 전방 부채꼴 사격(둔화) 후 뒤로 4m 도약(벽 넘기 가능, 시전 후 CC 무시)
    escape(ai, p, dir) {
      const K = ai.kitCfg.E; if (ai.cds.E > 0) return false;
      const fwd = V.norm(V.sub(p.pos, ai.pos)); ai.cds.E = ai.pick(K.cd, 'E'); ai.unstoppable = K.windup + K.leapTime;
      ai.startCast(K.windup, () => {
        Sfx.play('throw'); ai.psT = ai.kitCfg.P.window;
        if (KU.inCone(ai, fwd, K.range, K.angle, p)) { ai.hitP(p, (ai.pick(K.base, 'E') + ai.ad * K.ad) * ai.diff.dmgMul, { name: K.name }); p.addSlow(ai.pick(K.slow, 'E'), K.slowDur); ai.addMsBuff(K.msBuff, K.msDur, false, 'katjaE'); }
        FX.slash(ai.pos, V.ang(fwd), K.range, K.angle / 2 * Math.PI / 180, ai.motif.color, 0.25);
        ai.dashTo(V.mul(fwd, -1), K.leap, K.leapTime, true, K.name);
      }, { kind: 'cone', dir: fwd, len: K.range, angle: K.angle });
      return true;
    },
  },

  // ---------------- 리오 (활) ----------------
  rio: {
    init(ai) { ai.stance = 'long'; ai.kc = 0; ai.kcReady = false; ai.zones = []; },
    // P 카이: 방관 = 기본 + 치명확률×10%
    pen(ai) { const P = ai.kitCfg.P; return ai.pick(P.pen, 'P') + ai.critChance * P.penPerCrit; },
    asFlat(ai) { return ai.stance === 'long' ? -ai.kitCfg.Q.long.asPenalty : 0; },
    aaRange(ai) { const Q = ai.kitCfg.Q; return ai.stance === 'short' ? Q.short.range : Q.long.range + (ai.kcReady ? Q.longRange : 0); },
    gainKc(ai) { if (ai.kcReady) return; if (++ai.kc >= ai.kitCfg.Q.stacks) { ai.kcReady = true; ai.kc = 0; FX.text(ai.pos, '카이츄', ai.motif.color, 11, { bold: true }); } },
    // 평타: 치명 없음, ×(1.02 + 치명확률×0.75) × 활 계수 — 단궁은 3발(36% + 35%×2), 화궁은 1발(102%)
    fireAA(ai, p, dir) {
      const Q = ai.kitCfg.Q, M = (1.02 + ai.critChance * 0.75) * ai.diff.dmgMul, ready = ai.kcReady;
      if (ready) {   // 카이츄 발동
        ai.kcReady = false;
        if (ai.stance === 'short') { ai.addMsBuff(ai.pick(Q.shortMs, 'Q'), Q.buffDur, true, 'rioQ'); ai.addAs(ai.pick(Q.shortAs, 'Q'), Q.buffDur, 'rioQ'); }
      }
      const land = (u, ratio, main) => {
        let amt = ai.ad * ratio * M;
        if (main && ready && ai.stance === 'long') amt *= 1 + clamp(1 - u.hp / u.maxHp, 0, 1) * 100 * Q.longMissing / 100;   // 잃은 체력 1%당 0.3%
        Combat.damage(ai, u, amt, { type: 'normal', source: '적 평타', pen: this.pen(ai) });
        if (main) this.gainKc(ai);
      };
      if (ai.stance === 'short') {
        ai.shoot({ dir, speed: 26, range: Q.short.range + 1.5, width: 0.3, len: 0.5, onHit: u => land(u, Q.short.ratio, true) });
        for (const s of [-1, 1]) ai.shoot({ dir: V.fromAng(V.ang(dir) + s * 0.06), speed: 26, range: Q.short.range + 1.5, width: 0.3, len: 0.4, onHit: u => land(u, Q.short.extraRatio, false) });
      } else ai.shoot({ dir, speed: 24, range: this.aaRange(ai) + 1.5, width: 0.3, len: 0.8, onHit: u => land(u, Q.long.ratio, true) });
      return true;
    },
    onHit(ai, u, o) { if (o.kc !== false) this.gainKc(ai); if (o.hanare) for (const k of ['Q', 'E', 'R', 'D']) ai.cds[k] = Math.max(0, ai.cds[k] - ai.kitCfg.W.cdReduce); },
    update(ai, dt) {
      const p = Game.player;
      for (const z of ai.zones) {   // 단궁 하나레 둔화 바람 / 곡사 착탄
        z.t += dt;
        if (z.type === 'wind' && p && !p.dead && V.dist(p.pos, z.pos) <= z.r + p.r * 0.5) p.addSlow(z.slow, 0.1);
        if (z.type === 'arc' && !z.hit && z.t >= z.delay) {
          z.hit = true; const D = ai.kitCfg.D, dd = p ? V.dist(p.pos, z.pos) : 99;
          if (p && !p.dead && dd <= D.radius + p.r * 0.5) { const inner = dd <= D.innerR; ai.hitP(p, ai.calc(inner ? { base: D.inner, bad: D.innerBad, sp: D.innerSp } : D, 'D'), { name: D.name }); p.addSlow(D.slow, D.slowDur); }
          FX.ring(z.pos, 0.5, D.radius, ai.motif.color, 0.35, 0.12); FX.burst(z.pos, ai.motif.color, 16, 5);
        }
      }
      ai.zones = ai.zones.filter(z => z.type === 'wind' ? z.t < z.dur : !z.hit);
    },
    think(ai, p, d) {
      const K = ai.kitCfg;
      // Q 활 교체: 가까우면 단궁(지속 딜·카이팅), 멀면 화궁(긴 사거리 견제)
      const want = d <= 5.0 ? 'short' : 'long';
      if (ai.stance !== want && ai.cds.Q <= 0) { ai.stance = want; ai.cds.Q = K.Q.cd; FX.text(ai.pos, want === 'short' ? '단궁' : '화궁', ai.motif.color, 12, { bold: true }); }
      // R: 단궁 연사(붙은 캐시를 밀쳐냄, 벽꿍 기절) / 화궁 정사필중(장거리 둔화)
      if (ai.cds.R <= 0 && ai.stance === 'long' && d > 7 && (p.skills.Q.cd > 1 || d > 9)) { this.rLong(ai, p); return true; }
      // 무기 스킬 곡사
      if (ai.cds.D <= 0 && d > 6 && d < K.D.range) {
        const pos = Geo.pushOut(ai.predict(p, K.D.windup + K.D.delay), 0.2); ai.cds.D = ai.pick(K.D.cd, 'D');
        ai.startCast(K.D.windup, () => { ai.zones.push({ type: 'arc', pos, t: 0, delay: K.D.delay }); Sfx.play('throw'); }, { kind: 'circle', pos, r: K.D.radius });
        return true;
      }
      // W 하나레
      if (ai.cds.W <= 0) {
        const W = K.W, S = ai.stance === 'short' ? W.short : W.long;
        if (d <= S.range - 0.5) {
          const dir = ai.aimDir(p, 0.2, ai.stance === 'short' ? 30 : W.long.speed); ai.cds.W = ai.pick(W.cd, 'W');
          ai.startCast(0.2, () => {
            Sfx.play('throw');
            if (ai.stance === 'long') {
              ai.shoot({ dir, speed: W.long.speed, range: W.long.range, width: W.long.width, len: 1.4, onHit: u => { ai.hitP(u, (ai.pick(W.long.base, 'W') + ai.ad * W.long.ad) * ai.diff.dmgMul, { name: W.name, hanare: true }); u.addSlow(W.long.slow, W.long.slowDur); } });
            } else {
              let landed = 0;
              for (let i = 0; i < W.short.arrows; i++) {
                const a = V.ang(dir) + ((i / (W.short.arrows - 1)) - 0.5) * W.short.spread * Math.PI / 180;
                ai.pendingShots.push({ t: i * 0.06, fn: () => ai.shoot({ dir: V.fromAng(a), speed: 30, range: W.short.range, width: W.short.width, len: 0.6, onHit: u => {
                  const first = landed++ === 0, amt = (ai.pick(W.short.base, 'W') + ai.ad * W.short.ad) * ai.diff.dmgMul * (first ? 1 : W.short.repeat);
                  ai.hitP(u, amt, { name: W.name, hanare: first, kc: first }); if (first) ai.zones.push({ type: 'wind', pos: V.copy(u.pos), r: W.short.zoneR, t: 0, dur: W.short.zoneDur, slow: W.short.slow });
                } }) });
              }
            }
          }, { kind: ai.stance === 'long' ? 'line' : 'cone', dir, len: S.range, width: W.long.width, angle: W.short.spread });
          return true;
        }
      }
      return false;
    },
    checkBush(ai, est) {
      const K = ai.kitCfg, d = V.dist(ai.pos, est);
      if (ai.cds.D <= 0 && d < K.D.range) {
        const pos = V.copy(est); ai.cds.D = ai.pick(K.D.cd, 'D');
        ai.startCast(K.D.windup, () => { ai.zones.push({ type: 'arc', pos, t: 0, delay: K.D.delay }); Sfx.play('throw'); }, { kind: 'circle', pos, r: K.D.radius });
        return true;
      }
      if (ai.cds.W <= 0 && d <= K.W.long.range - 0.5) {
        if (ai.stance !== 'long') { ai.stance = 'long'; ai.cds.Q = K.Q.cd; }
        const W = K.W, dir = KU.aimAt(ai, est); ai.cds.W = ai.pick(W.cd, 'W');
        ai.startCast(0.2, () => { Sfx.play('throw');
          ai.shoot({ dir, speed: W.long.speed, range: W.long.range, width: W.long.width, len: 1.4, onHit: u => { ai.hitP(u, (ai.pick(W.long.base, 'W') + ai.ad * W.long.ad) * ai.diff.dmgMul, { name: W.name, hanare: true }); u.addSlow(W.long.slow, W.long.slowDur); } });
        }, { kind: 'line', dir, len: W.long.range, width: W.long.width });
        return true;
      }
      return false;
    },
    rLong(ai, p) {
      const R = ai.kitCfg.R.long, dir = ai.aimDir(p, R.windup, R.speed); ai.cds.R = ai.pick(ai.kitCfg.R.cd, 'R'); ai.kc = 0; ai.kcReady = true;
      ai.startCast(R.windup, () => {
        Sfx.play('ult');
        ai.shoot({ dir, speed: R.speed, range: 60, width: R.width, len: 2, color: '#ffffff', onHit: (u, pr) => {
          const boosted = pr.traveled > R.speed * R.boostAfter;   // 0.8초 비행 후 강화
          ai.hitP(u, (ai.pick(R.base, 'R') + ai.ad * R.ad) * ai.diff.dmgMul * (boosted ? 1 + R.boost : 1), { name: '정사필중' }); u.addSlow(R.slow, R.slowDur * (boosted ? 2 : 1));
        } });
      }, { kind: 'line', dir, len: 30, width: R.width, color: '#ffffff' });
      FX.text(ai.pos, '정사필중', ai.motif.color, 13, { bold: true });
    },
    rShort(ai, p) {
      const R = ai.kitCfg.R.short, dir = V.norm(V.sub(p.pos, ai.pos)); ai.cds.R = ai.pick(ai.kitCfg.R.cd, 'R'); ai.kc = 0; ai.kcReady = true;
      FX.text(ai.pos, '연사', ai.motif.color, 13, { bold: true });
      ai.startCast(0.15, () => {
        for (let i = 0; i < R.arrows; i++) ai.pendingShots.push({ t: i * 0.1, fn: () => ai.shoot({ dir, speed: 32, range: R.range, width: R.width, len: 0.8, onHit: u => {
          ai.hitP(u, (ai.pick(R.base, 'R') + ai.ad * R.ad) * ai.diff.dmgMul, { name: '연사' }); KU.knock(u, dir, R.push, 0.08);
        } }) });
        // 재사용: 강력한 화살로 4m 넉백, 벽에 부딪히면 기절
        ai.pendingShots.push({ t: 0.6, fn: () => {
          const d2 = V.norm(V.sub(p.pos, ai.pos)), RC = R.recast; Sfx.play('ult');
          ai.shoot({ dir: d2, speed: 34, range: R.range, width: R.width, len: 1.3, color: '#ffffff', onHit: u => {
            ai.hitP(u, (ai.pick(RC.base, 'R') + ai.ad * RC.ad) * ai.diff.dmgMul, { name: '연사 강화살' });
            KU.knock(u, d2, RC.knock, 0.25, () => { ai.hitP(u, (ai.pick(RC.wallBase, 'R') + ai.ad * RC.wallAd) * ai.diff.dmgMul, { name: '벽 충돌' }); u.applyCC('stun', RC.stun); FX.text(u.pos, '벽꿍 기절!', '#ffffff', 16, { bold: true }); FX.addShake(8); });
          } });
        } });
      }, { kind: 'line', dir, len: R.range, width: R.width });
    },
    escape(ai, p, dir, d) {
      const K = ai.kitCfg;
      if (ai.cds.R <= 0 && d < 4.2) { if (ai.stance !== 'short') { ai.stance = 'short'; ai.cds.Q = K.Q.cd; } this.rShort(ai, p); return true; }
      if (ai.cds.E > 0) return false;
      this.leap(ai, p, dir); return true;
    },
    dodge(ai, pd) { if (ai.cds.E > 0) return false; this.leap(ai, Game.player, pd); return true; },
    // E 비상: 5m 도약 후 사거리 내 적에게 화살 (카이츄 최대)
    leap(ai, p, dir) {
      const E = ai.kitCfg.E; ai.cds.E = ai.pick(E.cd, 'E'); ai.dashTo(dir, E.leap, E.leapTime, false, E.name);
      ai.pendingShots.push({ t: E.leapTime, fn: () => {
        if (!p || p.dead || V.dist(ai.pos, p.pos) - p.r > this.aaRange(ai) + 0.5) return;
        const S = ai.stance === 'short' ? E.short : E.long, n = ai.stance === 'short' ? E.short.arrows : 1, d0 = V.norm(V.sub(p.pos, ai.pos));
        for (let i = 0; i < n; i++) ai.shoot({ dir: V.fromAng(V.ang(d0) + (i - (n - 1) / 2) * 0.05), speed: 28, range: 9, width: 0.4, len: 0.6, home: p, onHit: u => {
          ai.hitP(u, (ai.pick(S.base, 'E') + ai.ad * S.ad) * ai.diff.dmgMul, { name: E.name, kc: false });
          if (ai.stance === 'long') ai.hitP(u, (ai.pick(E.long.aoe, 'E') + ai.ad * E.long.aoeAd) * ai.diff.dmgMul, { name: E.name, kc: false });
        } });
        ai.kc = 0; ai.kcReady = true;
      } });
    },
    draw(ai, ctx) {
      for (const z of ai.zones) {
        if (z.type === 'wind') KU.fill(ctx, z.pos, z.r, '#9fe3b0', 0.25 * (1 - z.t / z.dur));
        else { const k = clamp(z.t / z.delay, 0, 1), D = ai.kitCfg.D; KU.fill(ctx, z.pos, D.radius, ai.motif.color, 0.12 + 0.15 * k); KU.ring(ctx, z.pos, D.radius, ai.motif.color, 0.9); KU.fill(ctx, z.pos, D.innerR, '#ffffff', 0.15 + 0.2 * k); }
      }
    },
  },

  // ---------------- 아야 (권총) ----------------
  aya: {
    init(ai) { ai.pCd = 0; ai.reload = 0; },
    update(ai, dt) { if (ai.pCd > 0) ai.pCd -= dt; },
    // P 아야의 정의: 피격 시 보호막, 공격할 때마다 쿨 1초 감소
    onDamaged(ai) {
      if (ai.pCd > 0) return; const P = ai.kitCfg.P;
      ai.shield = Math.max(ai.shield, ai.calc(P, 'P') / ai.diff.dmgMul); ai.shieldT = P.dur; ai.pCd = P.cd; FX.text(ai.pos, P.name, ai.motif.color, 12, { bold: true });
    },
    onHit(ai) { ai.pCd = Math.max(0, ai.pCd - ai.kitCfg.P.perHit); },
    onAAHit(ai) {
      ai.pCd = Math.max(0, ai.pCd - ai.kitCfg.P.perHit);
      if (ai.reload > 0 && --ai.reload === 0) ai.asBuffs = ai.asBuffs.filter(a => a.tag !== 'reload');   // 무빙 리로드: 평타 2회 공속 +70%
    },
    think(ai, p, d) {
      const K = ai.kitCfg;
      // R 공포탄: 붙은 캐시를 공포로 떼어냄
      if (ai.cds.R <= 0 && d < K.R.radius - 0.8) { this.fear(ai, p); return true; }
      // Q 2연발: 대상 지정, 1발 평타(110%) + 2발 스킬
      if (ai.cds.Q <= 0 && d <= K.Q.range) {
        const Q = K.Q; ai.cds.Q = ai.pick(Q.cd, 'Q');
        ai.startCast(Q.windup / Math.max(1, ai.curAs()), () => {
          Sfx.play('throw');
          ai.shoot({ dir: V.norm(V.sub(p.pos, ai.pos)), speed: 30, range: 99, width: 0.3, len: 0.5, home: p, onHit: u => { ai.aaLand(u, Q.first); } });
          ai.pendingShots.push({ t: Q.gap, fn: () => ai.shoot({ dir: V.norm(V.sub(p.pos, ai.pos)), speed: 30, range: 99, width: 0.3, len: 0.6, home: p, onHit: u => ai.hitP(u, ai.calc(Q, 'Q'), { name: Q.name }) }) });
          ai.addAs(ai.pick(Q.asBuff, 'Q'), Q.asDur, 'ayaQ');
        }, null);
        return true;
      }
      // W 고정 사격: 한 방향으로 연사하며 이동 가능
      if (ai.cds.W <= 0 && d <= K.W.range - 0.5) {
        const W = K.W, dir = ai.aimDir(p, 0.3, W.speed), n = clamp(Math.round(W.shots + (ai.curAs() - 1) * 5), W.shots, W.maxShots);
        ai.cds.W = ai.pick(W.cd, 'W'); ai.noAA = W.dur; let fired = 0; FX.text(ai.pos, W.name, ai.motif.color, 12, { bold: true });
        ai.chans.push({ t: 0, dur: W.dur, dir, onTick: (dt, c) => {
          while (fired < n && c.t >= (fired / n) * W.dur) { fired++; Sfx.play('aa');
            ai.shoot({ dir: c.dir, speed: W.speed, range: W.range, width: W.width, len: 0.45, onHit: u => ai.hitP(u, ai.calc(W, 'W'), { name: W.name }) }); }
        } });
        return false;   // 이동은 계속(카이팅)
      }
      return false;
    },
    checkBush(ai, est) {
      const W = ai.kitCfg.W, d = V.dist(ai.pos, est);
      if (ai.cds.W > 0 || d > W.range + 0.5) return false;
      const dir = KU.aimAt(ai, est), n = clamp(Math.round(W.shots + (ai.curAs() - 1) * 5), W.shots, W.maxShots); let fired = 0;
      ai.cds.W = ai.pick(W.cd, 'W'); ai.noAA = W.dur; FX.text(ai.pos, W.name, ai.motif.color, 12, { bold: true });
      ai.chans.push({ t: 0, dur: W.dur, onTick: (dt, c) => {   // 부쉬를 좌우로 훑으며 연사
        while (fired < n && c.t >= (fired / n) * W.dur) { fired++; Sfx.play('aa');
          const sweep = V.fromAng(V.ang(dir) + Math.sin(fired * 1.3) * 0.18);
          ai.shoot({ dir: sweep, speed: W.speed, range: W.range, width: W.width, len: 0.45, onHit: u => ai.hitP(u, ai.calc(W, 'W'), { name: W.name }) }); }
      } });
      return true;
    },
    fear(ai, p) {
      const R = ai.kitCfg.R; ai.cds.R = ai.pick(R.cd, 'R'); FX.text(ai.pos, R.name, ai.motif.color, 13, { bold: true });
      ai.startCast(R.delay, () => {
        Sfx.play('ult'); FX.ring(ai.pos, 0.5, R.radius, '#ffffff', 0.4, 0.12); FX.addShake(6);
        if (V.dist(ai.pos, p.pos) <= R.radius + p.r) { ai.hitP(p, ai.calc(R, 'R'), { name: R.name }); if (p.applyFear(R.fear, ai.pos)) FX.text(p.pos, '공포!', '#b18cff', 16, { bold: true }); }
      }, { kind: 'circle', pos: ai.pos, r: R.radius, color: '#ffffff' });
    },
    escape(ai, p, dir, d) {
      const K = ai.kitCfg;
      if (ai.cds.R <= 0 && d < K.R.radius - 0.6) { this.fear(ai, p); return true; }
      if (ai.cds.E <= 0) { this.dash(ai, dir); return true; }
      if (ai.cds.D <= 0) {   // 무빙 리로드: 1초 이속(평타 불가) → 다음 평타 2회 공속 +70%
        const D = K.D; ai.cds.D = ai.pick(D.cd, 'D'); ai.addMsBuff(ai.pick(D.ms, 'D'), D.dur, false, 'reload'); ai.noAA = D.dur;
        ai.moveTarget = Geo.pushOut(V.add(ai.pos, V.mul(dir, 4)), ai.r); ai.kiteT = D.dur;
        ai.pendingShots.push({ t: D.dur, fn: () => { ai.reload = D.asShots; ai.addAs(D.asBuff, 5, 'reload'); } });
        FX.text(ai.pos, D.name, ai.motif.color, 12, { bold: true }); return true;
      }
      return false;
    },
    dodge(ai, pd) { if (ai.cds.E > 0) return false; this.dash(ai, pd); return true; },
    // E 무빙턴: 즉시 4m 대시(벽 통과), Q·W 쿨 감소
    dash(ai, dir) {
      const E = ai.kitCfg.E; ai.cds.E = ai.pick(E.cd, 'E'); ai.dashTo(dir, E.dist, E.time, true, E.name);
      const r = ai.pick(E.qwReduce, 'E'); ai.cds.Q *= 1 - r; ai.cds.W *= 1 - r;
    },
  },

  // ---------------- 나딘 (석궁) ----------------
  nadine: {
    init(ai) { ai.wire = null; ai.wolfT = 0; ai.wolfN = 0; ai.traps = []; ai.mark = null; ai.lastP = null; },
    wireAs(ai) { const E = ai.kitCfg.E; ai.addAs(ai.pick(E.as, 'E') + ai.sp * 0.0005, ai.wire ? E.life : E.after, 'wire'); },
    onAAHit(ai, u) {
      // R 늑대 맹습: 평타 3번마다 늑대
      if (ai.wolfT > 0 && ++ai.wolfN >= ai.kitCfg.R.every) { ai.wolfN = 0; const R = ai.kitCfg.R;
        ai.hitP(u, ai.calc(R, 'R') + ai.stacks * ai.diff.dmgMul, { name: '늑대' }); u.addSlow(R.slow, R.slowDur); FX.burst(u.pos, '#c9c9c9', 14, 6); FX.text(u.pos, '늑대!', '#e0e0e0', 13, { bold: true }); }
      this.markHit(ai);
    },
    onHit(ai, u, o) { if (!o.mark) this.markHit(ai); },
    markHit(ai) { const m = ai.mark; if (!m) return; const M = ai.kitCfg.D.mark; m.t -= M.cut; m.bonus += ai.pick(M.inc, 'D') + ai.bonusAd * ai.pick(M.incBad, 'D'); },
    update(ai, dt) {
      const p = Game.player, K = ai.kitCfg;
      if (ai.wolfT > 0) ai.wolfT -= dt;
      if (ai.wire && (ai.wire.t -= dt) <= 0) ai.wire = null;
      // 다람쥐 덫: 캐시가 연결선을 지나가면 발동
      if (p && !p.dead && ai.lastP) for (const tr of ai.traps) {
        if (tr.used || !tr.b) continue;
        if (KU.segCross(ai.lastP, p.pos, tr.a, tr.b) || Geo.segDist(p.pos, tr.a, tr.b) < p.r * 0.5) {
          tr.used = true; const W = K.W; ai.hitP(p, ai.calc(W, 'W'), { name: W.name }); p.addSlow(ai.pick(W.slow, 'W'), W.slowDur); FX.text(p.pos, '덫!', ai.motif.color, 15, { bold: true });
        }
      }
      ai.traps = ai.traps.filter(tr => !tr.used && (tr.life -= dt) > 0);
      if (p) ai.lastP = V.copy(p.pos);
      // 강노 표식 폭발
      if (ai.mark && (ai.mark.t -= dt) <= 0) { const M = K.D.mark, m = ai.mark, u = m.u; ai.mark = null;   // 적중마다 쌓인 추가 피해 포함
        if (!u.dead) { ai.hitP(u, ai.calc(M, 'D') + m.bonus * ai.diff.dmgMul, { name: '강노 폭발', mark: true }); FX.burst(u.pos, ai.motif.color, 18, 6); } }
    },
    think(ai, p, d) {
      const K = ai.kitCfg;
      // E 원숭이 와이어: 교전 전 뒤쪽에 걸어 두기(공속 증가, 위급하면 재사용으로 이탈)
      if (!ai.wire && ai.cds.E <= 0 && d < 9) {
        const away = V.norm(V.sub(ai.pos, p.pos)); let best = null, bs = -Infinity;
        for (let i = -2; i <= 2; i++) { const q = Geo.pushOut(V.add(ai.pos, V.mul(V.fromAng(V.ang(away) + i * 0.5), K.E.range)), 0.3); const sc = wallClearance(q) + V.dist(q, p.pos) * 0.3; if (sc > bs) { bs = sc; best = q; } }
        ai.wire = { pos: best, t: K.E.life }; ai.cds.E = ai.pick(K.E.cd, 'E'); this.wireAs(ai); FX.text(ai.pos, K.E.name, ai.motif.color, 12, { bold: true }); return false;
      }
      // R 늑대 맹습: 평타 교전이 시작되면
      if (ai.cds.R <= 0 && d <= ai.aaRange() + 0.5) { ai.cds.R = ai.pick(K.R.cd, 'R'); ai.wolfT = K.R.dur; ai.wolfN = K.R.every - 1; FX.text(ai.pos, K.R.name, ai.motif.color, 13, { bold: true }); return false; }
      // 강노: 부채꼴 사격 + 둔화 + 폭발 표식
      if (ai.cds.D <= 0 && d < K.D.range - 0.5) {
        const D = K.D, dir = V.norm(V.sub(p.pos, ai.pos)); ai.cds.D = ai.pick(D.cd, 'D');
        ai.startCast(D.windup, () => {
          Sfx.play('throw'); FX.slash(ai.pos, V.ang(dir), D.range, D.angle / 2 * Math.PI / 180, ai.motif.color, 0.25);
          if (KU.inCone(ai, dir, D.range, D.angle, p)) { ai.hitP(p, ai.calc(D, 'D'), { name: D.name, mark: true }); p.addSlow(D.slow, D.slowDur); ai.mark = { u: p, t: D.mark.time, bonus: 0 }; }
        }, { kind: 'cone', dir, len: D.range, angle: D.angle });
        return true;
      }
      // W 다람쥐 덫: 캐시가 다가오는 길목에 연결선 설치
      if (ai.cds.W <= 0 && d > 2.5 && d < K.W.range + 2 && ai.traps.length < K.W.sets * 2) {
        const W = K.W, toP = V.norm(V.sub(p.pos, ai.pos)), mid = V.add(ai.pos, V.mul(toP, Math.min(d * 0.55, W.range))), side = V.perp(toP);
        const a = Geo.pushOut(V.add(mid, V.mul(side, W.link / 2)), 0.2), b = Geo.pushOut(V.sub(mid, V.mul(side, W.link / 2)), 0.2);
        ai.cds.W = ai.pick(W.cd, 'W'); ai.traps.push({ a, b, life: W.life }); Sfx.play('click'); FX.text(mid, W.name, ai.motif.color, 12, { bold: true });
        return false;
      }
      // Q 황소의 눈: 멀리서 충전 사격 (충전 중 이속 감소, 평타 불가)
      if (ai.cds.Q <= 0 && d > 5.5 && d < K.Q.range[1] - 0.5 && !ai.chans.some(c => c.charge)) {
        const Q = K.Q, need = clamp((d + 0.8 - Q.range[0]) / (Q.range[1] - Q.range[0]), 0, 1), dur = Math.max(0.6, need * Q.charge);
        ai.cds.Q = Q.cd; ai.noAA = dur; FX.text(ai.pos, Q.name, ai.motif.color, 12, { bold: true });
        ai.chans.push({ t: 0, dur, charge: true, onTick: (dt, c) => { ai.addMsBuff(-Q.chargeSlow * Math.min(1, c.t / Q.charge), 0.1, false, 'charge'); if (V.dist(ai.pos, p.pos) < 3.2) c.stop = true; },
          onEnd: c => {
            const k = clamp(c.t / Q.charge, 0, 1), rng = lerp(Q.range[0], Q.range[1], k), dir = ai.aimDir(p, 0, Q.speed);
            const base = ai.pick(Q.min, 'Q') + ai.bonusAd * Q.minBad + ai.sp * Q.minSp, amt = (base * lerp(1, Q.maxMul, k) + ai.stacks) * ai.diff.dmgMul;
            Sfx.play('throw'); ai.shoot({ dir, speed: Q.speed, range: rng, width: Q.width, len: 1.2 + k, onHit: u => ai.hitP(u, amt, { name: Q.name }) });
          } });
        return false;
      }
      return false;
    },
    checkBush(ai, est) {
      const K = ai.kitCfg, d = V.dist(ai.pos, est);
      if (ai.cds.W <= 0 && ai.traps.length < K.W.sets * 2 && d < K.W.range + 4) {   // 캐시가 나올 길목(부쉬→나딘 방향)에 덫
        const W = K.W, toMe = V.norm(V.sub(ai.pos, est)), mid = V.add(est, V.mul(toMe, Math.min(2.2, d * 0.5))), side = V.perp(toMe);
        ai.traps.push({ a: Geo.pushOut(V.add(mid, V.mul(side, W.link / 2)), 0.2), b: Geo.pushOut(V.sub(mid, V.mul(side, W.link / 2)), 0.2), life: W.life });
        ai.cds.W = ai.pick(W.cd, 'W'); Sfx.play('click'); FX.text(mid, W.name, ai.motif.color, 12, { bold: true }); return true;
      }
      if (ai.cds.Q <= 0 && d < K.Q.range[1] - 0.5 && !ai.chans.some(c => c.charge)) {
        const Q = K.Q, need = clamp((d + 0.8 - Q.range[0]) / (Q.range[1] - Q.range[0]), 0, 1), dur = Math.max(0.6, need * Q.charge), to = V.copy(est);
        ai.cds.Q = Q.cd; ai.noAA = dur; FX.text(ai.pos, Q.name, ai.motif.color, 12, { bold: true });
        ai.chans.push({ t: 0, dur, charge: true, onTick: (dt, c) => ai.addMsBuff(-Q.chargeSlow * Math.min(1, c.t / Q.charge), 0.1, false, 'charge'),
          onEnd: c => { const k = clamp(c.t / Q.charge, 0, 1), base = ai.pick(Q.min, 'Q') + ai.bonusAd * Q.minBad + ai.sp * Q.minSp, amt = (base * lerp(1, Q.maxMul, k) + ai.stacks) * ai.diff.dmgMul;
            Sfx.play('throw'); ai.shoot({ dir: KU.aimAt(ai, to), speed: Q.speed, range: lerp(Q.range[0], Q.range[1], k), width: Q.width, len: 1.2 + k, onHit: u => ai.hitP(u, amt, { name: Q.name }) }); } });
        return true;
      }
      return false;
    },
    // 위급하면 와이어로 이탈 (없으면 와이어를 걸고 바로 이동)
    escape(ai, p, dir) {
      const E = ai.kitCfg.E;
      if (ai.wire) { const to = ai.wire.pos, dd = V.dist(ai.pos, to); if (dd < 1.5 || V.dist(to, p.pos) < V.dist(ai.pos, p.pos)) return false;
        ai.wire = null; this.wireAs(ai); ai.act = { type: 'dash', t: 0, dur: E.zipTime, from: V.copy(ai.pos), to: Geo.pushOut(V.copy(to), ai.r) }; FX.text(ai.pos, '와이어 이동', ai.motif.color, 12, { bold: true }); return true; }
      if (ai.cds.E <= 0) { ai.cds.E = ai.pick(E.cd, 'E'); this.wireAs(ai); ai.dashTo(dir, E.range, E.zipTime + 0.15, false, E.name); return true; }
      return false;
    },
    draw(ai, ctx) {
      for (const tr of ai.traps) { ctx.save(); ctx.strokeStyle = ai.motif.color; ctx.lineWidth = 0.07; ctx.setLineDash([0.25, 0.15]); ctx.beginPath(); ctx.moveTo(tr.a.x, tr.a.y); ctx.lineTo(tr.b.x, tr.b.y); ctx.stroke(); ctx.restore(); KU.fill(ctx, tr.a, 0.25, ai.motif.color, 0.8); KU.fill(ctx, tr.b, 0.25, ai.motif.color, 0.8); }
      if (ai.wire) { ctx.save(); ctx.strokeStyle = 'rgba(255,255,255,.5)'; ctx.lineWidth = 0.03; ctx.beginPath(); ctx.moveTo(ai.pos.x, ai.pos.y); ctx.lineTo(ai.wire.pos.x, ai.wire.pos.y); ctx.stroke(); ctx.restore(); KU.ring(ctx, ai.wire.pos, 0.35, '#ffffff', 0.8); }
      if (ai.mark && !ai.mark.u.dead) { const u = ai.mark.u, k = clamp(ai.mark.t / ai.kitCfg.D.mark.time, 0, 1); ctx.save(); ctx.strokeStyle = ai.motif.color; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.arc(u.pos.x, u.pos.y, u.r + 0.4, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); ctx.stroke(); ctx.restore(); }
      if (ai.wolfT > 0) KU.ring(ctx, ai.pos, ai.r + 0.3, '#d0d0d0', 0.5, true);
    },
  },
};
