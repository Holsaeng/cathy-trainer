
// ============================== 3D 스킬 이펙트 ==============================
// 게임 로직이 만드는 FX 데이터(베기 slashes · 큰 베기 arcs · 궤적 trails · 파티클 parts)를 3D로 다시 그림 — 게임 로직은 그대로
//   베기·큰 베기: 가슴 높이에서 빛나는 초승달 / 궤적: 공중에 뜬 빛의 띠 / 파티클: 위로 튀었다 떨어지는 불꽃
//   칼 궤적: 플레이어 무기 날 끝이 지나간 길을 매 프레임 기록해 빛 리본으로 (빠르게 휘두를 때만 보임)
// 3D에서는 위 효과를 바닥(데칼)에 중복해서 그리지 않음(Render.drawWorld 'ground'). 충격파 고리·범위 표시는 바닥에 그대로
// 안개 속(시야 밖) 효과는 숨김
const VFX3D = {
  H: 1.0,   // 효과 높이(가슴)
  WIDE: 0.6,   // 이보다 넓은 궤적은 범위 표시(R 돌진 자리 등)라 바닥에 그대로 둠
  on() { return Settings.vfx3d !== false && Renderer.mode === '3d' && Render3D.ready; },
  init(scene) {
    const T3 = THREE;
    this.group = new T3.Group(); scene.add(this.group);
    this.meshes = new Map();   // FX 객체 → 메시
    this.add = { blending: T3.AdditiveBlending, transparent: true, depthWrite: false, side: T3.DoubleSide };
    // 파티클: 점 하나로 많은 불꽃
    this.maxP = 600;
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.BufferAttribute(new Float32Array(this.maxP * 3), 3)); g.setAttribute('color', new T3.BufferAttribute(new Float32Array(this.maxP * 3), 3));
    this.points = new T3.Points(g, new T3.PointsMaterial(Object.assign({ size: 0.13, vertexColors: true, sizeAttenuation: true }, this.add)));
    this.points.frustumCulled = false; this.group.add(this.points);
    Render3D.noLine(this.points.material);
    this.blades = new Map();   // 유닛 id → 칼 궤적 리본들
  },
  mat(color, op) { const m = new THREE.MeshBasicMaterial(Object.assign({ color: new THREE.Color(color).convertSRGBToLinear(), opacity: op }, this.add)); Render3D.noLine(m); return m; },
  seen(x, y) { return !Vision.fogOn || Vision.pointVisible({ x, y }); },
  // ---------- 모양 ----------
  slashGeo(s, r0, r1) {   // 부채꼴 띠 (바닥과 평행)
    const g = new THREE.RingGeometry(Math.max(0.03, r0), r1, 24, 1, -s.half, s.half * 2);
    g.rotateX(Math.PI / 2); return g;
  },
  makeSlash(s) {   // 색 부채꼴 + 바깥쪽 밝은 칼날 테두리(흰 심)
    const m = new THREE.Group(), r0 = s.inner || s.R * 0.55;
    m.add(new THREE.Mesh(this.slashGeo(s, r0, s.R * 0.96), this.mat(s.color, 0.6)));
    m.add(new THREE.Mesh(this.slashGeo(s, s.R * 0.9, s.R * 1.02), this.mat('#ffffff', 0.95)));
    if (s.inner) m.add(new THREE.Mesh(this.slashGeo(s, s.inner * 0.97, s.inner * 1.04), this.mat('#ffffff', 0.8)));
    m.children[1].position.y = 0.008; return m;
  },
  ribbonGeo(pts, w) {   // 점들을 따라 가는 평평한 띠
    const T3 = THREE, pos = [], idx = [];
    for (let i = 0; i < pts.length; i++) {
      const p = pts[i], q = pts[Math.min(pts.length - 1, i + 1)], o = pts[Math.max(0, i - 1)], d = new T3.Vector2(q.x - o.x, q.y - o.y).normalize(), n = { x: -d.y * w / 2, y: d.x * w / 2 };
      pos.push(p.x + n.x, 0, p.y + n.y, p.x - n.x, 0, p.y - n.y);
      if (i < pts.length - 1) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    }
    const g = new T3.BufferGeometry(); g.setAttribute('position', new T3.Float32BufferAttribute(pos, 3)); g.setIndex(idx); return g;
  },
  // ---------- 매 프레임 ----------
  frame(dt) {
    if (!this.group) return;
    const on = this.on(); this.group.visible = on; if (!on) return;
    const live = new Set();
    // 베기: 펼쳐지며 사라짐
    for (const s of FX.slashes) {
      live.add(s); let m = this.meshes.get(s);
      if (!m) { m = this.makeSlash(s); m.position.set(s.x, this.H, s.y); m.rotation.set(0, -s.ang, 0.12); this.group.add(m); this.meshes.set(s, m); }
      const k = s.life / s.max, e = 1 - k; m.children[0].material.opacity = 0.7 * k; m.children[1].material.opacity = Math.min(1, 1.4 * k); if (m.children[2]) m.children[2].material.opacity = 0.9 * k;
      m.scale.setScalar(0.8 + 0.3 * (1 - e * e)); m.visible = this.seen(s.x, s.y);   // 빠르게 펼쳐지며 사라짐
    }
    // 큰 베기(휘어진 궤적): 두 겹 (색 + 흰 심)
    for (const a of FX.arcs) {
      live.add(a); let m = this.meshes.get(a);
      if (!m) {
        const end = V.add(a.a, V.mul(a.dir, a.len)), ctrl = V.add(V.add(a.a, V.mul(a.dir, a.len * 0.5)), V.mul(V.perp(a.dir), a.bend)), pts = [];
        for (let i = 0; i <= 16; i++) { const t = i / 16, u = 1 - t; pts.push({ x: u * u * a.a.x + 2 * u * t * ctrl.x + t * t * end.x, y: u * u * a.a.y + 2 * u * t * ctrl.y + t * t * end.y }); }
        m = new THREE.Group();
        m.add(new THREE.Mesh(this.ribbonGeo(pts, a.width), this.mat(a.color, 0.7)), new THREE.Mesh(this.ribbonGeo(pts, a.width * 0.28), this.mat('#ffffff', 0.9)));
        m.children[1].position.y = 0.01; m.position.y = this.H; this.group.add(m); this.meshes.set(a, m);
      }
      const k = a.life / a.max; m.children[0].material.opacity = 0.75 * k; m.children[1].material.opacity = 0.95 * k; m.visible = this.seen(a.a.x, a.a.y);
    }
    // 궤적(돌진 잔상·X자 베기): 공중에 뜬 띠
    for (const t of FX.trails) {
      if (t.width > this.WIDE) continue;
      live.add(t); let m = this.meshes.get(t);
      if (!m) { m = new THREE.Mesh(this.ribbonGeo([t.a, t.b], t.width), this.mat(t.color, 0.6)); m.position.y = this.H * 0.85; this.group.add(m); this.meshes.set(t, m); }
      m.material.opacity = 0.65 * t.life / t.max; m.visible = this.seen(t.a.x, t.a.y) || this.seen(t.b.x, t.b.y);
    }
    for (const [k, m] of this.meshes) if (!live.has(k)) { this.group.remove(m); m.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); this.meshes.delete(k); }
    // 파티클: 높이를 붙여 위로 튀었다 떨어짐
    const P = this.points.geometry.attributes.position, C = this.points.geometry.attributes.color, col = new THREE.Color(); let n = 0;
    for (const p of FX.parts) {
      if (n >= this.maxP) break;
      if (p.h === undefined) { p.h = this.H * (0.6 + Math.random() * 0.6); p.vh = 1 + Math.random() * 2.5; }
      p.h = Math.max(0.03, p.h + p.vh * dt); p.vh -= 9 * dt;
      if (!this.seen(p.x, p.y)) continue;
      col.set(p.color).convertSRGBToLinear().multiplyScalar(Math.min(1, p.life / p.max * 1.3));
      P.setXYZ(n, p.x, p.h, p.y); C.setXYZ(n, col.r, col.g, col.b); n++;
    }
    this.points.geometry.setDrawRange(0, n); P.needsUpdate = true; C.needsUpdate = true;
    this.updateBlades(dt);
  },
  // ---------- 칼 궤적 ----------
  BLADE_N: 12,
  updateBlades(dt) {
    const T3 = THREE, seenIds = new Set();
    for (const u of Game.units) {
      const m = Render3D.unitMeshes.get(u.id), rig = m && m.userData.body.userData.rig;
      if (!rig || !rig.blades || !rig.blades.length || !m.visible) continue;
      seenIds.add(u.id);
      let B = this.blades.get(u.id);
      if (B && B.rig !== rig) { for (const b of B) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); } B = null; }   // 모델이 다시 만들어지면 새로
      if (!B) {
        const color = u.charKey === 'daniel' ? '#c9a4ff' : u.team === myTeam() ? '#ffe1ea' : '#ffb0b0';
        B = rig.blades.map(bl => {
          const g = new T3.BufferGeometry(), N = this.BLADE_N;
          g.setAttribute('position', new T3.BufferAttribute(new Float32Array(N * 2 * 3), 3)); g.setAttribute('color', new T3.BufferAttribute(new Float32Array(N * 2 * 3), 3));
          const idx = []; for (let i = 0; i < N - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); } g.setIndex(idx);
          const mesh = new T3.Mesh(g, Render3D.noLine(new T3.MeshBasicMaterial(Object.assign({ vertexColors: true }, this.add)))); mesh.frustumCulled = false; this.group.add(mesh);
          return { bl, mesh, hist: [], color: new T3.Color(color).convertSRGBToLinear() };
        });
        B.rig = rig; this.blades.set(u.id, B);
      }
      for (const b of B) {
        b.bl.mesh.updateWorldMatrix(true, false);
        const tip = new T3.Vector3(0, -b.bl.len / 2, 0).applyMatrix4(b.bl.mesh.matrixWorld), base = new T3.Vector3(0, b.bl.len / 2, 0).applyMatrix4(b.bl.mesh.matrixWorld);
        b.hist.unshift({ tip, base }); if (b.hist.length > this.BLADE_N) b.hist.pop();
        const P = b.mesh.geometry.attributes.position, C = b.mesh.geometry.attributes.color, N = this.BLADE_N;
        for (let i = 0; i < N; i++) {
          const h = b.hist[Math.min(i, b.hist.length - 1)], prev = b.hist[Math.min(i + 1, b.hist.length - 1)];
          const speed = h.tip.distanceTo(prev.tip) / Math.max(1e-3, dt), k = (1 - i / (N - 1)) * Math.min(1, Math.max(0, (speed - 2.5) / 6));   // 빠를수록 진하게, 오래된 점일수록 흐리게
          P.setXYZ(i * 2, h.tip.x, h.tip.y, h.tip.z); P.setXYZ(i * 2 + 1, h.base.x, h.base.y, h.base.z);
          C.setXYZ(i * 2, b.color.r * k, b.color.g * k, b.color.b * k); C.setXYZ(i * 2 + 1, b.color.r * k * 0.35, b.color.g * k * 0.35, b.color.b * k * 0.35);
        }
        P.needsUpdate = true; C.needsUpdate = true; b.mesh.geometry.computeBoundingSphere();
      }
    }
    for (const [id, B] of this.blades) if (!seenIds.has(id)) { for (const b of B) { this.group.remove(b.mesh); b.mesh.geometry.dispose(); b.mesh.material.dispose(); } this.blades.delete(id); }
  },
  clear() { if (!this.group) return; for (const [k, m] of this.meshes) { this.group.remove(m); } this.meshes.clear(); for (const [id, B] of this.blades) for (const b of B) this.group.remove(b.mesh); this.blades.clear(); },
};
