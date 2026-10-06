
// ============================== 전술 스킬 (F) ==============================
// 수치: 나무위키 「이터널 리턴/전술 스킬」 (2026-10, 시즌 12). 모두 쿨다운 고정. 레벨 = 빌드별 전술 스킬 레벨(CONFIG.skills.F.lvByBuild)
// 'L' = 캐릭터 레벨, '추가 체력' = 현재 최대 체력 − 레벨 기본 체력
const TACTICAL_ORDER = ['blink', 'repulser', 'redstorm', 'lightwing', 'truthblade', 'plasmadash', 'quake', 'transcend', 'artifact', 'nullify'];
const Tactical = {
  def(key) { return CONFIG.tactical[key] || CONFIG.tactical.blink; },
  key() { return CONFIG.tactical[Settings.tactical] ? Settings.tactical : 'blink'; },
  L(p) { return (p.build && p.build.level) || 12; },
  bonusHp(p) { return Math.max(0, p.maxHp - (p.baseHpAtLv || p.maxHp)); },
  foes(p, pos, r) { return Game.enemies(p).concat(Game.units.filter(u => u.kind === 'animal' && !u.dead)).filter(u => !u.dead && !(u.untargetable > 0) && V.dist(u.pos, pos) - u.r <= r); },
  hit(p, u, amt) { Combat.damage(p, u, amt, { type: 'skill', source: 'F', trauma: true }); Events.emit('skillHit', { k: 'F', target: u }); },
  // 짧은 돌진 (벽 못 넘음)
  dash(p, aim, dist, speed, onEnd) {
    const dir = V.dist(aim, p.pos) > 0.05 ? V.norm(V.sub(aim, p.pos)) : V.fromAng(p.facing), len = Geo.clampDash(p.pos, dir, dist, p.r);
    p.facing = V.ang(dir); p.moveTarget = null;
    p.forced = { from: V.copy(p.pos), to: V.add(p.pos, V.mul(dir, len)), t: 0, dur: Math.max(0.05, len / speed), onEnd: () => onEnd && onEnd(dir) };
    FX.trail(p.pos, V.add(p.pos, V.mul(dir, len)), '#9fd8ff', 0.25, 0.25);
    return dir;
  },
  use(p, aim) {
    const k = this.key(), D = this.def(k), lv = p.skills.F.lv, L = this.L(p), at = i => (Array.isArray(i) ? i[clamp(lv - 1, 0, i.length - 1)] : i);
    p.interruptForCast(); p.S.cast('F'); Vision.act(p, 'skill'); if (p.breakStealth) p.breakStealth();
    FX.text(p.pos, D.name, '#9fd8ff', 12, { bold: true });
    switch (k) {
      case 'blink': p.blink(aim); return true;
      case 'repulser': {   // 3m 이동 후 가장 가까운 적 실험체에게 미사일 5발(2레벨 8발), 발당 10+L+최대 체력 0.6% 고정 피해
        this.dash(p, aim, D.dist, D.speed, () => {
          const t = Game.enemies(p).filter(u => u.kind !== 'animal' && Vision.visible(p, u) && V.dist(u.pos, p.pos) <= D.range).sort((a, b) => V.dist(a.pos, p.pos) - V.dist(b.pos, p.pos))[0];
          if (!t) return;
          const n = at(D.missiles);
          for (let i = 0; i < n; i++) {
            const pr = new Projectile({ team: p.team, owner: p, kind: 'shot', color: '#9fd8ff', len: 0.35, pos: V.copy(p.pos), dir: V.fromAng(V.ang(V.sub(t.pos, p.pos)) + (i - (n - 1) / 2) * 0.22), speed: D.mSpeed, range: 99, width: 0.2,
              onUnit: (pr2, u) => { if (u !== t) return 'continue'; Combat.damage(p, u, D.mBase + L * D.mLv + u.maxHp * D.mHp, { type: 'true', source: 'F', noShake: true }); return 'stop'; } });
            pr.homeTarget = t; pr.homeTurn = 14; Game.projectiles.push(pr);
          }
        });
        break;
      }
      case 'redstorm':   // 0.1초 2.5m 이동 + 기본 공격 사거리 10%(15%) 증가 10(12)초
        this.dash(p, aim, D.dist, D.dist / D.time); p.rangeBuff = { pct: at(D.range), t: at(D.dur) }; break;
      case 'lightwing':  // 둔화 제거, 7초 이속 15/20%+L%·공속 20% / 2레벨: 적 실험체 평타 시 +0.5초
        p.slows = []; p.addMsBuff(at(D.ms) + L * D.msLv, D.dur, false, 'lightwing'); p.lightWing = { t: D.dur }; break;
      case 'truthblade': {   // 주변 2.5m 140+L×20 스킬 피해, 2.5초 이속 20% + 추가 대상당 5/10%(최대 30/40%) / 2레벨: 칼날 하나 더 50+L×10
        const hit = this.foes(p, p.pos, D.r);
        for (const u of hit) { this.hit(p, u, D.base + L * D.lv); if (lv >= 2 && !u.dead) this.hit(p, u, D.base2 + L * D.lv2); }
        const cnt = hit.length * (lv >= 2 ? 2 : 1);
        p.addMsBuff(Math.min(at(D.msMax), D.ms + Math.max(0, cnt - 1) * at(D.msPer)), D.msDur, false, 'truthblade');
        FX.ring(p.pos, 0.3, D.r, '#ffe08a', 0.35, 0.1); for (let i = 0; i < 6; i++) FX.slash(p.pos, i * Math.PI / 3, D.r, 0.4, '#ffe08a', 0.25);
        break;
      }
      case 'plasmadash': {   // 2.5m 이동 + 전방 60° 투사체(사거리 7m·17m/s), 대상당 1회 120/150+L×5/10 피해 + 1초 30% 둔화
        const done = new Set();
        this.dash(p, aim, D.dist, D.speed, dir => {
          for (let i = 0; i < D.shots; i++) {
            const a = V.ang(dir) + (i / (D.shots - 1) - 0.5) * D.angle * Math.PI / 180;
            Game.projectiles.push(new Projectile({ team: p.team, owner: p, kind: 'shot', color: '#c79bff', len: 0.5, pos: V.copy(p.pos), dir: V.fromAng(a), speed: D.pSpeed, range: D.pRange, width: 0.35,
              onUnit: (pr, u) => { if (done.has(u.id)) return 'stop'; done.add(u.id); this.hit(p, u, at(D.base) + L * at(D.lv)); u.addSlow(D.slow, D.slowDur); return 'stop'; } }));
          }
        });
        break;
      }
      case 'quake': {   // 주변 4m 50/100+L×10+추가 체력 10% 스킬 피해 + 2초 40/50% 둔화 / 2레벨: 6초간 0.5초마다 3.5m 10+L×2+추가 체력 2.5%
        for (const u of this.foes(p, p.pos, D.r)) { this.hit(p, u, at(D.base) + L * D.lv + this.bonusHp(p) * D.hp); u.addSlow(at(D.slow), D.slowDur); }
        FX.ring(p.pos, 0.3, D.r, '#d9a066', 0.45, 0.14); FX.addShake(5);
        if (lv >= 2) p.quakeAura = { t: D.auraDur, tick: 0 };
        break;
      }
      case 'transcend':   // 3초 보호막 150/200 + 추가 체력 80/100%
        p.shield = Math.max(p.shield, at(D.base) + this.bonusHp(p) * at(D.hp)); p.shieldT = D.dur; FX.ring(p.pos, 0.5, 1.2, '#e9eef7', 0.4); break;
      case 'artifact':   // 2.5초 경직: 무적·대상 지정 불가, 행동 불가 / 2레벨: 경직 중 쿨다운 150% 빠르게
        p.stasis = { t: D.dur, fast: lv >= 2 }; p.invuln = p.untargetable = D.dur; p.moveTarget = null; p.attackTarget = null; p.vel = { x: 0, y: 0 };
        if (p.rest) Rest.stop(p, null, true);
        FX.ring(p.pos, 1, 0.4, '#ffd27a', 0.6); break;
      case 'nullify': {   // 해로운 상태 해제(에어본·넉백·붙잡힘·경직 제외) + 1초 이속 20/30%, 해제했다면 1초 30% 추가
        const had = p.stun > 0 || p.root > 0 || p.fear > 0 || p.silence > 0 || p.blindT > 0 || p.slows.length > 0;
        p.stun = p.root = p.fear = p.silence = p.blindT = 0; p.slows = [];
        p.addMsBuff(at(D.ms) + (had ? D.bonus : 0), D.msDur, false, 'nullify');
        FX.ring(p.pos, 0.3, 1.6, '#a6ffcf', 0.4); break;
      }
    }
    p.startCd('F'); Events.emit('action', { k: 'F' });
    return true;
  },
  // 매 스텝: 붉은 폭풍·라이트 윙·퀘이크 2레벨·아티팩트
  update(p, dt) {
    if (p.rangeBuff && (p.rangeBuff.t -= dt) <= 0) p.rangeBuff = null;
    if (p.lightWing && (p.lightWing.t -= dt) <= 0) p.lightWing = null;
    if (p.quakeAura) {
      const A = p.quakeAura, D = CONFIG.tactical.quake; A.t -= dt; A.tick += dt;
      while (A.tick >= D.auraEvery) { A.tick -= D.auraEvery; for (const u of this.foes(p, p.pos, D.auraR)) Combat.damage(p, u, D.auraBase + this.L(p) * D.auraLv + this.bonusHp(p) * D.auraHp, { type: 'skill', source: 'F', noShake: true, trauma: true }); }
      if (A.t <= 0) p.quakeAura = null;
    }
    if (p.stasis) {
      const S = p.stasis; S.t -= dt;
      if (S.fast) for (const k in p.skills) if (k !== 'F') p.skills[k].cd = Math.max(0, p.skills[k].cd - dt * 1.5);   // 2레벨: 쿨다운 2.5배 속도
      if (S.t <= 0) p.stasis = null;
    }
  },
  // 라이트 윙 2레벨: 적 실험체 평타 적중 시 지속 +0.5초
  onAA(p, t) { if (p.lightWing && p.skills.F.lv >= 2 && t && t.kind !== 'animal' && t.kind !== 'dummy' && t.team !== p.team) { p.lightWing.t += CONFIG.tactical.lightwing.extend; const m = p.msBuffs.find(x => x.tag === 'lightwing'); if (m) m.t += CONFIG.tactical.lightwing.extend; } },
  draw(ctx, p) {
    if (p.quakeAura) KU.ring(ctx, p.pos, CONFIG.tactical.quake.auraR, '#d9a066', 0.35 + 0.15 * Math.sin(Game.time * 12));
    if (p.stasis) { KU.fill(ctx, p.pos, p.r + 0.25, '#ffd27a', 0.35); KU.ring(ctx, p.pos, p.r + 0.3, '#ffe9b0', 0.9); }
    if (p.rangeBuff && Settings.showRange) KU.ring(ctx, p.pos, p.aaCfg().range + p.r, '#ff6b6b', 0.35, true);
  },
};
