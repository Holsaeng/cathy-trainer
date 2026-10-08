
// ============================== 온라인 대전 실험실 (개발용) ==============================
// 주소 끝에 ?netlab → 한 화면에 호스트·손님 두 창(iframe)을 띄우고, 두 창 사이 메시지를 지연·흔들림·손실을 넣어 중계
//   네트워크·서버 없이 온라인 대전을 시험 (실제 연결은 4단계에서 WebRTC로 같은 Net 위에 붙임)
//   ?netlab&test → 자동 시험: 두 창을 직접 한 스텝씩 진행하며 동기화·명령·효과·복구·경기 종료를 확인, 결과는 제목(NETLAB PASS n)
//   손실은 「재전송으로 늦게 도착」으로 흉내 (순서 보장 채널과 같음). 자동 시험은 일부러 메시지 하나를 버려 키프레임 복구도 확인
const NetLab = {
  q() { return new URLSearchParams(location.search); },
  page() { return this.q().has('netlab'); },
  childRole() { const r = this.q().get('net'); return r === 'host' || r === 'guest' ? r : null; },
  // ---------- 창 안(호스트·손님) ----------
  child() {
    const role = this.childRole(); if (!role || window.parent === window) return;
    if (this.q().has('rtc')) {   // 실제 WebRTC 시험: 연결은 바깥 페이지가 Rtc로 직접 진행
      Settings.netStun = false;   // 외부 서버 없이 같은 PC 안에서만
      window.LAB = { Net, Game, Cmd, Rtc, UI, Settings, Stats, V, CONFIG, document, advanceSim, loop };
      window.parent.postMessage({ lab: 'ready', role }, '*'); return;
    }
    const link = { send: s => window.parent.postMessage({ lab: 'net', from: role, s }, '*') };
    window.addEventListener('message', e => {
      const d = e.data || {};
      if (d.lab === 'net' && typeof d.s === 'string') Net.recv(d.s);
      if (d.lab === 'go' && role === 'host') Net.startHost(link, d.opts || {});
    });
    if (role === 'guest') { Net.startGuest(link); UI.show('<h2>손님</h2><div class="sub">호스트가 시작하기를 기다리는 중…</div>', {}, {}); }
    // const 전역은 window 속성이 아니므로 바깥 페이지가 쓸 수 있게 내보냄
    window.LAB = { Net, Game, Cmd, Combat, Renderer, Snap, Sfx, Stats, FX, Settings, CONFIG, V, document };
    this.link = link; window.parent.postMessage({ lab: 'ready', role }, '*');
  },
  // ---------- 바깥 페이지 ----------
  boot() {
    document.title = '온라인 대전 실험실';
    // 게임 화면용 CSS(스크롤 막힘)를 실험실에선 풀어 줌
    for (const el of [document.documentElement, document.body]) { el.style.overflow = 'auto'; el.style.height = 'auto'; }
    document.body.innerHTML = `<div style="font:13px ${FONT};color:#e6e9ef;background:#0d1016;min-height:100vh;padding:10px;box-sizing:border-box">
      <div style="display:flex;flex-wrap:wrap;gap:10px;align-items:center;margin-bottom:8px">
        <b>🧪 온라인 대전 실험실</b><span style="color:#8a93a6">개발용 · 두 창 사이를 가짜 네트워크로 연결</span>
        <label>지연 <input id="lab-lat" type="number" value="80" min="0" max="1000" style="width:60px">ms</label>
        <label>흔들림 <input id="lab-jit" type="number" value="30" min="0" max="500" style="width:55px">ms</label>
        <label>손실 <input id="lab-loss" type="number" value="2" min="0" max="50" style="width:45px">%</label>
        <label>손님 무기 <select id="lab-gw"><option value="dagger">단검</option><option value="dual">쌍검</option></select></label>
        <button id="lab-go" style="padding:4px 12px">▶ 대전 시작</button><span id="lab-stat" style="color:#9fd8ff"></span>
      </div>
      <div style="display:flex;flex-wrap:wrap;gap:8px">
        <div style="flex:1 1 420px"><div>호스트 (판정 계산)</div><iframe id="lab-h" style="width:100%;height:min(78vh, 46vw + 120px);border:1px solid #2a3140;background:#000"></iframe></div>
        <div style="flex:1 1 420px"><div>손님 (상태를 받아 그림 · 이 창을 클릭해서 조종)</div><iframe id="lab-g" style="width:100%;height:min(78vh, 46vw + 120px);border:1px solid #2a3140;background:#000"></iframe></div>
      </div></div>`;
    const base = location.pathname, $ = id => document.getElementById(id);
    this.fh = $('lab-h'); this.fg = $('lab-g'); this.last = { h: 0, g: 0 }; this.ready = {};
    window.addEventListener('message', e => {
      const d = e.data || {};
      if (d.lab === 'ready') { this.ready[d.role] = true; if (this.q().has('test') && this.ready.host && this.ready.guest) setTimeout(() => this.q().has('rtc') ? this.rtcTest() : this.autoTest(), 300); }
      if (d.lab === 'net') this.relay(d.from === 'host' ? 'g' : 'h', d.s);
    });
    $('lab-go').onclick = () => this.fh.contentWindow.postMessage({ lab: 'go', opts: { guestWeapon: $('lab-gw').value, map: 'basic', rounds: 3 } }, '*');
    setInterval(() => { try { const L = this.fh.contentWindow.LAB, S = L.Net.stats, t = Math.max(1, L.Game.time); $('lab-stat').textContent = `호스트 → 손님 ${(S.bytes / 1024 / t).toFixed(1)}KB/s · 키프레임 요청 ${S.keyReq}`; } catch (x) { /* 로딩 중 */ } }, 1000);
    const rtc = this.q().has('rtc') ? '&rtc=1' : '';
    this.fh.src = base + '?net=host&lab=1' + rtc; this.fg.src = base + '?net=guest&lab=1' + rtc;
  },
  // 가짜 네트워크: 지연 + 흔들림, 손실은 재전송 지연으로. 같은 방향은 순서 유지
  relay(to, s) {
    const v = id => +document.getElementById(id).value || 0, lat = v('lab-lat'), jit = v('lab-jit'), loss = v('lab-loss') / 100;
    let delay = lat + Math.random() * jit; if (Math.random() < loss) delay += lat * 2 + 100;
    const at = Math.max(performance.now() + delay, this.last[to] + 1); this.last[to] = at;
    const w = (to === 'g' ? this.fg : this.fh).contentWindow;
    setTimeout(() => w.postMessage({ lab: 'net', s }, '*'), at - performance.now());
  },
  // ---------- 실제 WebRTC 자동 시험 (?netlab&rtc&test) ----------
  //   사람이 하는 「코드 복사·붙여넣기」를 바깥 페이지가 대신 → 진짜 연결로 대전·명령·끊김 감지 확인 (STUN 끔: 외부 접속 없음)
  async rtcTest() {
    const H = this.fh.contentWindow.LAB, G = this.fg.contentWindow.LAB, res = [], ok = (n, c, info = '') => res.push({ n, c: !!c, info });
    // 숨겨진 창에선 setTimeout·화면 갱신이 느려지므로: 늦춰지지 않는 MessageChannel로 양보하고, 두 창의 계산을 직접 진행(advanceSim)
    const yieldNow = () => new Promise(r => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
    let hostPump = true, guestPump = true;   // 「숨겨진 호스트」 검사 중엔 끔(호스트는 손님 신호로만 진행해야 함)
    const pumpBoth = () => { try { if (hostPump && !H.Net.manual) H.advanceSim(performance.now()); if (guestPump && !G.Net.manual) G.advanceSim(performance.now()); } catch (e) { /* 로딩 중 */ } };
    const sleep = async ms => { const end = performance.now() + ms; while (performance.now() < end) { pumpBoth(); await yieldNow(); } }, err = [];
    for (const w of [this.fh.contentWindow, this.fg.contentWindow]) w.addEventListener('error', e => err.push(e.message));
    const fail = async (p, re) => { try { await p; return false; } catch (e) { return re.test(e.message) ? e.message : false; } };
    // 강한 절전(숨겨진 지 오래된 창: 타이머가 1분 간격까지 늦어짐) 여부 — 그러면 타이머에 기대는 검사는 건너뜀
    const throttled = await new Promise(r => { const t0 = performance.now(); setTimeout(() => r(performance.now() - t0 > 900), 50); });
    try {
      if (throttled) ok('(참고) 시험 창이 강한 절전 상태 — 타이머 의존 검사 일부 건너뜀', true);
      // 잘못된 코드 처리
      ok('엉뚱한 코드 거부', await fail(G.Rtc.join('안녕하세요'), /연결 코드가 아닙니다/));
      ok('잘린 코드 거부', await fail(G.Rtc.join('CT1.z!!!!'), /잘렸거나|읽을 수 없|올바르지/));
      const fake = await G.Rtc.pack({ t: 'offer', sdp: 'v=0', v: 'oldver00' });
      ok('버전이 다른 코드 거부', await fail(G.Rtc.join(fake), /버전/));
      // 연결: 호스트 초대 → 손님 응답 → 호스트 연결
      G.Settings.weapon = 'dual'; G.Settings.character = 'cathy'; G.Settings.gearOn = true; G.Settings.gearSets = { dual: Object.assign({}, CONFIG.gearPresets.dualS1.gear) };   // 손님 장비 전달 확인용
      const offer = await H.Rtc.host({ map: 'basic', rounds: 3, time: 'day', sphere: false, seed: 99 });
      ok('초대 코드 만들기', offer.startsWith('CT1.') && offer.length < 4000, offer.length + '자');
      ok('응답 코드 자리에 초대 코드를 넣으면 거부', await fail(H.Rtc.accept(offer), /응답 코드가 아닙니다/));
      const answer = await G.Rtc.join(offer);
      ok('응답 코드 만들기', answer.startsWith('CT1.') && answer !== offer, answer.length + '자');
      await H.Rtc.accept(answer);
      let w = 0; while (w++ < 100 && !(H.Rtc.state === 'open' && G.Rtc.state === 'open' && H.Net.role === 'host' && G.Game.modeId === 'pvp')) await sleep(100);
      ok('실제 연결 성공 → 대전 시작', H.Rtc.state === 'open' && G.Rtc.state === 'open' && H.Game.modeId === 'pvp' && G.Net.role === 'guest', `${H.Rtc.state}/${G.Rtc.state} ${(w / 10).toFixed(1)}초`);
      ok('손님 무기가 호스트에 전달', H.Game.mode && H.Game.mode.enemy && H.Game.mode.enemy.weapon === 'dual');
      ok('손님 장비가 호스트에 전달', H.Game.mode.enemy.gear && H.Game.mode.enemy.gear.weapon === 103505 && G.Game.player && G.Game.player.gear && G.Game.player.gear.weapon === 103505);
      G.Settings.gearOn = false;
      // 실제 시간으로 진행 (창이 숨겨져도 돌도록 직접 진행)
      H.Net.manual = G.Net.manual = true; const S = CONFIG.sim.step; let last = performance.now(), acc = 0, t0 = last, tick = 0;
      while (performance.now() - t0 < 8000) {
        const now = performance.now(); acc += Math.min(0.1, (now - last) / 1000); last = now; H.Net.fakeNow = G.Net.fakeNow = now;
        while (acc >= S) { acc -= S; tick++; if (H.Game.state === 'play') H.Game.step(S); }
        const gp = G.Game.player, ge = G.Game.units.find(u => u.kind === 'player' && u !== gp);
        if (G.Game.state === 'play' && gp && ge && !gp.dead) { if (tick % 50 < 2) G.Cmd.move({ x: ge.pos.x + 2.5, y: ge.pos.y }); if (tick % 140 < 2) G.Cmd.skill('Q', ge.pos); }
        G.Net.guestTick(1 / 60);
        await sleep(8);
      }
      const sec = H.Game.time;
      ok('손님 명령이 실제 연결로 호스트에 도착', H.Net.stats.cmds > 5, `${H.Net.stats.cmds}개`);
      ok('호스트 상태가 실제 연결로 손님에게 도착', G.Net.rx.got > 60 && G.Game.player && G.Game.player.team === 1, `${G.Net.rx.got}개`);
      ok('왕복 지연 측정', G.Net.rtt > 0 && G.Net.rtt < 500, Math.round(G.Net.rtt) + 'ms');
      ok('전송량 30KB/s 이하', H.Net.stats.bytes / 1024 / sec < 30, (H.Net.stats.bytes / 1024 / sec).toFixed(1) + 'KB/s');
      // 호스트 탭이 숨겨진 상황: 화면 갱신(requestAnimationFrame)을 멈춰도 손님 확인 메시지로 계산이 계속 진행되는지
      {
        const hw = this.fh.contentWindow, raf = hw.requestAnimationFrame; hw.requestAnimationFrame = () => 0;   // 호스트 화면 갱신 멈춤
        hostPump = false; H.Net.hidden = () => true; H.Net.manual = false; G.Net.manual = false; await sleep(100);
        const t1 = H.Game.time, r1 = performance.now();
        const g0 = performance.now(); while (performance.now() - g0 < 3000) { G.Net.fakeNow = performance.now(); G.Net.guestTick(1 / 60); await sleep(16); }
        const ran = H.Game.time - t1, real = (performance.now() - r1) / 1000;
        ok('호스트 탭이 숨겨져도 게임 진행', ran > real * 0.5 && G.Rtc.state === 'open', `실제 ${real.toFixed(1)}초 동안 게임 ${ran.toFixed(1)}초 (${Math.round(ran / real * 100)}%) — 시험 창이 숨겨지면 바깥 페이지도 멈춰 비율이 낮아질 수 있음, 멈춤(0%) 재발 검사`);
        H.Net.hidden = () => false; hw.requestAnimationFrame = raf; raf.call(hw, H.loop); hostPump = true;   // 원래대로
      }
      // 둘 다 창을 숨긴 것처럼(양쪽 계산·화면 멈춤) 7.5초 → 연결 유지 신호 덕에 끊김으로 오판하지 않음
      {
        const hw = this.fh.contentWindow, gw = this.fg.contentWindow, r1 = hw.requestAnimationFrame, r2 = gw.requestAnimationFrame;
        hw.requestAnimationFrame = gw.requestAnimationFrame = () => 0; hostPump = guestPump = false; H.Net.manual = G.Net.manual = true;
        await sleep(7500);
        ok('둘 다 멈춰도 연결 유지(1초 신호)', throttled || (H.Rtc.state === 'open' && G.Rtc.state === 'open'), throttled ? '건너뜀(강한 절전)' : `${H.Rtc.state}/${G.Rtc.state}`);
        hw.requestAnimationFrame = r1; gw.requestAnimationFrame = r2; r1.call(hw, H.loop); r2.call(gw, G.loop); hostPump = guestPump = true; H.Net.manual = G.Net.manual = false;
      }
      // 끊김: 손님이 창을 닫은 것처럼 → 호스트가 알아챔
      G.Rtc.close();
      w = 0; while (w++ < 90 && H.Rtc.state !== 'lost') await sleep(100);
      const card = H.document.querySelector('#card') ? H.document.querySelector('#card').innerText : '';
      ok('손님이 나가면 호스트가 알아챔', H.Rtc.state === 'lost' && /연결이 끊겼습니다/.test(card) && !H.Net.role, `${(w / 10).toFixed(1)}초 · ${card.slice(0, 20).split('\n').join(' ')}`);
      // 다시 연결(끊긴 뒤 새 방) → 이번엔 호스트가 메뉴로 나감 → 손님이 알아챔
      H.Net.manual = G.Net.manual = false;
      const offer2 = await H.Rtc.host({ map: 'jungle', rounds: 1, time: 'night', sphere: true }), answer2 = await G.Rtc.join(offer2); await H.Rtc.accept(answer2);
      w = 0; while (w++ < 100 && !(H.Rtc.state === 'open' && G.Rtc.state === 'open' && G.Game.modeId === 'pvp' && G.Net.rx && G.Net.rx.got > 0)) await sleep(100);
      ok('끊긴 뒤 다시 연결', H.Rtc.state === 'open' && G.Game.mapKey === 'jungle' && G.Net.rx.got > 0, `${(w / 10).toFixed(1)}초`);
      H.UI.showMenu();
      w = 0; while (w++ < 90 && G.Rtc.state !== 'lost') await sleep(100);
      const gcard = G.document.querySelector('#card') ? G.document.querySelector('#card').innerText : '';
      ok('호스트가 나가면 손님이 알아챔', G.Rtc.state === 'lost' && /연결이 끊겼습니다/.test(gcard) && /나갔습니다|끊겼습니다/.test(gcard), `${(w / 10).toFixed(1)}초`);
      ok('오류 없음', !err.length, err.slice(0, 3).join(' / '));
    } catch (x) { ok('예외 없이 실행', false, x.message + ' ' + (x.stack || '').split('\n')[1]); }
    const bad = res.filter(r => !r.c);
    document.title = bad.length ? `NETLAB RTC FAIL ${bad.length}/${res.length}` : `NETLAB RTC PASS ${res.length}`;
    window.__lab = res;
    const pre = document.createElement('pre'); pre.style.cssText = 'color:#e6e9ef;white-space:pre-wrap';
    pre.textContent = res.map(r => `${r.c ? '✔' : '✘'} ${r.n}${r.info ? ' (' + r.info + ')' : ''}`).join('\n'); document.body.prepend(pre);
  },
  // ---------- 자동 시험 ----------
  autoTest() {
    const H = this.fh.contentWindow.LAB, G = this.fg.contentWindow.LAB, res = [], ok = (n, c, info = '') => res.push({ n, c: !!c, info });
    const err = []; for (const w of [this.fh.contentWindow, this.fg.contentWindow]) w.addEventListener('error', e => err.push(e.message));
    try {
      H.Net.manual = G.Net.manual = true;
      const LAT = 12, q = []; let tick = 0, drop = false, gHit = 0, bot = true;   // 지연 12스텝(0.1초) + 0~4스텝 흔들림, 순서 유지
      const last = { h: 0, g: 0 }, link = to => ({ send: s => { const at = Math.max(tick + LAT + Math.floor(Math.random() * 5), last[to]); last[to] = at; q.push({ at, to, s }); } });
      // 호스트에서 실제로 울린 소리 기록 (손님 일이 호스트에서 울리면 안 됨)
      const hostSounds = {}, hp0 = H.Sfx.play; H.Sfx.play = function (n, pos) { hostSounds[n] = (hostSounds[n] || 0) + 1; return hp0.call(this, n, pos); };
      // 손님 캐릭터가 직접(틱 피해 아님) 맞은 횟수
      const dm0 = H.Combat.damage; H.Combat.damage = function (src, tgt, a, o = {}) { const r = dm0.apply(this, arguments); if (r > 0 && !o.tick && H.Game.mode && tgt === H.Game.mode.enemy) gHit++; return r; };
      G.Net.startGuest(link('h')); H.Net.startHost(link('g'), { guestWeapon: 'dual', hostWeapon: 'dagger', map: 'basic', rounds: 3, seed: 321 });
      const hist = new Map(), S = CONFIG.sim.step;
      const digest = (W, useTo) => W.Game.units.filter(u => u.kind !== 'ward').map(u => [u.id - W.Game.uid0, (useTo && u._to || u.pos).x, (useTo && u._to || u.pos).y, u.hp]);
      const close = (a, b) => a && b && a.length === b.length && a.every((r, i) => r[0] === b[i][0] && Math.abs(r[1] - b[i][1]) < 0.002 && Math.abs(r[2] - b[i][2]) < 0.002 && Math.abs(r[3] - b[i][3]) < 0.01);
      let synced = 0, checked = 0, maxRemoteCd = 0;
      const run = n => {
        for (let i = 0; i < n; i++) {
          tick++; H.Net.fakeNow += S * 1000; G.Net.fakeNow += S * 1000;   // 가짜 시계도 같이 진행
          q.sort((a, b) => a.at - b.at);
          while (q.length && q[0].at <= tick) {
            const m = q.shift();
            if (drop && m.to === 'g' && m.s.includes('"base"')) { drop = false; continue; }   // 델타 하나를 일부러 버림 → 키프레임 복구 확인
            (m.to === 'g' ? G : H).Net.recv(m.s);
          }
          // 손님 봇: 손님 Cmd로 입력 → 호스트로 전송
          const gp = G.Game.player, ge = G.Game.units.find(u => u.kind === 'player' && u !== gp);
          if (bot && G.Game.state === 'play' && gp && ge && !gp.dead) {
            if (tick % 50 === 0) G.Cmd.move({ x: ge.pos.x + 2.5, y: ge.pos.y + 0.5 });
            if (tick % 140 === 70) G.Cmd.skill(['Q', 'W', 'E'][(tick / 140 | 0) % 3], ge.pos);
            if (tick % 200 === 120) G.Cmd.attack(ge);
          }
          // 호스트 봇
          const hp = H.Game.player, he = H.Game.mode && H.Game.mode.enemy;
          if (bot && H.Game.state === 'play' && hp && he && !hp.dead && !he.dead) { if (tick % 60 === 0 && tick % 240 < 180) H.Cmd.move({ x: he.pos.x - 2.5, y: he.pos.y }); if (tick % 240 === 180) H.Cmd.attack(he); }
          if (H.Game.state === 'play') H.Game.step(S);
          if (he) maxRemoteCd = Math.max(maxRemoteCd, ...['Q', 'W', 'E'].map(k => he.skills[k].cd));
          hist.set(H.Game.tick, digest(H, false));
          G.Net.guestTick(S);
          if (tick % 30 === 0 && G.Net.rx && G.Net.rx.tree) { checked++; if (close(hist.get(G.Game.tick), digest(G, true))) synced++; }
          if (tick % 20 === 0) { G.Renderer.frame(); H.Renderer.frame(); }
        }
      };
      run(30); ok('손님이 판 정보를 받음', G.Game.modeId === 'pvp' && G.Net.rx.got > 0, `got ${G.Net.rx.got}`);
      ok('손님 시점: 내 캐릭터 = 팀 1 캐시', G.Game.player && G.Game.player.team === 1 && G.Game.player.weapon === 'dual');
      run(120 * 20);
      ok('손님 명령이 호스트에서 실행됨', H.Net.stats.cmds > 10 && maxRemoteCd > 0, `cmds ${H.Net.stats.cmds} rejected ${H.Net.stats.rejected}`);
      ok('손님 화면 = 호스트 상태(같은 시점 비교)', checked > 50 && synced / checked > 0.97, `${synced}/${checked}`);
      ok('효과 이벤트 전달', G.Net.stats.replayed > 20, `${G.Net.stats.replayed}`);
      ok('맞은 소리는 맞은 사람에게', gHit > 0 && (G.Net.stats.sounds.hurt || 0) > 0, `손님 피격 ${gHit}회 · 손님 소리 ` + JSON.stringify(G.Net.stats.sounds).slice(0, 120));
      ok('손님의 오류음은 호스트에서 안 울림', (G.Net.stats.sounds.error || 0) > 0 && !hostSounds.error, `손님 ${G.Net.stats.sounds.error || 0} / 호스트 ${hostSounds.error || 0}`);
      const kbps = H.Net.stats.bytes / 1024 / H.Game.time;
      ok('전송량 30KB/s 이하', kbps < 30, kbps.toFixed(1) + 'KB/s');
      // ---------- 3단계: 손님 이동 예측 ----------
      const waitPlay = () => { let w = 0; while (w++ < 3000 && !(H.Game.state === 'play' && H.Game.freeze <= 0 && !H.Game.mode.inter && !H.Game.player.dead && !H.Game.mode.enemy.dead)) run(5); };
      const runQuiet = n => { const b = bot; bot = false; run(n); bot = b; };
      bot = false; waitPlay(); runQuiet(60);
      const me = G.Game.player, srv0 = H.V.copy(me._to), tgt = { x: me._to.x + (me._to.x < 16 ? 5 : -5), y: me._to.y };
      G.Cmd.move(tgt); runQuiet(3);
      const early = G.V.dist(G.Game.player.pos, srv0), srvMoved = G.V.dist(G.Game.player._to, srv0);
      ok('예측: 누르자마자 내 캐릭터가 움직임(호스트 응답 전)', early > 0.05 && srvMoved < 1e-6, `화면 ${early.toFixed(3)}m · 호스트 ${srvMoved.toFixed(3)}m · RTT ${Math.round(G.Net.rtt)}ms`);
      runQuiet(60); G.Cmd.stop(); runQuiet(90);
      const pe = G.V.dist(G.Game.player.pos, G.Game.player._to);
      ok('예측: 멈추면 호스트 위치로 정확히 돌아옴', pe < 0.05, `오차 ${pe.toFixed(3)}m`);
      G.Settings.netPredict = false; G.Cmd.move({ x: tgt.x, y: tgt.y + 2 }); runQuiet(3);
      const off = G.V.dist(G.Game.player.pos, G.Game.player._to); G.Settings.netPredict = true; G.Cmd.stop(); runQuiet(60);
      ok('예측 끄기', off < 0.02, off.toFixed(3));
      // ---------- 3단계: 시점 색 (카메라) ----------
      G.Cmd.camera({ x: G.Game.player._to.x + 2, y: G.Game.player._to.y }); runQuiet(LAT * 2 + 12);
      const hw = H.Game.units.find(u => u.kind === 'ward'), gw = G.Game.units.find(u => u.kind === 'ward');
      const camName = H.CONFIG.vision.camera.name, gtxt = G.FX.texts.find(t => t.str === camName);
      ok('시점 색: 손님 카메라는 손님에게 파랑·호스트에게 빨강', hw && gw && hw.color === '#ff8a8a' && gw.color === '#7fd1ff' && (!gtxt || gtxt.color === '#7fd1ff'), `${hw && hw.color} / ${gw && gw.color} / 글자 ${gtxt && gtxt.color}`);
      bot = true;
      // 빠진 델타 → 키프레임 복구
      const req0 = G.Net.stats.keyReq; drop = true; run(120 * 3);
      ok('델타가 빠지면 키프레임을 요청해 복구', G.Net.stats.keyReq > req0 && H.Net.stats.keyReq > 0 && close(hist.get(G.Game.tick), digest(G, true)), `req ${G.Net.stats.keyReq}`);
      // 잘못된 명령은 거부
      const rj0 = H.Net.stats.rejected; G.Net.send({ t: 'c', c: { t: 'sk', s: 'Z', x: 1, y: 1 } }); G.Net.send({ t: 'c', c: { t: 'move', x: 'a', y: NaN } }); run(LAT + 8);
      ok('잘못된 명령 거부', H.Net.stats.rejected === rj0 + 2);
      // 경기 종료: 손님 캐릭터를 두 번 쓰러뜨림 → 손님 화면에 패배
      for (let r = 0; r < 2 && H.Game.state === 'play'; r++) {
        let w = 0; while (H.Game.freeze > 0 && w++ < 2000) run(10);
        const e = H.Game.mode.enemy; H.Combat.damage(H.Game.player, e, 1e6, { type: 'true' }); run(30);
        w = 0; while (H.Game.mode.inter && w++ < 2000) run(10);
      }
      run(LAT + 30);
      const gc = G.Stats.totalCasts(), hc = H.Stats.totalCasts(), card = G.document.querySelector('#card') ? G.document.querySelector('#card').innerText : '';
      ok('손님 통계 도착(손님 캐릭터 기록)', G.Net.gotStats && gc.c > 0 && G.Stats.t > 5, `손님 스킬 ${gc.c}회 · ${G.Stats.t.toFixed(0)}초`);
      ok('호스트 통계에 손님 기록이 안 섞임', hc.c === 0 && H.Game.mode.rs.totalCasts().c === gc.c, `호스트 ${hc.c} / 손님용 ${H.Game.mode.rs.totalCasts().c}`);
      ok('손님 종료 화면: 라운드 요약·코칭', /라운드 요약/.test(card) && /코칭/.test(card), card.slice(0, 60).split('\n').join(' '));
      ok('경기 종료가 손님에게 전달', H.Game.state === 'result' && G.Game.state === 'result' && /패배/.test(G.document.querySelector('#card') ? G.document.querySelector('#card').innerText : ''), `host ${H.Game.state} guest ${G.Game.state}`);
      // 5단계: 양쪽 지연 측정·연결 품질 표시, 손님 재대결 요청 → 호스트 결과 화면에 알림
      ok('호스트도 지연 측정', H.Net.rtt > 0 && G.Net.rtt > 0 && /ms/.test(H.Net.quality().text), `호스트 ${Math.round(H.Net.rtt)}ms · 손님 ${Math.round(G.Net.rtt)}ms`);
      const rb = G.document.querySelector('[data-a="rematch"]'); if (rb) rb.click(); run(LAT * 2 + 10);
      const hcard = H.document.querySelector('#card') ? H.document.querySelector('#card').innerText : '';
      ok('재대결 요청 → 호스트에 알림', !!rb && rb.disabled && H.Net.stats.rematch === 1 && /재대결/.test(hcard));
      // 호스트 「다시 하기」 → 손님도 새 판
      H.Game.restart(); run(LAT + 30);
      ok('다시 하기 → 손님도 새 판', G.Game.state === 'play' && G.Game.mode.round === 1 && G.Game.player && G.Game.player.team === 1);
      ok('오류 없음', !err.length, err.slice(0, 3).join(' / '));
    } catch (x) { ok('예외 없이 실행', false, x.message + ' ' + (x.stack || '').split('\n')[1]); }
    const fail = res.filter(r => !r.c);
    document.title = fail.length ? `NETLAB FAIL ${fail.length}/${res.length}` : `NETLAB PASS ${res.length}`;
    window.__lab = res;
    const pre = document.createElement('pre'); pre.style.cssText = 'color:#e6e9ef;white-space:pre-wrap';
    pre.textContent = res.map(r => `${r.c ? '✔' : '✘'} ${r.n}${r.info ? ' (' + r.info + ')' : ''}`).join('\n'); document.body.prepend(pre);
  },
};
