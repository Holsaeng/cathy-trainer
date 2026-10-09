
// ============================== 1:1 온라인 대전 (캐시·다니엘) ==============================
// 결투(Modes.duel)의 라운드·점수·스피어 규칙을 그대로 쓰고, 상대만 AI 대신 「명령으로 조종하는 캐시」(팀 1)
//   호스트: Game.player = 호스트 캐시, enemy = 손님 캐시(Net이 받은 명령을 적용)
//   손님: 같은 판을 만들고 상태만 받아 그림. 화면의 점수·승패는 손님 시점으로 뒤집어 보여 줌
//   두 캐릭터는 설정이 아니라 옵션(hostWeapon·guestWeapon·build)으로 만듦 → 손님도 똑같은 판을 만들 수 있음
Modes.pvp = Object.assign(Object.create(Modes.duel), {
  name: '1:1 온라인 대전',
  start(o) {
    this.o = o; this.diff = 'pvp'; this.need = o.rounds === 1 ? 1 : 2;
    this.guestWeapon = o.guestWeapon === 'dual' ? 'dual' : 'dagger'; this.hostWeapon = o.hostWeapon === 'dual' ? 'dual' : 'dagger';
    // 캐릭터: 캐시 / 다니엘 (다니엘은 단검 고정·장비 없음)
    this.hostChar = o.hostChar === 'daniel' ? 'daniel' : 'cathy'; this.guestChar = o.guestChar === 'daniel' ? 'daniel' : 'cathy';
    if (this.guestChar === 'daniel') this.guestWeapon = 'dagger'; if (this.hostChar === 'daniel') this.hostWeapon = 'dagger';
    const nm = c => c === 'daniel' ? '다니엘' : '캐시';
    this.motifKey = null; this.stageInfo = { label: '' };
    this.motif = { name: '상대 ' + nm(this.guestChar), weapon: CONFIG.basicAttack[this.guestWeapon].label, color: '#5aa9ff' };
    this.animals = false; this.sphere = !!o.sphere;
    this.title = `1:1 온라인 대전 · ${nm(this.hostChar)} vs ${nm(this.guestChar)}` + (Game.mapKey !== 'basic' ? ` · ${Game.map.name}` : '') + (this.sphere ? ' · 크로노 스피어' : '');
    // 손님 캐릭터 전용 통계 (판 전체 누적). 숨김 속성 → 스냅샷에 안 실림(라운드 끝에 따로 보냄)
    Object.defineProperty(this, 'rs', { value: Stats.make(), enumerable: false, writable: true, configurable: true });
    this.wins = { p: 0, e: 0 }; this.round = 0; this.history = []; this.newRound();
  },
  remote() { return this.enemy; },   // 손님이 조종하는 캐릭터
  newRound() {
    this.round++; Game.units = []; Game.projectiles = []; Game.zones = [];
    const sp = Game.map.spawns, keep = { c: Settings.character, w: Settings.weapon };
    try {
      Settings.character = this.hostChar; Settings.weapon = this.hostWeapon; Scene.player(sp.p.x, sp.p.y);
      Settings.character = this.guestChar; Settings.weapon = this.guestWeapon;
      const g = this.guestChar === 'daniel' ? new DanielPlayer(sp.e.x, sp.e.y) : new Cathy(sp.e.x, sp.e.y, this.o.guestGear || null);   // 손님 장비(캐시만, 없으면 실측)
      Object.assign(g, { team: 1, name: (this.guestChar === 'daniel' ? '다니엘' : '캐시') + ' 2P', color: '#5aa9ff', facing: Math.PI, stats: { dodges: 0, s1Hits: 0, s1Casts: 0 } });
      Object.defineProperty(g, 'rstats', { value: this.rs, enumerable: false, writable: true, configurable: true });   // 스냅샷에 안 실리게(따로 보냄)
      this.rs.owner = g; Game.units.push(g); this.enemy = g;
    } finally { Settings.character = keep.c; Settings.weapon = keep.w; }
    Game.player.name = (this.hostChar === 'daniel' ? '다니엘' : '캐시') + ' 1P';
    VisionItems.give(Game.player); VisionItems.give(this.enemy); Game.drones = []; Vision.reveals = []; Vision.noises = [];
    if (this.sphere) Sphere.start(); else Sphere.stop();
    this.snap = Stats.snapshot(); this.rsnap = this.rs.snapshot(); this.roundStart = Game.time; this.inter = null; this.ended = false;
    Game.freeze = 1.6; this.banner = { t: 1.6, text: `ROUND ${this.round}`, sub: `VS ${this.motif.name} (온라인)` };
  },
  update(dt, frozen) { Modes.duel.update.call(this, dt, frozen); if (!frozen && this.rs) this.rs.tick(dt); },
  // 라운드 끝: 손님 캐릭터 기준 요약을 붙이고 손님에게 통계를 보냄
  onRoundSum(sum) {
    const St = this.rs, s0 = this.rsnap, casts = {}, hits = {}, mist = {};
    for (const k of SKILL_KEYS) { casts[k] = (St.casts[k] || 0) - (s0.casts[k] || 0); hits[k] = (St.hits[k] || 0) - (s0.hits[k] || 0); }
    for (const k in St.mistakes) { const d = St.mistakes[k] - (s0.mistakes[k] || 0); if (d > 0) mist[k] = d; }
    sum.g = { casts, hits, dealt: St.dealtTotal - s0.dealt, taken: St.takenTotal - s0.taken, mistakes: Object.entries(mist).sort((a, b) => b[1] - a[1]).slice(0, 3) };
    if (Net.role === 'host') Net.sendStats(St);
  },
  // 손님 시점: 점수·라운드 결과를 뒤집은 「보기용」 복사본
  view() {
    if (Net.role !== 'guest') return this;
    const v = Object.create(this), host = Game.units.find(u => u instanceof Cathy && u !== Game.player);
    v.wins = { p: this.wins.e, e: this.wins.p }; v.motif = Object.assign({}, this.motif, { name: host ? host.name : '상대' });
    if (this.inter) { const s = this.inter.sum; const g = s.g || { casts: {}, hits: {}, mistakes: [], dealt: s.taken, taken: s.dealt }; v.inter = { t: this.inter.t, sum: Object.assign({}, s, { winner: s.winner === 'p' ? 'e' : 'p', dealt: g.dealt, taken: g.taken, casts: g.casts, hits: g.hits, mistakes: g.mistakes, eDodge: 0, eS1: '-' }) }; }
    return v;
  },
  drawScreen(ctx, L, oy = 0) {
    Modes.duel.drawScreen.call(this.view(), ctx, L, oy);
    if (Net.role) { const q = Net.quality(); Draw.text(ctx, q.text, L.W - 14, 22 + oy, { size: 13, bold: true, align: 'right', color: q.color, stroke: true }); }   // 연결 품질
  },
  side() {
    const v = this.view(), e = Net.role === 'guest' ? Game.units.find(u => u instanceof Cathy && u !== Game.player) : this.enemy;
    if (!e) return '';
    const S = Net.stats || {}, sec = Math.max(1, Game.time);
    return `<h4>⚔ 1:1 온라인 대전 (${Net.role === 'guest' ? '손님' : Net.role === 'host' ? '호스트' : '혼자'})</h4>${kv('점수', `${v.wins.p} : ${v.wins.e}`)}${kv('상대 체력', `${Math.round(Math.max(0, e.hp))} / ${e.maxHp}`)}${kv('상대 무기', CONFIG.basicAttack[e.weapon].label)}` +
      (Net.role ? `${kv('보냄 / 받음', `${(S.bytes / 1024 / sec).toFixed(1)} / ${(S.rbytes / 1024 / sec).toFixed(1)} KB/s`)}${kv('키프레임 요청', S.keyReq || 0)}` : '');
  },
  result(reason) {
    const r = Modes.duel.result.call(this, reason); r.key = 'pvp'; r.recTitle = this.title;
    if (Net.role === 'host') r.extraHtml = `<div class="sub" style="color:#9fd8ff">🌐 「다시 하기」를 누르면 상대도 새 판으로 함께 시작합니다. 리플레이는 양쪽 입력이 다 있는 호스트가 저장할 수 있습니다.</div>` + (r.extraHtml || '');
    return r;
  },
});
