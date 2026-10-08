
// ============================== 온라인 연결 (WebRTC · 연결 코드 복사·붙여넣기) ==============================
// 서버 없이 브라우저끼리 직접 연결 (docs/online_duel_plan.md 4단계)
//   ① 호스트: 초대 코드 만들기 → 메신저로 친구에게  ② 손님: 초대 코드 붙여넣기 → 응답 코드 만들기 → 호스트에게
//   ③ 호스트: 응답 코드 붙여넣기 → 연결 → 손님이 무기·버전을 보내면 대전 시작 (그다음은 Net이 담당)
// 코드 = 「CT1.」 + 압축(deflate) + base64url. 안에는 접속 정보(IP 주소 포함)가 들어 있음 → 믿을 수 있는 상대에게만
// 공개 STUN(설정에서 끄기 가능): 공유기 너머 상대를 찾는 데 필요. 끄면 같은 네트워크(같은 와이파이·같은 PC)에서만 연결됨
// 게임 데이터는 STUN을 거치지 않고 두 브라우저 사이로만 오감
const Rtc = {
  STUN: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'],
  PREFIX: 'CT1.',
  GATHER_MS: 5000,      // 접속 정보 모으기 최대 시간
  LOST_MS: 6000,        // 이 시간 동안 아무 메시지가 없으면 끊긴 것으로 봄
  BACKLOG: 512 * 1024,  // 보내기 대기열이 이보다 크면 델타를 건너뜀(→ 손님이 키프레임 요청)
  pc: null, dc: null, role: null, state: 'idle', lastRx: 0,
  ok() { return typeof RTCPeerConnection !== 'undefined'; },
  config() { return { iceServers: Settings.netStun === false ? [] : [{ urls: this.STUN }] }; },
  // ---------- 코드 ----------
  async pack(obj) {
    const raw = new TextEncoder().encode(JSON.stringify(obj));
    let bytes = raw, mode = 'j';
    if (typeof CompressionStream !== 'undefined') {
      try { bytes = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer()); mode = 'z'; } catch (e) { bytes = raw; mode = 'j'; }
    }
    let s = ''; for (let i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
    return this.PREFIX + mode + btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  async unpack(code) {
    code = String(code || '').replace(/\s+/g, '');
    if (!code.startsWith(this.PREFIX)) throw new Error('캐시 수련장 연결 코드가 아닙니다');
    const mode = code[this.PREFIX.length], b64 = code.slice(this.PREFIX.length + 1).replace(/-/g, '+').replace(/_/g, '/');
    let bin; try { bin = atob(b64 + '==='.slice((b64.length + 3) % 4)); } catch (e) { throw new Error('코드가 잘렸거나 잘못 복사되었습니다'); }
    let bytes = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    if (mode === 'z') {
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 코드를 읽을 수 없습니다 — 최신 브라우저를 쓰세요');
      try { bytes = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer()); } catch (e) { throw new Error('코드가 잘렸거나 잘못 복사되었습니다'); }
    } else if (mode !== 'j') throw new Error('알 수 없는 코드 형식');
    let o; try { o = JSON.parse(new TextDecoder().decode(bytes)); } catch (e) { throw new Error('코드를 읽을 수 없습니다'); }
    if (!o || (o.t !== 'offer' && o.t !== 'answer') || typeof o.sdp !== 'string') throw new Error('코드 내용이 올바르지 않습니다');
    return o;
  },
  // 접속 정보(ICE 후보)를 다 모을 때까지 기다림 — 코드를 한 번만 주고받으므로
  gather(pc) {
    return new Promise(res => {
      if (pc.iceGatheringState === 'complete') return res();
      const t = setTimeout(res, this.GATHER_MS);
      pc.addEventListener('icegatheringstatechange', () => { if (pc.iceGatheringState === 'complete') { clearTimeout(t); res(); } });
    });
  },
  // ---------- 호스트 ----------
  async host(opts = {}) {
    if (!this.ok()) throw new Error('이 브라우저는 WebRTC를 지원하지 않습니다');
    this.close(); this.role = 'host'; this.state = 'offer'; this.opts = opts;
    const pc = this.pc = new RTCPeerConnection(this.config());
    this.wire(pc); this.useChannel(pc.createDataChannel('game', { ordered: true }));
    await pc.setLocalDescription(await pc.createOffer()); await this.gather(pc);
    return this.pack({ t: 'offer', sdp: pc.localDescription.sdp, v: BUILD_ID });
  },
  async accept(code) {
    const o = await this.unpack(code);
    if (o.t !== 'answer') throw new Error('응답 코드가 아닙니다 (초대 코드를 붙여넣었나요?)');
    if (!this.pc || this.role !== 'host') throw new Error('먼저 초대 코드를 만드세요');
    if (o.v !== BUILD_ID) throw new Error(`상대의 게임 버전이 다릅니다 (상대 ${o.v} / 나 ${BUILD_ID}) — 둘 다 새로고침 후 다시`);
    this.state = 'connecting'; await this.pc.setRemoteDescription({ type: 'answer', sdp: o.sdp });
  },
  // ---------- 손님 ----------
  async join(code) {
    if (!this.ok()) throw new Error('이 브라우저는 WebRTC를 지원하지 않습니다');
    const o = await this.unpack(code);
    if (o.t !== 'offer') throw new Error('초대 코드가 아닙니다 (응답 코드를 붙여넣었나요?)');
    if (o.v !== BUILD_ID) throw new Error(`호스트의 게임 버전이 다릅니다 (호스트 ${o.v} / 나 ${BUILD_ID}) — 둘 다 새로고침 후 다시`);
    this.close(); this.role = 'guest'; this.state = 'answer';
    const pc = this.pc = new RTCPeerConnection(this.config());
    this.wire(pc); pc.ondatachannel = e => this.useChannel(e.channel);
    await pc.setRemoteDescription({ type: 'offer', sdp: o.sdp });
    await pc.setLocalDescription(await pc.createAnswer()); await this.gather(pc);
    this.state = 'connecting';
    return this.pack({ t: 'answer', sdp: pc.localDescription.sdp, v: BUILD_ID });
  },
  // ---------- 연결 상태 ----------
  wire(pc) {
    pc.onconnectionstatechange = () => { if (pc === this.pc && (pc.connectionState === 'failed' || pc.connectionState === 'closed')) this.lost(pc.connectionState === 'failed' ? '연결 실패 — 공유기·방화벽 때문일 수 있습니다' : '연결 종료'); };
  },
  useChannel(dc) {
    this.dc = dc;
    dc.onopen = () => { this.state = 'open'; this.lastRx = performance.now(); this.onOpen(); };
    dc.onclose = () => { if (dc === this.dc) this.lost('상대와 연결이 끊겼습니다'); };
    dc.onmessage = e => { this.lastRx = performance.now(); this.onMessage(e.data); };
  },
  // 게임에 넘기는 전송 수단: 대기열이 넘치면 델타는 버림(false) → Net이 키프레임으로 복구
  link() {
    return { send: s => { const dc = this.dc; if (!dc || dc.readyState !== 'open') return false; if (dc.bufferedAmount > this.BACKLOG && s.startsWith('{"t":"s"') && !s.includes('"key"')) return false; dc.send(s); return true; } };
  },
  onOpen() {
    // 손님: 버전·무기 알림 → 호스트가 대전 시작
    if (this.role === 'guest') { Net.startGuest(this.link()); this.dc.send(JSON.stringify({ t: 'join', v: BUILD_ID, weapon: Settings.weapon === 'dual' ? 'dual' : 'dagger', gear: Builds.current() })); }
    this.watch();
    this.onStatus('open');
  },
  onMessage(s) {
    if (this.role === 'host' && Net.role !== 'host') {   // 시작 전: 손님의 참가 메시지
      let m; try { m = JSON.parse(s); } catch (e) { return; }
      if (m.t !== 'join') return;
      if (m.v !== BUILD_ID) { this.lost('상대의 게임 버전이 다릅니다'); return; }
      const gw = m.weapon === 'dual' ? 'dual' : 'dagger', gg = m.gear ? Builds.clean(m.gear, gw) : null;   // 손님 장비는 검사 후
      Net.startHost(this.link(), Object.assign({}, this.opts, { guestWeapon: gw, guestGear: Builds.any(gg) ? gg : null, gear: Builds.current() }));
      this.onStatus('started');
      return;
    }
    Net.recv(s);
  },
  // 아무 메시지도 안 오면 끊긴 것으로 (손님은 0.05초마다 상태, 호스트는 1초마다 핑을 받음)
  watch() {
    clearInterval(this.watchT);
    // 1초마다: 무응답 검사 + 연결 유지 신호(ka). 둘 다 탭을 숨겨도 1초 간격 타이머는 돌므로 끊김으로 오판하지 않고, 숨겨진 호스트도 최소 1초마다 계산을 따라잡음
    this.lastWatch = performance.now();
    this.watchT = setInterval(() => {
      if (this.state !== 'open') return;
      // 내 타이머가 크게 늦어졌으면(창이 오래 숨겨져 브라우저가 절전) 이번엔 판정 보류 — 진짜 끊김은 채널 닫힘·연결 실패 이벤트로 잡힘
      const now = performance.now(), late = now - this.lastWatch > 2500; this.lastWatch = now;
      if (!late && now - this.lastRx > this.LOST_MS) { this.lost('응답이 없습니다 — 연결이 끊긴 것 같습니다'); return; }
      try { if (this.dc && this.dc.readyState === 'open') this.dc.send('{"t":"ka"}'); } catch (e) { /* 닫히는 중 */ }
    }, 1000);
  },
  // 기본 동작: 화면 안내 (어디서 연결을 시작했든 항상)
  onStatus(s) { if (s === 'open' && typeof UI !== 'undefined') UI.netStatus('연결됨! 대전을 시작합니다…'); },
  onLost(why) { if (typeof UI !== 'undefined') UI.showNetLost(why); },
  lost(why) {
    if (this.state === 'lost' || this.state === 'idle') return;
    const was = this.state; this.state = 'lost'; clearInterval(this.watchT);
    if (was !== 'offer') this.onLost(why);
  },
  close() {
    clearInterval(this.watchT); this.state = 'idle';
    try { if (this.dc) this.dc.close(); } catch (e) { /* 이미 닫힘 */ }
    try { if (this.pc) this.pc.close(); } catch (e) { /* 이미 닫힘 */ }
    this.dc = null; this.pc = null; this.role = null;
  },
};
