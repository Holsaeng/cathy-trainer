
// ============================== 상태 스냅샷 ==============================
// 호스트의 게임 상태 → 작은 데이터(JSON) → 손님 화면에 그대로 옮김 (온라인 대전 2단계, docs/online_duel_plan.md)
//   손님도 같은 모드·옵션·시드로 판을 시작하므로 처음 구성·설정 참조는 이미 같음 → 스냅샷은 상태값을 덮어씀
//   · 유닛끼리 참조 → { $u: 판 시작 기준 id }      · 설정 객체(CONFIG·Kits 안) → { $s: 경로 }
//   · Set → { $set: [...] }                       · 클래스 객체 → { $c: 클래스 이름, ...필드 }   · 함수는 보내지 않음
//   · 새로 생긴 유닛(카메라·새 라운드)·투사체는 클래스 이름으로 다시 만듦 (손님은 판정 계산을 하지 않고 그리기만)
const Snap = {
  V: 1,
  classes() { return this._cls || (this._cls = { Unit, Cathy, DanielPlayer, Ward, Duelist, RangedDuelist, Projectile }); },
  // ---------- 설정 객체 등록부: 객체 → 경로 ----------
  statics() {
    if (this._st) return this._st;
    const byObj = new Map(), byPath = {};
    const walk = (o, path, d) => {
      if (!o || typeof o !== 'object' || byObj.has(o) || d > 4) return;
      byObj.set(o, path); byPath[path] = o;
      for (const k of Object.keys(o)) { const v = o[k]; if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path + '.' + k, d + 1); }
    };
    walk(Kits, 'Kits', 0); walk(CONFIG, 'CONFIG', 0);
    return (this._st = { byObj, byPath });
  },
  // 설정 객체 경로 → 객체 (CONFIG.walls처럼 판마다 바뀌는 건 등록하지 않음)
  resolve(path) { return this.statics().byPath[path]; },
  // ---------- 인코딩 ----------
  q: 0,   // 0 = 정확히, 4 = 소수점 4자리(0.1mm·0.1ms)로 반올림 — 전송용
  enc(v, d = 0, top = false) {
    if (v === null || v === undefined) return v === null ? null : undefined;
    const t = typeof v;
    if (t === 'number') return Number.isFinite(v) ? (this.q && !Number.isInteger(v) ? Math.round(v * 1e4) / 1e4 : v) : (v > 0 ? '$inf' : v < 0 ? '$-inf' : '$nan');
    if (t === 'string' || t === 'boolean') return v;
    if (t === 'function') return undefined;
    if (d > 9) return undefined;
    if (!top && v instanceof Unit) return { $u: v.id - Game.uid0 };
    if (v instanceof Set) return { $set: [...v].map(x => this.enc(x, d + 1)) };
    if (v instanceof Map) return undefined;   // (게임 상태에 Map 없음)
    if (Array.isArray(v)) return v.map(x => { const e = this.enc(x, d + 1); return e === undefined ? null : e; });
    const sp = this.statics().byObj.get(v); if (sp) return { $s: sp };
    if (typeof Node !== 'undefined' && v instanceof Node) return undefined;
    const out = {}, C = v.constructor && v.constructor.name;
    if (C && C !== 'Object' && this.classes()[C]) out.$c = C;
    for (const k of Object.keys(v)) { const e = this.enc(v[k], d + 1); if (e !== undefined) out[k] = e; }
    return out;
  },
  capture(o = {}) {
    this.q = o.q ? 4 : 0;
    try { return this._capture(); } finally { this.q = 0; }
  },
  _capture() {
    const M = Game.mode, mode = {};
    if (M) for (const k of Object.keys(M)) { const e = this.enc(M[k], 1); if (e !== undefined) mode[k] = e; }
    return {
      v: this.V, tick: Game.tick, time: Game.time, freeze: Game.freeze, state: Game.state, uid0: Game.uid0, modeId: Game.modeId, mapKey: Game.mapKey,
      player: Game.player ? Game.player.id - Game.uid0 : null,
      // 유닛은 판 시작 기준 id, 투사체는 pid로 묶음 → 바뀐 것만 보내기(델타)가 유닛 단위로 됨. 순서는 uo/po
      units: Object.fromEntries(Game.units.map(u => [u.id - Game.uid0, this.enc(u, 0, true)])), uo: Game.units.map(u => u.id - Game.uid0),
      proj: Object.fromEntries(Game.projectiles.map(p => [p.pid, this.enc(p, 0, true)])), po: Game.projectiles.map(p => p.pid),
      zones: this.enc(Game.zones), drones: this.enc(Game.drones || []), mode,
      sphere: this.enc(Object.fromEntries(Object.keys(Sphere).filter(k => typeof Sphere[k] !== 'function').map(k => [k, Sphere[k]]))),
      vision: { night: Vision.night, nightT: Vision.nightT, cycleT: Vision.cycleT, reveals: this.enc(Vision.reveals), noises: this.enc(Vision.noises), rustles: this.enc(Vision.rustles) },
      walls: CONFIG.walls.map(w => this.enc(w)),
    };
  },
  // ---------- 디코딩 ----------
  dec(v, U) {
    if (v === null || typeof v !== 'object') return v === '$inf' ? Infinity : v === '$-inf' ? -Infinity : v === '$nan' ? NaN : v;
    if (Array.isArray(v)) return v.map(x => this.dec(x, U));
    if ('$u' in v) return U.get(v.$u) || null;
    if ('$s' in v) return this.resolve(v.$s);
    if ('$set' in v) return new Set(v.$set.map(x => this.dec(x, U)));
    const o = v.$c ? Object.create(this.classes()[v.$c].prototype) : {};
    for (const k of Object.keys(v)) if (k !== '$c') o[k] = this.dec(v[k], U);
    return o;
  },
  // 객체 필드를 스냅샷 값으로 바꿈 (없어진 필드는 지움, 메서드는 그대로)
  fill(o, e, U) {
    for (const k of Object.keys(o)) if (!(k in e) && typeof o[k] !== 'function') delete o[k];
    for (const k of Object.keys(e)) if (k !== '$c') o[k] = this.dec(e[k], U);
    return o;
  },
  apply(S) {
    if (!S || S.v !== this.V) throw new Error('스냅샷 형식이 다름');
    const C = this.classes(), old = new Map(Game.units.map(u => [u.id - Game.uid0, u])), U = new Map();
    // 1차: 유닛 객체 준비(같은 id·같은 클래스면 재사용 → 3D 메시·애니메이션 유지) / 2차: 필드 채움(서로 참조 해결)
    const list = S.uo.map(rid => S.units[rid]);
    const units = S.uo.map((rid, i) => {
      const e = list[i], prev = old.get(rid), cls = C[e.$c] || Unit;
      const u = prev && prev.constructor === cls ? prev : Object.create(cls.prototype);
      U.set(rid, u); return u;
    });
    list.forEach((e, i) => { this.fill(units[i], e, U); units[i].id = Game.uid0 + S.uo[i]; });
    Game.units = units;
    // 투사체: pid가 같으면 재사용
    const oldP = new Map(Game.projectiles.map(p => [p.pid, p]));
    Game.projectiles = S.po.map(pid => this.fill(oldP.get(pid) || Object.create(Projectile.prototype), S.proj[pid], U));
    Game.zones = this.dec(S.zones, U); Game.drones = this.dec(S.drones, U);
    Object.assign(Game, { tick: S.tick, time: S.time, freeze: S.freeze });
    if (S.player !== null) Game.player = U.get(S.player) || Game.player;
    if (Game.mode) for (const k of Object.keys(S.mode)) Game.mode[k] = this.dec(S.mode[k], U);
    for (const k of Object.keys(S.sphere)) Sphere[k] = this.dec(S.sphere[k], U);
    Object.assign(Vision, { night: S.vision.night, nightT: S.vision.nightT, cycleT: S.vision.cycleT, reveals: this.dec(S.vision.reveals, U), noises: this.dec(S.vision.noises, U), rustles: this.dec(S.vision.rustles, U) });
    // 벽(부서지는 벽 등 판 중 바뀔 수 있음): 내용만 갱신
    if (S.walls && S.walls.length === CONFIG.walls.length) S.walls.forEach((w, i) => Object.assign(CONFIG.walls[i], this.dec(w, U)));
    return true;
  },
  // ---------- 바뀐 값만 (델타) ----------
  //   diff(이전, 지금) → 바뀐 필드만 담은 데이터 / patch(이전, 델타) → 지금. 배열은 통째로({$a}), 객체↔값 교체는 {$v}, 지운 키는 $del
  isObj(v) { return v !== null && typeof v === 'object' && !Array.isArray(v); },
  same(a, b) { return a === b || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b)); },
  diff(a, b) {
    if (a === b) return undefined;
    if (this.isObj(a) && this.isObj(b)) {
      const d = {}; let any = false;
      for (const k of Object.keys(b)) { const x = this.diff(a[k], b[k]); if (x !== undefined) { d[k] = x; any = true; } }
      const del = Object.keys(a).filter(k => !(k in b)); if (del.length) { d.$del = del; any = true; }
      return any ? d : undefined;
    }
    if (Array.isArray(b)) return Array.isArray(a) && this.same(a, b) ? undefined : { $a: b };
    if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return undefined;
    return this.isObj(b) ? { $v: b } : b;
  },
  patch(a, d) {
    if (d === undefined) return a;
    if (d === null || typeof d !== 'object') return d;
    if ('$v' in d) return d.$v;
    if ('$a' in d) return d.$a;
    const o = this.isObj(a) ? Object.assign({}, a) : {};
    for (const k of Object.keys(d)) if (k !== '$del') o[k] = this.patch(o[k], d[k]);
    if (d.$del) for (const k of d.$del) delete o[k];
    return o;
  },
  // 문자열로 (전송용)
  pack() { return JSON.stringify(this.capture()); },
  unpack(s) { return this.apply(JSON.parse(s)); },
};
