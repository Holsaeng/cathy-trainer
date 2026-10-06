
// ============================== 직접 만든 동작 (쌍검) ==============================
// CC0 모델에는 쌍검 동작이 없어(복싱 펀치뿐) 코드로 만든다:
//   핵심 순간(키프레임)마다 「손 위치 · 칼날 방향 · 상체 비틀기」를 정하고, 두 관절 IK로 어깨·팔꿈치·손목 각도를 계산해 클립으로 굽는다(bake)
//   다리·몸통 흔들림은 원래의 전투 대기 동작(Idle_Sword)을 그대로 쓰고 팔·가슴만 덮어씀
// 키: [시간, 자세 이름들(뒤가 덮어씀), 상체 비틀기 yaw(+ 왼쪽으로 돎), 상체 숙이기 pitch(+ 앞으로)]
// 좌표: 모델 기준(m) — 위 +Y · 정면 +Z · 오른손 쪽 -X. 어깨 높이 ≈1.29m, 팔 길이 ≈0.41m
const Motions = {
  FPS: 60,
  // 쌍검 동작 정의. R/L = [손 위치, 칼날 방향], yaw = 상체 비틀기(+ 왼쪽으로 돎)
  POSE: {
    ready:  { R: [[-0.20, 1.02, 0.30], [0.15, -0.2, 1]],   L: [[0.20, 1.02, 0.30], [-0.15, -0.2, 1]] },     // 양손 칼을 앞쪽 낮게 겨눔
    windR:  { R: [[-0.32, 1.52, -0.04], [-0.35, 0.7, -0.55]] },                                             // 오른손 높이 뒤로
    hitR:   { R: [[0.10, 1.00, 0.36], [0.75, -0.5, 0.45]] },                                               // 오른손 대각선 내려 베기 끝
    backR:  { R: [[-0.25, 1.02, 0.22], [-0.1, -0.3, 1]] },
    windL:  { L: [[0.32, 1.50, -0.02], [0.35, 0.7, -0.55]] },
    hitL:   { L: [[-0.10, 1.00, 0.36], [-0.75, -0.5, 0.45]] },
    lowL:   { L: [[0.22, 0.98, 0.22], [-0.1, -0.3, 1]] },
    windX:  { R: [[-0.32, 1.48, -0.02], [-0.4, 0.7, -0.4]], L: [[0.32, 1.48, -0.02], [0.4, 0.7, -0.4]] },   // 양손 바깥 위로
    hitX:   { R: [[0.06, 1.08, 0.40], [0.65, -0.4, 0.6]],  L: [[-0.06, 1.12, 0.40], [-0.65, -0.35, 0.6]] },  // 앞에서 X자 교차
  },
  // 클립: [시간, 자세 이름들(뒤가 덮어씀), 상체 비틀기]
  CLIPS: {
    DualAA:   { dur: 0.75, keys: [[0, ['ready'], 0, 0.04], [0.18, ['ready', 'windR', 'lowL'], -0.42, -0.06], [0.32, ['ready', 'hitR', 'windL'], 0.28, 0.2], [0.44, ['ready', 'backR', 'hitL'], -0.28, 0.22], [0.75, ['ready'], 0, 0.04]] },
    DualX:    { dur: 0.70, keys: [[0, ['ready'], 0, 0.04], [0.22, ['windX'], 0, -0.1], [0.38, ['hitX'], 0, 0.28], [0.70, ['ready'], 0, 0.04]] },
    DualIdle: { dur: null, loop: true, keys: [[0, ['ready'], 0, 0.06]] },   // 살짝 숙인 전투 자세
  },
  // 타격 순간(클립 시간) — Models.MELEE 형식
  HITS: { DualAA: { s: 0.02, hit: 0.32, hit2: 0.44, end: 0.75 }, DualX: { s: 0.04, hit: 0.38, end: 0.70 } },

  bake(S) {
    const T3 = THREE, base = S.clips.Idle_Sword || S.clips.Idle; if (!base) return;
    const o = THREE.SkeletonUtils.clone(S.scene); o.scale.setScalar(S.scale); o.updateMatrixWorld(true);
    const B = n => o.getObjectByName(n), bones = []; o.traverse(b => { if (b.isBone) bones.push(b); });
    if (S.refPose && S.clips[S.refPose]) { const mx = new T3.AnimationMixer(o); mx.clipAction(S.clips[S.refPose]).play(); mx.setTime(0); o.updateMatrixWorld(true); mx.stopAllAction(); }   // 칼날 기준 = 무기 부착 기준 자세
    const arms = { R: ['UpperArmR', 'LowerArmR', 'WristR'].map(B), L: ['UpperArmL', 'LowerArmL', 'WristL'].map(B) }, chest = B('Chest');
    if (!arms.R[0] || !arms.L[0] || !chest) return;
    // 칼날 방향(손목 기준): 무기 틀은 바인드 자세에서 모델 축에 맞춰 붙으므로 칼날 = 모델 -Y
    const blade = {}; for (const s of ['R', 'L']) blade[s] = new T3.Vector3(0, -1, 0).applyQuaternion(arms[s][2].getWorldQuaternion(new T3.Quaternion()).invert());
    const mixer = new T3.AnimationMixer(o), act = mixer.clipAction(base); act.play();
    for (const [name, def] of Object.entries(this.CLIPS)) {
      const dur = def.dur || base.duration, n = Math.max(2, Math.round(dur * this.FPS) + 1), times = [], q = new Map(), pos = new Map();
      for (let i = 0; i < n; i++) {
        const t = dur * i / (n - 1); times.push(t);
        mixer.setTime(t % base.duration); o.updateMatrixWorld(true);
        const k = this.sample(def.keys, t);
        this.rotWorld(chest, new T3.Quaternion().setFromAxisAngle(new T3.Vector3(0, 1, 0), k.yaw));
        if (k.pitch) this.rotWorld(chest, new T3.Quaternion().setFromAxisAngle(new T3.Vector3(1, 0, 0), k.pitch));
        for (const s of ['R', 'L']) if (k[s]) {
          const [U, Lo, W] = arms[s], side = s === 'R' ? -1 : 1;
          const sh = U.getWorldPosition(new T3.Vector3()), pole = sh.clone().add(new T3.Vector3(side * 0.35, -0.3, -0.25));
          this.ik(U, Lo, W, new T3.Vector3(...k[s][0]), pole);
          const want = new T3.Vector3(...k[s][1]).normalize(), cur = blade[s].clone().applyQuaternion(W.getWorldQuaternion(new T3.Quaternion()));
          this.rotWorld(W, new T3.Quaternion().setFromUnitVectors(cur.normalize(), want));
        }
        for (const b of bones) {
          if (!q.has(b.name)) q.set(b.name, []); b.quaternion.toArray(q.get(b.name), q.get(b.name).length);
          if (b.name === 'Hips' || b.name === 'Root') { if (!pos.has(b.name)) pos.set(b.name, []); b.position.toArray(pos.get(b.name), pos.get(b.name).length); }
        }
      }
      const tracks = [];
      for (const [bn, v] of q) tracks.push(new T3.QuaternionKeyframeTrack(bn + '.quaternion', times, v));
      for (const [bn, v] of pos) tracks.push(new T3.VectorKeyframeTrack(bn + '.position', times, v));
      S.clips[name] = new T3.AnimationClip(name, dur, tracks);
    }
    act.stop();
  },
  // 키프레임 사이를 부드럽게(가속·감속) 보간한 손 위치·칼날 방향·비틀기
  sample(keys, t) {
    let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++;
    const a = keys[i], b = keys[Math.min(keys.length - 1, i + 1)], span = Math.max(1e-6, b[0] - a[0]);
    const u = clamp((t - a[0]) / span, 0, 1), e = u * u * (3 - 2 * u);
    const pa = this.merge(a[1]), pb = this.merge(b[1]), out = { yaw: lerp(a[2], b[2], e), pitch: lerp(a[3] || 0, b[3] || 0, e) };
    for (const s of ['R', 'L']) {
      const A = pa[s], Bv = pb[s] || A; if (!A) continue;
      out[s] = [A[0].map((x, j) => lerp(x, Bv[0][j], e)), A[1].map((x, j) => lerp(x, Bv[1][j], e))];
    }
    return out;
  },
  merge(names) { const o = {}; for (const n of names) Object.assign(o, this.POSE[n]); return o; },
  // 뼈를 월드 기준 회전 dq만큼 돌림
  rotWorld(bone, dq) {
    const T3 = THREE, w = bone.getWorldQuaternion(new T3.Quaternion()), pw = bone.parent.getWorldQuaternion(new T3.Quaternion());
    bone.quaternion.copy(pw.invert().multiply(dq.multiply(w))); bone.updateMatrixWorld(true);
  },
  // 두 관절 IK: 어깨→팔꿈치→손목을 목표 손 위치에 맞춤 (팔꿈치는 pole 쪽으로 굽힘)
  ik(U, Lo, W, target, pole) {
    const T3 = THREE, s = U.getWorldPosition(new T3.Vector3()), e = Lo.getWorldPosition(new T3.Vector3()), w = W.getWorldPosition(new T3.Vector3());
    const a = s.distanceTo(e), b = e.distanceTo(w), dv = target.clone().sub(s), d = clamp(dv.length(), 0.05, a + b - 1e-3), dir = dv.normalize();
    const cosA = clamp((a * a + d * d - b * b) / (2 * a * d), -1, 1), sinA = Math.sqrt(1 - cosA * cosA);
    const pv = pole.clone().sub(s), perp = pv.sub(dir.clone().multiplyScalar(pv.dot(dir))).normalize();
    const e2 = s.clone().add(dir.clone().multiplyScalar(a * cosA)).add(perp.multiplyScalar(a * sinA));
    this.rotWorld(U, new T3.Quaternion().setFromUnitVectors(e.clone().sub(s).normalize(), e2.clone().sub(s).normalize()));
    const e3 = Lo.getWorldPosition(new T3.Vector3()), w3 = W.getWorldPosition(new T3.Vector3()), tgt = s.clone().add(dir.clone().multiplyScalar(d));
    this.rotWorld(Lo, new T3.Quaternion().setFromUnitVectors(w3.sub(e3).normalize(), tgt.sub(e3).normalize()));
  },
};
