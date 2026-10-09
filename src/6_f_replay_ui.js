
// ============================== 리플레이 분석 (실수 타임라인) ==============================
// 리플레이를 열면 화면 없이 먼저 끝까지 돌려 「표시할 지점」을 모음 → 화면 아래 타임라인에 점으로 → 누르면 그 장면으로
//   ⚠ 실수(코칭과 같은 실수 기록) · ✕ 빗나간 스킬 · ▼ 큰 피격(최대 체력 12% 이상 한 번에) · ★ 치명적 외상 · ☠ 쓰러짐 · ⚔ 처치 · 🏁 라운드 끝
//   이동(seek): 결정성 덕분에 처음부터 그 틱까지 화면 없이 다시 계산 → 정확히 그 장면 (뒤로 가면 처음부터)
//   조작: 일시정지 P · 이전/다음 표시 [ ] · 속도 − = (0.5×·1×·2×·4×) · 점 클릭 = 그 2초 전 · 막대 클릭 = 그 시점
Object.assign(Replay, {
  SPEEDS: [0.5, 1, 2, 4], speed: 1, paused: false, markers: [], analyzing: false,
  KIND: { mistake: { icon: '⚠', color: '#ffb347', label: '실수' }, miss: { icon: '✕', color: '#ff6b6b', label: '빗나감' }, hurt: { icon: '▼', color: '#ff3b5c', label: '큰 피격' },
    crit: { icon: '★', color: '#ffd166', label: '치명적 외상' }, death: { icon: '☠', color: '#c0c4cc', label: '쓰러짐' }, kill: { icon: '⚔', color: '#5dff9a', label: '처치' }, round: { icon: '🏁', color: '#9fd8ff', label: '라운드 끝' } },
  // ---------- 분석: 끝까지 돌리며 지점 수집 (관찰만 — 판 결과는 그대로) ----------
  analyze(r) {
    this.check(r);
    const marks = [], push = (kind, text) => { const last = marks[marks.length - 1]; if (last && last.kind === kind && last.text === text && Game.tick - last.tick < 30) return; marks.push({ tick: Game.tick, kind, text }); };
    const orig = { mistake: Stats.mistake, shot: Stats.resolveShot, damage: Combat.damage, kill: Combat.kill, critical: Passive.critical, sound: Settings.sound };
    let roundN = 0;
    Stats.mistake = function (txt) { if (this === Stats) push('mistake', txt); return orig.mistake.apply(this, arguments); };
    Stats.resolveShot = function (k, hit) { if (this === Stats && ['Q', 'W', 'E'].includes(k) && !hit) push('miss', `${k} 빗나감`); return orig.shot.apply(this, arguments); };
    Combat.damage = function (src, tgt, amount, o = {}) { const before = tgt && tgt.hp; const d = orig.damage.apply(this, arguments); if (tgt === Game.player && !o.tick && d >= tgt.maxHp * 0.12) push('hurt', `큰 피격 ${Math.round(d)}${src && src.name ? ' ← ' + src.name : ''}`); return d; };
    Combat.kill = function (src, tgt) { const r2 = orig.kill.apply(this, arguments); if (tgt === Game.player) push('death', '쓰러짐'); else if (src === Game.player && !tgt.infinite && tgt.kind !== 'ward') push('kill', `처치: ${tgt.name || tgt.kind}`); return r2; };
    Passive.critical = function (t, by, p = Game.player) { const was = t && t.crit > 0; const r2 = orig.critical.apply(this, arguments); if (p === Game.player && !was && t && t.crit > 0) push('crit', '치명적 외상'); return r2; };
    Settings.sound = false; this.analyzing = true;
    try {
      this.start(r); const S = CONFIG.sim.step;
      let lastRound = Game.mode && Game.mode.history ? Game.mode.history.length : 0;
      while (Game.tick < r.ticks && Game.state === 'play') {
        Game.step(S);
        const H = Game.mode && Game.mode.history; if (H && H.length > lastRound) { lastRound = H.length; const s = H[H.length - 1]; push('round', `R${s.round} ${s.winner === 'p' ? '승' : '패'}`); roundN++; }
      }
    } finally {
      Object.assign(Stats, { mistake: orig.mistake, resolveShot: orig.shot }); Combat.damage = orig.damage; Combat.kill = orig.kill; Passive.critical = orig.critical;
      Settings.sound = orig.sound; this.analyzing = false; this.restore(); this.active = null; FX.reset();
    }
    return marks;
  },
  // ---------- 보기: 분석 → 처음부터 재생 + 타임라인 ----------
  watch(r) {
    const marks = this.analyze(r);
    this.markers = marks; this.speed = 1; this.paused = false;
    this.start(r); this.bar(); return marks;
  },
  // 그 틱으로 이동 (뒤면 처음부터 다시 계산)
  seek(tick) {
    const A = this.active; if (!A) return;
    const r = A.r, keepMarks = this.markers, keepSpeed = this.speed, snd = Settings.sound;
    tick = clamp(Math.round(tick), 0, r.ticks);
    if (tick < Game.tick || Game.state !== 'play') { this.analyzing = true; this.start(r); this.analyzing = false; }
    Settings.sound = false; this.analyzing = true;
    try { const S = CONFIG.sim.step; while (Game.tick < tick && Game.state === 'play') Game.step(S); }
    finally { this.analyzing = false; Settings.sound = snd; }
    FX.reset(); this.markers = keepMarks; this.speed = keepSpeed;
    if (Game.tick >= r.ticks) this.end(); else this.bar();
  },
  jump(dir) {   // 이전(-1)/다음(+1) 표시
    const t = Game.tick, list = this.markers;
    const m = dir > 0 ? list.find(x => x.tick - 120 * 2 > t + 5) : [...list].reverse().find(x => x.tick - 120 * 2 < t - 30);
    if (m) this.seek(m.tick - 120 * 2);
  },
  setSpeed(dir) { const i = clamp(this.SPEEDS.indexOf(this.speed) + dir, 0, this.SPEEDS.length - 1); this.speed = this.SPEEDS[i]; this.bar(); },
  togglePause() { if (!this.active) return; this.paused = !this.paused; Game.paused = this.paused; this.bar(); },
  key(k) {
    if (!this.active) return false;
    if (k === 'p') { this.togglePause(); return true; }
    if (k === '[') { this.jump(-1); return true; }
    if (k === ']') { this.jump(1); return true; }
    if (k === '-') { this.setSpeed(-1); return true; }
    if (k === '=' || k === '+') { this.setSpeed(1); return true; }
    return false;
  },
  // ---------- 타임라인 (화면 아래 DOM) ----------
  bar() {
    const A = this.active; let el = document.getElementById('replay-bar');
    if (!A) { if (el) el.remove(); return; }
    if (!el) { el = document.createElement('div'); el.id = 'replay-bar'; document.body.appendChild(el); }
    el.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:118px;width:min(760px,94vw);z-index:40;background:rgba(14,17,24,.92);border:1px solid #2a3140;border-radius:10px;padding:8px 10px;font:12px ' + FONT + ';color:#e6e9ef;box-sizing:border-box';
    const T = A.r.ticks || 1, counts = {};
    for (const m of this.markers) counts[m.kind] = (counts[m.kind] || 0) + 1;
    const dots = this.markers.map((m, i) => { const K = this.KIND[m.kind]; return `<span data-rm="${i}" title="${fmt(m.tick * A.r.step, 1)}초 · ${esc(m.text)}" style="position:absolute;left:${(m.tick / T * 100).toFixed(2)}%;top:-1px;transform:translateX(-50%);cursor:pointer;color:${K.color};font-size:12px;line-height:14px">${K.icon}</span>`; }).join('');
    const legend = Object.entries(counts).map(([k, n]) => `<span style="color:${this.KIND[k].color}">${this.KIND[k].icon} ${this.KIND[k].label} ${n}</span>`).join(' · ') || '<span style="color:#8a93a6">표시할 지점 없음</span>';
    el.innerHTML = `<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
        <button class="btn" data-rb="prev" title="이전 표시 [">⏮</button><button class="btn" data-rb="pause" title="일시정지 P">${this.paused ? '▶' : '⏸'}</button><button class="btn" data-rb="next" title="다음 표시 ]">⏭</button>
        <button class="btn" data-rb="slow" title="느리게 −">−</button><b>${this.speed}×</b><button class="btn" data-rb="fast" title="빠르게 =">+</button>
        <span id="replay-now" style="margin-left:6px;color:#9fd8ff"></span><span style="margin-left:auto">${legend}</span></div>
      <div id="replay-track" style="position:relative;height:16px;background:#1b2130;border-radius:6px;cursor:pointer">${dots}<i id="replay-head" style="position:absolute;top:0;bottom:0;width:2px;background:#fff;left:0"></i></div>`;
    el.onclick = e => {
      const rm = e.target.closest('[data-rm]'), rb = e.target.closest('[data-rb]'), tr = e.target.closest('#replay-track');
      if (rm) { const m = this.markers[+rm.dataset.rm]; this.seek(Math.max(0, m.tick - 120 * 2)); return; }
      if (rb) { ({ prev: () => this.jump(-1), next: () => this.jump(1), pause: () => this.togglePause(), slow: () => this.setSpeed(-1), fast: () => this.setSpeed(1) })[rb.dataset.rb](); return; }
      if (tr) { const b = tr.getBoundingClientRect(); this.seek((e.clientX - b.left) / Math.max(1, b.width) * T); }
    };
    this.updateBar();
  },
  // 매 프레임: 재생 위치·지금 지점 설명
  updateBar() {
    const A = this.active; if (!A) return;
    const head = document.getElementById('replay-head'), now = document.getElementById('replay-now'); if (!head) return;
    head.style.left = (Game.tick / Math.max(1, A.r.ticks) * 100).toFixed(2) + '%';
    const near = this.markers.filter(m => Math.abs(m.tick - Game.tick) < 120 * 1.5).pop();
    if (now) now.textContent = `${fmt(Game.tick * A.r.step, 1)} / ${fmt(A.r.ticks * A.r.step, 1)}초` + (near ? ` · ${this.KIND[near.kind].icon} ${near.text}` : '');
  },
});
