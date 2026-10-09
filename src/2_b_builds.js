
// ============================== 장비 → 능력치 계산 ==============================
// 장비를 고르지 않으면 CONFIG.builds(랭크 영상 실측)를 그대로 씀. 고르면 아래 공식으로 계산 (docs/build_items_plan.md)
//   레벨 능력치 = 1레벨 값 + 성장치 × (레벨 − 1)                      (나무위키·dak.gg 캐시)
//   스킬 증폭 = (고정 스증 + 옷 레벨당 × 레벨 + 맞춤형) × (1 + 숙련도 스증% + (고유)% + 스증%)   ⚠ %가 스증 수치를 키운다고 가정(RULES.spPct)
//   공격 속도 = (무기 기본 + 캐시 보정 0.09) × (1 + 숙련도 공속% + 아이템 공속%), 상한 2.5          ⚠ 곱하는 방식 가정
//   이동 속도 = (기본 3.5 + 고정 이속) × (1 + 이속%)                                               ⚠ 순서 가정
//   쿨감 = 아이템 쿨감 합 (점감 공식은 스킬 쪽: 쿨 × 100 / (100 + 쿨감))
//   맞춤형 = 추가 공격력×2 와 스증 중 높은 쪽으로 / (고유) 표기 효과는 같은 종류끼리 중첩 안 함(가장 큰 값)
const Builds = {
  SLOTS: ['weapon', 'chest', 'head', 'arm', 'leg'],
  SLOT_LABEL: { weapon: '무기', chest: '옷', head: '머리', arm: '팔/장식', leg: '다리' },
  GRADE_LABEL: { epic: '영웅', legend: '전설', mythic: '초월' },
  // 캐시 기본 능력치 [1레벨, 성장] — docs/er_notes_items.md 2.1
  BASE: { hp: [970, 88], ad: [29, 4.3], def: [53, 3.2], ms: 3.5, asBonus: 0.09 },
  WEAPON_AS: { dagger: 0.58, dual: 0.43 },
  MASTERY: { dagger: { as: 0.034, sp: 0.043 }, dual: { as: 0.03, sp: 0.045 } },   // 레벨당 (12.5)
  // 단계별 숙련도 레벨 ⚠ 추정 (캐릭터 레벨은 CONFIG.builds의 level)
  MASTERY_LV: { early: 3, mid: 8, late: 13 },
  RULES: { spPct: 'stat', asCap: 2.5, critCap: 1 },
  item(id) { return id !== null && id !== undefined ? CONFIG.items[id] || null : null; },
  // 장비 검사: 부위·무기군이 맞는 것만 남김 (잘못된 값은 빈 칸)
  clean(gear, weapon) {
    const g = {};
    for (const s of this.SLOTS) {
      const id = gear && gear[s], it = this.item(id);
      g[s] = it && it.slot === s && (s !== 'weapon' || it.weapon === weapon) ? +id : null;
    }
    return g;
  },
  any(gear) { return !!gear && this.SLOTS.some(s => gear[s]); },
  // 장비 서명 (기록 키·표시용)
  sig(gear) { return this.SLOTS.map(s => gear && gear[s] || 0).join('-'); },
  short(gear) { return this.SLOTS.map(s => { const it = this.item(gear && gear[s]); return it ? it.name : '–'; }).join(' / '); },
  // 단계 + 장비 → 캐시 빌드 (CONFIG.builds와 같은 모양 + 새 능력치)
  resolve(stage, gear, weapon) {
    const B0 = CONFIG.builds[stage] || CONFIG.builds.mid, Lv = B0.level, w = weapon === 'dual' ? 'dual' : 'dagger';
    const g = this.clean(gear, w), M = this.MASTERY[w], mLv = this.MASTERY_LV[stage] ?? 8;
    const sum = {}, uniq = {}, items = [];
    for (const s of this.SLOTS) {
      const it = this.item(g[s]); if (!it) continue; items.push(it);
      for (const [k, v] of Object.entries(it.stats)) {
        if (k === 'spPctU' || k === 'tenacity') uniq[k] = Math.max(uniq[k] || 0, v);   // (고유): 중첩 안 함
        else sum[k] = (sum[k] || 0) + v;
      }
    }
    const S = k => sum[k] || 0, at = ([a, b]) => a + b * (Lv - 1);
    const bonusAd = S('ad'), spFlat0 = S('sp') + S('spLv') * Lv;
    // 맞춤형: 추가 공격력(×2)과 스증 중 높은 쪽
    const toSp = spFlat0 >= bonusAd * 2, adaptAd = toSp ? 0 : S('adaptAd'), adaptSp = toSp ? S('adaptSp') : 0;
    const spFlat = spFlat0 + adaptSp, spMul = 1 + M.sp * mLv + (uniq.spPctU || 0) / 100 + S('spPct') / 100;
    const asBase = this.WEAPON_AS[w] + this.BASE.asBonus, asMul = 1 + M.as * mLv + S('as') / 100;
    const b = Object.assign({}, B0, {
      label: `${B0.label} · 장비`, computed: true, weapon: w, gear: g, masteryLv: mLv,
      hp: Math.round(at(this.BASE.hp) + S('hp')),
      ad: Math.round((at(this.BASE.ad) + bonusAd + adaptAd) * 10) / 10, bonusAd: bonusAd + adaptAd,
      sp: Math.round(this.RULES.spPct === 'stat' ? spFlat * spMul : spFlat), spMul,
      as: +Math.min(this.RULES.asCap, asBase * asMul).toFixed(3),
      def: Math.round(at(this.BASE.def) + S('def')),
      ms: +((this.BASE.ms + S('ms')) * (1 + S('msPct') / 100)).toFixed(3),
      crit: Math.min(this.RULES.critCap, S('crit') / 100), critDmg: S('critDmg') / 100,
      cdr: S('cdr') / 100, pen: S('pen'), penPct: S('penPct') / 100, omni: S('omni') / 100, ls: S('ls') / 100,
      regenPct: S('regen') / 100, tacCdr: S('tacCdr'), tenacity: (uniq.tenacity || 0) / 100,
      passives: [...new Set(items.flatMap(it => (it.pas || '').split(' / ').filter(Boolean)))],
      passiveK: this.passiveK(items),
    });
    return b;
  },
  // 고유 효과 수치(같은 이름은 큰 값 하나 — 중첩 여부 ⚠ 미확인이라 보수적으로)
  passiveK(items) {
    const k = {};
    for (const it of items) {
      if (it.pasK) for (const [a, v] of Object.entries(it.pasK)) k[a] = Math.max(k[a] || 0, v);
      for (const p of (it.pas || '').split(' / ')) if (p === '치유 감소') k.healCut = Math.max(k.healCut || 0, it.grade === 'mythic' ? 0.3 : 0.2);
      if (it.pas === '파열') k.rupture = true;
      if (it.pas === '집행자') k.executor = true;
    }
    return k;
  },
  // 지금 설정의 장비 (장비 사용 + 캐시일 때만, 아니면 null)
  current() {
    if (!Settings.gearOn || (Settings.character || 'cathy') !== 'cathy') return null;
    const w = Settings.weapon === 'dual' ? 'dual' : 'dagger', g = this.clean((Settings.gearSets || {})[w] || this.defaultGear(w), w);
    return this.any(g) ? g : null;
  },
  defaultGear(w) { return Object.assign({}, CONFIG.gearPresets[w === 'dual' ? 'dualS1' : 'daggerD1'].gear); },
  // 아이템 능력치 짧은 글
  LABEL: { ad: '공', sp: '스증', spLv: '레벨당 스증', spPct: '스증%', spPctU: '(고유) 스증%', hp: '체력', def: '방어', as: '공속%', ms: '이속', msPct: '이속%', cdr: '쿨감', pen: '방관', penPct: '방관%', omni: '모든 피해 흡혈%', regen: '체력 재생%', tacCdr: '전술 쿨감', tenacity: '(고유) 방해 저항%' },
  statText(it) {
    const s = it.stats, out = [];
    for (const [k, v] of Object.entries(s)) { if (k === 'adaptAd') out.push(`맞춤형 공 ${v}/스증 ${s.adaptSp}`); else if (k !== 'adaptSp') out.push(`${this.LABEL[k] || k} ${v}`); }
    return out.join(' · ');
  },
  // 예상 DPS: 허수아비(방어 100)를 10초 동안 단순 순환(Q·W·E·D + 평타, R 제외)으로 — 같은 시드라 매번 같은 값. 화면·기록에 남지 않음
  estimate(stage, gear, weapon, sec = 10) {
    const keep = { sound: Settings.sound, weapon: Settings.weapon, build: Settings.build, character: Settings.character, gfx: Renderer.mode };
    Object.assign(Settings, { sound: false, weapon: weapon === 'dual' ? 'dual' : 'dagger', build: stage, character: 'cathy' });
    let dps = 0;
    try {
      Game.start('dummy', { count: 1, hp: 3000, def: 100, infinite: true, seed: 7, build: stage, gear: gear || null });
      const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'), S = CONFIG.sim.step, n = Math.round(sec / S);
      p.pos = { x: d.pos.x - 2.3, y: d.pos.y }; Stats.reset();
      for (let i = 0; i < n; i++) {
        if (i % 6 === 0 && !(p.cast && p.cast.phase !== 'recovery')) {
          const k = ['Q', 'W', 'E', 'D'].find(k => p.skills[k].lv > 0 && p.skills[k].cd <= 0);
          if (k && !(p.enhanced > 0)) { p.attackTarget = null; p.cmdSkill(k, V.copy(d.pos)); } else if (!p.attackTarget) p.cmdAttack(d);
        }
        Game.step(S);
      }
      dps = Stats.dealtTotal / sec;
    } finally {
      Object.assign(Settings, { sound: keep.sound, weapon: keep.weapon, build: keep.build, character: keep.character });
      Object.assign(Game, { state: 'menu', mode: null, units: [], projectiles: [], zones: [], player: null }); FX.reset(); Stats.reset(); Cmd.reset();
    }
    return Math.round(dps);
  },
  // ---------- AI 상대 장비 (CONFIG.aiGear, docs/er_notes_ai_builds.md) ----------
  //   같은 공식 + 캐릭터별 숙련도(공속·스증 또는 기본 공격 증폭). 단계별 레벨은 AI 단계(CONFIG.rangedAI.stages), 숙련도 레벨은 MASTERY_LV
  aiItem(id) { return (CONFIG.aiGear && CONFIG.aiGear.items[id]) || CONFIG.items[id] || null; },
  aiBuilds(motif) { const C = CONFIG.aiGear && CONFIG.aiGear.characters[motif]; return C ? C.builds : []; },
  resolveAI(motif, stage, idx) {
    const C = CONFIG.aiGear && CONFIG.aiGear.characters[motif], B = C && C.builds[idx]; if (!B) return null;
    const S0 = CONFIG.rangedAI.stages[stage] || CONFIG.rangedAI.stages.mid, Lv = S0.level, mLv = this.MASTERY_LV[stage] ?? 8, M = C.mastery;
    const sum = {}, uniq = {}, items = [];
    for (const s of this.SLOTS) { const it = this.aiItem(B.gear[s]); if (!it) continue; items.push(it); for (const [k, v] of Object.entries(it.stats)) { if (k === 'spPctU') uniq[k] = Math.max(uniq[k] || 0, v); else sum[k] = (sum[k] || 0) + v; } }
    const S = k => sum[k] || 0, at = ([a, b]) => a + b * (Lv - 1);
    const bonusAd0 = S('ad') + S('adLv') * Lv, spFlat0 = S('sp') + S('spLv') * Lv, toSp = spFlat0 >= bonusAd0 * 2;
    const bonusAd = bonusAd0 + (toSp ? 0 : S('adaptAd')), spFlat = spFlat0 + (toSp ? S('adaptSp') : 0);
    const spMul = 1 + (M.sp || 0) * mLv + (uniq.spPctU || 0) / 100 + S('spPct') / 100;
    return {
      motif, idx, label: B.label, gear: B.gear, level: Lv, masteryLv: mLv,
      hp: Math.round(at(C.base.hp) + S('hp')), def: Math.round(at(C.base.def) + S('def')),
      ad: Math.round((at(C.base.ad) + bonusAd) * 10) / 10, baseAd: Math.round(at(C.base.ad) * 10) / 10, bonusAd,
      sp: Math.round(spFlat * spMul),
      as: +Math.min(this.RULES.asCap, (C.weaponAs + C.base.asBonus) * (1 + (M.as || 0) * mLv + S('as') / 100)).toFixed(3),
      ms: +((C.base.ms + S('ms')) * (1 + S('msPct') / 100)).toFixed(3),
      crit: Math.min(this.RULES.critCap, S('crit') / 100), critDmg: S('critDmg') / 100,
      pen: S('penPct') / 100, penFlat: S('pen'), ls: S('ls') / 100, omni: S('omni') / 100, cdr: S('cdr'),
      aaAmp: (M.baAmp || 0) * mLv,
      passives: [...new Set(items.flatMap(it => (it.pas || '').split(' / ').filter(Boolean)))], passiveK: this.passiveK(items),
    };
  },
  // 현재 실측 빌드와 비교할 주요 능력치
  compare(stage, gear, weapon) {
    const a = CONFIG.builds[stage], b = this.resolve(stage, gear, weapon), w = weapon === 'dual' ? 'dual' : 'dagger';
    const aAs = +(a.as * (CONFIG.basicAttack[w].asMul || 1)).toFixed(2);
    return [['체력', a.hp, b.hp], ['공격력', a.ad, b.ad], ['스킬 증폭', a.sp, b.sp], ['방어력', a.def, b.def], ['공격 속도', aAs, b.as], ['이동 속도', a.ms, b.ms],
      ['쿨다운 감소', Math.round(a.cdr * 100), Math.round(b.cdr * 100)], ['방어 관통', '0', `${b.pen ? b.pen + ' + ' : ''}${Math.round(b.penPct * 100)}%`]];
  },
};
