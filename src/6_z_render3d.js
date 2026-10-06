
// ============================== 3D 렌더 (Three.js r128) ==============================
// 「세미 이터널 리턴」 표현: 쿼터뷰 추적 카메라, 햇빛·그림자, 콘크리트 벽·화단·유리 벽, 수풀 부쉬, 로우폴리 인형 캐릭터
// 원칙: 게임 로직은 그대로(월드 좌표 x,y → 3D (x, 높이, y)). 예고 범위·이펙트·상태 표시·안개는 2D 그리기 코드를 바닥 텍스처(데칼)에 그려 재사용
// 실패(라이브러리 없음·WebGL 불가) 시 Renderer가 2D로 되돌림
const Render3D = {
  ready: false, TEX_PPM: 40,
  init() {
    if (!window.THREE) throw new Error('Three.js를 불러오지 못했습니다');
    const T3 = THREE;
    this.cv = document.getElementById('game3d');
    this.gl = new T3.WebGLRenderer({ canvas: this.cv, antialias: true, powerPreference: 'high-performance' });
    this.gl.shadowMap.enabled = true; this.gl.shadowMap.type = T3.PCFSoftShadowMap;
    this.gl.outputEncoding = T3.sRGBEncoding; this.gl.toneMapping = T3.ACESFilmicToneMapping; this.gl.toneMappingExposure = 0.95;
    this.scene = new T3.Scene(); this.scene.background = new T3.Color('#1a2130');
    this.camera = new T3.PerspectiveCamera(38, 1, 0.5, 200);
    this.zoom = 22; this.camTarget = new T3.Vector3(16, 0, 9); this.ray = new T3.Raycaster(); this.groundPlane = new T3.Plane(new T3.Vector3(0, 1, 0), 0);
    // 조명: 하늘·땅 반사광 + 비스듬한 햇빛(그림자)
    this.hemi = new T3.HemisphereLight('#cfe3ff', '#5a5040', 0.6); this.scene.add(this.hemi);
    this.sun = new T3.DirectionalLight('#fff1d6', 1.0); this.sun.position.set(6, 22, 4); this.sun.castShadow = true;
    const sc = this.sun.shadow.camera; sc.left = -22; sc.right = 22; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 60;
    this.sun.shadow.mapSize.set(2048, 2048); this.sun.shadow.bias = -0.0008; this.sun.shadow.radius = 3;
    this.scene.add(this.sun); this.scene.add(this.sun.target);
    // 바닥 데칼(2D 그리기 재사용)
    this.decalCv = document.createElement('canvas'); this.decalCtx = this.decalCv.getContext('2d');
    this.mapGroup = new T3.Group(); this.scene.add(this.mapGroup);
    this.unitMeshes = new Map(); this.projMeshes = new Map();
    this.mats = {};
    this.mapKey = null; this.resize(); this.ready = true;
    Models.load();
  },
  // ---------- 좌표 ----------
  resize() {
    const W = innerWidth, H = innerHeight;
    this.gl.setPixelRatio(Math.min(2, window.devicePixelRatio || 1)); this.gl.setSize(W, H, false);
    this.camera.aspect = W / Math.max(1, H); this.camera.updateProjectionMatrix();
    this.W = W; this.H = H;
  },
  toWorld(sx, sy) {
    const T3 = THREE, ndc = new T3.Vector2(sx / Math.max(1, this.W) * 2 - 1, -(sy / Math.max(1, this.H)) * 2 + 1);
    this.ray.setFromCamera(ndc, this.camera); const hit = new T3.Vector3();
    if (!this.ray.ray.intersectPlane(this.groundPlane, hit)) return { x: this.camTarget.x, y: this.camTarget.z };
    return { x: hit.x, y: hit.z };
  },
  toScreen(p, h = 0) { const v = new THREE.Vector3(p.x, h, p.y).project(this.camera); return { x: (v.x + 1) / 2 * this.W, y: (1 - v.y) / 2 * this.H }; },
  pxPerMeter(p) { const a = this.toScreen(p), b = this.toScreen({ x: p.x + 1, y: p.y }); return Math.max(4, Math.hypot(b.x - a.x, b.y - a.y)); },
  overhead(u) { const head = this.toScreen(u.pos, this.unitHeight(u) + 0.25), foot = this.toScreen(u.pos); return { x: head.x, top: head.y - 10, bottom: foot.y + 14 }; },
  inputCanvas() { return Render.cv; },
  unitHeight(u) { return u.kind === 'animal' ? 0.8 : u.kind === 'ward' ? 0.6 : u.kind === 'dummy' ? 1.7 : 1.75; },
  // ---------- 재질 ----------
  mat(key, make) { return this.mats[key] || (this.mats[key] = make()); },
  std(color, o = {}) { const m = new THREE.MeshStandardMaterial(Object.assign({ roughness: 0.85, metalness: 0.02 }, o)); m.color.set(color).convertSRGBToLinear(); return m; },   // 색은 sRGB → 선형
  // ---------- 맵 ----------
  groundTexture(key) {
    const c = document.createElement('canvas'), W = CONFIG.world.w, H = CONFIG.world.h, P = 32; c.width = W * P; c.height = H * P;
    const g = c.getContext('2d'), jungle = key === 'jungle';
    g.fillStyle = jungle ? '#4d6b3c' : '#4a4f57'; g.fillRect(0, 0, c.width, c.height);
    // 보도블록 / 잔디 결
    for (let i = 0; i < W * H * 3; i++) { const x = Math.random() * c.width, y = Math.random() * c.height; g.fillStyle = jungle ? `rgba(${70 + Math.random() * 40},${100 + Math.random() * 50},${50 + Math.random() * 30},.35)` : `rgba(255,255,255,${Math.random() * 0.05})`; g.fillRect(x, y, jungle ? 3 : 6, jungle ? 6 : 6); }
    if (!jungle) {   // 기본 아레나: 보도블록 줄눈 + 가운데 도로
      g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = 2;
      for (let x = 0; x <= W; x += 2) { g.beginPath(); g.moveTo(x * P, 0); g.lineTo(x * P, c.height); g.stroke(); }
      for (let y = 0; y <= H; y += 2) { g.beginPath(); g.moveTo(0, y * P); g.lineTo(c.width, y * P); g.stroke(); }
      g.fillStyle = '#383c42'; g.fillRect(0, 7 * P, c.width, 4 * P);
      g.strokeStyle = 'rgba(255,214,90,.7)'; g.lineWidth = 4; g.setLineDash([40, 30]); g.beginPath(); g.moveTo(0, 9 * P); g.lineTo(c.width, 9 * P); g.stroke(); g.setLineDash([]);
    } else {         // 숲길: 흙길
      g.fillStyle = 'rgba(120,95,60,.55)'; g.fillRect(0, 7.6 * P, c.width, 2.8 * P); g.fillRect(12 * P, 0, 1.8 * P, c.height);
    }
    const t = new THREE.CanvasTexture(c); t.encoding = THREE.sRGBEncoding; t.anisotropy = 4; return t;
  },
  buildMap() {
    const T3 = THREE, G = this.mapGroup, W = CONFIG.world.w, H = CONFIG.world.h;
    while (G.children.length) { const o = G.children.pop(); o.traverse(m => { if (m.geometry) m.geometry.dispose(); if (m.material) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } }); }
    this.bushMeshes = [];
    // 바닥
    const ground = new T3.Mesh(new T3.PlaneGeometry(W, H), this.std('#ffffff', { map: this.groundTexture(Game.mapKey) }));
    ground.rotation.x = -Math.PI / 2; ground.position.set(W / 2, 0, H / 2); ground.receiveShadow = true; G.add(ground);
    // 아레나 바깥 (어두운 바닥) + 경계 연석
    const out = new T3.Mesh(new T3.PlaneGeometry(W + 60, H + 60), this.std('#1d232e')); out.rotation.x = -Math.PI / 2; out.position.set(W / 2, -0.02, H / 2); G.add(out);
    const curbM = this.std('#7d838d');
    for (const [x, z, w, d] of [[W / 2, -0.15, W + 0.6, 0.3], [W / 2, H + 0.15, W + 0.6, 0.3], [-0.15, H / 2, 0.3, H], [W + 0.15, H / 2, 0.3, H]]) { const m = new T3.Mesh(new T3.BoxGeometry(w, 0.25, d), curbM); m.position.set(x, 0.12, z); m.castShadow = m.receiveShadow = true; G.add(m); }
    // 벽: 높은 벽(콘크리트) · 낮은 턱(화단) · 창문 벽(유리)
    const concrete = this.std('#8d939c'), concreteTop = this.std('#b4b9bf'), planter = this.std('#7f7a70'), hedge = this.std('#4f7d3f'), frame = this.std('#3c4452', { roughness: 0.5, metalness: 0.4 });
    const glass = this.std('#9fd3ff', { transparent: true, opacity: 0.3, roughness: 0.05, metalness: 0.1, depthWrite: false });
    for (const w of CONFIG.walls) {
      const cx = w.x + w.w / 2, cz = w.y + w.h / 2;
      if (w.kind === 'low') {
        const b = new T3.Mesh(new T3.BoxGeometry(w.w, 0.45, w.h), planter); b.position.set(cx, 0.225, cz); b.castShadow = b.receiveShadow = true; G.add(b);
        const h = new T3.Mesh(new T3.BoxGeometry(Math.max(0.1, w.w - 0.12), 0.25, Math.max(0.1, w.h - 0.12)), hedge); h.position.set(cx, 0.55, cz); h.castShadow = true; G.add(h);
      } else if (w.kind === 'glass') {
        const hgt = 2.0, base = new T3.Mesh(new T3.BoxGeometry(w.w, 0.3, w.h), frame); base.position.set(cx, 0.15, cz); base.castShadow = true; G.add(base);
        const top = new T3.Mesh(new T3.BoxGeometry(w.w, 0.15, w.h), frame); top.position.set(cx, hgt, cz); G.add(top);
        const pane = new T3.Mesh(new T3.BoxGeometry(Math.max(0.06, w.w * 0.4), hgt - 0.3, Math.max(0.06, w.h * 0.4)), glass); pane.position.set(cx, 0.3 + (hgt - 0.3) / 2, cz); pane.renderOrder = 2; G.add(pane);
        const L = Math.max(w.w, w.h), hz = w.w > w.h;   // 창틀 기둥
        for (let t = 0; t <= L + 0.01; t += Math.max(1, L / Math.round(L / 1.2))) { const post = new T3.Mesh(new T3.BoxGeometry(hz ? 0.1 : w.w, hgt, hz ? w.h : 0.1), frame); post.position.set(hz ? w.x + t : cx, hgt / 2, hz ? cz : w.y + t); post.castShadow = true; G.add(post); }
      } else {
        const hgt = 2.0, b = new T3.Mesh(new T3.BoxGeometry(w.w, hgt, w.h), concrete); b.position.set(cx, hgt / 2, cz); b.castShadow = b.receiveShadow = true; G.add(b);
        const cap = new T3.Mesh(new T3.BoxGeometry(w.w + 0.08, 0.1, w.h + 0.08), concreteTop); cap.position.set(cx, hgt + 0.05, cz); cap.castShadow = true; G.add(cap);
      }
    }
    // 부쉬: 잎 덩어리(로우폴리 구) 무리
    const leafGeo = new T3.IcosahedronGeometry(1, 0), leafCols = ['#3f7a3a', '#4b8a40', '#367034', '#5a9a48'];
    (CONFIG.bushes || []).forEach(b => {
      const grp = new T3.Group(), n = Math.max(6, Math.round(b.w * b.h * 2.4)), mats = leafCols.map(c => this.std(c, { transparent: true, opacity: 1, flatShading: true }));
      for (let i = 0; i < n; i++) {
        const r = 0.32 + ((i * 0.618) % 1) * 0.22, m = new T3.Mesh(leafGeo, mats[i % mats.length]);
        m.scale.set(r, r * 0.9, r); m.position.set(b.x + 0.25 + ((i * 0.618034) % 1) * (b.w - 0.5), r * 0.75 + ((i * 0.31) % 1) * 0.25, b.y + 0.25 + ((i * 0.381966 * 1.7) % 1) * (b.h - 0.5));
        m.rotation.set(i, i * 2, 0); m.castShadow = true; grp.add(m);
      }
      grp.userData = { mats, base: grp.children.map(c => c.rotation.y) }; G.add(grp); this.bushMeshes.push(grp);
    });
    this.mapKey = Game.mapKey; this.wallRef = CONFIG.walls;
  },
  // ---------- 유닛 (로우폴리 인형) ----------
  weaponMesh(u) {
    const T3 = THREE, g = new T3.Group(), metal = this.std('#d7dbe2', { roughness: 0.3, metalness: 0.7, transparent: true }), dark = this.std('#2a2f38', { roughness: 0.5, transparent: true });   // 유닛별 재질(투명도 독립)
    const wpn = u.kind === 'player' ? (u.charKey === 'daniel' ? 'scissor' : u.weapon) : (u.motif ? u.motif.weapon : null);
    const box = (w, h, d, m, x, y, z) => { const b = new T3.Mesh(new T3.BoxGeometry(w, h, d), m); b.position.set(x, y, z); b.castShadow = true; g.add(b); return b; };
    if (wpn === 'dagger') box(0.42, 0.05, 0.09, metal, 0.42, 0, 0);
    else if (wpn === 'dual') { box(0.5, 0.05, 0.08, metal, 0.42, 0, 0.12); box(0.5, 0.05, 0.08, metal, 0.42, 0, -0.12); }
    else if (wpn === 'scissor') { const a = box(0.55, 0.04, 0.07, metal, 0.4, 0, 0.04); a.rotation.y = 0.18; const b = box(0.55, 0.04, 0.07, metal, 0.4, 0, -0.04); b.rotation.y = -0.18; }
    else if (wpn === '권총') box(0.32, 0.12, 0.08, dark, 0.32, 0.02, 0);
    else if (wpn === '저격총') { box(1.1, 0.08, 0.08, dark, 0.5, 0, 0); box(0.25, 0.1, 0.1, metal, 0.35, 0.09, 0); }
    else if (wpn === '석궁') { box(0.6, 0.08, 0.08, dark, 0.35, 0, 0); box(0.08, 0.05, 0.7, dark, 0.55, 0, 0); }
    else if (wpn === '활') { const arc = new T3.Mesh(new T3.TorusGeometry(0.4, 0.03, 4, 12, Math.PI), this.std('#8a5a33', { transparent: true })); arc.rotation.set(Math.PI / 2, 0, -Math.PI / 2); arc.position.set(0.35, 0, 0); g.add(arc); }
    return g;
  },
  makeUnit(u) {
    const T3 = THREE, root = new T3.Group(), body = new T3.Group(); root.add(body);
    const col = new T3.Color(u.color || '#888'), mats = [];
    const M = (c, o) => { const m = this.std(c, Object.assign({ transparent: true }, o)); mats.push(m); return m; };
    const add = (geo, m, x, y, z, parent = body) => { const o = new T3.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; parent.add(o); return o; };
    if (u.kind === 'animal') {   // 늑대
      const fur = M('#7a5f46'); add(new T3.BoxGeometry(0.85, 0.42, 0.42), fur, 0, 0.5, 0); const head = add(new T3.BoxGeometry(0.34, 0.3, 0.3), fur, 0.5, 0.68, 0);
      add(new T3.ConeGeometry(0.07, 0.16, 4), fur, 0.48, 0.9, 0.08); add(new T3.ConeGeometry(0.07, 0.16, 4), fur, 0.48, 0.9, -0.08);
      add(new T3.BoxGeometry(0.16, 0.12, 0.16), M('#4b3a2c'), 0.7, 0.62, 0);
      for (const [x, z] of [[0.3, 0.14], [0.3, -0.14], [-0.3, 0.14], [-0.3, -0.14]]) add(new T3.BoxGeometry(0.1, 0.32, 0.1), fur, x, 0.16, z);
      add(new T3.BoxGeometry(0.4, 0.08, 0.08), fur, -0.58, 0.62, 0).rotation.z = 0.5; head.userData.head = true;
    } else if (u.kind === 'dummy') {   // 허수아비: 나무 기둥 + 가로대 + 자루 머리
      const wood = M('#8a6a45'), sack = M('#c8b48a'); add(new T3.CylinderGeometry(0.08, 0.1, 1.5, 6), wood, 0, 0.75, 0); add(new T3.BoxGeometry(0.08, 0.08, 1.1), wood, 0, 1.2, 0);
      add(new T3.CylinderGeometry(0.3, 0.36, 0.7, 7), sack, 0, 1.0, 0); add(new T3.SphereGeometry(0.24, 8, 6), sack, 0, 1.55, 0);
    } else if (u.kind === 'ward') {    // 망원 카메라 삼각대
      const leg = M('#3a3f48'); for (let i = 0; i < 3; i++) { const l = add(new T3.CylinderGeometry(0.02, 0.02, 0.6, 4), leg, Math.cos(i * 2.09) * 0.12, 0.28, Math.sin(i * 2.09) * 0.12); l.rotation.set(Math.sin(i * 2.09) * 0.35, 0, -Math.cos(i * 2.09) * 0.35); }
      add(new T3.BoxGeometry(0.28, 0.18, 0.2), M(u.color), 0, 0.62, 0); add(new T3.CylinderGeometry(0.06, 0.06, 0.12, 8), M('#20242c'), 0.18, 0.62, 0).rotation.z = Math.PI / 2;
    } else if (Models.available(u)) {    // CC0 인물 모델 + 무기 (6_y_models.js)
      const rig = Models.create(u, null, mats);
      if (rig) { body.add(rig.root); body.userData.rig = rig; rig.obj.traverse(o => { if (o.material && !mats.includes(o.material)) mats.push(o.material); }); }
    } else {                            // 실험체 인형: 다리·몸통·팔·머리·머리카락 + 무기
      const r = u.r || 0.5, cloth = M(col.getStyle()), dark = M(col.clone().multiplyScalar(0.55).getStyle()), skin = M('#f2d3bd'), hair = M(u.charKey === 'daniel' || (u.motif && u.motif.name === '다니엘') ? '#3b2a4f' : u.kind === 'player' ? '#2b1b16' : col.clone().multiplyScalar(0.4).getStyle());
      for (const z of [0.13, -0.13]) add(new T3.CylinderGeometry(0.1, 0.09, 0.55, 6), dark, 0, 0.28, z);
      add(new T3.CylinderGeometry(r * 0.5, r * 0.62, 0.62, 8), cloth, 0, 0.84, 0);
      add(new T3.SphereGeometry(r * 0.52, 8, 6), cloth, 0, 1.12, 0).scale.set(1, 0.45, 1);
      const armL = add(new T3.CylinderGeometry(0.07, 0.07, 0.5, 6), cloth, 0.05, 0.9, 0.32), armR = add(new T3.CylinderGeometry(0.07, 0.07, 0.5, 6), cloth, 0.12, 0.9, -0.32);
      armL.rotation.z = 0.3; armR.rotation.z = 0.9;
      const head = add(new T3.SphereGeometry(0.27, 10, 8), skin, 0, 1.45, 0);
      const cap = add(new T3.SphereGeometry(0.29, 10, 6, 0, Math.PI * 2, 0, Math.PI * 0.55), hair, -0.02, 1.48, 0); cap.rotation.z = 0.25;
      if (u.kind === 'player' && u.charKey !== 'daniel') { const cross = M('#ffffff'); add(new T3.BoxGeometry(0.02, 0.16, 0.05), cross, r * 0.55, 0.92, 0); add(new T3.BoxGeometry(0.02, 0.05, 0.16), cross, r * 0.55, 0.92, 0); }   // 캐시: 의료 십자
      const wp = this.weaponMesh(u); wp.position.set(0.25, 0.75, -0.38); body.add(wp); wp.traverse(o => { if (o.material) mats.push(o.material); });
      head.userData.head = true; body.userData.armR = armR;
    }
    // 발밑 팀 링
    const ring = new T3.Mesh(new T3.RingGeometry((u.r || 0.5) * 0.95, (u.r || 0.5) * 1.12, 28), new T3.MeshBasicMaterial({ color: new T3.Color(u.team === 0 ? '#4fe08a' : u.team === 2 ? '#c9b48a' : '#ff4d5e').convertSRGBToLinear(), transparent: true, opacity: 0.75, depthWrite: false }));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.025; root.add(ring); mats.push(ring.material);
    // 기절 별
    const stars = new T3.Group(); for (let i = 0; i < 3; i++) { const s = new T3.Mesh(new T3.OctahedronGeometry(0.07), new T3.MeshBasicMaterial({ color: '#ffc857' })); stars.add(s); } stars.visible = false; root.add(stars);
    root.userData = { body, mats, stars, bob: Math.random() * 6, last: V.copy(u.pos), modelVer: Models.ver };
    this.scene.add(root); return root;
  },
  syncUnits(dt) {
    const p = Game.player, seen = new Set();
    for (const u of Game.units) {
      seen.add(u.id);
      let m = this.unitMeshes.get(u.id);
      if (m && m.userData.modelVer !== Models.ver && Models.keyFor(u)) { this.dropUnit(u.id, m); m = null; }   // 모델 로딩 완료 → 인형 교체
      if (!m) { m = this.makeUnit(u); this.unitMeshes.set(u.id, m); }
      const D = m.userData, vis = !u.dead && (u.team === 0 || Vision.visible(p, u)) && !(u.kind === 'player' && u.shadow && u.shadow.phase !== 'out');
      m.visible = vis; if (!vis) continue;
      m.position.set(u.pos.x, 0, u.pos.y);
      // 방향: 인물 모델은 빠르게 돌아봄(초당 26rad ≈ 반 바퀴 0.12초), 단순 인형·순간 이동은 즉시
      const want = -(u.facing || 0);
      if (D.body.userData.rig && D.yaw !== undefined && V.dist(u.pos, D.last) < 1) { let df = want - D.yaw; df = Math.atan2(Math.sin(df), Math.cos(df)); D.yaw += Math.sign(df) * Math.min(Math.abs(df), 26 * dt * (Game.state === 'play' ? 1 : 0) || Math.abs(df)); }
      else D.yaw = want;
      D.body.rotation.y = D.yaw;
      // 이동 중 흔들림, 평타·스킬 시 앞으로 내밀기
      const moving = V.dist(u.pos, D.last) > 0.002; D.last = V.copy(u.pos);
      if (D.body.userData.rig) Models.animate(D.body.userData.rig, u, dt, moving);
      else { D.bob += dt * (moving ? 14 : 3); D.body.position.y = moving ? Math.abs(Math.sin(D.bob)) * 0.06 : Math.sin(D.bob) * 0.012; }
      const atk = (u.aa && u.aa.phase === 'windup') || (u.act && (u.act.type === 'aa' || u.act.type === 'cast')) || (u.cast && u.cast.phase !== 'recovery');
      if (D.body.userData.armR) D.body.userData.armR.rotation.z = atk ? 1.6 : 0.9;
      // 투명도: 은신·부쉬(내 캐릭터)·무적 깜빡임 / 피격 섬광
      let op = 1; if (u.team === 0 && u.kind === 'player') { if (u.stealthT > 0) op = 0.35; else if (Vision.bushAt(u.pos) >= 0) op = 0.6; }
      if (u.invuln > 0 && Math.floor(Game.time * 20) % 2 === 0) op *= 0.5;
      const fl = u.flash > 0 ? Math.min(1, u.flash / 0.12) : 0;
      for (const mt of D.mats) { mt.opacity = op * (mt.userData.baseOp || (mt.userData.baseOp = mt.opacity || 1)); mt.transparent = mt.opacity < 0.999; if (mt.emissive) mt.emissive.setRGB(fl * 0.9, fl * 0.9, fl * 0.9); }   // 불투명일 땐 깊이 정렬 문제(유령처럼 비침) 방지
      D.stars.visible = u.stun > 0;
      if (u.stun > 0) D.stars.children.forEach((s, i) => { const a = Game.time * 5 + i * 2.09; s.position.set(Math.cos(a) * 0.35, this.unitHeight(u) + 0.15, Math.sin(a) * 0.35); });
    }
    for (const [id, m] of this.unitMeshes) if (!seen.has(id)) this.dropUnit(id, m);
  },
  dropUnit(id, m) {
    this.scene.remove(m);
    m.traverse(o => { if (o.geometry && !o.userData.sharedGeo) o.geometry.dispose(); if (o.material) [].concat(o.material).forEach(x => x.dispose()); });
    const rig = m.userData.body && m.userData.body.userData.rig; if (rig) rig.mixer.stopAllAction();
    this.unitMeshes.delete(id);
  },
  // 설정에서 모델 켜고 끄기
  refreshModels() { if (Settings.models3d === false) { Models.state = 'failed'; Models.ver++; } else if (Models.state === 'failed' && Models.supported()) { Models.state = 'idle'; Models.load(); } },
  // ---------- 투사체 ----------
  syncProjectiles() {
    const seen = new Set(), T3 = THREE;
    for (const pr of Game.projectiles) {
      seen.add(pr);
      let m = this.projMeshes.get(pr);
      if (!m) {
        const col = pr.kind === 'needle' ? CONFIG.theme.accent2 : (pr.color || '#c79bff'), len = pr.kind === 'needle' ? 0.6 : (pr.len || 1.2);
        m = new T3.Mesh(new T3.BoxGeometry(len, Math.max(0.08, pr.width * 0.5), Math.max(0.08, pr.width)), new T3.MeshBasicMaterial({ color: new T3.Color(col).convertSRGBToLinear() }));
        this.scene.add(m); this.projMeshes.set(pr, m);
      }
      m.visible = pr.team === 0 || Vision.pointVisible(pr.pos);
      m.position.set(pr.pos.x, 1.0, pr.pos.y); m.rotation.y = -V.ang(pr.dir);
    }
    for (const [pr, m] of this.projMeshes) if (!seen.has(pr)) { this.scene.remove(m); m.geometry.dispose(); this.projMeshes.delete(pr); }
  },
  // ---------- 부쉬 반투명·흔들림 ----------
  syncBushes() {
    const p = Game.player, pb = p ? Vision.bushAt(p.pos) : -1;
    this.bushMeshes.forEach((g, bi) => {
      const op = bi === pb ? 0.45 : 1; for (const m of g.userData.mats) m.opacity = op;
      const R = Vision.rustles.find(r => r.b === bi && (r.team !== 0 || r.skill) && Vision.pointVisible(r.pt)), sh = R ? Math.sin(Game.time * 40) * 0.12 * (R.t / CONFIG.vision.rustle) : 0;
      g.children.forEach((c, i) => { c.rotation.y = g.userData.base[i] + sh; });
    });
  },
  // ---------- 바닥 데칼 (2D 그리기 재사용) ----------
  drawDecal() {
    const W = CONFIG.world.w, H = CONFIG.world.h, P = this.TEX_PPM, c = this.decalCv;
    if (c.width !== W * P || c.height !== H * P) { c.width = W * P; c.height = H * P; if (this.decalTex) this.decalTex.dispose(); this.decalTex = null; }
    const g = this.decalCtx; g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, c.width, c.height);
    g.setTransform(P, 0, 0, P, 0, 0); Render.drawWorld(g, CONFIG.theme, 'ground');
    if (!this.decalTex) {
      this.decalTex = new THREE.CanvasTexture(c); this.decalTex.encoding = THREE.sRGBEncoding; this.decalTex.anisotropy = 4;
      if (this.decal) { this.scene.remove(this.decal); this.decal.geometry.dispose(); }
      this.decal = new THREE.Mesh(new THREE.PlaneGeometry(W, H), new THREE.MeshBasicMaterial({ map: this.decalTex, transparent: true, depthWrite: false }));
      this.decal.rotation.x = -Math.PI / 2; this.decal.position.set(W / 2, 0.03, H / 2); this.decal.renderOrder = 1; this.scene.add(this.decal);
    }
    this.decalTex.needsUpdate = true;
  },
  // ---------- 카메라·조명 ----------
  updateCamera(dt) {
    const p = Game.player, W = CONFIG.world.w, H = CONFIG.world.h;
    const want = p && !p.dead && Game.state !== 'menu' ? new THREE.Vector3(p.pos.x, 0, p.pos.y) : new THREE.Vector3(W / 2, 0, H / 2);
    this.camTarget.lerp(want, Game.state === 'menu' ? 1 : Math.min(1, dt * 8));
    const z = Game.state === 'menu' ? 30 : this.zoom, pitch = 56 * Math.PI / 180, sh = Settings.reduceShake ? 0 : FX.shake * 0.01;
    this.camera.position.set(this.camTarget.x + (Math.random() - 0.5) * sh, Math.sin(pitch) * z, this.camTarget.z + Math.cos(pitch) * z + (Math.random() - 0.5) * sh);
    this.camera.lookAt(this.camTarget); this.camera.updateMatrixWorld();
    // 해: 카메라 근처를 따라다니며 그림자 범위 유지 / 밤: 푸르고 어둡게
    this.sun.position.set(this.camTarget.x + 6, 22, this.camTarget.z + 4); this.sun.target.position.copy(this.camTarget);
    const night = Vision.fogOn && Vision.night;
    this.hemi.intensity = night ? 0.28 : 0.6; this.sun.intensity = night ? 0.22 : 1.0;
    this.sun.color.set(night ? '#8fa8ff' : '#fff1d6'); this.scene.background.set(night ? '#0b0f1a' : '#1a2130');
  },
  frame() {
    const now = performance.now(), dt = Math.min(0.1, (now - (this.lastT || now)) / 1000); this.lastT = now;
    if (this.mapKey !== Game.mapKey || this.wallRef !== CONFIG.walls) this.buildMap();
    this.updateCamera(dt);
    this.syncUnits(dt); this.syncProjectiles(); this.syncBushes();
    this.drawDecal();
    this.gl.render(this.scene, this.camera);
    // 화면 층(체력바·글자·HUD)은 2D 캔버스를 투명하게 덮어 그림
    const ctx = Render.ctx, L = Render.L; ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, Render.cv.width, Render.cv.height);
    ctx.setTransform(L.dpr, 0, 0, L.dpr, 0, 0); ScreenLayer.draw(ctx, L);
  },
  onWheel(e) { this.zoom = clamp(this.zoom + Math.sign(e.deltaY) * 2, 12, 34); },
  show(on) { this.cv.style.display = on ? 'block' : 'none'; },
};
