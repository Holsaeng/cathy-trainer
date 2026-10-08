
// ============================== 3D 캐릭터 모델 (CC0) ==============================
// 출처: Quaternius 「Ultimate Modular Women / Men Pack」 (CC0, poly.pizza 배포본) — models/LICENSE.txt
// 님블뉴런 IP 정책상 게임 모델은 쓰지 않음. 범용 인물 모델에 실험체 느낌의 색·무기만 입힘
// 웹(http/https)에서만 불러옴. HTML만 내려받아 file://로 열거나 로딩 실패 시 Render3D의 로우폴리 인형을 그대로 사용
const Models = {
  DIR: 'models/',
  FILES: { cathy: 'cathy_base.glb', ranged: 'ranged_base.glb', male: 'daniel_base.glb' },
  HEIGHT: 1.72,       // 게임 속 키(m)
  state: 'idle',      // idle → loading → ready | failed
  ver: 0,             // 준비될 때마다 증가 → Render3D가 인형을 모델로 교체
  src: {},
  // 실험체별 모습: 모델 + 재질 이름별 색 (null = 원래 색) + 무기
  LOOKS: {
    cathy:  { file: 'cathy',  colors: { Red: '#2b1b16', Brown: '#1e1612', LimeGreen: '#eef1f5', Gold: '#2fb9a8' } },   // 흰 가운·청록 포인트·검은 머리 (외과의)
    daniel: { file: 'male',   colors: { White: '#26232e', Purple: '#3b2a4f', LightBlue: '#34304a', Hair: '#2d2140', Eyebrows: '#2d2140' } },   // 검보라 후드 (암살자)
    aya:    { file: 'ranged', tint: true },
    rio:    { file: 'ranged', tint: true },
    katja:  { file: 'ranged', tint: true },
    nadine: { file: 'male',   colors: { White: '#5b6640', Purple: '#7a5534', LightBlue: '#e0a35a', Hair: '#5a4632', Eyebrows: '#5a4632' } },   // 사냥꾼: 올리브 셔츠·갈색 후드
  },
  TINT_MATS: ['Green', 'LightGreen', 'Purple', 'White', 'LightBlue'],   // tint: 옷 재질만 실험체 색으로
  ANIM: { idle: 'Idle', idleGun: 'Idle_Gun', idleSword: 'Idle_Sword', run: 'Run', slash: 'Sword_Slash', stabR: 'Punch_Right', stabL: 'Punch_Left', dualAA: 'DualAA', dualX: 'DualX', dualIdle: 'DualIdle', shoot: 'Gun_Shoot', hit: 'HitRecieve', death: 'Death', roll: 'Roll' },
  // 근접 평타 구간(초) — 클립에서 손목 위치를 측정: s = 휘두르기 시작, hit = 손이 가장 앞으로 나온 순간(타격), end = 자세 회수
  MELEE: { slash: { s: 0.08, hit: 0.45, end: 0.95 }, stabR: { s: 0.40, hit: 0.70, end: 1.0 }, stabL: { s: 0.44, hit: 0.72, end: 1.0 },
           dualAA: { s: 0.02, hit: 0.32, hit2: 0.44, end: 0.75 }, dualX: { s: 0.04, hit: 0.38, end: 0.70 } },   // dual*: 직접 만든 쌍검 동작(Motions.HITS와 같음)

  supported() { return /^https?:$/.test(location.protocol) && !!(window.THREE && THREE.GLTFLoader && THREE.SkeletonUtils); },
  load() {
    if (this.state !== 'idle') return;
    if (!this.supported() || Settings.models3d === false) { this.state = 'failed'; return; }
    this.state = 'loading';
    const loader = new THREE.GLTFLoader(), keys = Object.keys(this.FILES);
    Promise.all(keys.map(k => new Promise((ok, no) => loader.load(this.DIR + this.FILES[k], ok, undefined, no))))
      .then(list => { list.forEach((g, i) => { this.src[keys[i]] = this.prepare(g); });
        try { Motions.bake(this.src.cathy); } catch (e) { console.warn('쌍검 동작 생성 실패 — 기본 동작 사용:', e); }   // 6_y_motions.js
        for (const k of this.CUSTOM) try { this.src[k + 'Proc'] = Procgen.build(this.src[DESIGNS[k].rig], DESIGNS[k]); } catch (e) { console.warn('직접 만든 모델 생성 실패:', k, e); }   // 6_y_procgen.js · 6_y_designs.js
        this.state = 'ready'; this.ver++; this.loadOptional(loader); this.loadLocal(); })
      .catch(e => { console.warn('3D 모델을 불러오지 못해 기본 인형을 씁니다:', e); this.state = 'failed'; });
  },
  // 직접 만든 모델이 있는 실험체 (설계: 6_y_designs.js). 선택: Settings.models[키] = 'cc0' | 'proc' | 'blend'
  CUSTOM: ['cathy', 'daniel'],
  // 기본: Blender 모델이 있으면 Blender 모델, 없으면(file:// 등) CC0 모델
  choice(key) { const m = Settings.models3dBy || {}; return m[key] || (this.src[key + 'Blend'] ? 'blend' : 'cc0'); },
  // 파일 찾기: local/(이 PC에서 고쳐 보는 개발용, 깃 제외)이 있으면 그것, 없으면 models/(공개판)
  async find(name) {
    for (const dir of ['local/', this.DIR]) { try { const r = await fetch(dir + name, { method: 'HEAD' }); if (r.ok) return dir + name; } catch (e) { /* file:// 등 */ } }
    return null;
  },
  // 원작풍 설계(models/<키>_ref.json, 이 PC에선 local/이 우선) → 설정에 「원작풍」 선택지가 생김
  optPending: 0,   // 아직 불러오는 중인 추가 파일 수(Blender 모델·원작풍 설계) — 테스트가 다 받을 때까지 기다림
  loadLocal() {
    for (const k of this.CUSTOM) { this.optPending++; this.find(k + '_ref.json').then(f => f ? fetch(f).then(r => r.ok ? r.json() : null) : null).then(d => {
      if (!d || !d.parts) return;
      try { this.src[k + 'Ref'] = Procgen.build(this.src[d.rig], d); if (this.choice(k) === 'ref') this.ver++; } catch (e) { console.warn('로컬 설계 생성 실패:', k, e); }
    }).catch(() => {}).finally(() => this.optPending--); }
  },
  // Blender로 만든 모델(tools/blender/make_model.py → models/<키>_custom.glb, 이 PC에선 local/이 우선). 없으면 조용히 넘어감
  loadOptional(loader) {
    for (const k of this.CUSTOM) {
      this.optPending++; const done = () => this.optPending--;
      this.find(k + '_custom.glb').then(file => {
        if (!file) return done();
        loader.load(file, g => { done();
          // 모양만 가져오고 뼈대·동작은 원본 CC0 것 (Procgen.rebind) — 쌍검 동작 등 직접 만든 동작도 원본 것을 그대로 공유
          const S = Procgen.rebind(this.src[DESIGNS[k].rig], g, DESIGNS[k]); if (!S) return;
          this.src[k + 'Blend'] = S; if (this.choice(k) === 'blend') this.ver++;
        }, undefined, e => { done(); console.warn('Blender 모델을 읽지 못했습니다:', k, e); });
      }).catch(() => {});
    }
  },
  // 원본 1회 처리: 그림자, 키 측정(뼈 기준 — 스키닝 메시 bbox는 부정확)
  prepare(g) {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    g.scene.updateMatrixWorld(true);
    const ys = ['Head_end', 'Head'].map(n => g.scene.getObjectByName(n)).filter(Boolean).map(o => o.getWorldPosition(new THREE.Vector3()).y);
    const h = ys.length ? Math.max(...ys) : 1.8;
    const clips = {}; for (const c of g.animations) clips[c.name.split('|').pop()] = c;
    return { scene: g.scene, scale: this.HEIGHT / Math.max(0.01, h * 1.04), clips };
  },
  keyFor(u) {
    if (u.kind === 'player') return u.charKey === 'daniel' ? 'daniel' : 'cathy';
    if (u.motifKey && this.LOOKS[u.motifKey]) return u.motifKey;
    return null;   // 허수아비·야생동물·카메라·회피 모드 적은 기존 모형
  },
  available(u) { return this.state === 'ready' && !!this.keyFor(u); },
  // 유닛 하나 만들기: 뼈대 복제 + 재질 복제(유닛별 투명도) + 손에 무기 + 애니메이션
  create(u, weapon, mats) {
    const key = this.keyFor(u), look = key && this.LOOKS[key];
    let S = look && this.src[look.file];
    if (this.CUSTOM.includes(key)) {   // 직접 만든 모델 · Blender 모델 — 뼈대·동작은 같음
      const ch = this.choice(key);
      if (ch === 'proc' && this.src[key + 'Proc']) S = this.src[key + 'Proc'];
      if (ch === 'blend' && this.src[key + 'Blend']) S = this.src[key + 'Blend'];
      if (ch === 'ref' && this.src[key + 'Ref']) S = this.src[key + 'Ref'];   // 로컬 전용
    }
    if (!S) return null;
    const T3 = THREE, obj = THREE.SkeletonUtils.clone(S.scene), cache = new Map();
    obj.scale.setScalar(S.scale); obj.rotation.y = Math.PI / 2;   // 모델 정면(+Z) → 게임 정면(+X)
    obj.traverse(o => {
      if (!o.isMesh) return;
      o.userData.sharedGeo = true;   // 원본과 공유 — 유닛 삭제 시 지오메트리는 버리지 않음
      const one = m => {
        if (cache.has(m)) return cache.get(m);
        const c = m.clone(); c.transparent = true; c.userData = {};
        const name = (m.name || '').replace(/\.\d+$/, '');
        let col = look.colors && look.colors[name];
        if (!col && look.tint && this.TINT_MATS.includes(name)) col = name === 'White' ? new T3.Color(u.color).lerp(new T3.Color('#ffffff'), 0.55).getStyle() : u.color;
        if (col) c.color.set(col).convertSRGBToLinear();
        if (c.emissive) c.emissive.setRGB(0, 0, 0);
        const t = Render3D.toonify(c);   // 카툰 렌더링이면 툰 재질
        cache.set(m, t); mats.push(t); return t;
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    if (S.refPose && S.clips[S.refPose]) { const mx = new T3.AnimationMixer(obj); mx.clipAction(S.clips[S.refPose]).play(); mx.setTime(0); obj.updateMatrixWorld(true); }   // 무기·소품 붙이는 기준 자세
    const PP = this.addProps(obj, S, S.proc ? key + 'Proc' : key, u, mats);
    const mixer = new T3.AnimationMixer(obj), actions = {};
    for (const [k, n] of Object.entries(this.ANIM)) if (S.clips[n]) actions[k] = mixer.clipAction(S.clips[n]);
    for (const k of ['slash', 'stabR', 'stabL', 'dualAA', 'dualX', 'shoot', 'hit', 'roll']) if (actions[k]) { actions[k].setLoop(T3.LoopOnce); actions[k].clampWhenFinished = true; }   // 끝 프레임 유지 — 끝나자마자 기본 자세(A자세)로 튀지 않고 다음 동작과 섞임
    if (actions.death) { actions.death.setLoop(T3.LoopOnce); actions.death.clampWhenFinished = true; }
    const ranged = !!(u.motif && !u.motif.melee);
    const root = new T3.Group(); root.add(obj);   // 기울기 틀: 돌진 시 앞으로 숙임 (게임 정면 +X 기준 Z축 회전)
    const rig = { blades: (PP && PP.blades) || [], obj, root, mixer, actions, cur: null, ranged, oneShot: 0, melee: u.kind === 'player', dan: u.charKey === 'daniel', swing: 0, recov: 0, combat: 0, lean: 0, leanTo: 0, segEnd: null };   // melee: 플레이어(캐시·다니엘) 평타를 판정 타이밍에 맞춰 재생 / dan: 다니엘 스킬 동작
    this.play(rig, ranged ? 'idleGun' : 'idle', 0);
    return rig;
  },
  // ---------- 소품: 역할 느낌만 내는 일반 소품 (특정 캐릭터 디자인 재현 아님) ----------
  // 뼈에 붙이되, 붙이는 틀(holder)을 모델 기준 좌표(위 +Y · 정면 +Z · 오른손 -X, 단위 m)로 맞춰서 소품을 쉽게 배치
  addProps(obj, S, key, u, mats) {
    const build = this.PROPS[key];
    const T3 = THREE; obj.updateMatrixWorld(true);
    const objW = obj.matrixWorld.clone().multiply(new T3.Matrix4().makeScale(1 / S.scale, 1 / S.scale, 1 / S.scale));
    const holders = {};
    const at = name => {
      if (holders[name]) return holders[name];
      const bone = obj.getObjectByName(name); if (!bone) return null;
      const want = objW.clone().setPosition(new T3.Vector3().setFromMatrixPosition(bone.matrixWorld));   // 원점 = 뼈 위치, 축 = 모델 기준
      const h = new T3.Group(), m = new T3.Matrix4().copy(bone.matrixWorld).invert().multiply(want);
      m.decompose(h.position, h.quaternion, h.scale); bone.add(h); return (holders[name] = h);
    };
    const M = (c, o = {}) => { const m = Render3D.toonify(Render3D.std(c, Object.assign({ flatShading: true }, o))); mats.push(m); return m; };
    const add = (bone, geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
      const h = at(bone); if (!h) return null;
      const o = new T3.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); o.castShadow = true; h.add(o); return o;
    };
    const P = { T3, add, M, u, col: u.color || '#888', S, blades: [] };
    if (build) build.call(this, P);
    this.addWeapon(P);
    return P;
  },
  weaponKind(u, S) {
    if (S && S.design && S.design.weapon && (u.kind === 'player' || u.motifKey === 'daniel')) return S.design.weapon;   // 직접 만든 모델의 무기(다니엘: 단검)
    return u.kind === 'player' ? (u.charKey === 'daniel' ? 'scissor' : u.weapon) : (u.motif ? u.motif.weapon : null);
  },
  // 무기: 손목 뼈에 붙임. 틀 기준 손가락 방향 = -Y(날·총구), 엄지 쪽 = +Z(윗면). 바인드 자세가 팔을 내린 A자세라 공격·사격 동작에서 앞을 향함
  addWeapon({ T3, add, M }) {
    const w = this.weaponKind(arguments[0].u, arguments[0].S), steel = M('#dfe4ea', { metalness: 0.75, roughness: 0.25 }), grip = M('#2a2f38'), wood = M('#7a5534');
    const G = 0.075;   // 손목 → 손바닥 중심
    const blades = arguments[0].blades;
    const blade = (bone, len, wid, col = steel) => {   // 손잡이 + 날 (끝으로 갈수록 가는 판)
      add(bone, new T3.CylinderGeometry(0.016, 0.018, 0.1, 6), grip, 0, -G, 0);
      const b = add(bone, new T3.BoxGeometry(0.006, len, wid), col, 0, -G - 0.05 - len / 2, wid * 0.2); if (b) blades.push({ mesh: b, len });   // 칼 궤적(VFX3D)용
      add(bone, new T3.ConeGeometry(wid * 0.55, wid * 1.6, 4), col, 0, -G - 0.05 - len - wid * 0.7, wid * 0.2, Math.PI, 0, 0).scale.set(0.12, 1, 1);
    };
    if (w === 'dagger') blade('WristR', 0.2, 0.04);
    else if (w === 'dual') { blade('WristR', 0.26, 0.035); blade('WristL', 0.26, 0.035); }
    else if (w === '단검') blade('WristR', 0.22, 0.04, M('#b9b2c9', { metalness: 0.7, roughness: 0.3 }));
    else if (w === 'scissor') {   // 큰 가위: 두 날 + 고리 손잡이
      for (const sgn of [1, -1]) {
        const sb = add('WristR', new T3.BoxGeometry(0.008, 0.42, 0.035), steel, 0, -G - 0.23, sgn * 0.018, sgn * 0.06, 0, 0); if (sb && sgn > 0) blades.push({ mesh: sb, len: 0.42 });
        add('WristR', new T3.TorusGeometry(0.03, 0.009, 4, 10), grip, 0, -G + 0.02, sgn * 0.035, 0, Math.PI / 2, 0);
      }
    } else if (w === '권총') {
      add('WristR', new T3.BoxGeometry(0.035, 0.07, 0.025), grip, 0, -G, -0.01);
      add('WristR', new T3.BoxGeometry(0.035, 0.2, 0.05), M('#3a404b'), 0, -G - 0.09, 0.035);
    } else if (w === '저격총') {
      add('WristR', new T3.BoxGeometry(0.04, 0.08, 0.03), grip, 0, -G, -0.01);
      add('WristR', new T3.BoxGeometry(0.045, 0.45, 0.07), M('#3a404b'), 0, -G - 0.12, 0.04);
      add('WristR', new T3.CylinderGeometry(0.012, 0.012, 0.45, 6), grip, 0, -G - 0.55, 0.05);
      add('WristR', new T3.CylinderGeometry(0.022, 0.022, 0.14, 8), grip, 0, -G - 0.12, 0.1);   // 조준경
      add('WristR', new T3.BoxGeometry(0.04, 0.2, 0.09), wood, 0, -G + 0.13, 0.03);              // 개머리판
    } else if (w === '석궁') {
      add('WristR', new T3.BoxGeometry(0.035, 0.07, 0.025), grip, 0, -G, -0.01);
      add('WristR', new T3.BoxGeometry(0.04, 0.36, 0.05), wood, 0, -G - 0.12, 0.035);
      add('WristR', new T3.TorusGeometry(0.2, 0.013, 4, 12, Math.PI * 0.8), grip, 0, -G - 0.18, 0.035, Math.PI / 2, 0, Math.PI * 1.1);   // 활대(가로)
    } else if (w === '활') {
      add('WristR', new T3.TorusGeometry(0.42, 0.016, 4, 16, Math.PI * 0.75), wood, 0, -G + 0.3, 0, 0, Math.PI / 2, -Math.PI * 0.875);   // 세로 활대
    }
  },
  PROPS: {
    // 캐시 → 외과의: 앞이 트인 흰 가운(상의·자락) · 청록 깃 · 청진기
    cathy({ T3, add, M }) {
      const coat = M('#f4f6f8', { side: T3.DoubleSide }), teal = M('#2fb9a8'), steel = M('#c9d1d9', { metalness: 0.6, roughness: 0.35 });
      add('Chest', new T3.CylinderGeometry(0.155, 0.17, 0.36, 10, 1, true, Math.PI * 0.16, Math.PI * 1.68), coat, 0, -0.1, 0);
      add('Hips', new T3.CylinderGeometry(0.175, 0.25, 0.5, 10, 1, true, Math.PI * 0.2, Math.PI * 1.6), coat, 0, -0.2, -0.005);
      add('Neck', new T3.TorusGeometry(0.085, 0.022, 5, 12), teal, 0, -0.04, 0, Math.PI / 2 + 0.25, 0, 0);
      // 청진기: 목에 건 U자 관 + 앞으로 늘어진 두 줄 + 가슴 쪽 청진판
      add('Neck', new T3.TorusGeometry(0.1, 0.008, 4, 16, Math.PI * 1.3), steel, 0, -0.06, 0, Math.PI / 2, 0, -Math.PI * 1.15);
      for (const sx of [1, -1]) add('Chest', new T3.CylinderGeometry(0.007, 0.007, 0.16, 4), steel, sx * 0.075, 0.03, 0.06, 0.35, 0, sx * -0.25);
      add('Chest', new T3.CylinderGeometry(0.028, 0.028, 0.014, 10), steel, 0.03, -0.07, 0.15, Math.PI / 2 - 0.2, 0, 0);
    },
    // 직접 만든 캐시: 가운은 모델에 포함 → 청진기만
    cathyProc({ T3, add, M }) {
      const steel = M('#c9d1d9', { metalness: 0.6, roughness: 0.35 });
      add('Neck', new T3.TorusGeometry(0.1, 0.008, 4, 16, Math.PI * 1.3), steel, 0, -0.06, 0, Math.PI / 2, 0, -Math.PI * 1.15);
      for (const sx of [1, -1]) add('Chest', new T3.CylinderGeometry(0.007, 0.007, 0.16, 4), steel, sx * 0.075, 0.03, 0.06, 0.35, 0, sx * -0.25);
      add('Chest', new T3.CylinderGeometry(0.028, 0.028, 0.014, 10), steel, 0.03, -0.07, 0.15, Math.PI / 2 - 0.2, 0, 0);
    },
    // 다니엘 → 암살자: 머리를 덮는 후드 · 입을 가리는 검은 마스크
    daniel({ T3, add, M }) {
      const hood = M('#2d2140', { side: T3.DoubleSide }), mask = M('#141218');
      add('Head', new T3.SphereGeometry(0.175, 12, 8, Math.PI * 0.82, Math.PI * 1.36, 0, Math.PI * 0.72), hood, 0, 0.1, -0.025);   // 앞(+Z)이 트인 반구 (구의 phi=π/2가 +Z)
      add('Neck', new T3.CylinderGeometry(0.12, 0.15, 0.1, 10, 1, true), hood, 0, 0.0, 0);
      add('Head', new T3.BoxGeometry(0.19, 0.07, 0.05), mask, 0, -0.005, 0.155);   // 코 아래를 가림
    },
    // 원딜 AI: 무기 성격에 맞는 일반 소품 (색은 실험체 색)
    aya({ T3, add, M, col }) {   // 권총 → 야구모자
      const c = M(col), d = M(new T3.Color(col).multiplyScalar(0.6).getStyle());
      add('Head', new T3.SphereGeometry(0.155, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.45), c, 0, 0.1, -0.005);
      add('Head', new T3.BoxGeometry(0.17, 0.016, 0.11), d, 0, 0.12, 0.14, -0.2, 0, 0);
    },
    rio({ T3, add, M, col }) {   // 활 → 등 화살통
      const lea = M('#7a5534'), fl = M(col);
      add('Chest', new T3.CylinderGeometry(0.055, 0.045, 0.42, 8), lea, -0.06, 0.02, -0.17, 0.25, 0, -0.45);
      for (let i = 0; i < 3; i++) add('Chest', new T3.ConeGeometry(0.025, 0.07, 4), fl, -0.15 + i * 0.03, 0.24 - i * 0.012, -0.22, 0.25, 0, -0.45);
    },
    nadine({ T3, add, M }) {     // 석궁 → 챙 넓은 사냥 모자
      const hat = M('#6b4a2e'), band = M('#e0a35a');
      add('Head', new T3.CylinderGeometry(0.3, 0.3, 0.025, 14), hat, 0, 0.2, 0, -0.08, 0, 0);
      add('Head', new T3.CylinderGeometry(0.15, 0.17, 0.14, 12), hat, 0, 0.27, -0.01, -0.08, 0, 0);
      add('Head', new T3.CylinderGeometry(0.172, 0.172, 0.03, 12), band, 0, 0.215, -0.005, -0.08, 0, 0);
    },
    katja({ T3, add, M, col }) { // 저격총 → 베레모 · 목도리
      const c = M(new T3.Color(col).multiplyScalar(0.7).getStyle());
      add('Head', new T3.SphereGeometry(0.16, 12, 6), c, 0.03, 0.18, -0.02, 0, 0, 0.25).scale.set(1.05, 0.33, 1.05);
      add('Neck', new T3.TorusGeometry(0.09, 0.035, 6, 12), M(col), 0, -0.02, 0, Math.PI / 2, 0, 0);
    },
  },
  play(rig, name, fade = 0.15, speed = 1) {
    const a = rig.actions[name] || rig.actions.idle; if (!a) return;
    a.timeScale = speed;
    if (rig.cur === a) return;
    a.reset().play(); if (rig.cur) a.crossFadeFrom(rig.cur, fade, false);
    rig.cur = a;
  },
  // 캐시 스킬 동작: 시전 단계(선딜 w · 발동 a · 후딜 r)마다 클립 구간 [시작, 끝]을 그 단계 시간에 맞춰 재생, 끝 프레임에서 멈춤
  //   Q 동맥절제술: 칼을 앞으로 내밀어 찌르는 자세로 고속 돌진 · W 앰퓨테이션: 크게 휘두르는 부채꼴 베기
  //   E 수쳐: 바늘을 앞으로 던지기 · R 이머전시 OP: 칼을 들어 올린 채 정신집중 → 낮게 숙여 돌진하며 베기
  //   D 단검: 대상 뒤로 이동하며 찌르기 · D 쌍검 1식: 파고들며 좌우 연속 찌르기 · 2식: 숙여 돌진 베기
  SKILL_ANIM: {
    Q:     { clip: 'stabR', w: [0.50, 0.66], a: [0.66, 0.72], r: [0.72, 0.95], lean: 0.32 },
    W:     { clip: 'slash', w: [0.24, 0.45], r: [0.45, 0.95] },
    E:     { clip: 'stabR', w: [0.36, 0.70], r: [0.70, 1.00] },
    R:     { clip: 'slash', w: [0.06, 0.30], a: [0.30, 0.50], r: [0.50, 0.95], lean: 0.42, crouch: 0.12 },
    D:     { clip: 'stabR', w: [0.50, 0.70], r: [0.70, 1.00] },
    Ddual: { flurry: 6, r: [0.74, 1.00], lean: 0.15 },
    D2:    { clip: 'slash', a: [0.28, 0.50], r: [0.50, 0.95], lean: 0.4 },
    // 다니엘 — E 그림자 이동: 몸을 숙여 찌르는 자세로 은신 돌진 · R 걸작: 그림자 속(모델 숨김)에선 칼을 들어 올린 채, 빠져나올 때 숙여 돌진하며 베기
    dE:    { clip: 'stabR', a: [0.58, 0.70], r: [0.70, 0.95], lean: 0.42 },
    dR:    { clip: 'slash', a: [0.06, 0.30], out: [0.30, 0.52], lean: 0.45 },
    dD:    { clip: 'stabR', w: [0.50, 0.70], r: [0.70, 1.00] },
  },
  // 다니엘 즉시 시전 스킬(시전 시간 없음)의 손짓: Q 그림자 가위 = 크게 휘두르기 · W 영감 = 대상을 가리키는 찌르기 (이동 중이면 다리를 살리려고 생략)
  DAN_GESTURE: { Q: { clip: 'slash', s: 0.22, e: 0.52, dur: 0.3 }, W: { clip: 'stabR', s: 0.56, e: 0.70, dur: 0.16 } },
  skillKey(c, u) { if (u && u.charKey === 'daniel') return 'd' + c.k; return c.k !== 'D' ? c.k : c.impl === Impl.Ddual1 ? 'Ddual' : c.impl === Impl.Ddual2 ? 'D2' : 'D'; },
  // 구간 재생: 같은 클립이 이어지면 끊지 않고 속도만 바꿈
  seg(rig, clip, from, to, dur, fade = 0.06) {
    const a = rig.actions[clip]; if (!a) return;
    const sc = clamp((to - from) / Math.max(0.02, dur), 0.2, 16);
    if (rig.cur === a && Math.abs(a.time - from) < 0.1) { a.paused = false; a.timeScale = sc; }
    else this.playSeg(rig, clip, from, sc, fade);
    rig.segEnd = to;
  },
  skillAnim(rig, u) {
    const c = u.cast, key = this.skillKey(c, u), A = this.SKILL_ANIM[key]; if (!A) return false;
    if (A.out) {   // 다니엘 R: 그림자 속 → 빠져나오기
      const out = u.shadow && u.shadow.phase === 'out', ph = out ? 'out' : 'in';
      if (rig.castId !== c.id || rig.castPh !== ph) {
        rig.castId = c.id; rig.castPh = ph; rig.combat = 2.5;
        if (out) { this.seg(rig, A.clip, A.out[0], A.out[1], u.K ? u.K.R.exitTime : 0.2); rig.leanTo = A.lean; } else { this.seg(rig, A.clip, A.a[0], A.a[1], 0.3); rig.leanTo = 0.1; }
      }
      return true;
    }
    const ph = c.phase, fresh = rig.castId !== c.id || rig.castPh !== ph;
    if (fresh) {
      rig.castId = c.id; rig.castPh = ph; rig.combat = 2.5; rig.flurryN = -1;
      const dur = ph === 'windup' ? c.windup : ph === 'active' ? (c.data.dur || 0.1) : c.recovery;
      const sg = A[ph === 'windup' ? 'w' : ph === 'active' ? 'a' : 'r'];
      if (sg && A.clip) this.seg(rig, A.clip, sg[0], sg[1], dur);
      else if (sg && ph === 'recovery' && A.flurry) this.seg(rig, rig.flurryClip || 'stabR', sg[0], sg[1], dur);
      rig.leanTo = ph === 'active' ? (A.lean || 0) : ph === 'windup' ? (A.crouch || 0) : 0;
    }
    if (A.flurry && ph === 'active') {   // 연속 찌르기: 타격 수만큼 오른손·왼손 번갈아
      const dur = c.data.dur || 0.66, n = Math.min(A.flurry - 1, Math.floor(c.t / dur * A.flurry));
      if (n !== rig.flurryN) { rig.flurryN = n; const clip = n % 2 ? 'stabL' : 'stabR', M = this.MELEE[clip]; rig.flurryClip = clip; this.seg(rig, clip, M.hit - 0.16, M.hit + 0.04, dur / A.flurry, 0.04); }
    }
    return true;
  },
  // 한 프레임 진행 + 구간 끝 프레임에서 정확히 멈춤 (넘어간 만큼 되돌려 떨림 없음)
  step(rig, dt) {
    rig.mixer.update(dt);
    if (rig.segEnd !== null && rig.cur && rig.cur.time > rig.segEnd) { rig.cur.time = rig.segEnd; rig.cur.timeScale = 0; rig.mixer.update(0); }
    this.fixLegs(rig);
  },
  // 다리 보정: CC0 뼈대의 동작은 무릎이 바깥으로 벌어지게 구워져 있음(대기 자세 엉덩이 x0.11 → 무릎 0.19 → 발 0.11, IK 무릎 방향 기준점이 옆에 있던 탓)
  //   → 매 프레임 엉덩이·발목 위치는 그대로 두고, 무릎만 캐릭터 정면 쪽(살짝 바깥)으로 꺾이게 두 관절 IK로 다시 계산
  fixLegs(rig) {
    if (rig.legs === undefined) {
      rig.legs = ['L', 'R'].map(sd => ({ sd: sd === 'L' ? 1 : -1, U: rig.obj.getObjectByName('UpperLeg' + sd), Lo: rig.obj.getObjectByName('LowerLeg' + sd), E: rig.obj.getObjectByName('LowerLeg' + sd + '_end'), F: rig.obj.getObjectByName('Foot' + sd) })).filter(l => l.U && l.Lo && l.E && l.F);
      // 무릎 끝점(LowerLeg_end)이 발목(= 발 IK 뼈)과 일치하는 뼈대에서만 (Blender로 내보낸 파일은 끝점이 다시 계산돼 어긋나고, 무릎 벌어짐도 없음)
      rig.obj.updateMatrixWorld(true);
      if (rig.legs.some(l => l.E.getWorldPosition(new THREE.Vector3()).distanceTo(l.F.getWorldPosition(new THREE.Vector3())) > 0.05)) rig.legs = [];
      rig._v = [new THREE.Vector3(), new THREE.Vector3(), new THREE.Vector3(), new THREE.Quaternion()];
    }
    if (!rig.legs.length || typeof Motions === 'undefined') return;
    const [fw, side, hip, q] = rig._v;
    rig.obj.getWorldQuaternion(q); fw.set(0, 0, 1).applyQuaternion(q); side.set(1, 0, 0).applyQuaternion(q);   // 모델 정면(+Z)·왼쪽(+X)의 월드 방향
    for (const l of rig.legs) {
      const ank = l.E.getWorldPosition(new THREE.Vector3()); l.U.getWorldPosition(hip);
      const pole = hip.clone().lerp(ank, 0.5).addScaledVector(fw, 0.6).addScaledVector(side, 0.12 * l.sd);
      Motions.ik(l.U, l.Lo, l.E, ank, pole);
    }
  },
  // 클립의 한 구간을 원하는 속도로 재생 (판정 시간에 맞추기)
  playSeg(rig, name, from, scale, fade) {
    const a = rig.actions[name]; if (!a) return;
    a.reset(); a.time = from; a.timeScale = scale; a.setEffectiveWeight(1); a.play(); rig.segEnd = null;
    if (rig.cur && rig.cur !== a) a.crossFadeFrom(rig.cur, fade, false);
    rig.cur = a;
  },
  // 캐시 평타: 선딜(windup) 동안 「휘두르기 시작 → 타격 프레임」을 정확히 재생해 피해가 들어가는 순간 칼끝이 닿게 함
  //   단검: 베기 ↔ 찌르기 번갈아 · 쌍검: 오른손 찌르기(1타) → 0.12초 뒤 왼손 찌르기(2타) · 강화 평타: 크게 베기
  //   타격 후(back)는 남은 동작을 후딜에 맞춰 빠르게 회수, 다음 평타가 오면 바로 이어 붙임
  meleeAA(rig, u) {
    const a = u.aa, ph = a.phase;
    if (ph === 'windup' && (rig.aaPh !== 'windup' || a.t < rig.aaT)) {
      const enh = u.enhanced > 0, dual = u.weapon === 'dual';
      const W = Math.max(0.02, a.dur - a.t);
      const hasDual = dual && rig.actions.dualAA;   // 쌍검: 오른손 대각 베기 → 왼손 반대 대각 베기 / 강화 평타 = X자 교차 베기
      let name = enh ? (hasDual ? 'dualX' : 'slash') : dual ? (hasDual ? 'dualAA' : 'stabR') : (rig.swing++ % 2 ? 'stabR' : 'slash');
      if (W < 0.08) {   // 즉시 평타(R 직후 등): 처음부터 다시 들어 올리면 튀므로, 지금 동작과 다른 클립을 타격 직전부터 이어 붙임
        name = hasDual ? (enh ? 'dualX' : 'dualAA') : rig.cur === rig.actions.slash ? 'stabR' : 'slash'; const M = this.MELEE[name], lead = Math.max(0.05, W * 2);
        this.playSeg(rig, name, M.hit - lead, lead / W, 0.05);
      } else { const M = this.MELEE[name]; this.playSeg(rig, name, M.s, clamp((M.hit - M.s) / W, 0.3, 14), 0.06); }
      rig.swingName = name; rig.dual = dual && !enh; rig.combat = 2.5; rig.recov = 9;
    }
    if (ph !== 'windup' && rig.aaPh === 'windup' && rig.swingName) {   // 타격 순간
      if (rig.swingName === 'dualAA') {
        const M = this.MELEE.dualAA, gap = CONFIG.basicAttack.dual.hitGap, sc = (M.hit2 - M.hit) / gap;   // 2타가 정확히 0.12초 뒤 왼손 타격 프레임
        rig.cur.timeScale = sc; rig.recov = (M.end - M.hit) / sc;
      } else if (rig.dual) {
        const L = this.MELEE.stabL, gap = CONFIG.basicAttack.dual.hitGap, sc = 2.2;
        this.playSeg(rig, 'stabL', Math.max(L.s, L.hit - gap * sc), sc, 0.05); rig.recov = gap + (L.end - L.hit) / sc;
      } else {
        const M = this.MELEE[rig.swingName], B = ph === 'back' ? a.dur : 0.2, sc = clamp((M.end - M.hit) / (B + 0.12), 0.8, 5);
        rig.cur.timeScale = sc; rig.recov = (M.end - M.hit) / sc;
      }
    }
    rig.aaPh = ph; rig.aaT = a.t;
    return ph === 'windup' || ph === 'back' || rig.recov > 0;
  },
  // 상태 → 동작. 공격·피격은 한 번 재생 후 원래 동작으로
  animate(rig, u, dt, moving) {
    dt *= Game.state === 'play' ? (Settings.gameSpeed || 1) : 0;   // 게임 속도·일시정지 반영 (판정 시간과 맞춤)
    rig.oneShot = Math.max(0, rig.oneShot - dt); rig.recov = Math.max(0, rig.recov - dt); rig.combat = Math.max(0, rig.combat - dt);
    rig.lean += (rig.leanTo - rig.lean) * Math.min(1, dt * 30); rig.root.rotation.z = -rig.lean;
    if (rig.dan) {   // 다니엘 Q·W 손짓 (시전 시간이 없는 스킬)
      const fresh = k => { const G = this.DAN_GESTURE[k]; if (!moving) { this.seg(rig, G.clip, G.s, G.e, G.dur, 0.05); rig.recov = G.dur + 0.15; rig.combat = 2.5; } };
      if (u.qSeq !== rig.qSeq) { if (rig.qSeq !== undefined) fresh('Q'); rig.qSeq = u.qSeq; }
      if (u.mark !== rig.mark) { if (u.mark && rig.mark !== undefined) fresh('W'); rig.mark = u.mark; }
    }
    if (rig.melee && u.cast && this.skillAnim(rig, u)) { rig.wasAtk = false; this.step(rig, dt); return; }
    if (rig.melee && u.cast === null && rig.castId !== undefined && rig.castPh !== 'done') { rig.castPh = 'done'; rig.leanTo = 0; rig.recov = 0.12; }   // 스킬 끝 → 잠깐 자세 유지 후 전투 자세
    if (rig.melee && u.aa && !(u.cast && u.cast.phase !== 'recovery')) {
      // 타격 후 이동하면 회수 동작을 끊고 바로 달리기(무빙)
      if (this.meleeAA(rig, u) && !(moving && u.aa.phase === 'none' && (rig.recov = 0, true))) { rig.wasAtk = false; this.step(rig, dt); return; }
    }
    const attacking = (!rig.melee && u.aa && u.aa.phase === 'windup') || (u.act && u.act.type === 'cast') || (!rig.melee && u.act && u.act.type === 'aa') || (u.cast && u.cast.phase !== 'recovery');
    if (attacking && !rig.wasAtk && rig.oneShot <= 0) { const n = rig.ranged ? 'shoot' : 'slash'; this.play(rig, n, 0.08, rig.ranged ? 1.4 : 1.7); rig.oneShot = rig.ranged ? 0.45 : 0.4; }
    else if (u.flash > 0.1 && !rig.wasHit && rig.oneShot <= 0 && !moving) { this.play(rig, 'hit', 0.08, 1.5); rig.oneShot = 0.3; }
    else if (rig.oneShot <= 0) {
      if (u.stun > 0) this.play(rig, 'hit', 0.1, 0.4);
      else if (moving) this.play(rig, 'run', 0.15, clamp((u.speed ? u.speed() : 3.5) / 3.8, 0.75, 1.5));
      else this.play(rig, rig.ranged ? 'idleGun' : rig.combat > 0 && rig.actions.idleSword ? (u.weapon === 'dual' && rig.actions.dualIdle ? 'dualIdle' : 'idleSword') : 'idle', 0.25);   // 공격 직후엔 전투 자세
    }
    rig.wasAtk = attacking; rig.wasHit = u.flash > 0.1;
    this.step(rig, dt);
  },
};
