
// ============================== 실측값 입력 (로드맵 A) ==============================
// 공개 자료(위키·패치노트·공식 영상)로 확정하지 못한 추정값을 게임 연습 모드에서 직접 재서 넣는 곳.
// 넣은 값은 Settings.measured에 저장되고 CONFIG(·ItemFx)에 바로 덮어씀. 지우면 기본(추정)값으로 돌아감.
// 재는 방법 자세히: docs/measure_guide.md
const Measure = {
  ITEMS: [
    { g: '알론소', key: 'alonsoLink', path: 'CONFIG.rangedKits.alonso.Q.markDur', label: 'Q 자력 연결 지속', unit: '초', min: 1, max: 10, step: 0.1,
      how: 'Q를 맞힌 뒤 평타 없이 기다리며, 연결선이 사라질 때까지의 시간(녹화 프레임 ÷ fps).' },
    { g: '알론소', key: 'alonsoBreak', path: 'CONFIG.rangedKits.alonso.Q.breakDist', label: 'Q 연결이 끊어지는 거리', unit: 'm', min: 3, max: 20, step: 0.1,
      how: 'Q를 맞힌 뒤 뒤로 걸어 멀어지며 연결선이 끊기는 순간의 거리. 화면 자: E 사거리 원(4.75m)의 반지름 픽셀.' },
    { g: '클로에', key: 'ninaRange', path: 'CONFIG.rangedKits.chloe.P.range', label: '니나 평타 사거리', unit: 'm', min: 0.5, max: 4, step: 0.05,
      how: 'Alt+우클릭으로 니나에게 허수아비를 공격시키고, 니나가 멈춰서 때리기 시작하는 거리(니나 중심~허수아비 가장자리).' },
    { g: '클로에', key: 'ninaSpeed', path: 'CONFIG.rangedKits.chloe.E.ninaSpeed', label: 'E 재사용 니나 돌진 속도', unit: 'm/s', min: 5, max: 60, step: 0.5,
      how: '클로에와 니나를 7m 떨어뜨린 뒤 E 재사용 — 니나가 날아간 거리 ÷ 걸린 시간.' },
    { g: '클로에', key: 'spinTick', path: 'CONFIG.rangedKits.chloe.W.tickEvery', label: 'W 회전 고정 피해 간격', unit: '초', min: 0.1, max: 1, step: 0.05,
      how: '허수아비 옆에서 W(회전) — 고정 피해 숫자가 뜨는 간격.' },
    { g: '클로에', key: 'linkRamp', path: 'CONFIG.rangedKits.chloe.R.ramp', label: 'R 연결선 피해가 최대가 되는 시간', unit: '초', min: 0.3, max: 6, step: 0.1,
      how: 'R 후 허수아비가 연결선에 계속 닿게 두고, 틱 피해 숫자가 더 이상 커지지 않을 때까지의 시간.' },
    { g: '비형', key: 'bhQBuff', path: 'CONFIG.rangedKits.bihyung.Q.buffDur', label: 'Q 뚝딱! 강화 평타 대기 시간', unit: '초', min: 1, max: 15, step: 0.5,
      how: 'Q를 누르고 평타하지 않은 채 기다리며, 강화 표시가 사라지고 쿨이 돌기 시작할 때까지.' },
    { g: '비형', key: 'bhKnock', path: 'CONFIG.rangedKits.bihyung.D.knock', label: '풀스윙 밀치는 거리', unit: 'm', min: 0.5, max: 6, step: 0.1,
      how: '허수아비를 풀스윙으로 쳐서 밀려난 거리(화면 자: 방망이 평타 원 1.8m). 공식 영상 약 2.4m(±20%).' },
    { g: '쇼이치', key: 'shDagLife', path: 'CONFIG.rangedKits.shoichi.dagger.life', label: '바닥 단검이 사라지는 시간', unit: '초', min: 2, max: 30, step: 0.5,
      how: '연습 모드에서 강화 Q로 단검을 하나 깔고 줍지 않은 채 기다리며, 단검이 사라질 때까지의 시간.' },
    { g: '쇼이치', key: 'shPickR', path: 'CONFIG.rangedKits.shoichi.dagger.pickR', label: '단검 줍는 원 반지름', unit: 'm', min: 0.3, max: 2, step: 0.05,
      how: '단검 쪽으로 천천히 걸어가 주워지는 순간 쇼이치 중심~단검 거리(화면 자: 단검의 큰 파란 원 = W 사거리 5.5m).' },
    { g: '카티야', key: 'snipeAim', path: 'CONFIG.rangedKits.katja.D.aim', label: '저격(D) 모드 진입 → 첫 발까지', unit: '초', min: 0, max: 2, step: 0.05,
      how: 'D를 누른 순간부터 첫 발을 쏠 수 있게 될 때까지(D 연타로 처음 나가는 시각).' },
    { g: '캐시', key: 'bleedTick', path: 'CONFIG.passive.tick', label: '외상 출혈 피해 간격', unit: '초', min: 0.1, max: 2, step: 0.05,
      how: '허수아비에 스킬 1번 — 외상 출혈 숫자가 뜨는 간격.' },
    { g: '캐시', key: 'sutureHome', path: 'CONFIG.skills.E.homingRange', label: '수쳐 2인 적중 유도 거리', unit: 'm', min: 0, max: 8, step: 0.1,
      how: '허수아비 2개를 일직선에서 조금씩 비껴 놓고, 첫 대상을 지나 두 번째에 붙는(유도되는) 최대 거리.' },
    { g: '시스템', key: 'combat', path: 'CONFIG.rest.combatDur', label: '전투 상태 해제 시간', unit: '초', min: 1, max: 20, step: 0.5,
      how: '마지막으로 피해를 주고받은 뒤 휴식(X) — 비전투 추가 회복(0.5초마다 2%)이 붙기 시작할 때까지.' },
    { g: '시스템', key: 'assist', path: 'CONFIG.sphere.boom.assist', label: '처치 관여로 인정되는 시간', unit: '초', min: 1, max: 30, step: 0.5,
      how: '적에게 피해를 주고 손을 뗀 뒤 몇 초 안에 아군이 처치해야 어시스트(폭발 타이머 +7초)가 되는지 — 커스텀 게임.' },
    { g: '시스템', key: 'nightRamp', path: 'CONFIG.vision.night.ramp', label: '밤 시야가 회복되는 시간', unit: '초', min: 1, max: 120, step: 1,
      how: '밤이 된 순간 시야 3.4m에서 6.4m까지 넓어지는 데 걸리는 시간(시야 경계를 녹화).' },
    { g: '시스템', key: 'noiseSkill', path: 'CONFIG.vision.noise.skill', label: '시야 밖 스킬 소리(!) 들리는 거리', unit: 'm', min: 3, max: 30, step: 0.5,
      how: '친구가 시야 밖에서 스킬을 쓸 때 「!」 표시가 뜨는 최대 거리.' },
    { g: '시스템', key: 'noiseAttack', path: 'CONFIG.vision.noise.attack', label: '시야 밖 평타 소리(!) 들리는 거리', unit: 'm', min: 3, max: 30, step: 0.5,
      how: '친구가 시야 밖에서 평타할 때 「!」가 뜨는 최대 거리.' },
    { g: '시스템', key: 'noiseStep', path: 'CONFIG.vision.noise.step', label: '발소리 들리는 거리', unit: 'm', min: 1, max: 20, step: 0.5,
      how: '친구가 시야 밖에서 걸을 때 발자국이 보이는 최대 거리.' },
    { g: '시스템', key: 'droneR', path: 'CONFIG.vision.drone.r', label: '정찰 드론 시야 반경', unit: 'm', min: 1, max: 15, step: 0.5,
      how: '드론을 띄운 지점에서 밝혀지는 원의 반지름(화면 자로 환산).' },
    { g: '시스템', key: 'plasmaShots', path: 'CONFIG.tactical.plasmadash.shots', label: '플라즈마 대시 투사체 수', unit: '개', min: 1, max: 15, step: 1, int: true,
      how: '플라즈마 대시를 쓰고 녹화를 멈춰 부채꼴로 날아가는 투사체 개수를 셈.' },
    { g: '시스템', key: 'sphereMove', paths: ['CONFIG.sphere.phases.3.dur', 'CONFIG.sphere.finalPhases.3.dur'], label: '크로노 스피어 이동 시간', unit: '초', min: 1, max: 30, step: 0.5,
      how: '이동 지점 표시가 끝나고 스피어가 출발해서 목표 지점에 닿을 때까지.' },
    { g: '아이템', key: 'galeR', path: 'ItemFx.RANGE.gale', label: '돌풍 반경', unit: 'm', min: 0.5, max: 8, step: 0.1, how: '효과가 터지는 원의 반지름(화면 자로 환산).' },
    { g: '아이템', key: 'masterR', path: 'ItemFx.RANGE.master', label: '달인 반경', unit: 'm', min: 0.5, max: 8, step: 0.1, how: '효과 원의 반지름.' },
    { g: '아이템', key: 'ruptureR', path: 'ItemFx.RUPTURE.r', label: '파열 폭발 반경', unit: 'm', min: 0.5, max: 8, step: 0.1, how: '스킬 피해 0.8초 뒤 터지는 폭발 원의 반지름.' },
  ],
  defaults: {},
  paths(it) { return it.paths || [it.path]; },
  root(p) { const a = p.split('.'); return { obj: a[0] === 'CONFIG' ? CONFIG : a[0] === 'ItemFx' ? ItemFx : null, keys: a.slice(1) }; },
  get(p) { let { obj, keys } = this.root(p); for (const k of keys) { if (obj == null) return undefined; obj = obj[k]; } return obj; },
  set(p, v) { let { obj, keys } = this.root(p); for (const k of keys.slice(0, -1)) obj = obj[k]; obj[keys[keys.length - 1]] = v; },
  // 처음 한 번 기본(추정)값을 기억해 두고, 저장된 실측값을 덮어씀
  apply() {
    const M = Settings.measured || {};
    for (const it of this.ITEMS) for (const p of this.paths(it)) {
      if (!(p in this.defaults)) this.defaults[p] = this.get(p);
      const v = M[it.key]; this.set(p, typeof v === 'number' && isFinite(v) ? v : this.defaults[p]);
    }
  },
  value(it) { return this.get(this.paths(it)[0]); },
  base(it) { return this.defaults[this.paths(it)[0]]; },
  measured(it) { return typeof (Settings.measured || {})[it.key] === 'number'; },
  put(key, v) {
    const it = this.ITEMS.find(x => x.key === key); if (!it) return false;
    const M = Object.assign({}, Settings.measured);
    if (v === null || v === '' || !isFinite(+v)) delete M[key];
    else { let n = clamp(+v, it.min, it.max); if (it.int) n = Math.round(n); M[key] = n; }
    Settings.measured = M; saveSettings(); this.apply(); return true;
  },
  count() { return this.ITEMS.filter(it => this.measured(it)).length; },
};
Measure.apply();
