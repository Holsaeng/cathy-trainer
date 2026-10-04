
// ============================== 씬 구성 도우미 ==============================
const Scene = {
  player(x, y) { const p = new Cathy(x, y); Game.player = p; Game.units.push(p); return p; },
  dummy(x, y, o) {
    const u = new Unit({ team: 1, x, y, r: 0.55, hp: o.hp, def: o.def, ms: o.wander ? 1.2 : 0, color: '#8d96a8', name: '허수아비', kind: 'dummy', infinite: o.infinite, respawn: o.respawn !== false, brain: o.wander ? AI.wander : null });
    Game.units.push(u); return u;
  },
  // 야생동물: 중립(팀 2) — 공격하지 않고 배회, 처치되면 재생성
  animal(x, y, stage) {
    const W = CONFIG.wildlife, st = stage || Game.buildId;
    const u = new Unit({ team: 2, x, y, r: W.r, hp: W.hp[st] || W.hp.mid, def: W.def[st] || W.def.mid, ms: W.ms, color: W.color, name: W.name, kind: 'animal', respawn: true, brain: AI.wander });
    u.respawnDelay = W.respawn; Game.units.push(u); return u;
  },
  target(x, y, pattern, o) {
    const u = new Unit({ team: 1, x, y, r: 0.5, hp: 3000, def: 0, ms: o.speed, color: '#ff9f43', name: o.name, kind: 'target', infinite: true, brain: AI[pattern], ai: Object.assign({}, o) });
    Game.units.push(u); return u;
  },
};
const sideBar = (label, ratio, val, color) => `<div class="sbar"><i style="width:${clamp(ratio * 100, 0, 100)}%;background:${color}55;border-right:2px solid ${color}"></i><em>${esc(label)} · ${val}</em></div>`;
const kv = (k, v) => `<div class="kv"><span>${k}</span><b>${v}</b></div>`;
const pct = (a, b) => b > 0 ? Math.round(a / b * 100) + '%' : '-';

const Modes = {};

// ---------- 1. 허수아비 모드 ----------
Modes.dummy = {
  name: '허수아비 모드',
  start(o) {
    this.title = this.name;
    const layouts = {
      default: [[16.5, 9], [18.2, 9.6], [17, 7.4], [18.6, 7.8], [17.6, 11]],
      pair: [[15, 9], [16.6, 9]],
      wall: [[20.5, 9]],
    };
    Scene.player(8, 9);
    const pos = layouts[o.layout || 'default'], n = clamp(o.count | 0, 1, pos.length);
    for (let i = 0; i < n; i++) Scene.dummy(pos[i][0], pos[i][1], o);
  },
  update() {},
  side() {
    const St = Stats, t = Math.max(0.001, St.t), tot = St.dealtTotal || 1;
    const rows = Object.entries(St.dmgBy).sort((a, b) => b[1] - a[1]);
    const dm = Game.units.filter(u => u.kind === 'dummy');
    return `<h4>🎯 허수아비 통계</h4>${kv('총 피해', Math.round(St.dealtTotal))}${kv('DPS (전체)', fmt(St.dealtTotal / t))}${kv('DPS (최근 5초)', fmt(St.recentDps(5)))}
      ${kv('치명적 외상', St.criticals)}${kv('처치', St.kills)}${kv('강화 평타', St.enhAA)}
      <h5>스킬별 피해 비율</h5>${rows.map(([k, v]) => sideBar(SRC_LABEL[k] || k, v / tot, `${Math.round(v / tot * 100)}%`, SRC_COLOR[k] || '#999')).join('') || '<div class="kv"><span>아직 피해 없음</span></div>'}
      <h5>허수아비</h5>${dm.map((u, i) => kv('#' + (i + 1), u.dead ? '재생성 중' : u.infinite ? '∞' : `${Math.round(u.hp)} / ${u.maxHp}`)).join('')}`;
  },
  result() {
    const dps = Stats.dealtTotal / Math.max(1, Stats.t);
    return { key: 'dummy', score: Math.round(dps), scoreLabel: '평균 DPS', modeRatio: clamp(dps / Game.player.build.refDps, 0, 1), modeLabel: 'DPS 목표 대비', weights: { acc: 25, waste: 30, mistake: 20, mode: 25 } };
  },
};

// ---------- 2. 콤보 트레이너 ----------
Modes.combo = {
  name: '콤보 트레이너',
  parse(steps) {
    return steps.map(tok => {
      let s = String(tok).trim().toUpperCase(), gap = null, optional = false;
      const m = s.match(/~([\d.]+)$/); if (m) { gap = parseFloat(m[1]); s = s.slice(0, m.index); }
      if (s.endsWith('?')) { optional = true; s = s.slice(0, -1); }
      return { alts: s.split('|').map(x => x.trim()).filter(Boolean), optional, gap };
    });
  },
  start(o) {
    this.combo = o.combo; this.diff = o.diff || 'intro'; this.title = '콤보: ' + o.combo.name;
    this.steps = this.parse(o.combo.steps); this.state = 'idle'; this.idx = 0; this.marks = []; this.msg = null; this.resetT = 0; this.flags = {};
    const pl = Scene.player(10, 9);
    if (o.combo.weapon && pl.weapon !== o.combo.weapon) { pl.weapon = o.combo.weapon; FX.toast(`이 콤보는 ${CONFIG.basicAttack[o.combo.weapon].label} 기준입니다 (무기 자동 변경)`, CONFIG.theme.gold); }
    const C = CONFIG.modes.combo, pos = o.combo.setup === 'pair' ? [[14.6, 9], [16.2, 9]] : [[14.6, 9]];
    this.dummies = pos.map(([x, y]) => Scene.dummy(x, y, { hp: C.dummyHp, def: C.dummyDef, infinite: true }));
    Events.on('action', a => this.onAction(a));
    Events.on('eDouble', () => { if (this.state === 'run') this.flags.eDouble = true; });
  },
  limit(st) { const base = CONFIG.modes.combo.gap[this.diff]; if (!isFinite(base)) return Infinity; return st && st.gap ? st.gap : base; },
  onAction(a) {
    if (this.state === 'result') return;
    for (const nk of ['D1', 'D2', 'F']) if (a.k === nk && !this.steps.some(s => s.alts.includes(nk))) return;   // 콤보에 없는 보조 입력은 무시
    const now = Game.time, label = k => ({ AA: '평타', D1: 'D(1차)' }[k] || k);
    if (this.state === 'idle') {
      if (this.steps[0].alts.includes(a.k)) {
        this.state = 'run'; this.idx = 1; this.marks = [{ ok: true, gap: null }]; this.last = now; this.prevK = a.k; this.flags = {};
        Stats.comboAtt++; Sfx.play('click');
        if (this.idx >= this.steps.length) this.success();
      } else if (a.k !== 'AA') FX.toast(`콤보 시작 입력: ${this.steps[0].alts.join(' / ')}`, '#8a93a6');
      return;
    }
    let i = this.idx;
    while (i < this.steps.length && this.steps[i].optional && !this.steps[i].alts.includes(a.k)) { this.marks[i] = { skip: true }; i++; }
    const st = this.steps[i];
    if (!st || !st.alts.includes(a.k)) { this.fail(`${label(a.k)} 입력 (기대: ${st ? st.alts.map(label).join('/') : '-'})`); return; }
    const gap = now - this.last, lim = this.limit(st);
    if (gap > lim) { this.fail(`시간 초과 (${Math.round(gap * 1000)}ms > ${Math.round(lim * 1000)}ms)`); return; }
    this.marks[i] = { ok: true, gap }; this.idx = i + 1; this.last = now; this.prevK = a.k;
    if (this.steps.slice(this.idx).every(s => s.optional)) this.success();
  },
  success() {
    this.state = 'result'; this.resetT = CONFIG.modes.combo.resetDelay;
    if (this.combo.require === 'eDouble' && !this.flags.eDouble) { this.resultOk = false; this.msg = '실패: 2인 수쳐(관통 기절)가 발동하지 않음'; Stats.mistake('콤보 실패 - 2인 수쳐 미발동'); Sfx.play('fail'); return; }
    this.resultOk = true; Stats.comboOk++; this.msg = '콤보 성공!'; Sfx.play('combo');
    FX.text(Game.player.pos, 'COMBO!', CONFIG.theme.gold, 24, { bold: true, life: 1.2 }); Events.emit('comboOk');
  },
  fail(why) {
    this.state = 'result'; this.resultOk = false; this.msg = '실패: ' + why; this.resetT = CONFIG.modes.combo.resetDelay;
    this.marks[this.idx] = { fail: true }; Sfx.play('fail'); Stats.mistake('콤보 실패 - ' + why.split(' (')[0]);
  },
  update(dt) {
    if (this.state === 'run' && Game.time - this.last > this.limit(this.steps[this.idx])) this.fail('시간 초과');
    if (this.state === 'result' && (this.resetT -= dt) <= 0) this.reset();
  },
  reset() {
    this.state = 'idle'; this.idx = 0; this.marks = []; this.msg = null;
    const p = Game.player;
    for (const k in p.skills) { p.skills[k].cd = 0; p.skills[k].reduced = false; }
    Object.assign(p, { st: p.maxSt, enhanced: 0, daggerReady: 0, dualRecast: 0, msBuffs: [], hp: p.maxHp, shield: 0 });
    for (const d of this.dummies) d.resetState();
  },
  drawScreen(ctx, L) {
    const n = this.steps.length, cw = n > 7 ? 56 : 70, gap = n > 7 ? 5 : 8, total = n * cw + (n - 1) * gap, x0 = L.W / 2 - total / 2, y = 14;
    Draw.text(ctx, this.combo.name, L.W / 2, y + 2, { size: 15, bold: true, align: 'center' });
    this.steps.forEach((st, i) => {
      const x = x0 + i * (cw + gap), m = this.marks[i];
      let bg = '#1b2030', bd = '#2a3140';
      if (m && m.ok) { bg = '#163a37'; bd = CONFIG.theme.accent2; } else if (m && m.fail) { bg = '#3a1620'; bd = CONFIG.theme.accent; }
      else if (m && m.skip) { bg = '#15181f'; } else if (this.state === 'run' && i === this.idx) bd = '#ffffff';
      Draw.rr(ctx, x, y + 14, cw, 34, 7); ctx.fillStyle = bg; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = bd; ctx.stroke();
      const lab = st.alts.map(k => ({ AA: '평타', D1: 'D1' }[k] || k)).join('/');
      Draw.text(ctx, st.optional ? `(${lab})` : lab, x + cw / 2, y + 36, { size: 14, bold: true, align: 'center', color: m && m.skip ? '#666' : '#fff' });
      if (m && m.ok && m.gap != null) Draw.text(ctx, Math.round(m.gap * 1000) + 'ms', x + cw / 2, y + 62, { size: 11, align: 'center', color: CONFIG.theme.accent2 });
    });
    const lim = CONFIG.modes.combo.gap[this.diff], dl = { intro: '입문', skilled: '숙련', master: '마스터' }[this.diff];
    Draw.text(ctx, `성공 ${Stats.comboOk} / 시도 ${Stats.comboAtt} (${pct(Stats.comboOk, Stats.comboAtt)}) · 난이도 ${dl}${isFinite(lim) ? ` (간격 ≤ ${lim}s)` : ''}`, L.W / 2, y + 82, { size: 12, align: 'center', color: '#8a93a6' });
    if (this.msg) Draw.text(ctx, this.msg, L.W / 2, y + 108, { size: 18, bold: true, align: 'center', color: this.resultOk ? CONFIG.theme.gold : CONFIG.theme.accent, stroke: true });
  },
  side() {
    return `<h4>🧩 콤보 가이드</h4><div style="line-height:1.6;color:#c9cfdb">${esc(this.combo.tip || '')}</div>
      <h5>현황</h5>${kv('성공 / 시도', `${Stats.comboOk} / ${Stats.comboAtt}`)}${kv('완성률', pct(Stats.comboOk, Stats.comboAtt))}${kv('강화 평타', Stats.enhAA)}
      <h5>팁</h5><div style="color:#8a93a6;line-height:1.5">우클릭으로 허수아비를 지정하면 평타가 나갑니다. 성공/실패 후 쿨타임이 자동 초기화됩니다.</div>`;
  },
  result() {
    return { key: `combo:${this.combo.id}:${this.diff}`, recTitle: `콤보 ${this.combo.name} (${this.diff})`, score: Stats.comboOk, scoreLabel: '콤보 성공 횟수',
      modeRatio: Stats.comboAtt ? Stats.comboOk / Stats.comboAtt : 0, modeLabel: '콤보 완성률', weights: { acc: 20, waste: 0, mistake: 20, mode: 60 } };
  },
};

// ---------- 3. 스킬샷 사격장 ----------
Modes.skillshot = {
  name: '스킬샷 사격장',
  start(o) {
    this.title = this.name; this.challenge = !!o.challenge;
    this.dur = o.challenge ? Infinity : CONFIG.modes.skillshot.duration; this.t = 0;
    Game.cdMul = o.cdMul || CONFIG.modes.skillshot.cdMul;
    Scene.player(6, 9);
    Scene.target(15, 4, 'line', { x0: 14, x1: 28, y: 4, speed: 3.0, name: '직선' });
    Scene.target(17, 9, 'zigzag', { x0: 14.5, x1: 20, y0: 6.5, y1: 11.5, speed: 3.2, name: '지그재그' });
    Scene.target(25, 14, 'dodger', { x0: 15, x1: 29, y0: 12.5, y1: 16, speed: 3.0, dodge: 0.55, react: 0.22, name: '회피형' });
    Scene.target(26.5, 9, 'strafe', { cx: 26.5, cy: 9, R: 2.4, speed: 2.8, name: '원형' });
  },
  update(dt) { this.t += dt; if (this.t >= this.dur) Game.finish('time'); },
  drawScreen(ctx, L, oy = 0) {
    const left = isFinite(this.dur) ? `남은 시간 ${fmt(Math.max(0, this.dur - this.t), 1)}s · ` : '';
    Draw.text(ctx, `${left}명중률 ${pct(Stats.shotHits, Stats.shots)} · 연속 ${Stats.streak} (최고 ${Stats.bestStreak})`, L.W / 2, 22 + oy, { size: 16, bold: true, align: 'center', stroke: true });
  },
  side() {
    const r = k => kv(`${k} 적중`, `${Stats.hits[k] || 0}/${Stats.casts[k] || 0} (${pct(Stats.hits[k] || 0, Stats.casts[k] || 0)})`);
    return `<h4>🏹 사격 통계</h4>${r('E')}${r('Q')}${r('W')}${kv('예측샷 성공률', pct(Stats.leadHits, Stats.movingHits))}${kv('최고 연속 명중', Stats.bestStreak)}
      <h5>팁</h5><div style="color:#8a93a6;line-height:1.5">E 투사체 속도 24m/s · 사거리 5.5m. 직선 이동 표적은 진행 방향 앞쪽을, 회피형은 반응 직후를 노리세요.</div>`;
  },
  result() {
    const acc = Stats.shots ? Stats.shotHits / Stats.shots : 0;
    return { key: 'skillshot', score: Math.round(Stats.shotHits * 10 * acc + Stats.bestStreak * 5), scoreLabel: '사격 점수', modeRatio: acc, modeLabel: '사격 명중률', weights: { acc: 40, waste: 10, mistake: 10, mode: 40 } };
  },
};

// ---------- 4. 회피 수련 ----------
Modes.dodge = {
  name: '회피 수련',
  start(o) {
    this.title = this.name; Scene.player(16, 9); Game.cdMul = CONFIG.modes.dodge.cdMul;
    this.lives = this.maxLives = o.lives || CONFIG.modes.dodge.lives; this.t = 0; this.spawnT = 1.2; this.hz = []; this.k0 = o.startK || 0;
    this.turrets = [{ x: 1, y: 1 }, { x: 31, y: 1 }, { x: 1, y: 17 }, { x: 31, y: 17 }, { x: 16, y: 0.6 }, { x: 16, y: 17.4 }, { x: 0.6, y: 9 }, { x: 31.4, y: 9 }];
  },
  level() { return 1 + this.k0 + this.t / 25; },
  update(dt) {
    const p = Game.player, L = this.level(); this.t += dt;
    if ((this.spawnT -= dt) <= 0) {
      const r = Math.random();
      if (r < 0.45) this.spawnLine(L); else if (r < 0.75) this.spawnCircle(L); else this.spawnDelayed(L);
      if (L > 2.2 && Math.random() < 0.25) [-0.25, 0.25].forEach(o => this.spawnLine(L, o));
      this.spawnT = Math.max(0.28, 1.45 / L);
    }
    for (const h of this.hz) this.updH(h, dt, p);
    this.hz = this.hz.filter(h => !h.dead);
  },
  spawnLine(L, off = 0) {
    const p = Game.player, tu = this.turrets[Math.floor(Math.random() * this.turrets.length)];
    const tgt = V.add(p.pos, V.mul(p.vel, Math.min(1, (L - 1) * 0.5) * 0.4));
    this.hz.push({ type: 'line', from: V.copy(tu), dir: V.fromAng(V.ang(V.sub(tgt, tu)) + off), tele: Math.max(0.35, 0.75 / Math.sqrt(L)), t: 0, speed: Math.min(20, 9 * Math.sqrt(L)), width: 0.7, pos: null, traveled: 0 });
  },
  spawnCircle(L) {
    const c = V.add(Game.player.pos, V.mul(V.fromAng(Math.random() * 6.28), Math.random() * 1.4));
    this.hz.push({ type: 'circle', c, r: rand(1.5, 2.3), tele: Math.max(CONFIG.modes.dodge.circleTeleMin, CONFIG.modes.dodge.circleTele / Math.pow(L, 0.45)), t: 0 });
  },
  spawnDelayed(L) { this.hz.push({ type: 'delayed', c: V.copy(Game.player.pos), follow: 0.5, r: 1.8, tele: Math.max(0.6, 1.3 / Math.pow(L, 0.35)), t: 0 }); },
  updH(h, dt, p) {
    h.t += dt;
    if (h.type === 'line') {
      if (h.t < h.tele) return;
      if (!h.pos) h.pos = V.copy(h.from);
      const prev = V.copy(h.pos), step = h.speed * dt; h.pos = V.add(h.pos, V.mul(h.dir, step)); h.traveled += step;
      if (Geo.segDist(p.pos, prev, h.pos) <= p.r + h.width / 2 && this.hitPlayer()) h.dead = true;
      if (h.traveled > 45) h.dead = true;
    } else if (h.type === 'circle') {
      if (h.t >= h.tele) { if (V.dist(p.pos, h.c) <= h.r + p.r * 0.5) this.hitPlayer(); FX.ring(h.c, h.r * 0.6, h.r, '#b56cff', 0.3, 0.15); h.dead = true; }
    } else {
      if (h.t < h.follow) h.c = V.copy(p.pos);
      if (h.t >= h.follow + h.tele) { if (V.dist(p.pos, h.c) <= h.r + p.r * 0.5) this.hitPlayer(); FX.burst(h.c, '#ff7b3b', 18, 6); FX.ring(h.c, 0.3, h.r, '#ff7b3b', 0.3, 0.15); h.dead = true; }
    }
  },
  hitPlayer() {
    const p = Game.player; if (p.invuln > 0) return false;
    p.invuln = 0.8; p.flash = 0.2; this.lives--; Stats.playerHits++; Stats.takenTotal += 1; Stats.hitPositions.push(V.copy(p.pos));
    Events.emit('playerHit'); FX.addShake(10); Sfx.play('hurt'); FX.text(p.pos, '피격!', '#ff5d5d', 17, { bold: true });
    if (this.lives <= 0) Game.finish('dead');
    return true;
  },
  drawWorld(ctx) {
    for (const t of this.turrets) { ctx.fillStyle = '#6b4bb3'; ctx.beginPath(); ctx.moveTo(t.x, t.y - 0.35); ctx.lineTo(t.x + 0.35, t.y); ctx.lineTo(t.x, t.y + 0.35); ctx.lineTo(t.x - 0.35, t.y); ctx.fill(); }
    for (const h of this.hz) {
      const k = clamp(h.t / (h.tele + (h.follow || 0)), 0, 1);
      if (h.type === 'line') {
        if (!h.pos) { ctx.save(); ctx.translate(h.from.x, h.from.y); ctx.rotate(V.ang(h.dir)); ctx.fillStyle = `rgba(255,70,90,${0.08 + 0.25 * k})`; ctx.fillRect(0, -h.width / 2, 45, h.width); ctx.restore(); }
        else { ctx.save(); ctx.translate(h.pos.x, h.pos.y); ctx.rotate(V.ang(h.dir)); ctx.fillStyle = '#ff5d7a'; ctx.shadowColor = '#ff5d7a'; ctx.shadowBlur = 12; ctx.fillRect(-0.7, -h.width / 2, 1.4, h.width); ctx.restore(); }
      } else {
        ctx.fillStyle = h.type === 'circle' ? `rgba(181,108,255,${0.1 + 0.2 * k})` : `rgba(255,123,59,${0.1 + 0.2 * k})`;
        ctx.beginPath(); ctx.arc(h.c.x, h.c.y, h.r, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = h.type === 'circle' ? '#b56cff' : '#ff7b3b'; ctx.lineWidth = 0.06;
        if (h.type === 'delayed') ctx.setLineDash([0.25, 0.15]);
        ctx.beginPath(); ctx.arc(h.c.x, h.c.y, h.type === 'circle' ? h.r * k : h.r * (1 - k * 0.85) + 0.05, 0, Math.PI * 2); ctx.stroke(); ctx.setLineDash([]);
      }
    }
  },
  drawScreen(ctx, L, oy = 0) {
    Draw.text(ctx, '♥'.repeat(Math.max(0, this.lives)) + '♡'.repeat(Math.max(0, this.maxLives - this.lives)), L.W / 2, 24 + oy, { size: 22, align: 'center', color: '#ff5d7a' });
    Draw.text(ctx, `생존 ${fmt(this.t, 1)}s · 단계 ${fmt(this.level(), 1)}`, L.W / 2, 48 + oy, { size: 14, bold: true, align: 'center', stroke: true });
  },
  side() { return `<h4>💨 회피 수련</h4>${kv('생존 시간', fmt(this.t, 1) + 's')}${kv('피격', Stats.playerHits)}${kv('난이도 단계', fmt(this.level(), 2))}<h5>패턴</h5><div style="color:#8a93a6;line-height:1.6">빨간 선: 직선 투사체<br>보라 원: 장판 (안쪽 원이 차면 폭발)<br>주황 점선: 지연 폭발 (0.5초 추적 후 고정)<br>Q·점멸·D로 회피 가능 (쿨 40% 감소)</div>`; },
  result() { return { key: 'dodge', score: Math.round(this.t * 10) / 10, scoreLabel: '생존 시간(초)', modeRatio: clamp(this.t / 90, 0, 1), modeLabel: '생존 시간', weights: { acc: 0, waste: 0, mistake: 10, mode: 90 }, heatmap: Stats.hitPositions.slice() }; },
};

// ---------- 5. 1:1 결투 ----------
Modes.duel = {
  name: '1:1 결투',
  start(o) {
    this.diff = o.diff || 'normal'; this.need = o.rounds === 1 ? 1 : 2;
    const keys = Object.keys(CONFIG.rangedMotifs);
    this.motifKey = o.motif && CONFIG.rangedMotifs[o.motif] ? o.motif : keys[Math.floor(Math.random() * keys.length)];   // 기본: 무작위
    this.motif = CONFIG.rangedMotifs[this.motifKey];
    const eb = o.enemyBuild && o.enemyBuild !== 'same' ? o.enemyBuild : Game.buildId;   // 상대 레벨: 캐시와 같게 / 직접 선택
    this.enemyStage = CONFIG.rangedAI.stages[eb] ? eb : 'mid';
    this.stageInfo = CONFIG.rangedAI.stages[this.enemyStage];
    this.title = `1:1 결투 vs ${this.motif.name} ${this.stageInfo.label} (${CONFIG.enemy.difficulty[this.diff].label})` + (Game.mapKey !== 'basic' ? ` · ${Game.map.name}` : '');
    this.animals = !!o.animals;
    this.wins = { p: 0, e: 0 }; this.round = 0; this.history = []; this.newRound();
  },
  newRound() {
    this.round++; Game.units = []; Game.projectiles = []; Game.zones = [];
    const sp = Game.map.spawns;
    Scene.player(sp.p.x, sp.p.y); this.enemy = new RangedDuelist(sp.e.x, sp.e.y, this.diff, this.motifKey, this.enemyStage); Game.units.push(this.enemy);
    if (this.animals) for (const a of Game.map.animals) Scene.animal(a.x, a.y, this.enemyStage);   // 야생동물(2인 수쳐 응용)
    this.snap = Stats.snapshot(); this.roundStart = Game.time; this.inter = null; this.ended = false;
    Game.freeze = 1.6; this.banner = { t: 1.6, text: `ROUND ${this.round}`, sub: `VS ${this.motif.name} ${this.stageInfo.label} · ${this.motif.weapon}` };
  },
  update(dt, frozen) {
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    if (this.inter) { if ((this.inter.t -= dt) <= 0) this.newRound(); return; }
    if (frozen || this.ended) return;
    if (this.enemy.dead) this.roundEnd('p'); else if (Game.player.dead) this.roundEnd('e');
  },
  roundEnd(w) {
    this.ended = true; this.wins[w]++;
    const St = Stats, s0 = this.snap, casts = {}, hits = {}, mist = {}, p = Game.player, e = this.enemy;
    for (const k of SKILL_KEYS) { casts[k] = (St.casts[k] || 0) - (s0.casts[k] || 0); hits[k] = (St.hits[k] || 0) - (s0.hits[k] || 0); }
    for (const k in St.mistakes) { const d = St.mistakes[k] - (s0.mistakes[k] || 0); if (d > 0) mist[k] = d; }
    const sum = { round: this.round, winner: w, time: Game.time - this.roundStart, dealt: St.dealtTotal - s0.dealt, taken: St.takenTotal - s0.taken, casts, hits,
      mistakes: Object.entries(mist).sort((a, b) => b[1] - a[1]).slice(0, 3), eDodge: e.stats.dodges, eS1: `${e.stats.s1Hits}/${e.stats.s1Casts}`, pHp: Math.max(0, p.hp / p.maxHp), eHp: Math.max(0, e.hp / e.maxHp) };
    this.history.push(sum);
    if (w === 'p') { Events.emit('roundWin'); Sfx.play('win'); } else Sfx.play('fail');
    if (this.wins.p >= this.need || this.wins.e >= this.need) { Game.finish('duelEnd'); return; }
    this.inter = { t: 4.5, sum }; Game.freeze = 999;
  },
  drawScreen(ctx, L, oy = 0) {
    Draw.text(ctx, `캐시 ${this.wins.p}  :  ${this.wins.e} ${this.motif.name}  ·  ROUND ${this.round}`, L.W / 2, 24 + oy, { size: 18, bold: true, align: 'center', stroke: true });
    if (this.banner) { Draw.text(ctx, this.banner.text, L.W / 2, L.H * 0.4, { size: 46, bold: true, align: 'center', color: CONFIG.theme.gold, stroke: true }); if (this.banner.sub) Draw.text(ctx, this.banner.sub, L.W / 2, L.H * 0.4 + 44, { size: 18, bold: true, align: 'center', color: this.motif.color, stroke: true }); }
    if (this.inter) {
      const s = this.inter.sum, w = 420, h = 230, x = L.W / 2 - w / 2, y = L.H * 0.22;
      Draw.panel(ctx, x, y, w, h);
      Draw.text(ctx, `ROUND ${s.round} — ${s.winner === 'p' ? '승리!' : '패배'}`, L.W / 2, y + 34, { size: 22, bold: true, align: 'center', color: s.winner === 'p' ? CONFIG.theme.gold : CONFIG.theme.accent });
      const lines = [
        `시간 ${fmt(s.time, 1)}s · 가한 피해 ${Math.round(s.dealt)} · 받은 피해 ${Math.round(s.taken)}`,
        `적중  ` + SKILL_KEYS.filter(k => s.casts[k] > 0).map(k => `${k} ${s.hits[k]}/${s.casts[k]}`).join('  ') || '-',
        `적 회피 시도 ${s.eDodge}회 · 적 스킬 적중 ${s.eS1}`,
        ...s.mistakes.map(([k, v]) => `⚠ ${k} ×${v}`),
      ];
      lines.forEach((t, i) => Draw.text(ctx, t, L.W / 2, y + 70 + i * 24, { size: 13, align: 'center', color: i > 2 ? '#ffb347' : '#e6e9ef' }));
      Draw.text(ctx, `다음 라운드까지 ${Math.ceil(this.inter.t)}초`, L.W / 2, y + h - 16, { size: 12, align: 'center', color: '#8a93a6' });
    }
  },
  drawWorld(ctx) { if (this.enemy && this.enemy.drawExtra) this.enemy.drawExtra(ctx); },
  side() {
    const e = this.enemy; if (!e) return '';
    const M = this.motif;
    if (e.melee) {   // 근거리 암살자(다니엘): 상태·표식 + 대응 팁
      const st = { stalk: '서성이며 각 재는 중', engage: '진입!', retreat: '후퇴' }[e.mode] + (e.stealthT > 0 ? ' · 은신' : '') + (e.shadow ? ' · 걸작(대상 지정 불가)' : '');
      const mk = e.mark ? kv('영감 표식', e.mark.t >= e.kitCfg.W.ready ? `<b style="color:#ffd1ff">활성 — 공격받으면 폭발 ${Math.round(e.mark.acc)}</b>` : `${fmt(e.kitCfg.W.ready - e.mark.t, 1)}s 후 활성 (축적 ${Math.round(e.mark.acc)})`) : '';
      return `<h4>⚔ vs ${M.name} Lv${e.level} (${M.weapon})</h4>${kv('적 체력', `${Math.round(Math.max(0, e.hp))} / ${e.maxHp}`)}${kv('공격력 / 공속', `${e.ad} / ${fmt(e.curAs(), 2)}`)}${kv('치명 / 평타 증폭 / 방관', `${Math.round(e.critChance * 100)}% / ${Math.round(e.aaAmp * 100)}% / ${Math.round(e.pen * 100)}%`)}${kv('방어력', e.def)}${kv('상태', st)}${mk}${['Q', 'W', 'E', 'R', 'D'].map(k => kv(`${k === 'D' ? '무기' : k} ${e.kitCfg[k].name}`, e.cds[k] > 0 ? fmt(e.cds[k], 1) + 's' : (k === 'D' && e.cloakT > 0 ? '단검 재사용 가능' : '준비'))).join('')}
      <h5>팁</h5><div style="color:#8a93a6;line-height:1.5">다니엘은 정면으로 싸우지 않습니다. 6m 근처(부쉬 선호)에서 서성이다가 <b>캐시의 E(수쳐)·Q가 빠지거나 체력이 깎이면</b> 망토 → E 은신 돌진 → 건너편 순간이동 평타 → 가위(Q)+영감(W) → 단검 → R 걸작으로 들어옵니다. 은신 연기를 보면 바로 대비하고 <b>E 수쳐는 진입 순간을 위해 아껴 두세요</b>. 걸작(R) 중엔 대상 지정 불가 + 0.5초 침묵 — 빠져나오는 위치를 노리세요. 보라색 링(영감)이 밝아지면 맞는 순간 축적 피해가 터집니다.</div>`;
    }
    return `<h4>⚔ vs ${M.name} Lv${e.level} (${M.weapon})</h4>${kv('적 체력', `${Math.round(Math.max(0, e.hp))} / ${e.maxHp}`)}${kv('공격력 / 스킬 증폭', `${e.ad} / ${e.sp}`)}${kv('공속 / 치명 / 방관', `${e.as} / ${Math.round(e.critChance * 100)}% / ${Math.round(e.pen * 100)}%`)}${kv('방어력', e.def)}${kv('평타 사거리', fmt(e.aaRange(), 2) + 'm' + (e.stance ? (e.stance === 'short' ? ' (단궁)' : ' (화궁)') : ''))}${['Q', 'W', 'E', 'R', 'D'].filter(k => e.kitCfg[k]).map(k => kv(`${k === 'D' ? '무기' : k} ${e.kitCfg[k].name}`, e.cds[k] > 0 ? fmt(e.cds[k], 1) + 's' : '준비')).join('')}
      <h5>팁</h5><div style="color:#8a93a6;line-height:1.5">원딜은 쏘고 움직이며(카이팅), 캐시의 E·Q가 준비돼 있으면 평타 사이사이 E 사거리(5.5m) 밖으로 빠집니다. 평타를 쏘려면 사거리(4.85~6m) 안으로 들어와야 하니 그 순간을 노리세요. E 예고선을 보면 좌우로 피하고, 벽 근처는 피합니다. 이동기가 빠진 순간이 진입 타이밍.</div>`;
  },
  result() {
    const t = this.wins.p + this.wins.e;
    const rows = this.history.map(s => `<tr><td>R${s.round}</td><td>${s.winner === 'p' ? '<b style="color:#ffc857">승</b>' : '<b style="color:#ff3b5c">패</b>'}</td><td>${fmt(s.time, 1)}s</td><td>${Math.round(s.dealt)}</td><td>${Math.round(s.taken)}</td><td>${SKILL_KEYS.filter(k => s.casts[k] > 0).map(k => `${k} ${s.hits[k]}/${s.casts[k]}`).join(' ')}</td><td>${s.eDodge}</td></tr>`).join('');
    return { key: 'duel:' + this.diff, recTitle: this.title, score: this.wins.p * 100 - this.wins.e * 50, scoreLabel: `점수 (${this.wins.p}승 ${this.wins.e}패)`,
      modeRatio: t ? this.wins.p / t : 0, modeLabel: '라운드 승률', weights: { acc: 35, waste: 15, mistake: 15, mode: 30 },
      extraHtml: `<h3>라운드 요약</h3><table><tr><th>라운드</th><th>결과</th><th>시간</th><th>가한 피해</th><th>받은 피해</th><th>스킬 적중</th><th>적 회피</th></tr>${rows}</table>` };
  },
};

// ---------- 6. 챌린지 ----------
const ChallengeStore = { get() { return Store.get('challenges', {}); }, set(id, stars) { const a = this.get(); if (!a[id] || stars > a[id]) a[id] = stars; Store.set('challenges', a); } };
Modes.challenge = {
  name: '챌린지',
  start(o) {
    const ch = o.ch; this.ch = ch; this.title = '챌린지: ' + ch.name; this.count = 0; this.elapsed = 0; this.hits = 0;
    this.base = Modes[ch.scene.type]; this.base.start(Object.assign({}, ch.scene, { challenge: true }));
    if (ch.goal.event) Events.on(ch.goal.event, d => { if (ch.goal.event === 'streak') this.count = Math.max(this.count, d.n); else this.count++; });
    Events.on('playerHit', () => this.hits++);
  },
  update(dt, frozen) {
    this.base.update(dt, frozen);
    if (frozen || Game.state !== 'play') return;
    this.elapsed += dt; const g = this.ch.goal;
    if (g.survive) { if (this.hits > g.maxHits) Game.finish('fail'); else if (this.elapsed >= g.survive) Game.finish('clear'); return; }
    if (this.count >= (g.count || g.reach)) { Game.finish('clear'); return; }
    if (this.elapsed >= this.ch.limit) Game.finish('timeout');
  },
  drawWorld(ctx) { if (this.base.drawWorld) this.base.drawWorld(ctx); },
  drawScreen(ctx, L) {
    const ch = this.ch, g = ch.goal, w = 460, x = L.W / 2 - w / 2;
    Draw.panel(ctx, x, 8, w, 56);
    Draw.text(ctx, `🏆 ${ch.name} — ${ch.desc}`, L.W / 2, 30, { size: 14, bold: true, align: 'center' });
    const prog = g.survive ? `생존 ${fmt(this.elapsed, 1)} / ${g.survive}s · 피격 ${this.hits}/${g.maxHits}` : `진행 ${Math.min(this.count, g.count || g.reach)} / ${g.count || g.reach} · 남은 시간 ${fmt(Math.max(0, ch.limit - this.elapsed), 1)}s`;
    Draw.text(ctx, prog, L.W / 2, 52, { size: 13, align: 'center', color: CONFIG.theme.accent2 });
    if (this.base.drawScreen) this.base.drawScreen(ctx, L, 62);
  },
  side() { return this.base.side ? this.base.side() : ''; },
  result(reason) {
    const ch = this.ch, cleared = reason === 'clear' || (reason === 'duelEnd' && this.count >= 1);
    let stars = 0;
    if (cleared) {
      if (ch.stars.time) { const [a, b, c] = ch.stars.time; stars = this.elapsed <= c ? 3 : this.elapsed <= b ? 2 : 1; }
      else { const [a, b, c] = ch.stars.hits; stars = this.hits <= c ? 3 : this.hits <= b ? 2 : 1; }
      ChallengeStore.set(ch.id, stars);
    }
    const idx = CONFIG.challenges.indexOf(ch), next = CONFIG.challenges[idx + 1];
    return { key: 'challenge:' + ch.id, recTitle: '챌린지 ' + ch.name, score: stars, scoreLabel: cleared ? '획득한 별' : '실패', modeRatio: stars / 3, modeLabel: '챌린지 별',
      weights: { acc: 25, waste: 15, mistake: 10, mode: 50 }, stars, cleared, nextCh: cleared && next ? next : null,
      extraHtml: `<h3>챌린지 결과</h3><div style="font-size:28px" class="stars">${'★'.repeat(stars)}${'☆'.repeat(3 - stars)}</div>
        <div class="sub">${cleared ? `클리어! 기록 ${fmt(this.elapsed, 1)}s${ch.stars.time ? ` (★2 ≤ ${ch.stars.time[1]}s · ★3 ≤ ${ch.stars.time[2]}s)` : ` · 피격 ${this.hits}회`}` : `실패 (${{ timeout: '시간 초과', fail: '피격 초과', dead: '피격 초과', duelEnd: '결투 패배' }[reason] || reason})`}${cleared && next ? ` · 다음 챌린지 「${esc(next.name)}」 해금` : ''}</div>` };
  },
};
