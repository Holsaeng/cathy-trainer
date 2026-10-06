
// ============================== 명령 계층 ==============================
// 플레이어 입력(키·마우스)을 「명령」으로 바꿔 한 곳에서 적용하고 기록함
//   명령 = { k: 틱, t: 종류, x, y, id, s } — 좌표·대상 id(판 시작 기준)·스킬 키만 담은 순수 데이터
//   · 지금: 바로 적용 + Cmd.log에 기록 → 같은 시드로 다시 재생하면 같은 판(리플레이·결정성 검사)
//   · 온라인 대전(준비 중): 상대 입력도 같은 명령 형식으로 받아 같은 길로 적용
// 이벤트 처리는 항상 스텝과 스텝 사이에 실행되므로, 「지금까지 끝난 스텝 수(Game.tick)」에 기록하면 재생 때 같은 시점에 적용됨
const Cmd = {
  log: [], play: null, playI: 0,
  reset() { this.log = []; this.play = null; this.playI = 0; },
  rel(u) { return u ? u.id - Game.uid0 : null; },   // 판 시작 기준 id (UID는 판마다 계속 늘어남)
  unit(rid) { return rid === null || rid === undefined ? null : Game.units.find(u => u.id - Game.uid0 === rid) || null; },
  // 입력 → 명령 (내 캐릭터)
  send(c, u = Game.player) {
    if (!u || this.play) return;   // 재생 중엔 실제 입력 무시
    c.k = Game.tick; if (c.x !== undefined) { c.x = +c.x; c.y = +c.y; }
    if (Net.role === 'guest') { Net.sendCmd(c); return; }   // 온라인 손님: 호스트가 적용
    this.log.push(c); this.apply(u, c);
  },
  move(pt) { this.send({ t: 'move', x: pt.x, y: pt.y }); },
  attack(t) { this.send({ t: 'atk', id: this.rel(t) }); },
  amove(pt) { this.send({ t: 'amove', x: pt.x, y: pt.y }); },
  stop() { this.send({ t: 'stop' }); },
  skill(k, pt) { this.send({ t: 'sk', s: k, x: pt.x, y: pt.y }); },
  rest() { this.send({ t: 'rest' }); },
  camera(pt) { this.send({ t: 'cam', x: pt.x, y: pt.y }); },
  drone(pt) { this.send({ t: 'drone', x: pt.x, y: pt.y }); },
  cursor(pt) { this.send({ t: 'cur', x: pt.x, y: pt.y }); },   // 커서 위치가 결과에 영향을 줄 때만(다니엘 걸작 탈출 방향)
  apply(u, c) {
    const pt = c.x !== undefined ? { x: c.x, y: c.y } : null;
    if (pt) u.cursor = pt;   // 마지막으로 가리킨 지점
    switch (c.t) {
      case 'move': u.cmdMove(pt); break;
      case 'atk': { const t = this.unit(c.id); if (t) u.cmdAttack(t); break; }
      case 'amove': u.cmdAttackMove(pt); break;
      case 'stop': u.cmdStop(); break;
      case 'sk': u.cmdSkill(c.s, pt); break;
      case 'rest': if (u.rest) Rest.stop(u, null, true); else Rest.start(u); break;
      case 'cam': VisionItems.camera(u, pt); break;
      case 'drone': VisionItems.drone(u, pt); break;
      case 'cur': break;
    }
  },
  // ---------- 재생 ----------
  //   Game.start(같은 모드·옵션·seed) 직후 Cmd.replay(기록) → 매 스텝 시작에 그 틱의 명령을 적용
  replay(log) { this.play = log.map(c => Object.assign({}, c)); this.playI = 0; this.log = []; },
  feed() {
    if (!this.play) return;
    const L = this.play, u = Game.player;
    while (this.playI < L.length && L[this.playI].k <= Game.tick) {
      const c = L[this.playI++], who = c.p ? (Game.mode && Game.mode.remote && Game.mode.remote()) : u;   // p: 1 = 상대(온라인 대전 손님) 명령
      this.log.push(c); if (who && !(c.p && who.dead)) this.apply(who, c);
    }
  },
  // 판 하나를 다시 만들 수 있는 정보 (모드·옵션·시드·설정·명령)
  record() {
    return { v: 1, mode: Game.modeId, opts: Object.assign({}, Game.opts, { seed: Game.seed }), seed: Game.seed, ticks: Game.tick, step: CONFIG.sim.step,
      settings: { character: Settings.character, weapon: Settings.weapon, build: Settings.build, tactical: Settings.tactical, fog: Settings.fog, duelTime: Settings.duelTime },
      log: this.log.map(c => Object.assign({}, c)) };
  },
  // 판 상태 요약(결정성 검사용): 유닛 위치·체력·쿨, 투사체 수, 시간
  hash() {
    const r = v => Math.round(v * 1e5) / 1e5, out = [Game.tick, r(Game.time), Game.projectiles.length];
    for (const u of Game.units) {
      out.push(u.id - Game.uid0, u.kind, r(u.pos.x), r(u.pos.y), r(u.hp), u.dead ? 1 : 0);
      if (u.skills) for (const k of Object.keys(u.skills).sort()) out.push(r(u.skills[k].cd));
    }
    let h = 2166136261; const s = out.join('|'); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    return (h >>> 0).toString(16);
  },
};
