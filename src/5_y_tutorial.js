
// ---------- 입문 튜토리얼 (로드맵 F) ----------
// 처음 온 사람용: 허수아비 하나를 두고 이동 → 평타 → 스킬 → 실험체별 리듬 → 궁극기 → 전술 스킬 순서로 직접 해 보며 익힘
// 각 단계는 해내면 자동으로 넘어가고(화면 위 안내 + 진행도), 끝나면 콤보 연습·쉬운 결투로 이어줌. 메뉴의 「처음이세요?」 버튼으로 시작
Modes.tutorial = {
  name: '입문 튜토리얼',
  MARKS: [[13, 5], [19, 13], [8, 12.5]],
  start(o) {
    this.title = this.name;
    Scene.player(8, 9); Scene.dummy(15, 9, { hp: 999999, def: 0, infinite: true });
    const p = Game.player, ch = p.charKey || 'cathy';
    this.kind = ch === 'cathy' ? 'cathy' : p.ranged && !(p.motif && p.motif.melee) ? 'ranged' : 'melee';
    this.steps = this.makeSteps(p); this.i = 0; this.wait = 0; this.done = false; this.begin();
  },
  castHow() { return { smart: '키를 누르면 바로 커서 방향으로', release: '키를 누르고 있다가 떼면', normal: '키를 누른 뒤 좌클릭으로' }[Settings.castMode] || '키를 누른 뒤 좌클릭으로'; },
  key(a) { return ((Settings.keys || {})[a] || a).toUpperCase(); },
  makeSteps(p) {
    const K = this.key.bind(this), skillName = k => (p.skillDef && p.skillDef(k) && p.skillDef(k).name) || k;
    const rhythm = {
      cathy: { title: '스킬 → 강화 평타', text: '캐시는 스킬을 쓴 직후 평타가 「강화 평타」가 됩니다. 스킬 하나 쓰고 바로 허수아비를 우클릭 — 2번', goal: 2, count: (s, b) => s.enhAA - b.enhAA },
      ranged: { title: '쏘고 움직이기', text: '평타가 손을 떠나면 바로 우클릭으로 옆으로 한 걸음 → 다시 허수아비 우클릭. 평타 사이에 움직이기 3번', goal: 3, count: () => this.kite },
      melee: { title: '평타 사이에 스킬', text: '붙어서 평타 → 스킬 → 평타 순서로 이어 치기. 평타를 쉬지 않는 게 핵심 — 2번', goal: 2, count: () => this.weave },
    }[this.kind];
    return [
      { title: '이동', text: '바닥의 노란 원을 우클릭해서 차례로 밟으세요 (마우스 오른쪽 = 이동)', goal: 3, count: () => this.mark },
      { title: '평타', text: '허수아비를 우클릭하면 다가가서 기본 공격(평타)을 합니다 — 3번', goal: 3, count: (s, b) => s.aaHits - b.aaHits },
      { title: '스킬', text: `${K('Q')} ${skillName('Q')} · ${K('W')} ${skillName('W')} · ${K('E')} ${skillName('E')} — 허수아비 쪽으로 하나씩 써 보세요 (${this.castHow()} 사용 · 설정에서 바꿀 수 있음)`, goal: 3, count: (s, b) => ['Q', 'W', 'E'].filter(k => (s.casts[k] || 0) > (b.casts[k] || 0)).length },
      rhythm,
      { title: '궁극기', text: `${K('R')} ${skillName('R')} — 허수아비에게 궁극기를 써 보세요${p.charKey === 'daniel' ? ' (다니엘 걸작: 4초 안에 때린 3m 안의 적에게만 — 먼저 평타 후 붙어서)' : ''}`, goal: 1, count: (s, b) => (s.casts.R || 0) - (b.casts.R || 0) },
      { title: '전술 스킬', text: `${K('F')} 전술 스킬(지금: ${(CONFIG.tactical[Settings.tactical] || CONFIG.tactical.blink).name}) — 메뉴에서 다른 전술 스킬로 바꿀 수 있어요`, goal: 1, count: (s, b) => (s.casts.F || 0) - (b.casts.F || 0) },
    ];
  },
  snap() { const S = Stats; return { aaHits: S.aaHits, enhAA: S.enhAA, casts: Object.assign({}, S.casts) }; },
  begin() { this.base = this.snap(); this.mark = 0; this.kite = 0; this.weave = 0; this.lastAA = null; this.seq = 0; this.prevAA = Stats.aaHits; this.prevCast = this.castSum(); },
  castSum() { return ['Q', 'W', 'E', 'R', 'D'].reduce((a, k) => a + (Stats.casts[k] || 0), 0); },
  cur() { return this.steps[this.i]; },
  progress() { const s = this.cur(); return s ? Math.min(s.goal, Math.max(0, s.count(Stats, this.base))) : 0; },
  update(dt) {
    const p = Game.player; if (!p || this.done) return;
    if (this.wait > 0) { if ((this.wait -= dt) <= 0) { this.i++; if (this.i >= this.steps.length) return this.finish(); this.begin(); } return; }
    // 단계별 직접 세는 것: 원 밟기 · 쏘고 움직이기 · 평타-스킬-평타
    if (this.i === 0 && this.mark < 3 && V.dist(p.pos, { x: this.MARKS[this.mark][0], y: this.MARKS[this.mark][1] }) < 0.9) { this.mark++; Sfx.play('click'); }
    const aa = Stats.aaHits, cs = this.castSum();
    if (aa > this.prevAA) {
      if (this.lastAA && V.dist(this.lastAA, p.pos) > 0.4) this.kite++;
      this.lastAA = V.copy(p.pos);
      if (this.seq === 2) { this.weave++; this.seq = 1; } else this.seq = 1;
    }
    if (cs > this.prevCast && this.seq === 1) this.seq = 2;
    this.prevAA = aa; this.prevCast = cs;
    if (this.progress() >= this.cur().goal) { this.wait = 0.8; Sfx.play('combo'); FX.toast(`✔ ${this.cur().title} 완료`, '#5dff9a'); }
  },
  finish() {
    this.done = true; Settings.tutorialDone = true; saveSettings(); Game.paused = true;
    UI.showTutorialDone();
  },
  drawWorld(ctx) {
    if (this.i !== 0 || this.done) return;
    this.MARKS.forEach(([x, y], k) => {
      if (k < this.mark) return; ctx.save(); ctx.globalAlpha = k === this.mark ? 0.9 : 0.35; ctx.strokeStyle = '#ffd166'; ctx.lineWidth = 0.08;
      Draw.circle(ctx, x, y, 0.7 + (k === this.mark ? 0.08 * Math.sin(Game.time * 6) : 0)); ctx.stroke(); ctx.restore();
    });
  },
  drawScreen(ctx, L, oy = 0) {
    const s = this.cur(); if (!s || this.done) return;
    const side = Settings.side && Side.el && Side.el.classList.contains('show') ? (Side.el.offsetWidth || 280) + 24 : 0, room = L.W - side;   // 오른쪽 정보 패널을 피해서
    const w = Math.min(620, room - 40), x = room / 2 - w / 2, y = 62 + oy, pr = this.progress();   // 왼쪽 위 상태 글자 아래
    ctx.save(); ctx.globalAlpha = 0.86; ctx.fillStyle = '#12151c'; ctx.fillRect(x, y, w, 74); ctx.globalAlpha = 1; ctx.strokeStyle = '#3fd0c9'; ctx.lineWidth = 1; ctx.strokeRect(x + 0.5, y + 0.5, w - 1, 73);
    ctx.fillStyle = '#3fd0c9'; ctx.fillRect(x, y + 70, w * (this.i + pr / s.goal) / this.steps.length, 4); ctx.restore();
    Draw.text(ctx, `🎓 입문 튜토리얼 ${this.i + 1}/${this.steps.length} · ${s.title}  (${pr}/${s.goal})`, x + 12, y + 20, { size: 15, bold: true, color: '#3fd0c9' });
    const words = s.text, max = Math.floor((w - 24) / 13); const lines = []; let cur = '';
    for (const part of words.split(' ')) { if ((cur + ' ' + part).trim().length > max) { lines.push(cur.trim()); cur = part; } else cur += ' ' + part; } if (cur.trim()) lines.push(cur.trim());
    lines.slice(0, 2).forEach((ln, k) => Draw.text(ctx, ln, x + 12, y + 42 + k * 18, { size: 13, color: '#e6e9ef' }));
  },
  side() {
    return `<h4>🎓 입문 튜토리얼</h4>${this.steps.map((s, k) => kv(`${k < this.i || this.done ? '✔' : k === this.i ? '▶' : '·'} ${s.title}`, k === this.i && !this.done ? `${this.progress()}/${s.goal}` : '')).join('')}
      <div class="sub" style="margin-top:6px">Esc: 일시정지 → 메뉴로 나가기</div>`;
  },
  result() { return { key: 'tutorial', score: this.i, scoreLabel: '완료한 단계', modeRatio: this.i / Math.max(1, this.steps.length), modeLabel: '튜토리얼 진행' }; },
};
