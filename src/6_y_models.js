
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
    daniel: { file: 'male',   colors: { White: '#26232e', Purple: '#3b2a4f', LightBlue: '#7a5cff', Hair: '#2d2140', Eyebrows: '#2d2140' } },   // 검보라 후드 (암살자)
    aya:    { file: 'ranged', tint: true },
    rio:    { file: 'ranged', tint: true },
    katja:  { file: 'ranged', tint: true },
    nadine: { file: 'male',   colors: { White: '#5b6640', Purple: '#7a5534', LightBlue: '#e0a35a', Hair: '#5a4632', Eyebrows: '#5a4632' } },   // 사냥꾼: 올리브 셔츠·갈색 후드
  },
  TINT_MATS: ['Green', 'LightGreen', 'Purple', 'White', 'LightBlue'],   // tint: 옷 재질만 실험체 색으로
  ANIM: { idle: 'Idle', idleGun: 'Idle_Gun', run: 'Run', slash: 'Sword_Slash', shoot: 'Gun_Shoot', hit: 'HitRecieve', death: 'Death', roll: 'Roll' },

  supported() { return /^https?:$/.test(location.protocol) && !!(window.THREE && THREE.GLTFLoader && THREE.SkeletonUtils); },
  load() {
    if (this.state !== 'idle') return;
    if (!this.supported() || Settings.models3d === false) { this.state = 'failed'; return; }
    this.state = 'loading';
    const loader = new THREE.GLTFLoader(), keys = Object.keys(this.FILES);
    Promise.all(keys.map(k => new Promise((ok, no) => loader.load(this.DIR + this.FILES[k], ok, undefined, no))))
      .then(list => { list.forEach((g, i) => { this.src[keys[i]] = this.prepare(g); }); this.state = 'ready'; this.ver++; })
      .catch(e => { console.warn('3D 모델을 불러오지 못해 기본 인형을 씁니다:', e); this.state = 'failed'; });
  },
  // 원본 1회 처리: 그림자, 키 측정(뼈 기준 — 스키닝 메시 bbox는 부정확)
  prepare(g) {
    g.scene.traverse(o => { if (o.isMesh) { o.castShadow = true; o.frustumCulled = false; } });
    g.scene.updateMatrixWorld(true);
    const head = g.scene.getObjectByName('Head_end') || g.scene.getObjectByName('Head'), v = new THREE.Vector3();
    const h = head ? head.getWorldPosition(v).y : 1.8;
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
    const key = this.keyFor(u), look = key && this.LOOKS[key], S = look && this.src[look.file];
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
        cache.set(m, c); mats.push(c); return c;
      };
      o.material = Array.isArray(o.material) ? o.material.map(one) : one(o.material);
    });
    // 무기: 오른손 손목 뼈에 부착 (뼈 축척 100배를 상쇄)
    const hand = obj.getObjectByName('WristR') || obj.getObjectByName('Wrist.R');   // GLTFLoader가 이름의 '.'을 지움
    if (hand && weapon) {
      const holder = new T3.Group(); holder.add(weapon);
      holder.scale.setScalar(1 / (S.scale * 100) * 1.0);
      holder.rotation.set(0, 0, Math.PI / 2); holder.position.set(0, 0.0009, 0);   // 뼈의 +Y(손가락 방향) = 무기의 +X(날 방향)
      weapon.position.set(-0.14, 0, 0);
      hand.add(holder);
    }
    const mixer = new T3.AnimationMixer(obj), actions = {};
    for (const [k, n] of Object.entries(this.ANIM)) if (S.clips[n]) actions[k] = mixer.clipAction(S.clips[n]);
    for (const k of ['slash', 'shoot', 'hit', 'roll']) if (actions[k]) actions[k].setLoop(T3.LoopOnce);
    if (actions.death) { actions.death.setLoop(T3.LoopOnce); actions.death.clampWhenFinished = true; }
    const ranged = !!(u.motif && !u.motif.melee);
    const rig = { obj, mixer, actions, cur: null, ranged, oneShot: 0 };
    this.play(rig, ranged ? 'idleGun' : 'idle', 0);
    return rig;
  },
  play(rig, name, fade = 0.15, speed = 1) {
    const a = rig.actions[name] || rig.actions.idle; if (!a) return;
    a.timeScale = speed;
    if (rig.cur === a) return;
    a.reset().play(); if (rig.cur) a.crossFadeFrom(rig.cur, fade, false);
    rig.cur = a;
  },
  // 상태 → 동작. 공격·피격은 한 번 재생 후 원래 동작으로
  animate(rig, u, dt, moving) {
    rig.oneShot = Math.max(0, rig.oneShot - dt);
    const attacking = (u.aa && u.aa.phase === 'windup') || (u.act && (u.act.type === 'aa' || u.act.type === 'cast')) || (u.cast && u.cast.phase !== 'recovery');
    if (attacking && !rig.wasAtk && rig.oneShot <= 0) { const n = rig.ranged ? 'shoot' : 'slash'; this.play(rig, n, 0.08, rig.ranged ? 1.4 : 1.7); rig.oneShot = rig.ranged ? 0.45 : 0.4; }
    else if (u.flash > 0.1 && !rig.wasHit && rig.oneShot <= 0 && !moving) { this.play(rig, 'hit', 0.08, 1.5); rig.oneShot = 0.3; }
    else if (rig.oneShot <= 0) {
      if (u.stun > 0) this.play(rig, 'hit', 0.1, 0.4);
      else if (moving) this.play(rig, 'run', 0.15, clamp((u.speed ? u.speed() : 3.5) / 3.8, 0.75, 1.5));
      else this.play(rig, rig.ranged ? 'idleGun' : 'idle', 0.2);
    }
    rig.wasAtk = attacking; rig.wasHit = u.flash > 0.1;
    rig.mixer.update(dt);
  },
};
