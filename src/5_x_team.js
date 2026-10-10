
// ============================== 5. AI 팀 대전 (2:2 · 3:3) ==============================
// 나 + 아군 AI vs 상대 AI 팀. 맵 기본 = 원형 투기장(LoL 아레나풍), 라운드제(3판 2선승) — 한 팀이 모두 쓰러지면 라운드 끝
// AI는 1:1 결투와 같은 실험체 AI(RangedDuelist + 키트)를 쓰고, 팀 판단만 이 모드가 더함:
//   · 대상 고르기(pickFoe): 가까움 · 잡기 쉬움(유효 체력) · 아군이 치는 대상(집중 공격) · 내가 찍은 대상(아군 AI가 따라감) · CC 걸린 대상 · 아군 원딜에 붙은 암살자(견제)
//   · 팀 움직임(teamThink): 수적 열세 + 체력 낮음 → 아군 쪽으로 후퇴 / 혼자 떨어지면 합류
//   규칙·수치 근거: docs/er_notes_teamfight.md (⚠ 추정 수치는 CONFIG.teamAI)
CONFIG.teamAI = {
  spread: 2.4,          // 시작 위치 간격(m)
  focus: 2.2,           // 아군 한 명이 치고 있는 대상 가산점
  leader: 2.5,          // 내(플레이어)가 평타로 찍은 대상 가산점 — 아군 AI가 따라 침
  inRange: 2.0,         // 지금 사거리 안
  cc: 2.0,              // 기절·속박·공포 중인 대상
  revenge: 1.5,         // 방금 나를 친 대상(2.5초)
  peel: 2.5,            // 아군 원딜 3.5m 안에 붙은 근접 상대(견제)
  stick: 1.2,           // 지금 대상 유지(흔들림 방지)
  distW: 0.6,           // 거리 1m당 감점
  retreatHp: 0.55,      // 이 체력 비율 밑에서 수적 열세면 후퇴
  localR: 8,            // 「근처」 반경(수적 우세 판정)
  regroup: 10,          // 아군 중심에서 이만큼 떨어지면 합류
};
Modes.team = {
  name: 'AI 팀 대전',
  start(o) {
    this.diff = o.diff || 'normal'; this.size = clamp((o.size | 0) || 3, 2, 3); this.need = o.rounds === 1 ? 1 : 2;
    const keys = Object.keys(CONFIG.rangedMotifs);
    // 팀 구성: 지정한 칸은 그대로, 비운 칸은 무작위(같은 팀 안에서는 겹치지 않게)
    const fill = (want, n) => { const out = [], pool = keys.slice(); for (let i = 0; i < n; i++) { let k = want && want[i] && CONFIG.rangedMotifs[want[i]] ? want[i] : null; if (!k) { const free = pool.filter(x => !out.includes(x)); k = free[Math.floor(rnd() * free.length)] || keys[0]; } out.push(k); } return out; };
    this.allyKeys = fill(o.allies, this.size - 1); this.enemyKeys = fill(o.enemies, this.size);
    const eb = o.enemyBuild && o.enemyBuild !== 'same' ? o.enemyBuild : Game.buildId;
    this.stage = CONFIG.rangedAI.stages[eb] ? eb : 'mid'; this.stageInfo = CONFIG.rangedAI.stages[this.stage];
    this.sphere = !!o.sphere;
    this.title = `AI 팀 대전 ${this.size}:${this.size} (${CONFIG.enemy.difficulty[this.diff].label})` + ` · ${Game.map.name}` + (this.sphere ? ' · 크로노 스피어' : '');
    Events.on('kill', a => { if (a.unit && isHero(a.unit) && !this.ended) this.kills[a.unit.team === 0 ? 'e' : 'p']++; });   // 처치 수 (Game.start마다 이벤트 초기화)
    this.wins = { p: 0, e: 0 }; this.round = 0; this.history = []; this.newRound();
  },
  // 시작 위치: 스폰 지점을 가운데로 앞뒤(맵 중심 쪽 수직 방향)로 벌림
  spot(base, i) {
    const c = { x: CONFIG.world.w / 2, y: CONFIG.world.h / 2 }, to = V.norm(V.sub(c, base)), side = V.perp(V.len(to) > 0.01 ? to : { x: 1, y: 0 });
    const off = [0, -1, 1][i] * CONFIG.teamAI.spread;
    return Geo.pushOut(V.add(base, V.mul(side, off)), 0.6);
  },
  newRound() {
    this.round++; Game.units = []; Game.projectiles = []; Game.zones = [];
    const sp = Game.map.spawns, P = this.spot(sp.p, 0);
    Scene.player(P.x, P.y); VisionItems.give(Game.player); Game.drones = []; Vision.reveals = []; Vision.noises = []; Vision.ghosts = {};
    this.allies = this.allyKeys.map((k, i) => { const q = this.spot(sp.p, i + 1), u = new RangedDuelist(q.x, q.y, this.diff, k, this.stage, 0); u.facing = 0; Game.units.push(u); return u; });
    this.enemies = this.enemyKeys.map((k, i) => { const q = this.spot(sp.e, i), u = new RangedDuelist(q.x, q.y, this.diff, k, this.stage, 1); Game.units.push(u); return u; });
    if (this.sphere) Sphere.start(); else Sphere.stop();
    this.snap = Stats.snapshot(); this.roundStart = Game.time; this.inter = null; this.ended = false; this.kills = { p: 0, e: 0 };
    Game.freeze = 1.6; this.banner = { t: 1.6, text: `ROUND ${this.round}`, sub: `${this.size}:${this.size} · ${this.enemyKeys.map(k => CONFIG.rangedMotifs[k].name).join(' · ')}` };
  },
  team(t) { return Game.units.filter(u => isHero(u) && u.team === t); },
  alive(t) { return this.team(t).filter(u => !u.dead); },
  update(dt, frozen) {
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.inter) { if ((this.inter.t -= dt) <= 0) this.newRound(); return; }
    if (frozen || this.ended) return;
    if (this.sphere) {
      Sphere.update(dt);
      if (Sphere.done && this.alive(0).length && this.alive(1).length) {   // 끝까지 승부가 안 나면 팀 남은 체력 비율로 판정
        const r = t => { const a = this.team(t); return a.reduce((s, u) => s + Math.max(0, u.hp) / u.maxHp, 0) / Math.max(1, a.length); }, pr = r(0), er = r(1);
        FX.toast(`크로노 스피어 종료 — 판정 (${Math.round(pr * 100)}% vs ${Math.round(er * 100)}%)`, '#9fe0ff');
        this.roundEnd(pr >= er ? 'p' : 'e'); return;
      }
    }
    if (!this.alive(1).length) this.roundEnd('p'); else if (!this.alive(0).length) this.roundEnd('e');
  },
  roundEnd(w) {
    this.ended = true; this.wins[w]++;
    const St = Stats, s0 = this.snap, casts = {}, hits = {}, p = Game.player;
    for (const k of SKILL_KEYS) { casts[k] = (St.casts[k] || 0) - (s0.casts[k] || 0); hits[k] = (St.hits[k] || 0) - (s0.hits[k] || 0); }
    const sum = { round: this.round, winner: w, time: Game.time - this.roundStart, dealt: St.dealtTotal - s0.dealt, taken: St.takenTotal - s0.taken, casts, hits,
      kills: Object.assign({}, this.kills), survived: this.alive(0).length, pAlive: !p.dead };
    this.history.push(sum);
    if (w === 'p') Events.emit('roundWin');
    Sfx.play(w === 'p' ? 'win' : 'fail');
    if (this.wins.p >= this.need || this.wins.e >= this.need) { Game.finish('duelEnd'); return; }
    this.inter = { t: 4.5, sum }; Game.freeze = 999;
  },
  // ---------- 팀 AI: 대상 고르기 ----------
  pickFoe(ai, es, cur) {
    const T = CONFIG.teamAI, alive = es.filter(u => !u.dead); if (!alive.length) return null;
    const vis = alive.filter(u => Vision.visible(ai, u));   // 팀 시야 공유 포함
    if (!vis.length) return cur && !cur.dead ? cur : null;   // 아무도 안 보이면 쫓던 상대(추정 위치)
    const mates = Game.units.filter(a => a !== ai && a.team === ai.team && !a.dead && isHero(a)), lead = Game.player && Game.player.team === ai.team && !Game.player.dead ? Game.player : null;
    const range = ai.aaRange();
    let best = null, bs = -Infinity;
    for (const u of vis) {
      const d = V.dist(ai.pos, u.pos), ehp = Math.max(1, u.hp) * (1 + (u.def || 0) / 100) + (u.shield || 0);
      let s = -d * T.distW + clamp(1 - ehp / 4000, 0, 1) * 4 + (1 - u.hp / u.maxHp) * 3;
      if (d - u.r - (ai.melee ? ai.r : 0) <= range + 0.5) s += T.inRange;
      s += mates.filter(a => a.foe === u || a.attackTarget === u).length * T.focus;
      if (lead && lead.attackTarget === u) s += T.leader;
      if (u.stun > 0 || u.root > 0 || u.fear > 0) s += T.cc;
      if (ai.lastHitBy && ai.lastHitBy.u === u && Game.time - ai.lastHitBy.t < 2.5) s += T.revenge;
      if ((u.melee || (u.kind === 'player' && !u.motifKey)) && mates.some(a => !a.melee && a.kind !== 'player' && V.dist(a.pos, u.pos) < 3.5)) s += T.peel;
      if (u === cur) s += T.stick;
      if (s > bs) { bs = s; best = u; }
    }
    return best;
  },
  // ---------- 팀 AI: 움직임 (RangedDuelist.think에서 키트 판단 전에 호출) ----------
  teamThink(ai, p, d) {
    const T = CONFIG.teamAI, mates = Game.units.filter(a => a !== ai && a.team === ai.team && !a.dead && isHero(a));
    if (!mates.length) return false;
    const foes = Game.units.filter(u => isHero(u) && u.team !== ai.team && u.team !== 2 && !u.dead && Vision.visible(ai, u));
    const near = (arr, c) => arr.filter(u => V.dist(u.pos, c) <= T.localR).length;
    const c = mates.reduce((s, a) => V.add(s, V.mul(a.pos, 1 / mates.length)), { x: 0, y: 0 });
    // 수적 열세 + 체력 낮음: 아군 쪽으로 빠짐(근처 적 중심 반대 + 아군 중심)
    if (foes.length && near(foes, ai.pos) > near(mates, ai.pos) + 1 && ai.hp / ai.maxHp < T.retreatHp && ai.kiteT <= 0) {
      const fc = foes.reduce((s, u) => V.add(s, V.mul(u.pos, 1 / foes.length)), { x: 0, y: 0 });
      const dir = V.norm(V.add(V.norm(V.sub(ai.pos, fc)), V.mul(V.norm(V.sub(c, ai.pos)), 0.8)));
      ai.moveTarget = Geo.pushOut(V.add(ai.pos, V.mul(dir, 3)), ai.r); ai.kiteT = 0.6; ai.stats.retreats = (ai.stats.retreats || 0) + 1; return true;
    }
    // 혼자 떨어짐: 근처에 적이 없으면 아군 쪽으로 합류
    if (V.dist(ai.pos, c) > T.regroup && (!p || p.dead || d > 9) && ai.kiteT <= 0) {
      ai.moveTarget = Geo.pushOut(V.lerp(ai.pos, c, 0.6), ai.r); ai.kiteT = 0.5; return true;
    }
    return false;
  },
  drawWorld(ctx) { if (this.sphere) Sphere.draw(ctx); for (const u of Game.units) if (u.drawExtra && u !== Game.player) u.drawExtra(ctx); },
  drawScreen(ctx, L, oy = 0) {
    const a = this.alive(0).length, e = this.alive(1).length;
    Draw.text(ctx, `블루 ${this.wins.p}  :  ${this.wins.e} 레드  ·  ROUND ${this.round}  ·  생존 ${a} vs ${e}`, L.W / 2, 24 + oy, { size: 18, bold: true, align: 'center', stroke: true });
    if (this.sphere && Sphere.active) Draw.text(ctx, Sphere.label(), L.W / 2, 46 + oy, { size: 12, bold: true, align: 'center', color: '#9fe0ff', stroke: true });
    if (this.banner) { Draw.text(ctx, this.banner.text, L.W / 2, L.H * 0.4, { size: 46, bold: true, align: 'center', color: CONFIG.theme.gold, stroke: true }); if (this.banner.sub) Draw.text(ctx, this.banner.sub, L.W / 2, L.H * 0.4 + 44, { size: 18, bold: true, align: 'center', color: '#ff8a8a', stroke: true }); }
    if (Game.player && Game.player.dead && !this.inter && this.alive(0).length) Draw.text(ctx, '쓰러졌습니다 — 아군이 싸우는 중 (관전)', L.W / 2, L.H * 0.3, { size: 18, bold: true, align: 'center', color: '#c9cfdb', stroke: true });
    if (this.inter) {
      const s = this.inter.sum, w = 420, h = 200, x = L.W / 2 - w / 2, y = L.H * 0.22;
      Draw.panel(ctx, x, y, w, h);
      Draw.text(ctx, `ROUND ${s.round} — ${s.winner === 'p' ? '승리!' : '패배'}`, L.W / 2, y + 34, { size: 22, bold: true, align: 'center', color: s.winner === 'p' ? CONFIG.theme.gold : CONFIG.theme.accent });
      [`시간 ${fmt(s.time, 1)}s · 처치 ${s.kills.p} / 쓰러짐 ${s.kills.e} · 아군 생존 ${s.survived}명`,
        `내 피해 ${Math.round(s.dealt)} · 받은 피해 ${Math.round(s.taken)}${s.pAlive ? '' : ' · 나는 쓰러짐'}`,
        `적중  ` + (SKILL_KEYS.filter(k => s.casts[k] > 0).map(k => `${k} ${s.hits[k]}/${s.casts[k]}`).join('  ') || '-')]
        .forEach((t, i) => Draw.text(ctx, t, L.W / 2, y + 70 + i * 26, { size: 13, align: 'center', color: '#e6e9ef' }));
      Draw.text(ctx, `다음 라운드까지 ${Math.ceil(this.inter.t)}초`, L.W / 2, y + h - 16, { size: 12, align: 'center', color: '#8a93a6' });
    }
  },
  side() {
    const row = u => { const nm = u === Game.player ? `${u.name} (나)` : (u.motif ? u.motif.name : u.name), hp = Math.max(0, u.hp);
      const st = u.dead ? '쓰러짐' : u.kiteT > 0 && u.stats && u.stats.retreats ? '' : '';
      return sideBar(`${nm}${u.foe && !u.dead ? ' → ' + (u.foe === Game.player ? '나' : (u.foe.motif ? u.foe.motif.name : u.foe.name)) : ''}`, u.dead ? 0 : hp / u.maxHp, u.dead ? '쓰러짐' : `${Math.round(hp)}${st}`, u.team === 0 ? '#5aa9ff' : '#ff6b6b'); };
    return `<h4>👥 ${this.size}:${this.size} 팀 대전</h4>${kv('라운드', `${this.round} (블루 ${this.wins.p} : ${this.wins.e} 레드)`)}
      <h5>블루 팀 (아군)</h5>${this.team(0).map(row).join('')}<h5>레드 팀 (상대)</h5>${this.team(1).map(row).join('')}
      <h5>팁</h5><div style="color:#8a93a6;line-height:1.5">아군 AI는 <b>내가 평타로 찍은 대상</b>을 함께 칩니다(집중 공격). 시야는 팀이 공유합니다 — 아군이 보는 적은 나도 보입니다. 수적으로 밀리면 아군 쪽으로 빠지세요. 원딜 아군에게 붙은 암살자는 근접 실험체가 끊어 주는 게 정석입니다.</div>`;
  },
  result() {
    const t = this.wins.p + this.wins.e;
    const rows = this.history.map(s => `<tr><td>R${s.round}</td><td>${s.winner === 'p' ? '<b style="color:#ffc857">승</b>' : '<b style="color:#ff3b5c">패</b>'}</td><td>${fmt(s.time, 1)}s</td><td>${s.kills.p} / ${s.kills.e}</td><td>${Math.round(s.dealt)}</td><td>${Math.round(s.taken)}</td><td>${s.pAlive ? '생존' : '쓰러짐'}</td></tr>`).join('');
    return { key: `team:${this.size}:${this.diff}`, recTitle: this.title, score: this.wins.p * 100 - this.wins.e * 50, scoreLabel: `점수 (${this.wins.p}승 ${this.wins.e}패)`,
      modeRatio: t ? this.wins.p / t : 0, modeLabel: '라운드 승률', weights: { acc: 30, waste: 15, mistake: 15, mode: 40 },
      extraHtml: `<h3>라운드 요약</h3><table><tr><th>라운드</th><th>결과</th><th>시간</th><th>처치 / 쓰러짐</th><th>내 피해</th><th>받은 피해</th><th>나</th></tr>${rows}</table>
        <div class="sub">아군 ${this.allyKeys.map(k => CONFIG.rangedMotifs[k].name).join(' · ')} · 상대 ${this.enemyKeys.map(k => CONFIG.rangedMotifs[k].name).join(' · ')}</div>` };
  },
};
