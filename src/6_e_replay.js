
// ============================== 리플레이 (저장·다시 보기) ==============================
// 같은 시드 + 같은 명령 = 같은 판(결정성, 6_a_cmd.js) → 파일에는 시드·옵션·설정·명령만 담음 (보통 수십 KB)
//   저장: 판이 끝날 때 기록을 잡아 두고(Replay.last) 결과 화면 「리플레이 저장」으로 내려받음
//   보기: 메뉴 「리플레이 열기」 → 저장할 때의 설정을 잠시 적용하고 그 판을 다시 진행 (실제 입력은 막힘, 기록에 안 남음)
//   온라인 대전은 양쪽 명령을 다 가진 호스트가 저장 (손님 명령은 p: 1)
const Replay = {
  V: 1, active: null, last: null,
  KEEP: ['character', 'weapon', 'build', 'tactical', 'fog', 'duelTime'],   // 판정에 영향을 주는 설정
  capture() {
    const r = Cmd.record();
    return Object.assign(r, { kind: 'cathy-replay', rv: this.V, buildId: BUILD_ID, title: (Game.mode && Game.mode.title) || Game.modeId, date: Date.now() });
  },
  fileName(r) { const d = new Date(r.date || Date.now()), p = n => String(n).padStart(2, '0'); return `cathy-replay-${r.mode}-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.json`; },
  // 파일 내용 검사 (잘못된 파일로 게임이 깨지지 않게)
  check(r) {
    if (!r || r.kind !== 'cathy-replay') throw new Error('캐시 수련장 리플레이 파일이 아닙니다');
    if (r.rv !== this.V) throw new Error('지원하지 않는 리플레이 형식입니다');
    if (!Modes[r.mode] || r.mode === 'combo' && !(r.opts && r.opts.combo)) throw new Error('알 수 없는 모드: ' + r.mode);
    if (!Array.isArray(r.log) || !Number.isInteger(r.ticks) || r.ticks < 0 || r.ticks > 120 * 60 * 60) throw new Error('리플레이 내용이 올바르지 않습니다');
    if (r.step !== CONFIG.sim.step) throw new Error('시뮬레이션 간격이 다른 리플레이입니다');
    for (const c of r.log) if (!c || !Number.isInteger(c.k) || !Net.validCmd(c)) throw new Error('리플레이 명령이 올바르지 않습니다');
    return r;
  },
  download(r = this.last) {
    if (!r) return false;
    const url = URL.createObjectURL(new Blob([JSON.stringify(r)], { type: 'application/json' })), a = document.createElement('a');
    a.href = url; a.download = this.fileName(r); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
    return true;
  },
  // 다시 보기 시작
  start(r) {
    this.check(r);
    if (this.active) this.restore();
    const backup = {}; for (const k of this.KEEP) backup[k] = Settings[k];
    Object.assign(Settings, r.settings || {});
    this.active = { r, backup, warn: r.buildId !== BUILD_ID };
    Game.start(r.mode, Object.assign({}, r.opts, { seed: r.seed }));
    Cmd.replay(r.log);
    if (this.active.warn) FX.toast('다른 버전에서 저장한 리플레이 — 결과가 다를 수 있습니다', '#ffb347');
    return true;
  },
  restore() { if (!this.active) return; Object.assign(Settings, this.active.backup); },
  // 매 스텝 뒤: 기록 끝에 닿으면 종료
  afterStep() { if (this.active && Game.state === 'play' && Game.tick >= this.active.r.ticks) this.end(); },
  end() {
    if (!this.active) return;
    const r = this.active.r; Game.state = 'result'; this.restore(); this.active = null;
    UI.show(`<h2>📼 리플레이 끝</h2><div class="sub">${esc(r.title || r.mode)} · ${fmt(r.ticks * r.step, 1)}초</div>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-a="again">다시 보기 <kbd>R</kbd></button><button class="btn" data-a="menu">메인 메뉴 <kbd>M</kbd></button></div>`,
      { again: () => this.start(r), menu: () => UI.showMenu() }, { r: 'again', m: 'menu', Escape: 'menu' });
  },
  stop() { if (this.active) { this.restore(); this.active = null; } },
  label() { const A = this.active; if (!A) return ''; const t = A.r.ticks * A.r.step; return `📼 리플레이 ${fmt(Math.min(Game.tick * A.r.step, t), 1)} / ${fmt(t, 1)}초${A.warn ? ' · ⚠ 다른 버전' : ''}`; },
};
