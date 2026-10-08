
// ============================== 온라인 대전 통신 ==============================
// 호스트 판정 방식 (docs/online_duel_plan.md)
//   호스트: 게임을 계산 → 0.05초(6스텝)마다 「바뀐 상태(델타) + 그동안의 효과·소리 이벤트」를 보냄 / 손님 명령은 다음 스텝 시작에 적용
//   손님: 계산하지 않음 → 받은 상태를 적용해 그리기만(위치는 부드럽게 보간) / 내 입력은 명령으로 호스트에 보냄
// 전송 수단(link)은 { send(문자열) } 만 있으면 됨 — 실험실(?netlab)은 창 사이 중계, 실제 연결은 WebRTC(4단계)
// 안정성: ① 2초마다 전체 상태(키프레임) ② 델타는 「몇 번째 기준」을 붙여 하나라도 빠지면 손님이 키프레임 요청 ③ 받은 명령은 검사 후 적용
const Net = {
  role: null, link: null, manual: false,
  SEND_TICKS: 6, KEY_EVERY: 40,
  ev: [], depth: 0,
  FXN: ['text', 'ring', 'slash', 'trail', 'burst', 'blood', 'xslash', 'arc', 'mark'],
  CMD_T: ['move', 'atk', 'amove', 'stop', 'sk', 'rest', 'cam', 'drone', 'cur'], SKILL_K: ['Q', 'W', 'E', 'R', 'D', 'F'],
  resetStats() { this.stats = { sent: 0, bytes: 0, recv: 0, rbytes: 0, keys: 0, keyReq: 0, events: 0, replayed: 0, cmds: 0, rejected: 0, sounds: {} }; },
  // ---------- 효과·소리 기록 (호스트) ----------
  //   FX·Sfx 함수를 감싸서 호스트에서 일어난 효과를 이벤트로 모음. 안쪽 호출(예: blood → burst)은 한 번만 기록
  init() {
    if (this._hooked) return; this._hooked = true; this.orig = {}; this.resetStats();
    for (const n of this.FXN) {
      const f = FX[n]; this.orig[n] = f;
      FX[n] = function (...a) { if (Net.role === 'host' && !Net.depth) Net.note('fx:' + n, a); Net.depth++; try { return f.apply(FX, a); } finally { Net.depth--; } };
    }
    const sp = Sfx.play; this.orig.play = sp;
    Sfx.play = function (n, pos) { if (Net.role === 'host' && !Net.depth) Net.note('sfx', [n, pos || null]); Net.depth++; try { return sp.call(Sfx, n, pos); } finally { Net.depth--; } };
  },
  // 시계(ms): 보통은 실제 시간, 실험실 자동 시험(manual)은 바깥에서 진행하는 가짜 시간
  fakeNow: 0,
  now() { return this.manual ? this.fakeNow : performance.now(); },
  hidden() { return typeof document !== 'undefined' && document.hidden; },   // 실험실 시험에서 바꿔 끼움
  onAck: null,
  quiet(fn) { this.depth++; try { return fn(); } finally { this.depth--; } },
  note(k, args, forUnit) {
    if (this.role !== 'host') return;
    const e = { k, a: Snap.enc(args) }; if (forUnit) e.f = forUnit.id - Game.uid0;
    this.ev.push(e); if (this.ev.length > 400) this.ev.shift();   // 한 번에 너무 많으면 오래된 것부터 버림
  },
  send(o) {
    const s = JSON.stringify(o); this.stats.sent++; this.stats.bytes += s.length;
    const ok = this.link ? this.link.send(s) : true;
    if (ok === false && o.t === 's' && this.tx) { this.tx.wantKey = true; this.stats.skipped = (this.stats.skipped || 0) + 1; }   // 보내기 대기열이 밀려 건너뜀 → 다음은 키프레임
  },
  stop() {
    if (this.role && this.link) try { this.send({ t: 'bye' }); } catch (e) { /* 끊김 */ }
    this.role = null; this.link = null; this.inbox = [];
    // bye가 나간 뒤 그 연결만 닫기 (그사이 새로 만든 연결은 건드리지 않음)
    if (typeof Rtc !== 'undefined' && Rtc.pc) { const pc = Rtc.pc; setTimeout(() => { if (Rtc.pc === pc) Rtc.close(); }, 200); }
  },
  // ---------- 호스트 ----------
  startHost(link, opts = {}) {
    this.init(); this.resetStats(); this.role = 'host'; this.link = link; this.inbox = []; this.ev = []; this.rtt = 0;
    const o = Object.assign({ build: Settings.build, hostWeapon: Settings.weapon, guestWeapon: 'dagger', rounds: 3, map: 'basic', time: 'day' }, opts);
    if (o.seed === undefined) o.seed = (Math.random() * 4294967296) >>> 0;
    this.tx = { n: 0, prev: null, sinceKey: 0, wantKey: true, t: 0, opts: null };
    Game.start('pvp', o); this.hello();
  },
  // 판 정보(손님이 같은 판을 만들 수 있게) — 호스트가 「다시 하기」로 새 판을 열 때도 다시 보냄
  hello() { this.tx.opts = Game.opts; this.tx.prev = null; this.tx.wantKey = true; this.send({ t: 'hello', v: Snap.V, mode: Game.modeId, opts: Game.opts }); },
  // 스텝 시작: 손님 명령 적용 (검사 통과한 것만)
  feed() {
    if (this.role !== 'host' || !this.inbox || !this.inbox.length) return;
    const u = Game.mode && Game.mode.remote && Game.mode.remote(), list = this.inbox; this.inbox = [];
    for (const c of list) {
      if (!this.validCmd(c)) { this.stats.rejected++; continue; }
      const cc = { t: c.t, k: Game.tick, p: 1 }; for (const f of ['x', 'y', 'id', 's']) if (c[f] !== undefined) cc[f] = c[f];
      Cmd.log.push(cc); this.stats.cmds++;
      if (u && !u.dead && Game.state === 'play') Cmd.apply(u, cc);
    }
  },
  validCmd(c) {
    if (!c || !this.CMD_T.includes(c.t)) return false;
    if (c.x !== undefined && !(Number.isFinite(c.x) && Number.isFinite(c.y) && Math.abs(c.x) < 1e4 && Math.abs(c.y) < 1e4)) return false;
    if (c.t === 'sk' && !this.SKILL_K.includes(c.s)) return false;
    if (c.t === 'atk' && !Number.isInteger(c.id)) return false;
    if (['move', 'amove', 'sk', 'cam', 'drone', 'cur'].includes(c.t) && c.x === undefined) return false;
    return true;
  },
  afterStep() {
    if (this.role !== 'host' || !this.tx) return;
    if (++this.tx.t % this.SEND_TICKS === 0) this.flush();
    if (this.tx.t % 120 === 60) this.send({ t: 'ping', c: this.now() });   // 호스트도 지연 측정(1초마다)
  },
  rttSample(c) { const s = this.now() - c; if (s >= 0 && s < 5000) this.rtt = this.rtt ? this.rtt * 0.8 + s * 0.2 : s; },
  flush() {
    if (!this.tx) return;
    if (this.tx.opts !== Game.opts) this.hello();
    const T = this.tx, cur = Snap.capture({ q: true }); let m;
    if (T.wantKey || !T.prev || T.sinceKey >= this.KEY_EVERY) { m = { t: 's', n: ++T.n, key: cur }; T.sinceKey = 0; T.wantKey = false; this.stats.keys++; }
    else { m = { t: 's', n: ++T.n, base: T.n - 1, d: Snap.diff(T.prev, cur) || {} }; T.sinceKey++; }
    m.ev = this.ev; this.ev = []; T.prev = cur; this.send(m);
  },
  // ---------- 손님 ----------
  startGuest(link) {
    this.init(); this.resetStats(); this.role = 'guest'; this.link = link; this.rx = { n: 0, tree: null, asked: false, got: 0 }; this.ended = false;
    this.pred = { target: null }; this.rtt = 0; this.lastPing = -1e9; this.gotStats = false; this.persp = '';
  },
  sendCmd(c) {
    this.send({ t: 'c', c });
    // 예측 목표: 이동·공격 이동만 미리 움직임. 정지·스킬·평타 대상 지정은 예측 안 함(호스트 결과를 기다림)
    if (c.t === 'move' || c.t === 'amove') this.pred.target = { x: c.x, y: c.y };
    else if (c.t !== 'cur' && c.t !== 'cam' && c.t !== 'drone') this.pred.target = null;
  },
  // 손님 캐릭터 통계 → 손님 (라운드 끝마다): 손님 화면의 라운드 요약·결과 코칭용
  sendStats(St) { this.send({ t: 'stats', s: Snap.enc(St.data()) }); },
  // 받은 메시지 처리 (양쪽 공용)
  recv(str) {
    let m; try { m = JSON.parse(str); } catch (e) { return; }
    this.stats.recv++; this.stats.rbytes += str.length;
    if (this.role === 'host') {
      if (this.onAck) this.onAck();   // 손님이 보낸 메시지(확인·핑·명령)마다: 숨겨진 탭이면 계산 진행 → 상태 전송 → 손님 확인… 으로 계속 이어짐
      if (m.t === 'c') { (this.inbox = this.inbox || []).push(m.c); if (this.inbox.length > 200) this.inbox.shift(); }
      else if (m.t === 'key') { this.tx.wantKey = true; this.stats.keyReq++; }
      else if (m.t === 'ping') this.send({ t: 'pong', c: m.c });
      else if (m.t === 'pong') this.rttSample(m.c);
      else if (m.t === 'rematch') { this.stats.rematch = (this.stats.rematch || 0) + 1; UI.netNotice('🔁 상대가 재대결을 원합니다 — 「다시 하기」를 누르면 바로 함께 시작'); }
      // m.t === 'a': 손님 확인(아래에서 계산 진행만)
      else if (m.t === 'bye') { FX.toast('상대가 나갔습니다', '#ffb347'); if (Rtc.state === 'open') Rtc.lost('상대가 나갔습니다'); }
      return;
    }
    if (this.role !== 'guest') return;
    if (m.t === 'hello') {
      if (m.v !== Snap.V) { FX.toast('버전이 다른 상대입니다 — 같은 버전으로 접속하세요', '#ff6b6b'); return; }
      Game.start(m.mode, m.opts); this.rx = { n: 0, tree: null, asked: false, got: 0 }; this.ended = false; this.gotStats = false; this.pred = { target: null }; return;
    }
    if (m.t === 'bye') { FX.toast('호스트가 나갔습니다', '#ffb347'); if (Rtc.state === 'open') Rtc.lost('호스트가 나갔습니다'); return; }
    if (m.t === 'pong') { this.rttSample(m.c); return; }
    if (m.t === 'ping') { this.send({ t: 'pong', c: m.c }); return; }
    if (m.t === 'stats') { Stats.reset(); Object.assign(Stats, Snap.dec(m.s, new Map())); this.gotStats = true; return; }
    if (m.t !== 's' || !Game.mode) return;
    const R = this.rx;
    if (m.key) R.tree = m.key;
    else if (R.tree && m.base === R.n) R.tree = Snap.patch(R.tree, m.d);
    else { if (!R.asked) { R.asked = true; this.stats.keyReq++; this.send({ t: 'key' }); } return; }   // 빠진 델타 → 키프레임 요청
    R.n = m.n; R.asked = false; R.got++;
    // 받을 때마다 짧은 응답(0.5초에 한 번까지): 손님 창이 오래 숨겨져 타이머가 멈춰도, 메시지 수신은 계속되므로 호스트가 끊김으로 오판하지 않음
    { const now = performance.now(); if (now - (this.lastAck || 0) > 500) { this.lastAck = now; this.send({ t: 'a' }); } }
    this.applyView(); this.replay(m.ev || []);
  },
  // 받은 상태 적용 + 손님 시점(내 캐릭터 = 호스트 기준 상대) + 위치 보간 준비
  applyView() {
    const before = new Map(Game.units.map(u => [u.id - Game.uid0, V.copy(u.pos)]));
    Snap.apply(this.rx.tree);
    const me = Game.mode.remote && Game.mode.remote(); if (me) Game.player = me;
    // 시점이 바뀌면(판 시작 직후 호스트 시점 → 내 시점) 3D 메시를 다시 만듦 — 링·궤적 색이 「내 편/적」 기준이라
    const persp = Game.player ? `${Game.player.id - Game.uid0}:${Game.player.team}` : '';
    if (persp !== this.persp) { this.persp = persp; if (Renderer.mode === '3d' && Render3D.ready && Render3D.rebuildUnits) Render3D.rebuildUnits(); }
    if (this.rx.tree.state === 'result' && !this.ended) { this.ended = true; Game.state = 'result'; UI.showNetEnd && UI.showNetEnd(); }
    else if (this.rx.tree.state === 'play') Game.state = 'play';
    const now = this.now(), span = this.SEND_TICKS * CONFIG.sim.step * 1000; this.rxAt = now;
    for (const u of Game.units) {
      const b = before.get(u.id - Game.uid0);
      u._to = V.copy(u.pos); u._from = b && V.dist(b, u.pos) < 3 ? b : V.copy(u.pos); u._t0 = now; u._span = span;   // 3m 넘게 튀면(점멸·라운드 시작) 보간 안 함
      if (u === Game.player && this.predOn()) { u._srv = V.copy(u.pos); u._from = b && V.dist(b, u.pos) < 1.5 ? b : V.copy(u.pos); }   // 내 캐릭터: 예측 표시 위치에서 이어감
      u.pos = V.copy(u._from);
    }
    this.lastTime = Game.time;
  },
  replay(list) {
    const U = new Map(Game.units.map(u => [u.id - Game.uid0, u])), mine = Game.player ? Game.player.id - Game.uid0 : null;
    for (const e of list) {
      let a; try { a = Snap.dec(e.a, U); } catch (x) { continue; }
      this.stats.events++;
      if (e.k.startsWith('fx:')) { const f = this.orig[e.k.slice(3)]; if (f) { f.apply(FX, a); this.stats.replayed++; } }
      else if (e.k === 'sfx') this.playSound(a[0], a[1]);
      else if (e.k === 'sfor') { const n = e.f === mine ? a[0] : a[2]; if (n) this.playSound(n, a[1]); }
      else if (e.k === 'toast') FX.toast(a[0], a[1] || undefined);
      else if (e.k === 'tfor') { if (e.f === mine) FX.toast(a[0], a[1] || undefined); }
      else if (e.k === 'ringfor') { const u = U.get(e.f); this.orig.ring.call(FX, a[0], a[1], a[2], FX.teamColor(a[3], u), a[4] || undefined); }
      else if (e.k === 'textfor') { const u = U.get(e.f); if (u && FX.canSee(u, a[5], Game.player)) this.orig.text.call(FX, a[0], a[1], FX.teamColor(a[2], u), a[3] || undefined, a[4] || undefined); }
    }
  },
  playSound(n, pos) { this.stats.sounds[n] = (this.stats.sounds[n] || 0) + 1; this.orig.play.call(Sfx, n, pos || undefined); },
  // 손님 매 프레임: 위치 보간·효과 진행 (판정 계산 없음)
  // 연결 품질: 지연 + 최근 받은 시각 → 표시 문구·색
  quality() {
    const quiet = typeof Rtc !== 'undefined' && Rtc.state === 'open' && performance.now() - Rtc.lastRx > 1500;
    const ms = Math.round(this.rtt || 0), c = quiet ? '#ff6b6b' : ms < 80 ? '#5dff9a' : ms < 150 ? '#ffd166' : '#ff6b6b';
    return { ms, quiet, color: c, text: quiet ? '⚠ 연결 불안정' : ms ? `📶 ${ms}ms` : '📶 측정 중' };
  },
  predOn() { return Settings.netPredict !== false; },
  // 예측 위치: 마지막 호스트 위치에서 목표 쪽으로 (왕복 지연 + 받은 뒤 지난 시간)만큼. 벽에서 멈춤. 못 움직이는 상태면 호스트 위치 그대로
  predictPos(u, now) {
    const P = this.pred, srv = u._srv || u._to; if (!P || !P.target || !srv) return null;
    if (!u.canMove() || u.rest || (u.cast && u.skillDef && (u.skillDef(u.cast.k) || {}).channel)) return null;
    if (V.dist(srv, P.target) < 0.08) { P.target = null; return null; }   // 호스트에서도 도착
    const lead = clamp(this.rtt / 1000, 0, 0.35) + clamp((now - (this.rxAt || now)) / 1000, 0, 0.2), want = u.speed() * lead;
    const d = V.dist(srv, P.target), dir = V.norm(V.sub(P.target, srv)), go = Math.min(d, want, Geo.clampDash(srv, dir, d, u.r * 0.9));
    return V.add(srv, V.mul(dir, go));
  },
  guestTick(dt) {
    if (this.role !== 'guest' || !Game.mode) return;
    const now = this.now(), me = Game.player;
    if (now - this.lastPing > 1000) { this.lastPing = now; this.send({ t: 'ping', c: now }); }   // 왕복 지연 측정
    else if (now - (this.lastBeat || 0) > 50) { this.lastBeat = now; this.send({ t: 'a' }); }   // 심장박동(0.05초): 호스트 탭이 숨겨져도 이 메시지로 계산이 진행됨
    for (const u of Game.units) if (u._to) { const k = clamp((now - u._t0) / u._span, 0, 1); u.pos = { x: lerp(u._from.x, u._to.x, k), y: lerp(u._from.y, u._to.y, k) }; }
    // 내 캐릭터: 예측 위치로 부드럽게 (1.5m 넘게 어긋나면 바로 맞춤)
    if (me && me._to && this.predOn()) {
      const want = this.predictPos(me, now) || me._srv || me._to, cur = me._disp || me.pos;
      me._disp = V.dist(cur, want) > 1.5 ? V.copy(want) : V.add(cur, V.mul(V.sub(want, cur), 1 - Math.exp(-25 * Math.max(dt, 1 / 240))));
      me.pos = V.copy(me._disp);
    }
    FX.update(dt);
  },
};
