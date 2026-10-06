
// ============================== 결과 화면 코칭 ==============================
// 판이 끝나면 실수 기록(Stats.mistakes)과 통계(쿨 낭비·스킬 적중률·강화 평타 비율 등)를 분석해
//   ① 가장 중요한 개선점 3가지 — 왜 문제인지 · 고치는 요령 · 바로 연습하기(알맞은 모드·콤보)
//   ② 잘한 점 — 잘하고 있는 습관을 짚어 줌
// 규칙은 RULES 표(실수 문구 → 분류)와 METRICS(통계 → 분류)로 정리. 무게(w)가 클수록 실력에 미치는 영향이 큼
const Coach = {
  // 실수 문구(정규식) → 분류
  RULES: [
    { re: /^평타 선딜 중 이동/, id: 'aaCancel', w: 1.2, title: '평타가 이동 입력에 끊김',
      why: '평타 선딜 중에 이동을 누르면 평타가 취소돼 피해도, 강화 평타도 날아갑니다.',
      tip: '이동은 피해 숫자가 뜬 「뒤」(후딜 구간)에 누르세요. 무빙 평타는 「평타 → 짧게 이동 → 평타」 리듬입니다.',
      drill: { mode: 'dummy', label: '허수아비에서 무빙 평타 리듬 연습' } },
    { re: /선딜 중 이동 입력으로 캔슬/, id: 'castCancel', w: 1.4, title: '스킬이 선딜 중에 취소됨',
      why: '선딜 중 이동 입력이 들어가면 스킬이 나가지 않고 쿨타임만큼의 기회를 잃습니다.',
      tip: '스킬을 누른 뒤 이펙트가 보일 때까지 이동을 참으세요. 급하면 S(정지) 후 시전.',
      drill: { mode: 'combo', combo: 'basic', label: '기본 콤보로 시전 리듬 익히기' } },
    { re: /^강화 평타를 쓰지 않고/, id: 'enhSkip', w: 1.3, title: '강화 평타를 건너뜀',
      why: '스킬 사용 후 다음 평타가 강화돼 외상을 쌓습니다. 스킬을 연달아 쓰면 이 피해가 사라집니다.',
      tip: '「스킬 → 평타 → 스킬 → 평타」 리듬을 유지하세요. 스킬 사이에 평타 한 번이 캐시 피해의 핵심입니다.',
      drill: { mode: 'combo', combo: 'basic', label: '기본 콤보(Q → 평타 → W) 연습' } },
    { re: /^너무 이른 선입력/, id: 'earlyInput', w: 0.8, title: '선입력이 너무 일러 씹힘',
      why: '앞 동작이 끝나기 한참 전에 누른 입력은 무시됩니다.',
      tip: '앞 스킬의 이펙트가 끝나갈 즈음 다음 키를 누르세요. 콤보 트레이너의 입력 간격(ms) 표시를 참고하세요.',
      drill: { mode: 'combo', combo: 'ambushA', label: '기습 콤보로 입력 간격 맞추기' } },
    { re: /^W 안쪽 범위만/, id: 'wInner', w: 1.0, title: 'W를 너무 가까이서 맞춤',
      why: 'W(앰퓨테이션)는 바깥 범위(3~4m)에 맞아야 피해가 크고 외상·둔화가 붙습니다.',
      tip: '상대와 3m 이상 떨어진 상태에서 W를 쓰고, 붙어 있으면 한 걸음 물러난 뒤 쓰세요.',
      drill: { mode: 'dummy', label: '허수아비에서 W 바깥 범위 거리 감 익히기' } },
    { re: /^E 사거리 밖/, id: 'eRange', w: 0.9, title: 'E를 사거리 밖에서 던짐',
      why: 'E(수쳐) 사거리는 5.5m입니다. 밖에서 던지면 닿지 않고 쿨만 돕니다.',
      tip: '범위 표시를 켜고 5.5m 원 안에 상대가 들어왔을 때 던지세요.',
      drill: { mode: 'duel', label: '결투에서 E 사거리 안 견제' } },
    { re: /^R을 체력 70% 이상/, id: 'rEarly', w: 1.1, title: 'R을 너무 일찍 씀',
      why: 'R(이머전시 OP)은 대상 체력이 30% 이하일 때 최대 피해(2배)입니다.',
      tip: '상대 체력이 30% 근처일 때 마무리로 쓰세요. 체력이 많을 땐 Q·W·E·평타로 깎는 게 먼저입니다.',
      drill: { mode: 'combo', combo: 'finish', label: '마무리 콤보(E → W → Q → R) 연습' } },
    { re: /^단검 D/, id: 'dRange', w: 0.7, title: '단검 무기 스킬 대상 실패',
      why: '단검 D 2차는 2.5m 안의 대상을 커서로 지정해야 합니다.',
      tip: 'D를 누르기 전에 커서를 상대 위에 올리고 2.5m 안으로 들어가세요.',
      drill: { mode: 'dummy', label: '허수아비에서 단검 D 연습' } },
    { re: /^콤보 실패/, id: 'comboFail', w: 1.0, title: '콤보 순서·타이밍 실패',
      why: '정해진 순서나 입력 간격을 벗어나 콤보가 끊겼습니다.',
      tip: '입문 난이도로 순서를 몸에 익힌 뒤 숙련·마스터로 올리세요.',
      drill: { mode: 'combo', label: '같은 콤보를 입문 난이도로 다시' } },
    { re: /^걸작/, id: 'danR', w: 1.0, title: '걸작(R) 대상 조건 실패',
      why: '걸작은 4초 안에 피해를 준 3m 안의 적에게만 들어갑니다.',
      tip: 'Q나 평타로 먼저 맞힌 뒤 가까이 붙어서 R을 쓰세요.',
      drill: { mode: 'duel', label: '결투에서 진입 → 걸작 연습' } },
    { re: /^영감/, id: 'danW', w: 0.7, title: '영감(W) 대상 지정 실패',
      why: 'W는 커서 위의 적에게 표식을 남깁니다.',
      tip: '커서를 상대 위에 정확히 올리고 누르세요(7m).',
      drill: { mode: 'dummy', label: '허수아비에서 W 표식 연습' } },
  ],
  // 통계 → 분류 (판 길이에 맞춰 판단)
  metrics(St) {
    const out = [], t = Math.max(1, St.t), waste = Object.values(St.waste).reduce((a, b) => a + b, 0);
    if (waste > 8 && waste / t > 0.25) out.push({ id: 'waste', w: 1.1, n: Math.round(waste), unit: '초', title: '교전 중 쿨타임이 놀았음',
      why: `적이 8m 안에 있는데 쓸 수 있는 스킬을 쓰지 않은 시간이 ${fmt(waste, 1)}초입니다.`,
      tip: '교전 중엔 쿨이 돈 스킬을 바로 쓰는 습관을 들이세요. 특히 Q는 쿨이 짧아 자주 돌립니다.',
      drill: { mode: 'dummy', label: '허수아비 DPS 측정으로 쿨 돌리기' } });
    const e = St.casts.E || 0, eh = St.hits.E || 0;
    if (e >= 4 && eh / e < 0.45) out.push({ id: 'eAim', w: 1.2, n: e - eh, unit: '회', title: `수쳐(E) 적중률 낮음 (${pct(eh, e)})`,
      why: 'E는 캐시 교전의 시작입니다. 빗나가면 속박·기절 연계가 모두 사라집니다.',
      tip: '움직이는 상대는 「지금 위치」가 아니라 「0.3초 뒤 위치」를 노리세요. 상대가 스킬을 쓰는 순간(멈춘 순간)도 좋은 타이밍입니다.',
      drill: { mode: 'duel', label: '결투에서 E 예측샷 연습' } });
    const enhRate = St.aaHits ? St.enhAA / St.aaHits : 0, sk = ['Q', 'W', 'E', 'R', 'D'].reduce((a, k) => a + (St.casts[k] || 0), 0);
    if (sk >= 6 && St.enhAA < sk * 0.4 && !St.mistakes['강화 평타를 쓰지 않고 다음 스킬 연계']) out.push({ id: 'enhLow', w: 1.0, n: sk - St.enhAA, unit: '회', title: '스킬 뒤 강화 평타가 적음',
      why: `스킬 ${sk}번에 강화 평타는 ${St.enhAA}번(평타 중 ${Math.round(enhRate * 100)}%)입니다.`,
      tip: '스킬을 쓰고 나면 바로 평타로 이어 주세요.',
      drill: { mode: 'combo', combo: 'basic', label: '기본 콤보 연습' } });
    return out;
  },
  // 잘한 점
  strengths(St) {
    const out = [], { c, h } = St.totalCasts();
    if (c >= 5 && h / c >= 0.7) out.push(`스킬 적중률 ${pct(h, c)} — 조준이 정확합니다.`);
    if (St.enhAA >= 3 && St.aaHits && St.enhAA / St.aaHits >= 0.5) out.push(`강화 평타 ${St.enhAA}회 — 스킬과 평타를 잘 섞고 있습니다.`);
    if (St.eDouble > 0) out.push(`2인 수쳐 ${St.eDouble}회 — 고급 기술을 쓰고 있습니다.`);
    if (St.eWall > 0) out.push(`벽꿍 수쳐 ${St.eWall}회 — 지형을 잘 활용합니다.`);
    if (St.criticals >= 3) out.push(`치명적 외상 ${St.criticals}회 — 외상 3중첩 관리가 좋습니다.`);
    if (St.bestStreak >= 4) out.push(`스킬샷 ${St.bestStreak}연속 명중.`);
    if (!Object.keys(St.mistakes).length && St.t > 15) out.push('기록된 실수가 없습니다.');
    return out.slice(0, 3);
  },
  analyze(St) {
    const items = new Map();
    for (const [txt, n] of Object.entries(St.mistakes)) {
      const r = this.RULES.find(x => x.re.test(txt)); if (!r) continue;
      const cur = items.get(r.id) || Object.assign({ n: 0, unit: '회' }, r); cur.n += n; items.set(r.id, cur);
    }
    for (const m of this.metrics(St)) if (!items.has(m.id)) items.set(m.id, m);
    // 무게 × log(횟수) 순. 초 단위(쿨 낭비)는 4초 = 실수 1회로 환산
    const top = [...items.values()].map(x => Object.assign(x, { score: x.w * Math.log2(1 + (x.unit === '초' ? x.n / 4 : x.n)) })).sort((a, b) => b.score - a.score).slice(0, 3);
    return { top, good: this.strengths(St) };
  },
  // 연습하기: 알맞은 모드·콤보로 바로 시작
  startDrill(d) {
    if (!d) return;
    if (d.mode === 'combo') {
      const list = UI.allCombos(), cur = Modes.combo && Modes.combo.combo;
      const combo = (d.combo && list.find(c => c.id === d.combo)) || cur || list[0];
      UI.start('combo', { combo, diff: d.combo ? (Settings.comboDiff || 'intro') : 'intro' });
    } else UI.start(d.mode, UI.quickOpts(d.mode));
  },
  html(St) {
    const A = this.analyze(St); this.last = A;
    const items = A.top.map((x, i) => `<div class="coach">
        <div class="coach-h"><b>${i + 1}. ${esc(x.title)}</b><span>${x.n}${x.unit}</span></div>
        <div class="sub">${esc(x.why)}</div>
        <div class="coach-tip">💡 ${esc(x.tip)}</div>
        <button class="btn" data-a="drill" data-v="${i}">▶ ${esc(x.drill.label)}</button></div>`).join('');
    const good = A.good.length ? `<div class="coach-good">${A.good.map(g => `✔ ${esc(g)}`).join('<br>')}</div>` : '';
    return `<h3>🧑‍🏫 코칭</h3>${items || '<div class="sub">눈에 띄는 개선점이 없습니다. 난이도를 올려 보세요!</div>'}${good}`;
  },
};
