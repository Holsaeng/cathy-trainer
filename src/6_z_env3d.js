
// ============================== 3D 환경 연출 ==============================
// ① 낮밤 조명: 낮↔밤이 바뀌면 몇 초에 걸쳐 천천히 바뀌고, 중간에 노을빛(해가 낮게 → 그림자가 길어짐)
// ② 크로노 스피어 차단벽: 반경을 따라 붉게 일렁이는 빛의 벽 (다음 이동 지점은 옅은 흰 벽)
// ③ 날씨(설정): 맑음 / 비(빗줄기·물방울 튐·가끔 번개) / 안개(멀리 갈수록 흐려짐) — 보기만 바뀌고 게임 판정은 그대로
const Env3D = {
  FADE: 3.2,   // 낮밤 전환 시간(초)
  COL: { day: '#fff1d6', night: '#8fa8ff', dusk: '#ffa060', bgDay: '#1a2130', bgNight: '#0b0f1a', bgDusk: '#3a2430' },
  init(scene) {
    const T3 = THREE; this.scene = scene; this.k = 1; this.flash = 0; this.boltT = 8;
    // 스피어 벽: 위로 갈수록 투명해지는 세로 줄무늬가 흐름
    const wallMat = c => Render3D.noLine(new T3.ShaderMaterial({
      uniforms: { t: { value: 0 }, color: { value: new T3.Color(c) }, op: { value: 1 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform float t; uniform vec3 color; uniform float op; varying vec2 vUv;' +
        'void main(){ float h = 1.0 - vUv.y; float s = 0.55 + 0.25 * sin(vUv.x * 260.0 + t * 2.2) + 0.2 * sin(vUv.y * 18.0 - t * 3.5);' +
        ' float a = pow(h, 1.6) * s * op + smoothstep(0.93, 1.0, h) * 0.5 * op; gl_FragColor = vec4(color * (0.8 + 0.6 * h), a); }',
      transparent: true, depthWrite: false, side: T3.DoubleSide, blending: T3.AdditiveBlending,
    }));
    const cyl = () => new T3.CylinderGeometry(1, 1, this.WALL_H, 128, 1, true).translate(0, this.WALL_H / 2, 0);
    this.wall = new T3.Mesh(cyl(), wallMat('#ff3a50')); this.wall.frustumCulled = false; this.wall.renderOrder = 5; scene.add(this.wall);
    this.next = new T3.Mesh(cyl(), wallMat('#cfe8ff')); this.next.frustumCulled = false; this.next.renderOrder = 5; scene.add(this.next);
    this.wall.visible = this.next.visible = false;
    // 비: 기울어진 빗줄기(선분) + 바닥에 튀는 물방울(점)
    const N = this.RAIN_N, pos = new Float32Array(N * 6); this.drops = [];
    for (let i = 0; i < N; i++) this.drops.push({ x: Math.random(), z: Math.random(), y: Math.random() * this.RAIN_H, v: 0.8 + Math.random() * 0.4 });
    const rg = new T3.BufferGeometry(); rg.setAttribute('position', new T3.BufferAttribute(pos, 3));
    this.rain = new T3.LineSegments(rg, Render3D.noLine(new T3.LineBasicMaterial({ color: new T3.Color('#a9bedf').convertSRGBToLinear(), transparent: true, opacity: 0.42, depthWrite: false })));
    this.rain.frustumCulled = false; this.rain.visible = false; scene.add(this.rain);
    const sg = new T3.BufferGeometry(); sg.setAttribute('position', new T3.BufferAttribute(new Float32Array(this.SPLASH_N * 3), 3));
    this.splash = new T3.Points(sg, Render3D.noLine(new T3.PointsMaterial({ color: new T3.Color('#d6e4ff').convertSRGBToLinear(), size: 0.09, transparent: true, opacity: 0.7, depthWrite: false })));
    this.splash.frustumCulled = false; this.splash.visible = false; scene.add(this.splash);
    this.fog = new T3.Fog('#1a2130', 30, 90);
  },
  WALL_H: 3.2, RAIN_N: 1600, RAIN_H: 16, RAIN_W: 46, RAIN_D: 34, SPLASH_N: 160,
  weather() { return Settings.weather || 'clear'; },
  // 새 판이 시작되면 전환 없이 바로 그 시간대로
  snapIfNew() { if (this.ref !== Game.opts || this.refState !== (Game.state === 'menu')) { this.ref = Game.opts; this.refState = Game.state === 'menu'; return true; } return false; },
  frame(dt) {
    if (!this.scene) return;
    const R = Render3D, T3 = THREE, W = this.weather();
    // ---------- ① 낮밤 ----------
    const want = Vision.fogOn && Vision.night && Game.state !== 'menu' ? 0 : 1;
    if (this.snapIfNew()) this.k = want;
    this.k += clamp(want - this.k, -dt / this.FADE, dt / this.FADE);
    const k = this.k, dusk = 1 - Math.abs(2 * k - 1), dim = W === 'rain' ? 0.72 : W === 'fog' ? 0.88 : 1;
    const C = this.COL, c = new T3.Color(C.night).lerp(new T3.Color(C.day), k).lerp(new T3.Color(C.dusk), dusk * 0.65);
    const bg = new T3.Color(C.bgNight).lerp(new T3.Color(C.bgDay), k).lerp(new T3.Color(C.bgDusk), dusk * 0.6);
    if (W === 'fog') bg.lerp(new T3.Color('#56606e'), 0.35 * (0.4 + 0.6 * k)); else if (W === 'rain') bg.lerp(new T3.Color('#262c36'), 0.4);
    // 번개: 비 오는 날 가끔 하늘이 번쩍 → 잠시 뒤 천둥
    if (W === 'rain' && Game.state === 'play' && !Game.paused && (this.boltT -= dt) <= 0) {
      this.boltT = 14 + Math.random() * 18; this.flash = 1; setTimeout(() => Sfx.play('thunder'), 300 + Math.random() * 900);
    }
    this.flash = Math.max(0, this.flash - dt * 3.5); const fl = this.flash * (0.6 + 0.4 * Math.sin(this.flash * 30));
    R.hemi.intensity = lerp(0.28, 0.6, k) * dim + fl * 0.9; R.sun.intensity = lerp(0.22, 1.0, k) * dim * (W === 'rain' ? 0.7 : 1) + fl * 0.5;
    R.sun.color.copy(c); R.scene.background.copy(bg).lerp(new T3.Color('#c8d4ff'), fl * 0.5);
    // 노을: 해가 낮게 비스듬히 → 그림자가 길어짐
    const tg = R.camTarget; R.sun.position.set(tg.x + 6 + dusk * 10, lerp(22, 9, dusk), tg.z + 4 + dusk * 3); R.sun.target.position.copy(tg);
    // ---------- ③ 안개·비 ----------
    const z = R.zoom;
    if (W === 'fog' || W === 'rain') {
      R.scene.fog = this.fog; this.fog.color.copy(bg);
      if (W === 'fog') { this.fog.near = z * 0.72; this.fog.far = z * 1.55; } else { this.fog.near = z * 1.0; this.fog.far = z * 2.8; }
    } else R.scene.fog = null;
    this.updateRain(W === 'rain' && Game.state !== 'menu', Game.state === 'play' && !Game.paused ? dt * (Settings.gameSpeed || 1) : 0);
    // ---------- ② 크로노 스피어 차단벽 ----------
    const S = typeof Sphere !== 'undefined' && Sphere, on = S && S.active && !S.done && S.r > 0.05 && Game.state !== 'menu';
    this.wall.visible = !!on; this.next.visible = !!(on && S.target);
    if (on) {
      this.wall.position.set(S.c.x, 0, S.c.y); this.wall.scale.set(S.r, 1, S.r);
      const u = this.wall.material.uniforms; u.t.value = Game.time; u.op.value = 0.85 + 0.15 * Math.sin(Game.time * 5);
      if (S.target) { this.next.position.set(S.target.x, 0, S.target.y); this.next.scale.set(S.r, 0.55, S.r); this.next.material.uniforms.t.value = Game.time; this.next.material.uniforms.op.value = 0.35; }
    }
  },
  updateRain(on, dt) {
    this.rain.visible = this.splash.visible = on; if (!on) return;
    const tg = Render3D.camTarget, P = this.rain.geometry.attributes.position, Wd = this.RAIN_W, D = this.RAIN_D, H = this.RAIN_H, sp = 19, len = 0.55, wind = 0.18;
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i]; d.y -= sp * d.v * dt;
      if (d.y < 0) { d.y += H; d.x = Math.random(); d.z = Math.random(); }
      const x = tg.x + (d.x - 0.5) * Wd + d.y * wind, zz = tg.z + (d.z - 0.5) * D;
      P.setXYZ(i * 2, x, d.y, zz); P.setXYZ(i * 2 + 1, x - len * wind, d.y + len, zz);
    }
    P.needsUpdate = true;
    // 물방울: 매 프레임 일부를 새 자리로 옮겨 반짝반짝 튀는 느낌
    const S = this.splash.geometry.attributes.position;
    for (let i = 0; i < this.SPLASH_N; i++) if (dt > 0 && Math.random() < 0.25 || S.getY(i) === 0) S.setXYZ(i, tg.x + (Math.random() - 0.5) * Wd * 0.8, 0.04, tg.z + (Math.random() - 0.5) * D * 0.8);
    S.needsUpdate = true;
  },
};
