
// ============================== 시야 아이템: 망원 카메라 · 정찰 드론 ==============================
// 나무위키: 망원 카메라 = 반경 13m 시야(벽에 가려짐), 60초, 최대 2개 설치(초과 시 가장 먼저 설치한 것 파괴), 재사용 3초, 은신 감지,
//          상대가 기본 공격 한 번으로 파괴 / 정찰 드론 = 목표 지점 5초 시야(벽 무시), 상대는 드론이 자기 시야 안에 있어야 범위가 보임
class Ward extends Unit {
  constructor(x, y, owner) {
    const C = CONFIG.vision.camera;
    super({ x, y, team: owner.team, kind: 'ward', name: C.name, hp: 1, def: 0, ms: 0, r: 0.28 });
    this.owner = owner; this.life = C.dur; this.detect = true; this.born = Game.time;
  }
  // 색은 보는 사람 기준(내 편 파랑·적 빨강) — 저장하지 않고 그릴 때 계산
  get color() { return this.team === myTeam() ? '#7fd1ff' : '#ff8a8a'; }
  set color(v) { /* 무시 */ }
  sightR() { return CONFIG.vision.camera.r * (Vision.night ? CONFIG.vision.cameraNightMul : 1); }
  update(dt) { this.tickStatus(dt); if ((this.life -= dt) <= 0 && !this.dead) { this.dead = true; } }
}

const VisionItems = {
  give(u) { const V0 = CONFIG.vision; u.items = { camera: V0.camera.stock, drone: V0.drone.stock }; u.itemCd = { camera: 0, drone: 0 }; },
  tick(u, dt) { if (!u.itemCd) return; for (const k in u.itemCd) u.itemCd[k] = Math.max(0, u.itemCd[k] - dt); },
  can(u, k) { return Vision.fogOn && u.items && u.items[k] > 0 && u.itemCd[k] <= 0 && !u.dead; },
  // 망원 카메라 설치: 커서 방향 설치 거리 안
  camera(u, pt, quiet) {
    const C = CONFIG.vision.camera;
    if (!this.can(u, 'camera')) { if (!quiet) this.fail(u, 'camera'); return false; }
    const d = Math.min(C.range, V.dist(u.pos, pt)), dir = d > 1e-3 ? V.norm(V.sub(pt, u.pos)) : V.fromAng(u.facing || 0);
    const pos = Geo.pushOut(V.add(u.pos, V.mul(dir, Geo.clampDash(u.pos, dir, d, 0.3))), 0.3);
    const mine = Game.units.filter(w => w.kind === 'ward' && !w.dead && w.owner === u).sort((a, b) => a.born - b.born);
    if (mine.length >= C.max) { mine[0].dead = true; FX.ring(mine[0].pos, 0.2, 0.8, '#8a93a6', 0.3); }   // 최대 2개: 가장 먼저 설치한 것 파괴
    const w = new Ward(pos.x, pos.y, u); Game.units.push(w);
    u.items.camera--; u.itemCd.camera = C.cd;
    FX.ringFor(w, pos, 0.3, 1.2, 'team', 0.4); FX.textFor(w, C.name, 'team', 11, { bold: true }, 'all'); Sfx.play('throw');   // 색은 보는 사람 기준
    return w;
  },
  // 정찰 드론: 목표 지점으로 날아가 5초간 원형 시야(벽 무시)
  drone(u, pt, quiet) {
    const D = CONFIG.vision.drone;
    if (!this.can(u, 'drone')) { if (!quiet) this.fail(u, 'drone'); return false; }
    const d = Math.min(D.range, V.dist(u.pos, pt)), dir = d > 1e-3 ? V.norm(V.sub(pt, u.pos)) : V.fromAng(u.facing || 0);
    const to = V.add(u.pos, V.mul(dir, d)); to.x = clamp(to.x, 0.3, CONFIG.world.w - 0.3); to.y = clamp(to.y, 0.3, CONFIG.world.h - 0.3);
    u.items.drone--; u.itemCd.drone = D.cd; Sfx.play('throw');
    const fly = { from: V.copy(u.pos), to, t: 0, dur: d / D.speed + 0.05, team: u.team };
    (Game.drones = Game.drones || []).push(fly);
    FX.textFor(u, D.name, 'team', 11, { bold: true }, quiet ? 'owner' : 'all');
    return true;
  },
  fail(u, k) {
    if (!Vision.fogOn) { FX.toastFor(u, '시야 아이템은 1:1 결투(시야 시스템)에서만 쓸 수 있습니다', '#aaa'); return; }
    if (!u.items || u.items[k] <= 0) FX.toastFor(u, `${CONFIG.vision[k].name}: 이번 라운드 보유량을 다 썼습니다`, '#aaa');
    else { FX.toastFor(u, `${CONFIG.vision[k].name}: 재사용 대기 ${fmt(u.itemCd[k], 1)}초`, '#aaa'); Sfx.playFor(u, 'error'); }
  },
  update(dt) {
    const D = CONFIG.vision.drone;
    for (const f of Game.drones || []) {
      f.t += dt;
      if (!f.done && f.t >= f.dur) {
        f.done = true; Vision.reveals.push({ team: f.team, pos: f.to, r: D.r, t: D.dur, drone: true });
        const b = Vision.bushAt(f.to); if (b >= 0) Vision.rustle(b, f.to, f.team);
      }
    }
    Game.drones = (Game.drones || []).filter(f => !f.done);
  },
};
