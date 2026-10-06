
// ============================== 직접 만든 3D 모델 (코드 생성) ==============================
// 설계(src/6_y_designs.js의 DESIGNS)를 읽어 모양(메시)을 만들고, 뼈대·동작은 CC0 모델의 것을 그대로 빌려 씀
//   → 평타 동기화·쌍검 동작·스킬 동작이 그대로 돌아감. Blender 스크립트(tools/blender/make_model.py)도 같은 설계·같은 규칙을 씀
//   1) CC0 뼈대를 복제해 바인드 자세(T자세)로 되돌림  2) 설계의 도형(구·원통·회전체·상자·고리)을 뼈 위치 기준으로 만듦
//   3) 정점마다 후보 뼈 중 가까운 두 개에 가중치(거리^-4 비율)  4) 원래 메시를 지우고 새 메시로 교체, 기준 자세 되돌림
// IP 기준선: 직업·체형·머리 길이·피부톤 같은 일반 요소만 사용, 원본 고유 디자인 요소는 넣지 않음 (README 「IP 기준선」)
const Procgen = {
  build(S, D) {
    const T3 = THREE, o = THREE.SkeletonUtils.clone(S.scene); o.scale.setScalar(S.scale); o.updateMatrixWorld(true);
    let sk = null; const olds = []; o.traverse(m => { if (m.isSkinnedMesh) { olds.push(m); if (!sk) sk = m.skeleton; } });
    if (!sk) return null;
    const keep = sk.bones.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);   // 원래 노드 자세(무기·소품 부착 기준과 같게 되돌리기 위해)
    sk.pose(); o.updateMatrixWorld(true);   // 바인드 자세(T자세)에서 모양을 만듦
    const BP = n => { const b = o.getObjectByName(n); if (!b) throw new Error('뼈 없음: ' + n); const v = b.getWorldPosition(new T3.Vector3()); return [v.x, v.y, v.z]; };
    const seg = this.segments(sk.bones, BP), parts = this.expand(D, BP);
    for (const m of olds) m.parent.remove(m);
    const byColor = new Map(); for (const p of parts) { if (!byColor.has(p.c)) byColor.set(p.c, []); byColor.get(p.c).push(p); }
    const inv = new T3.Matrix4().copy(o.matrixWorld).invert(), skel = new T3.Skeleton(sk.bones);
    for (const [c, list] of byColor) {
      const geo = this.mergeSkinned(list, seg, inv, D.skirt);
      const mat = new T3.MeshStandardMaterial({ roughness: 0.82, metalness: 0.02, flatShading: true, skinning: true, side: T3.DoubleSide });
      mat.color.set(D.colors[c] || '#ff00ff').convertSRGBToLinear(); mat.name = 'proc';
      const mesh = new T3.SkinnedMesh(geo, mat); mesh.castShadow = true; mesh.frustumCulled = false;
      o.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(skel, mesh.matrixWorld);
    }
    sk.bones.forEach((b, i) => { b.position.copy(keep[i][0]); b.quaternion.copy(keep[i][1]); b.scale.copy(keep[i][2]); });   // CC0 모델과 같은 기준 자세 → 손 무기·소품·쌍검 칼날 방향이 그대로 맞음
    o.scale.setScalar(1);   // Models.prepare와 같은 규약: 원본 축척(게임에서 S.scale 적용)
    return { scene: o, scale: S.scale, clips: S.clips, proc: true, design: D };
  },
  // Blender 모델 붙이기: Blender 파일(local/<키>_custom.glb)에서는 모양(메시·음영·가중치)만 가져오고 뼈대·동작은 원본 CC0 것을 그대로 씀
  //   (Blender로 내보내면 뼈의 기본 방향·끝점이 다시 계산돼 다리 동작이 어긋나 발이 부츠에서 떨어졌음) → 직접 만든 모델과 똑같이 다리 보정·쌍검 동작·무기 위치가 맞음
  rebind(S, g, D) {
    const T3 = THREE, o = THREE.SkeletonUtils.clone(S.scene); o.scale.setScalar(S.scale); o.updateMatrixWorld(true);
    let sk = null; const olds = []; o.traverse(m => { if (m.isSkinnedMesh) { olds.push(m); if (!sk) sk = m.skeleton; } });
    if (!sk) return null;
    const keep = sk.bones.map(b => [b.position.clone(), b.quaternion.clone(), b.scale.clone()]);
    sk.pose(); o.updateMatrixWorld(true);
    for (const m of olds) m.parent.remove(m);
    const skel = new T3.Skeleton(sk.bones), byName = new Map(sk.bones.map((b, i) => [b.name, i]));
    const toLocal = new T3.Matrix4().copy(o.matrixWorld).invert().multiply(new T3.Matrix4().makeScale(S.scale, S.scale, S.scale));   // Blender 파일 월드(원본 축척) → 이 모델 안쪽 좌표
    g.scene.updateMatrixWorld(true);
    let n = 0;
    g.scene.traverse(m => {
      if (!m.isSkinnedMesh) return;
      const geo = m.geometry.clone(); geo.applyMatrix4(new T3.Matrix4().copy(toLocal).multiply(m.bindMatrix));   // 바인드 자세(T자세) 모양 그대로
      const si = geo.attributes.skinIndex;
      const map = i => { const b = m.skeleton.bones[i], j = b ? byName.get(b.name) : undefined; return j === undefined ? 0 : j; }, idx = new Uint16Array(si.count * 4);   // 뼈 번호를 이름으로 다시 맞춤
      for (let i = 0; i < si.count; i++) { idx[i * 4] = map(si.getX(i)); idx[i * 4 + 1] = map(si.getY(i)); idx[i * 4 + 2] = map(si.getZ(i)); idx[i * 4 + 3] = map(si.getW(i)); }
      geo.setAttribute('skinIndex', new T3.Uint16BufferAttribute(idx, 4));
      const mat = m.material.clone(); mat.skinning = true; mat.name = 'blend';
      const mesh = new T3.SkinnedMesh(geo, mat); mesh.castShadow = true; mesh.frustumCulled = false;
      o.add(mesh); mesh.updateMatrixWorld(true); mesh.bind(skel, mesh.matrixWorld); n++;
    });
    if (!n) return null;
    sk.bones.forEach((b, i) => { b.position.copy(keep[i][0]); b.quaternion.copy(keep[i][1]); b.scale.copy(keep[i][2]); });
    o.scale.setScalar(1);
    return { scene: o, scale: S.scale, clips: S.clips, proc: true, design: D, blend: true };
  },
  // 뼈 구간(뼈 → 끝): 가중치 계산용
  TIP: { Hips: 'Abdomen', Abdomen: 'Torso', Torso: 'Chest', Chest: 'Neck', Neck: 'Head', UpperArmL: 'LowerArmL', LowerArmL: 'WristL', UpperArmR: 'LowerArmR', LowerArmR: 'WristR', UpperLegL: 'LowerLegL', UpperLegR: 'LowerLegR', ShoulderL: 'UpperArmL', ShoulderR: 'UpperArmR' },
  segments(bones, BP) {
    const seg = {};
    bones.forEach((b, i) => {
      const n = b.name, a = BP(n); let t;
      if (this.TIP[n]) t = BP(this.TIP[n]);
      else if (n === 'Head') t = [a[0], a[1] + 0.24, a[2]];
      else if (/^Wrist/.test(n)) t = [a[0] + (n.endsWith('L') ? 0.09 : -0.09), a[1], a[2]];
      else if (/^LowerLeg/.test(n)) t = [a[0], 0.07, a[2] - 0.01];
      else if (/^Foot/.test(n)) t = [a[0], a[1], a[2] + 0.14];
      else return;
      seg[n] = [new THREE.Vector3(...a), new THREE.Vector3(...t), i];
    });
    return seg;
  },
  // 설계 → 도형 목록 (좌우 대칭 펼치기, 점 위치 풀기)
  expand(D, BP) {
    const out = [];
    for (const p of D.parts) for (const side of p.sym ? [1, -1] : [1]) {
      const sn = side > 0 ? 'L' : 'R', bn = n => n.replace('%', sn), mx = v => [v[0] * side, v[1], v[2]];
      const rel = p.rel ? BP(p.rel) : [0, 0, 0];
      const pt = q => {
        if (Array.isArray(q)) { const v = mx(q); return [v[0] + rel[0], v[1] + rel[1], v[2] + rel[2]]; }
        const b = BP(bn(q.b)), oo = mx(q.o || [0, 0, 0]), v = [b[0] + oo[0], b[1] + oo[1], b[2] + oo[2]];
        if (q.set) for (const [k, val] of Object.entries(q.set)) v['xyz'.indexOf(k)] = k === 'x' ? val * side : val;
        return v;
      };
      const rot = p.rot ? [p.rot[0], p.rot[1] * side, p.rot[2] * side] : null;
      let g;
      if (p.t === 'sphere') g = this.gSphere(pt(p.at), p.s, p.seg || [10, 8], p.ang, rot);
      else if (p.t === 'tube') g = this.gTube(pt(p.a), pt(p.b), p.r[0], p.r[1], p.seg || 8, p.rings || 2, p.over || 0);
      else if (p.t === 'lathe') g = this.gLathe(p.prof.map(([r, y]) => [r, y + rel[1]]), (p.cz || 0) + rel[2], p.zs || 1, p.n || 12, p.p);
      else if (p.t === 'box') g = this.gBox(pt(p.at), p.s, rot);
      else if (p.t === 'torus') g = this.gTorus(pt(p.at), p.R, p.r, p.zs || 1, rot);
      else continue;
      out.push({ v: g.v, f: g.f, c: p.c, w: p.w.map(bn), skirt: !!p.skirt });
    }
    return out;
  },
  // ---------- 도형 생성 (게임 좌표 m) — Blender 스크립트에 같은 식이 있음 ----------
  rotate(v, rot) {   // 오일러 XYZ (Three.js 'XYZ' 순서)
    if (!rot) return v; const q = new THREE.Vector3(...v).applyEuler(new THREE.Euler(rot[0], rot[1], rot[2], 'XYZ')); return [q.x, q.y, q.z];
  },
  gSphere(c, s, sg, ang, rot) {
    const [w, h] = sg, [p0, pl, t0, tl] = (ang || [0, 2, 0, 1]).map(x => x * Math.PI), v = [], f = [];
    for (let iy = 0; iy <= h; iy++) for (let ix = 0; ix <= w; ix++) {
      const ph = p0 + ix / w * pl, th = t0 + iy / h * tl;
      const q = this.rotate([-Math.cos(ph) * Math.sin(th) * s[0], Math.cos(th) * s[1], Math.sin(ph) * Math.sin(th) * s[2]], rot);
      v.push([q[0] + c[0], q[1] + c[1], q[2] + c[2]]);
    }
    const id = (ix, iy) => iy * (w + 1) + ix;
    for (let iy = 0; iy < h; iy++) for (let ix = 0; ix < w; ix++) { const a = id(ix + 1, iy), b = id(ix, iy), cc = id(ix, iy + 1), d = id(ix + 1, iy + 1); f.push([a, b, d], [b, cc, d]); }
    return { v, f };
  },
  gTube(a, b, r0, r1, n, rings, over) {
    const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A);
    if (over) { A.addScaledVector(d, -over / 2); B.addScaledVector(d, over / 2); d.subVectors(B, A); }
    const L = d.length(), q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.clone().normalize()), v = [], f = [];
    for (let j = 0; j <= rings; j++) {
      const t = j / rings, r = r0 + (r1 - r0) * t, y = t * L;
      for (let i = 0; i < n; i++) { const th = i / n * Math.PI * 2, p = new THREE.Vector3(r * Math.sin(th), y, r * Math.cos(th)).applyQuaternion(q).add(A); v.push([p.x, p.y, p.z]); }
    }
    for (let j = 0; j < rings; j++) for (let i = 0; i < n; i++) { const i2 = (i + 1) % n, a0 = j * n + i, a1 = j * n + i2, b0 = (j + 1) * n + i, b1 = (j + 1) * n + i2; f.push([a0, a1, b0], [a1, b1, b0]); }
    const c0 = v.length; v.push([A.x, A.y, A.z]); const c1 = v.length; v.push([B.x, B.y, B.z]);
    for (let i = 0; i < n; i++) { const i2 = (i + 1) % n; f.push([c0, i2, i], [c1, rings * n + i, rings * n + i2]); }
    return { v, f };
  },
  gLathe(prof, cz, zs, n, p) {
    const [p0, pl] = (p || [0, 2]).map(x => x * Math.PI), m = prof.length, v = [], f = [];
    for (let i = 0; i <= n; i++) { const ph = p0 + i / n * pl; for (const [r, y] of prof) v.push([r * Math.sin(ph), y, r * Math.cos(ph) * zs + cz]); }
    for (let i = 0; i < n; i++) for (let j = 0; j < m - 1; j++) { const a = i * m + j, b = (i + 1) * m + j, c = b + 1, d = a + 1; f.push([a, b, d], [c, d, b]); }
    return { v, f };
  },
  gBox(c, s, rot) {
    const v = [], f = [], h = s.map(x => x / 2);
    const faces = [[[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]], [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]];
    for (const fc of faces) { const b = v.length; for (const k of fc) { const q = this.rotate([k[0] * h[0], k[1] * h[1], k[2] * h[2]], rot); v.push([q[0] + c[0], q[1] + c[1], q[2] + c[2]]); } f.push([b, b + 1, b + 2], [b, b + 2, b + 3]); }
    return { v, f };
  },
  gTorus(c, R, r, zs, rot, nu = 14, nv = 5) {
    const v = [], f = [];
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
      const u = i / nu * Math.PI * 2, w = j / nv * Math.PI * 2, rr = R + r * Math.cos(w);
      const q = this.rotate([rr * Math.cos(u), r * Math.sin(w), rr * Math.sin(u) * zs], rot); v.push([q[0] + c[0], q[1] + c[1], q[2] + c[2]]);
    }
    for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const i2 = (i + 1) % nu, j2 = (j + 1) % nv, a = i * nv + j, b = i2 * nv + j, cc = i2 * nv + j2, d = i * nv + j2; f.push([a, d, b], [b, d, cc]); }
    return { v, f };
  },
  // 정점 가중치: 후보 뼈 구간과의 거리로 가까운 두 개 (거리^-4 비율). 자락(skirt)은 엉덩이 위주 + 아래로 갈수록 같은 쪽 다리 조금(가운데 솔기는 엉덩이 고정)
  mergeSkinned(list, seg, inv, sk) {
    const T3 = THREE, pos = [], idx = [], si = [], sw = [], v = new T3.Vector3(), ab = new T3.Vector3(), av = new T3.Vector3();
    const SK = sk || { top: 0.9, span: 0.45, max: 0.5 };
    let base = 0;
    for (const p of list) {
      const cands = p.w.filter(b => seg[b]);
      for (const q of p.v) {
        v.set(q[0], q[1], q[2]);
        if (p.skirt && v.y < SK.top && seg.Hips && seg.UpperLegL) {
          const leg = seg[v.x > 0 ? 'UpperLegL' : 'UpperLegR'], k = clamp((SK.top - v.y) / SK.span, 0, 1) * SK.max * clamp(Math.abs(v.x) / 0.06, 0, 1);
          si.push(seg.Hips[2], leg[2], 0, 0); sw.push(1 - k, k, 0, 0);
        } else {
          const ds = cands.map(b => { const [a, t, bi] = seg[b]; ab.subVectors(t, a); av.subVectors(v, a); const k = clamp(av.dot(ab) / Math.max(1e-9, ab.lengthSq()), 0, 1); return [a.clone().addScaledVector(ab, k).distanceTo(v), bi]; }).sort((x, y) => x[0] - y[0]);
          const w = ds.slice(0, 2).map(([d]) => 1 / Math.pow(d + 0.012, 4)), tot = w.reduce((x, y) => x + y, 0);
          si.push(ds[0][1], ds[1] ? ds[1][1] : 0, 0, 0); sw.push(w[0] / tot, ds[1] ? w[1] / tot : 0, 0, 0);
        }
        v.applyMatrix4(inv); pos.push(v.x, v.y, v.z);
      }
      for (const t of p.f) idx.push(t[0] + base, t[1] + base, t[2] + base);
      base += p.v.length;
    }
    const geo = new T3.BufferGeometry();
    geo.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); geo.setIndex(idx);
    geo.setAttribute('skinIndex', new T3.Uint16BufferAttribute(si, 4)); geo.setAttribute('skinWeight', new T3.Float32BufferAttribute(sw, 4));
    geo.computeVertexNormals(); return geo;
  },
};
