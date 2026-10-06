
// ============================== 사이드 패널 ==============================
const Side = {
  el: null,
  update() {
    if (!this.el) this.el = document.getElementById('side');
    const show = Game.state === 'play' && !Game.paused && Settings.side && Game.mode && Game.mode.side;
    this.el.classList.toggle('show', !!show);
    if (show) this.el.innerHTML = Game.mode.side() + '<div class="kv" style="margin-top:8px"><span>Tab: 패널 숨기기</span></div>';
  },
};

// ============================== 차트 ==============================
const Charts = {
  setup(id, h) {
    const cv = document.getElementById(id); if (!cv) return null;
    const w = cv.clientWidth || 600, dpr = Math.min(2, devicePixelRatio || 1);
    cv.width = w * dpr; cv.height = h * dpr; cv.style.height = h + 'px';
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); return { c, w, h };
  },
  empty(g, msg) { Draw.text(g.c, msg, g.w / 2, g.h / 2, { size: 12, align: 'center', color: '#8a93a6' }); },
  // 시간별 DPS (3초 이동 평균)
  dps(id) {
    const g = this.setup(id, 160); if (!g) return; const { c, w, h } = g;
    const n = Math.ceil(Stats.t), raw = Array.from({ length: n }, (_, i) => Stats.timeline[i] || 0);
    if (n < 2) return this.empty(g, '데이터 부족');
    const sm = raw.map((_, i) => { let s = 0, k = 0; for (let j = Math.max(0, i - 2); j <= i; j++) { s += raw[j]; k++; } return s / k; });
    const max = Math.max(1, ...sm), pl = 40, pb = 20, pt = 12;
    c.strokeStyle = '#2a3140'; c.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { const y = pt + (h - pt - pb) * i / 4; c.beginPath(); c.moveTo(pl, y); c.lineTo(w - 8, y); c.stroke(); Draw.text(c, String(Math.round(max * (1 - i / 4))), pl - 4, y, { size: 10, align: 'right', color: '#8a93a6' }); }
    const X = i => pl + (w - pl - 8) * i / (n - 1), Y = v => pt + (h - pt - pb) * (1 - v / max);
    c.beginPath(); sm.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v)));
    c.strokeStyle = CONFIG.theme.accent; c.lineWidth = 2; c.stroke();
    c.lineTo(X(n - 1), Y(0)); c.lineTo(X(0), Y(0)); c.closePath(); c.fillStyle = 'rgba(255,59,92,.12)'; c.fill();
    for (let s = 0; s < n; s += Math.max(5, Math.ceil(n / 8 / 5) * 5)) Draw.text(c, s + 's', X(s), h - 8, { size: 10, align: 'center', color: '#8a93a6' });
  },
  contrib(id) {
    const items = Object.entries(Stats.dmgBy).sort((a, b) => b[1] - a[1]);
    const g = this.setup(id, Math.max(60, items.length * 24 + 10)); if (!g) return; const { c, w } = g;
    if (!items.length) return this.empty(g, '가한 피해 없음');
    const tot = Stats.dealtTotal || 1, lw = 110;
    items.forEach(([k, v], i) => {
      const y = 8 + i * 24, bw = (w - lw - 70) * v / items[0][1];
      Draw.text(c, SRC_LABEL[k] || k, 8, y + 9, { size: 11, color: '#c9cfdb' });
      c.fillStyle = SRC_COLOR[k] || '#999'; Draw.rr(c, lw, y + 2, Math.max(2, bw), 14, 3); c.fill();
      Draw.text(c, `${Math.round(v)} (${Math.round(v / tot * 100)}%)`, lw + bw + 6, y + 9, { size: 11, color: '#e6e9ef' });
    });
  },
  trend(id, hist) {
    const g = this.setup(id, 120); if (!g) return; const { c, w, h } = g;
    if (!hist || hist.length < 2) return this.empty(g, '기록이 2판 이상 쌓이면 추이가 표시됩니다');
    const vals = hist.map(x => x.s), mn = Math.min(...vals), mx = Math.max(...vals), rg = mx - mn || 1, pl = 20, pr = 20, pt = 18, pb = 18;
    const X = i => pl + (w - pl - pr) * i / (hist.length - 1), Y = v => pt + (h - pt - pb) * (1 - (v - mn) / rg);
    c.beginPath(); vals.forEach((v, i) => i ? c.lineTo(X(i), Y(v)) : c.moveTo(X(i), Y(v))); c.strokeStyle = CONFIG.theme.accent2; c.lineWidth = 2; c.stroke();
    hist.forEach((x, i) => { Draw.circle(c, X(i), Y(x.s), 4); c.fillStyle = i === hist.length - 1 ? CONFIG.theme.gold : CONFIG.theme.accent2; c.fill(); Draw.text(c, `${x.s}`, X(i), Y(x.s) - 11, { size: 10, align: 'center', color: '#c9cfdb' }); Draw.text(c, x.g || '', X(i), h - 7, { size: 10, align: 'center', color: '#8a93a6' }); });
  },
  // 피격 위치 히트맵
  heat(id, pts) {
    const g = this.setup(id, 200); if (!g) return; const { c, w, h } = g;
    const sc = Math.min(w / CONFIG.world.w, h / CONFIG.world.h), ox = (w - CONFIG.world.w * sc) / 2, oy = (h - CONFIG.world.h * sc) / 2;
    c.fillStyle = CONFIG.theme.floor; c.fillRect(ox, oy, CONFIG.world.w * sc, CONFIG.world.h * sc);
    c.fillStyle = CONFIG.theme.wall; for (const wl of CONFIG.walls) c.fillRect(ox + wl.x * sc, oy + wl.y * sc, wl.w * sc, wl.h * sc);
    c.globalCompositeOperation = 'lighter';
    for (const p of pts) { const x = ox + p.x * sc, y = oy + p.y * sc, gr = c.createRadialGradient(x, y, 0, x, y, sc * 2.2); gr.addColorStop(0, 'rgba(255,80,60,.75)'); gr.addColorStop(1, 'rgba(255,80,60,0)'); c.fillStyle = gr; c.fillRect(x - sc * 2.2, y - sc * 2.2, sc * 4.4, sc * 4.4); }
    c.globalCompositeOperation = 'source-over';
    if (!pts.length) Draw.text(c, '피격 없음 — 완벽!', w / 2, h / 2, { size: 13, bold: true, align: 'center', color: CONFIG.theme.gold });
  },
};

// ============================== UI (메뉴/설정/결과) ==============================
const UI = {
  handlers: {}, keys: {}, waitKey: null, settingsBack: null,
  init() {
    this.ov = document.getElementById('overlay'); this.card = document.getElementById('card');
    this.card.addEventListener('click', e => {
      const el = e.target.closest('[data-a]'); if (!el || el.disabled) return;
      Sfx.init(); Sfx.play('click'); const h = this.handlers[el.dataset.a]; if (h) h(el.dataset, el);
    });
    const onIn = e => { const el = e.target; if (el.dataset && el.dataset.in) { const h = this.handlers['in:' + el.dataset.in]; if (h) h(el); } };
    this.card.addEventListener('input', onIn); this.card.addEventListener('change', onIn);
    // 화면별 단축키 (메뉴 1~4·Enter, 옵션 Enter·Esc, 결과 R·M) — 플레이 중이 아닐 때만
    window.addEventListener('keydown', e => {
      if (this.waitKey || !this.ov.classList.contains('show') || Game.state === 'play' || e.repeat) return;
      if (e.target && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) && e.key !== 'Escape') return;
      const k = this.keys[e.key] || this.keys[e.key.toLowerCase()]; if (!k) return;
      const [a, v] = Array.isArray(k) ? k : [k]; const h = this.handlers[a]; if (!h) return;
      e.preventDefault(); Sfx.init(); Sfx.play('click'); h({ v });
    });
  },
  show(html, handlers, keys) { this.card.innerHTML = html; this.handlers = handlers || {}; this.keys = keys || {}; this.ov.classList.add('show'); this.card.scrollTop = 0; Side.update(); },
  hide() { this.ov.classList.remove('show'); Side.update(); },
  // 상대(AI) 레벨 버튼: 캐시와 같게 / Lv6 / Lv12 / Lv18
  enemyBuildBtns() {
    const opts = [['same', '캐시와 같게']].concat(Object.entries(CONFIG.rangedAI.stages).map(([k, s]) => [k, s.label]));
    return opts.map(([k, l]) => `<button class="btn ${(Settings.enemyBuild || 'same') === k ? 'sel' : ''}" data-a="ebuild" data-v="${k}">${l}</button>`).join('');
  },
  customCombos() { return Store.get('combos', []); },
  allCombos() { return CONFIG.combos.concat(CONFIG.videoCombos, this.customCombos()); },

  // 모드 시작 (마지막 플레이로 저장 → 메뉴의 「최근 플레이 다시」·Enter)
  start(id, opts) { Settings.lastPlay = { id, opts }; saveSettings(); Game.start(id, opts); },
  modeList() {
    return [
      ['duel', '⚔️', '1:1 결투', '원딜 4명·다니엘 AI와 3판 2선승. 시야·부쉬·카메라·휴식까지 실전처럼.'],
      ['dummy', '🎯', '허수아비', 'DPS·스킬별 피해 비율 측정. 개수·체력·방어력 설정.'],
      ['combo', '🧩', '콤보 트레이너', '콤보 순서·입력 간격(ms) 판정. 입문 / 숙련 / 마스터.'],
      ['dodge', '💨', '회피 수련', '점점 빨라지는 투사체·장판. 생존 시간과 피격 히트맵.'],
    ];
  },
  // 각 모드의 「바로 시작」 옵션 (마지막으로 고른 값)
  quickOpts(id) {
    if (id === 'dummy') return Object.assign({ count: 1, hp: 3000, def: 50, infinite: true }, Store.get('dummyOpts', {}));
    if (id === 'combo') { const list = this.allCombos(), i = clamp(Settings.comboSel || 0, 0, list.length - 1); return { combo: list[i], diff: Settings.comboDiff || 'intro' }; }
    if (id === 'duel') return { diff: Settings.duelDiff || 'normal', motif: Settings.duelMotif || null, enemyBuild: Settings.enemyBuild, map: Settings.duelMap, animals: Settings.duelAnimals, time: Settings.duelTime, sphere: !!Settings.duelSphere };
    return {};
  },
  quickLabel(id) {
    const o = this.quickOpts(id);
    if (id === 'dummy') return `${o.count}개 · 체력 ${o.infinite ? '무한' : o.hp} · 방어 ${o.def}`;
    if (id === 'combo') return `${o.combo ? o.combo.name : '-'} · ${{ intro: '입문', skilled: '숙련', master: '마스터' }[o.diff]}${Settings.character === 'daniel' ? ' · 캐시로 진행' : ''}`;
    if (id === 'duel') return `${o.motif ? CONFIG.rangedMotifs[o.motif].name : '랜덤 상대'} · ${CONFIG.enemy.difficulty[o.diff].label} · ${(CONFIG.maps[o.map] || CONFIG.maps.basic).name} · ${{ day: '낮', night: '밤', cycle: '낮밤 교대' }[o.time || 'day']}${o.sphere ? ' · 크로노 스피어' : ''}`;
    return `목숨 ${CONFIG.modes.dodge.lives}개`;
  },
  lastLabel() {
    const L = Settings.lastPlay; if (!L || !Modes[L.id]) return '';
    const name = (this.modeList().find(m => m[0] === L.id) || [])[2] || L.id, o = L.opts || {};
    if (L.id === 'duel') return `${name} — ${o.motif ? CONFIG.rangedMotifs[o.motif].name : '랜덤'} · ${CONFIG.enemy.difficulty[o.diff || 'normal'].label}`;
    if (L.id === 'combo') return `${name} — ${o.combo ? o.combo.name : ''}`;
    return name;
  },

  showMenu() {
    Game.state = 'menu'; Game.paused = false; Game.mode = null; Game.units = []; Game.projectiles = []; Game.zones = []; Game.player = null;
    const modes = this.modeList(), dan = Settings.character === 'daniel';
    const wb = (v, l) => `<button class="btn ${Settings.weapon === v ? 'sel' : ''}" data-a="weapon" data-v="${v}">${l}</button>`;
    const bb = Object.entries(CONFIG.builds).map(([k, b]) => `<button class="btn ${Settings.build === k ? 'sel' : ''}" data-a="build" data-v="${k}">${b.label}</button>`).join('');
    const last = this.lastLabel();
    this.show(`<h1>${dan ? 'DANIEL' : 'CATHY'} <span>수련장</span></h1>
      <div class="sub">이터널 리턴 · 실험체 「${dan ? '다니엘' : '캐시'}」 숙련도 트레이닝 시뮬레이터 — 실제 스킬 수치 · 랭크 영상 실측 능력치 · 시야 시스템.</div>
      <div class="row"><label>실험체</label>${[['cathy', '캐시', CONFIG.theme.accent], ['daniel', '다니엘', CONFIG.rangedMotifs.daniel.color]].map(([k, l, c]) => `<button class="btn ${(Settings.character || 'cathy') === k ? 'sel' : ''}" data-a="char" data-v="${k}" style="color:${c}">${l}</button>`).join('')}
        <label style="margin-left:14px">무기</label>${dan ? '<button class="btn sel">단검 (다니엘 전용)</button>' : wb('dagger', '단검') + wb('dual', '쌍검')}</div>
      <div class="row"><label>빌드</label>${bb}<label style="margin-left:14px">그래픽</label><button class="btn ${Renderer.mode !== '3d' ? 'sel' : ''}" data-a="gfx" data-v="2d">2D</button><button class="btn ${Renderer.mode === '3d' ? 'sel' : ''}" data-a="gfx" data-v="3d">3D (시험)</button></div>
      <div class="row"><label>전술 스킬 (F)</label><select data-in="tac">${TACTICAL_ORDER.map(k => `<option value="${k}" ${Tactical.key() === k ? 'selected' : ''}>${CONFIG.tactical[k].name}</option>`).join('')}</select>
        <span class="sub" style="margin:0 0 0 6px">${esc(Tactical.def(Tactical.key()).desc)} · 쿨 ${Tactical.def(Tactical.key()).cd.join('/')}초</span></div>
      ${last ? `<div class="row" style="margin-top:10px"><button class="btn primary" data-a="last">▶ 최근 플레이 다시 — ${esc(last)} <kbd>Enter</kbd></button></div>` : ''}
      <div class="grid" style="margin-top:14px">${modes.map(([id, ic, t, d], i) => `<div class="mode" data-a="mode" data-v="${id}">
        <b><kbd>${i + 1}</kbd> ${ic} ${t}</b><small>${d}</small>
        <small style="color:#9fb3d1;margin-top:6px">${esc(this.quickLabel(id))}</small>
        <div class="row" style="margin-top:auto;padding-top:8px"><button class="btn primary" data-a="quick" data-v="${id}">▶ 바로 시작</button><button class="btn" data-a="mode" data-v="${id}">옵션</button></div></div>`).join('')}</div>
      <div class="row" style="margin-top:16px"><button class="btn" data-a="records">📊 기록</button><button class="btn" data-a="settings">⚙ 설정</button><button class="btn" data-a="help">❔ 조작법</button>
        <span class="sub" style="margin:0 0 0 8px">숫자 1~4: 모드 옵션 · Enter: 최근 플레이</span></div>
      ${NOTICE.html()}`, {
      weapon: d => { Settings.weapon = d.v; saveSettings(); this.showMenu(); },
      char: d => { Settings.character = d.v; saveSettings(); this.showMenu(); },
      'in:tac': el => { Settings.tactical = el.value; saveSettings(); this.showMenu(); },
      gfx: d => { Settings.gfx = d.v; saveSettings(); Renderer.setMode(d.v); this.showMenu(); },
      build: d => { Settings.build = d.v; saveSettings(); this.showMenu(); },
      mode: d => this.showModeOptions(d.v),
      quick: d => this.start(d.v, this.quickOpts(d.v)),
      last: () => { const L = Settings.lastPlay; if (L && Modes[L.id]) this.start(L.id, L.opts); },
      records: () => this.showRecords(), settings: () => this.showSettings(() => this.showMenu()), help: () => this.showHelp(),
    }, Object.assign({ Enter: 'last' }, Object.fromEntries(modes.map(([id], i) => [String(i + 1), ['mode', id]]))));
  },

  showModeOptions(id) {
    const back = `<button class="btn" data-a="back">← 뒤로 <kbd>Esc</kbd></button>`, go = `<button class="btn primary" data-a="go">▶ 시작 <kbd>Enter</kbd></button>`, H = { back: () => this.showMenu() }, K = { Escape: 'back', Enter: 'go' };
    if (id === 'dummy') {
      const o = this.quickOpts('dummy');
      this.show(`<h2>🎯 허수아비 모드</h2><div class="sub">움직이지 않는 허수아비. 오른쪽 패널에 DPS와 스킬별 피해 비율이 실시간 표시됩니다. ESC → 「결과 보기」로 세션을 마칩니다.</div>
        <div class="row"><label>개수</label><input type="number" id="o-count" min="1" max="5" value="${o.count}"><label>체력</label><input type="number" id="o-hp" min="100" step="100" value="${o.hp}"><label>방어력</label><input type="number" id="o-def" min="0" value="${o.def}"><label><input type="checkbox" id="o-inf" ${o.infinite ? 'checked' : ''}> 무한 체력</label></div>
        <div class="row" style="margin-top:14px">${back}${go}</div>`, Object.assign(H, {
        go: () => {
          const v = { count: clamp(+document.getElementById('o-count').value || 1, 1, 5), hp: Math.max(100, +document.getElementById('o-hp').value || 3000), def: Math.max(0, +document.getElementById('o-def').value || 0), infinite: document.getElementById('o-inf').checked };
          Store.set('dummyOpts', v); this.start('dummy', v);
        },
      }), K);
    } else if (id === 'combo') {
      const list = this.allCombos(); Settings.comboSel = clamp(Settings.comboSel || 0, 0, list.length - 1);
      const sel = Settings.comboSel, cd = Settings.comboDiff || 'intro', nC = CONFIG.combos.length + CONFIG.videoCombos.length;
      const dbtn = (v, l) => `<button class="btn ${cd === v ? 'sel' : ''}" data-a="diff" data-v="${v}">${l}</button>`;
      this.show(`<h2>🧩 콤보 트레이너</h2><div class="sub">첫 단계 입력부터 측정이 시작됩니다. 단계마다 맞음/틀림과 입력 간격(ms)이 표시되고, 끝나면 쿨타임이 초기화됩니다.${Settings.character === 'daniel' ? ' <b style="color:#ff9f9f">캐시 전용 — 캐시로 진행됩니다.</b>' : ''}</div>
        <div class="row"><label>난이도</label>${dbtn('intro', '입문 (시간 제한 없음)')}${dbtn('skilled', '숙련 (간격 ≤ 2.0s)')}${dbtn('master', '마스터 (간격 ≤ 1.0s)')}</div>
        ${list.map((c, i) => `<div class="combo ${i === sel ? 'sel' : ''}" data-a="sel" data-v="${i}"><b>${esc(c.name)}</b> ${i >= nC ? '<span class="lock">(사용자)</span>' : ''}<small>${esc(c.steps.join(' → '))}${c.setup === 'pair' ? ' · 허수아비 2개' : ''}${c.weapon ? ' · ' + CONFIG.basicAttack[c.weapon].label + ' 전용' : ''}<br>${esc(c.tip || '')}</small></div>`).join('')}
        <div class="row" style="margin-top:10px">${back}${go}</div>
        <details style="margin-top:10px"><summary class="sub" style="cursor:pointer">콤보 직접 추가 / 삭제</summary>
        <textarea id="o-json">{"name":"내 콤보","steps":["E","AA","Q","W"],"setup":"single","tip":"설명"}</textarea>
        <div class="sub" style="margin:4px 0">토큰: Q W E R D F AA D1(단검 1차) D2(쌍검 2식) · "W|E" 택1 · "W?" 생략 가능 · "Q~8" 그 단계 허용 간격 8초 · setup "pair" = 허수아비 2개</div>
        <div class="row"><button class="btn" data-a="add">콤보 추가</button><button class="btn" data-a="del" ${sel < nC ? 'disabled' : ''}>선택한 사용자 콤보 삭제</button></div></details>`, Object.assign(H, {
        sel: d => { Settings.comboSel = +d.v; saveSettings(); this.showModeOptions('combo'); },
        diff: d => { Settings.comboDiff = d.v; saveSettings(); this.showModeOptions('combo'); },
        add: () => {
          try {
            const c = JSON.parse(document.getElementById('o-json').value);
            const ok = /^(Q|W|E|R|D|F|AA|D1|D2)$/;
            if (!c.name || !Array.isArray(c.steps) || !c.steps.length) throw new Error('name, steps 필요');
            for (const t of c.steps) for (const a of String(t).toUpperCase().replace(/~[\d.]+$/, '').replace(/\?$/, '').split('|')) if (!ok.test(a.trim())) throw new Error('알 수 없는 토큰: ' + a);
            c.id = 'u' + Date.now(); const cs = this.customCombos(); cs.push(c); Store.set('combos', cs);
            Settings.comboSel = this.allCombos().length - 1; saveSettings(); this.showModeOptions('combo');
          } catch (e) { alert('콤보 JSON 오류: ' + e.message); }
        },
        del: () => { const cs = this.customCombos(); cs.splice(sel - nC, 1); Store.set('combos', cs); Settings.comboSel = 0; saveSettings(); this.showModeOptions('combo'); },
        go: () => this.start('combo', this.quickOpts('combo')),
      }), K);
    } else if (id === 'dodge') {
      this.show(`<h2>💨 회피 수련</h2><div class="sub">목숨 ${CONFIG.modes.dodge.lives}개. 직선 투사체·원형 장판·지연 폭발이 갈수록 빨라집니다. 무빙과 이동기·블링크로 버티세요. 결과 화면에 피격 위치 히트맵이 표시됩니다.</div><div class="row">${back}${go}</div>`, Object.assign(H, { go: () => this.start('dodge', {}) }), K);
    } else if (id === 'duel') {
      const dd = Settings.duelDiff || 'normal', dm = Settings.duelMotif || null;
      const db = Object.entries(CONFIG.enemy.difficulty).map(([k, d]) => `<button class="btn ${dd === k ? 'sel' : ''}" data-a="diff" data-v="${k}">${d.label}</button>`).join('');
      const ms = [['random', '🎲 랜덤', '#e6e9ef']].concat(Object.entries(CONFIG.rangedMotifs).map(([k, m]) => [k, `${m.name} (${m.weapon})`, m.color]));
      const mb = ms.map(([k, l, c]) => `<button class="btn ${(dm || 'random') === k ? 'sel' : ''}" data-a="motif" data-v="${k}" style="color:${c}">${l}</button>`).join('');
      const cur = CONFIG.rangedMotifs[dm];
      this.show(`<h2>⚔ 1:1 결투</h2><div class="sub">3판 2선승. 상대는 이터널 리턴 원거리 딜러 4명 + 근거리 암살자 다니엘 모티브 AI (실제 스킬 수치, 랭크 영상 HUD 실측 능력치).</div>
        <div class="row"><label>상대</label>${mb}</div>
        <div class="sub" style="margin:2px 0 6px">${cur ? `${cur.build} 빌드 · 평타 사거리 ${cur.aaRange}m · ` + ['P', 'Q', 'W', 'E', 'R', 'D'].map(k => CONFIG.rangedKits[dm][k]).filter(Boolean).map(s => s.name).join(' · ') : '시작할 때마다 5명 중 무작위'}</div>
        <div class="row"><label>난이도</label>${db}</div>
        <div class="row"><label>상대 레벨</label>${this.enemyBuildBtns()}</div>
        <div class="row"><label>시간대</label>${[['day', '☀ 낮 (시야 8.5m)'], ['night', '🌙 밤 (3.4→6.4m)'], ['cycle', '🔄 낮밤 교대']].map(([k, l]) => `<button class="btn ${(Settings.duelTime || 'day') === k ? 'sel' : ''}" data-a="dtime" data-v="${k}">${l}</button>`).join('')}</div>
        <div class="row"><label>맵</label>${Object.entries(CONFIG.maps).map(([k, m]) => `<button class="btn ${(Settings.duelMap || 'basic') === k ? 'sel' : ''}" data-a="map" data-v="${k}">${m.name}</button>`).join('')}
          <label style="margin-left:10px"><input type="checkbox" data-in="animals" ${Settings.duelAnimals ? 'checked' : ''}> 야생동물(늑대)</label></div>
        <div class="row"><label><input type="checkbox" data-in="sphere" ${Settings.duelSphere ? 'checked' : ''}> <b>크로노 스피어</b> (시즌 12 임시 안전지대) — 반경 30m → 10m → 이동 → 5m → 0m로 줄어드는 차단벽 안에서 결투, 이동기로도 못 넘음. 끝까지 승부가 안 나면 남은 체력 비율로 판정</label></div>
        ${Settings.character === 'daniel' ? '<div class="sub" style="margin:4px 0;color:#d9a8ff">다니엘은 은신(E)·영감 시야 감소(W)·걸작(R)으로 원딜을 한 번에 무는 암살자라 <b>어려움</b>을 권장합니다.</div>' : ''}
        <div class="row" style="margin-top:12px">${back}${go}</div>
        <details style="margin-top:10px"><summary class="sub" style="cursor:pointer">AI·맵·시야 설명 자세히</summary><div class="sub" style="margin-top:6px">
          · <b>원딜 AI</b>: 유튜브 원딜 강의 반영 — 쏘고 움직이기, 좌우 무빙(E 예고선 회피), 앞뒤 무빙(쏠 때만 들어오고 진입 거리 밖으로), 벽 근처 회피, 위험 스킬이 남아 있으면 이동기 아끼기. 평타 사거리: 권총 4.85m / 석궁 5.2m / 활 6.4m / 저격총 6m.<br>
          · <b>다니엘 AI</b>: 다니엘 랭킹 1위 강의 반영 — 정면 싸움 대신 서성이다가 캐시의 E·Q가 빠진 순간 은신 진입.<br>
          · <b>난이도</b>: 쉬움 = 반응 느림 · 보통 = 예측샷·회피 · 어려움 = 자주 피하고 진입에 즉시 반응.<br>
          · <b>숲길</b>: 좁은 길목·복도(벽꿍 각), 부쉬 5곳, 낮은 턱·창문 벽.<br>
          · <b>시야 시스템</b>(설정에서 끄기): 시야 낮 8.5m·밤 3.4→6.4m, 높은 벽 뒤 암시야(낮은 턱 점선·창문 벽은 너머가 보임), 시야 밖 행동은 <b style="color:#ff4d5e">!</b> 소음·발소리, 시야 안 부쉬 진입 시 흔들림. <b>C</b> 망원 카메라 · <b>V</b> 정찰 드론 · <b>X</b> 휴식. AI도 같은 규칙으로 보고 듣습니다.</div></details>`, Object.assign(H, {
        diff: d => { Settings.duelDiff = d.v; saveSettings(); this.showModeOptions('duel'); },
        motif: d => { Settings.duelMotif = d.v === 'random' ? null : d.v; saveSettings(); this.showModeOptions('duel'); },
        ebuild: d => { Settings.enemyBuild = d.v; saveSettings(); this.showModeOptions('duel'); },
        map: d => { Settings.duelMap = d.v; saveSettings(); this.showModeOptions('duel'); },
        'in:animals': el => { Settings.duelAnimals = el.checked; saveSettings(); },
        'in:sphere': el => { Settings.duelSphere = el.checked; saveSettings(); },
        dtime: d => { Settings.duelTime = d.v; saveSettings(); this.showModeOptions('duel'); },
        go: () => this.start('duel', this.quickOpts('duel')),
      }), K);
    }
  },

  showPause() {
    this.show(`<h2>⏸ 일시정지</h2><div class="sub">${esc(Game.mode.title)} · ${fmt(Game.time, 1)}s</div>
      <div class="row"><button class="btn primary" data-a="resume">계속 (ESC)</button><button class="btn" data-a="settings">설정</button>
      <button class="btn" data-a="end">결과 보기 (세션 종료)</button><button class="btn" data-a="restart">재시작</button><button class="btn" data-a="menu">메인 메뉴</button></div>`, {
      resume: () => Game.togglePause(),
      settings: () => this.showSettings(() => this.showPause()),
      end: () => { Game.paused = false; Game.finish('manual'); },
      restart: () => Game.restart(),
      menu: () => this.showMenu(),
    });
  },

  showSettings(back) {
    this.settingsBack = back;
    const names = { Q: 'Q 동맥절제술', W: 'W 앰퓨테이션', E: 'E 수쳐', R: 'R 이머전시 OP', D: 'D 무기 스킬', F: 'F 블링크', S: '정지', A: '공격 이동', C: 'C 망원 카메라 (결투)', V: 'V 정찰 드론 (결투)', X: 'X 휴식', Y: 'Y 카메라 잠금 전환 (3D)' };
    const cb = (k, l) => `<div class="row"><label><input type="checkbox" data-in="${k}" ${Settings[k] ? 'checked' : ''}> ${l}</label></div>`;
    this.show(`<h2>⚙ 설정</h2>
      <h3>시전 방식</h3>
      <div class="row"><label>기본</label>${Object.entries(CAST_MODES).map(([k, l]) => `<button class="btn ${Settings.castMode === k ? 'sel' : ''}" data-a="cast" data-v="${k}">${l}</button>`).join('')}</div>
      <table>${['Q', 'W', 'E', 'R', 'D', 'F'].map(k => `<tr><td>${k} ${CONFIG.skills[k === 'D' ? 'D_dagger' : k].name.replace('단검 ', '')}</td><td><select data-in="cm" data-k="${k}"><option value="">기본 설정 따름</option>${Object.entries(CAST_MODES).map(([m, l]) => `<option value="${m}" ${Settings.castModes[k] === m ? 'selected' : ''}>${l}</option>`).join('')}</select></td></tr>`).join('')}</table>
      <div class="sub" style="margin:4px 0">스마트: 키를 누르는 순간 커서 방향으로 발동 · 범위 표시 후 떼면 발동: 누르고 있는 동안 범위를 보고 키를 떼면 발동. 단검 1차(유틸)는 항상 즉시 발동.</div>
      <h3>마우스</h3>
      <div class="row"><label>이동 버튼</label><button class="btn ${Settings.moveButton !== 'left' ? 'sel' : ''}" data-a="mbtn" data-v="right">우클릭 (게임과 동일)</button><button class="btn ${Settings.moveButton === 'left' ? 'sel' : ''}" data-a="mbtn" data-v="left">좌클릭 (웨일 마우스 제스처 회피)</button></div>
      <div class="sub" style="margin:4px 0">웨일 브라우저의 마우스 제스처는 브라우저 자체 기능이라 페이지에서 막을 수 없습니다. <b>좌클릭 이동</b>으로 바꾸면 우클릭 드래그를 쓸 일이 없어 제스처가 뜨지 않습니다(스킬 조준 확정도 좌클릭, 우클릭은 조준 취소).</div>
      ${cb('pointerLock', '마우스 잠금 모드 — 웨일·비발디 등의 <b>우클릭 드래그 마우스 제스처</b>가 이동을 가로챌 때 사용 (플레이 중 클릭하면 커서가 게임 화면에 고정, Esc로 해제·일시정지)')}
      <div class="sub" style="margin:4px 0">우클릭을 누르고 있으면 커서를 따라 계속 이동합니다. 잠금 모드로도 제스처가 뜨면 브라우저 설정에서 '마우스 제스처'를 끄세요 (웨일: 설정 → 검색창에 '제스처').</div>
      <h3>그래픽</h3>
      <div class="row"><label>표시</label><button class="btn ${Renderer.mode !== '3d' ? 'sel' : ''}" data-a="gfx" data-v="2d">2D (가볍고 안정적)</button><button class="btn ${Renderer.mode === '3d' ? 'sel' : ''}" data-a="gfx" data-v="3d">3D (시험) — 쿼터뷰·그림자·로우폴리 캐릭터</button></div>
      ${cb('models3d', '3D 인물 모델 사용 (CC0 · Quaternius) — 웹에서만, 끄면 단순 인형')}
      ${[['cathy', '캐시'], ['daniel', '다니엘']].map(([k, n]) => `<div class="row"><label>${n} 3D 모델</label>${[['cc0', 'CC0 모델'], ['proc', '직접 만든 모델'], ['blend', 'Blender 모델'], ['ref', '원작풍 (로컬 전용)']].filter(([v]) => (v !== 'blend' || Models.src[k + 'Blend']) && (v !== 'ref' || Models.src[k + 'Ref'])).map(([v, l]) => `<button class="btn ${Models.choice(k) === v ? 'sel' : ''}" data-a="cmodel" data-k="${k}" data-v="${v}">${l}</button>`).join('')}</div>`).join('')}
      ${cb('camLock', '카메라 잠금 (3D) — 끄면 마우스를 화면 가장자리에 대 카메라 이동, 스페이스를 누르고 있으면 내 캐릭터로. 플레이 중 <kbd>Y</kbd>로 전환')}
      <div class="sub" style="margin:4px 0">3D: 이터널 리턴처럼 높이 내려다보는 시점(탑뷰와 쿼터뷰 사이), 마우스 휠로 줌. 게임 판정은 2D와 똑같습니다. 3D를 쓸 수 없는 환경이면 자동으로 2D로 돌아갑니다.</div>
      <h3>시야</h3>
      ${cb('fog', '시야 시스템 (1:1 결투) — 시야 8.5m(밤 3.4→6.4m), 높은 벽 뒤 암시야, 소음·발소리·부쉬 흔들림, C 카메라·V 드론')}
      <h3>표시 / 기타</h3>
      ${cb('showRange', '스킬 사거리·범위 미리보기 표시')}${cb('showHitbox', '히트박스 표시')}${cb('sound', '효과음')}${cb('reduceShake', '화면 흔들림 끄기')}
      <div class="row"><label>볼륨</label><input type="range" min="0" max="1" step="0.05" value="${Settings.volume}" data-in="volume"></div>
      <div class="row"><label>게임 속도 <b id="spdv">x${fmt(Settings.gameSpeed, 1)}</b> (느린 연습용)</label><input type="range" min="0.5" max="1.5" step="0.1" value="${Settings.gameSpeed}" data-in="gameSpeed"></div>
      <h3>키 설정 (버튼 클릭 후 새 키 입력, 겹치면 맞바꿈)</h3>
      <table>${Object.keys(names).map(k => `<tr><td>${names[k]}</td><td><button class="btn" data-a="bind" data-k="${k}">${(Settings.keys[k] || '').toUpperCase()}</button></td></tr>`).join('')}</table>
      <div class="row" style="margin-top:12px"><button class="btn" data-a="back">← 돌아가기</button><button class="btn" data-a="reset">기본값 복원</button></div>`, {
      cast: d => { Settings.castMode = d.v; saveSettings(); this.showSettings(back); },
      mbtn: d => { Settings.moveButton = d.v; saveSettings(); this.showSettings(back); },
      cmodel: d => { Settings.models3dBy = Object.assign({}, Settings.models3dBy, { [d.k]: d.v }); saveSettings(); Models.ver++; this.showSettings(back); },   // 모델 교체 → Render3D가 다시 만듦
      gfx: d => { Settings.gfx = d.v; saveSettings(); Renderer.setMode(d.v); this.showSettings(back); },
      'in:cm': el => { if (el.value) Settings.castModes[el.dataset.k] = el.value; else delete Settings.castModes[el.dataset.k]; saveSettings(); },
      'in:showRange': el => { Settings.showRange = el.checked; saveSettings(); },
      'in:showHitbox': el => { Settings.showHitbox = el.checked; saveSettings(); }, 'in:sound': el => { Settings.sound = el.checked; saveSettings(); },
      'in:fog': el => { Settings.fog = el.checked; saveSettings(); },
      'in:camLock': el => { Settings.camLock = el.checked; saveSettings(); },
      'in:models3d': el => { Settings.models3d = el.checked; saveSettings(); if (Render3D.ready) Render3D.refreshModels(); },
      'in:pointerLock': el => { Settings.pointerLock = el.checked; saveSettings(); },
      'in:reduceShake': el => { Settings.reduceShake = el.checked; saveSettings(); },
      'in:volume': el => { Settings.volume = +el.value; saveSettings(); },
      'in:gameSpeed': el => { Settings.gameSpeed = +el.value; saveSettings(); document.getElementById('spdv').textContent = 'x' + fmt(Settings.gameSpeed, 1); },
      bind: (d, el) => { this.waitKey = d.k; el.textContent = '키 입력…'; },
      back: () => back(),
      reset: () => { Object.assign(Settings, DEFAULT_SETTINGS, { weapon: Settings.weapon, build: Settings.build }); Settings.keys = Object.assign({}, DEFAULT_KEYS); Settings.castModes = {}; saveSettings(); this.showSettings(back); },
    });
  },

  showHelp() {
    this.show(`<h2>❔ 조작법</h2><table>
      <tr><td><kbd>우클릭</kbd></td><td>이동 / 적 위에서 우클릭 = 기본 공격 대상 지정</td></tr>
      <tr><td><kbd>A</kbd> + <kbd>좌클릭</kbd></td><td>공격 이동 (경로 근처 적 자동 공격)</td></tr>
      <tr><td><kbd>S</kbd></td><td>정지 (평타 후딜도 끊음)</td></tr>
      <tr><td><kbd>Q</kbd><kbd>W</kbd><kbd>E</kbd><kbd>R</kbd></td><td>스킬. 시전 방식은 메인 메뉴·설정에서 선택(스킬별 지정 가능)<br>· 일반: 키 → 범위 확인 → 좌클릭(또는 같은 키 한 번 더)<br>· 스마트: 키를 누르면 즉시 커서 방향으로 발동<br>· 범위 표시 후 떼면 발동: 누르는 동안 범위 표시, 떼면 발동</td></tr>
      <tr><td><kbd>D</kbd></td><td>단검: 1차 = 이동 속도 증가(3초) → 2차 = 2.5m 내 대상 뒤로 이동 + 피해 / 쌍검: 돌진 6연타 → 적중 시 5초 내 2식</td></tr>
      <tr><td><kbd>F</kbd></td><td>전술 스킬 — 메인 메뉴에서 선택 (블링크·리펄서 미사일·붉은 폭풍·라이트 윙·진실의 칼날·플라즈마 대시·퀘이크·초월·아티팩트·무효화)</td></tr>
      <tr><td><kbd>ESC</kbd> / <kbd>Tab</kbd></td><td>일시정지·설정·결과 보기 / 통계 패널 켜기·끄기</td></tr></table>
      <h3>핵심 메커니즘</h3><div class="sub">
      · <b>평타</b>: 평타 선딜 중 이동하면 평타가 취소됩니다(실수로 기록).<br>
      · <b>선딜 캔슬</b>: 스킬 선딜 중 이동 입력을 하면 스킬이 끊깁니다(실수로 기록).<br>
      · <b>선입력</b>: 시전 중 누른 스킬은 ${CONFIG.input.bufferMs}ms 안에 시전이 끝나면 이어서 나갑니다. 너무 일찍 누르면 씹힙니다.<br>
      · <b>외과 전문의</b>: 스킬 피해마다 외상 1중첩(스킬당 1회, 4초간 스킬 증폭 25% 출혈) → 3중첩 시 치명적 외상(4초간 최대 체력 6%+스킬 증폭 25% 출혈, 치유 감소, 보호막, Q 쿨 감소). W 안쪽 범위와 E 충돌은 외상을 주지 않습니다.<br>
      · <b>강화 평타</b>: Q/W/E/R 사용 후 다음 평타가 추가 스킬 피해(외상 부여).<br>
      · <b>다니엘(메인 메뉴 → 실험체)</b>: Q 그림자 가위 — 지정 위치(7m) 부채꼴, 0.53초 뒤 적중(시전 중 이동 가능), 중앙은 강화 피해·둔화, 적중 시 다음 평타 3번 공속 증가 · W 영감 — 대상 지정(7m) 표식, 4초 뒤 활성 → 공격하면 축적 피해 폭발, 대상 시야 4.5m로 감소 · E 그림자 이동 — 앞으로 3m 은신 돌진, 3초간 평타 사거리 3m + 평타 시 대상 건너편 순간이동 · R 걸작 — 4초 안에 피해를 준 적(3m)의 그림자 속으로(침묵 0.5초, 2초 대상 지정 불가·지속 피해), R 재사용·종료 시 커서 쪽으로 탈출 · D 망토와 단검 · P 밤에 시야·이속 증가. 결투·허수아비·회피 모드에서 사용.<br>
      · <b>X 휴식 (시즌 12)</b>: 전투 중에도 시작 가능한 3단계 캐스팅 — 1단계 3초 → 최대 체력 15%, 2단계 3초 → 15%, 3단계 4초 → 50%가 <b>단계가 끝날 때 한 번에</b> 회복(도중 취소 시 그 단계는 회복 없음). 단계 종료 0.25초 이내 이동 입력은 회복 후 이동. 피격·군중 제어·이동/공격/스킬·X 재입력 시 취소, 취소 후 1초 대기. 휴식 중 시야 1m 감소(밤 0.4m). 체력바 아래에 캐스팅 바와 예상 회복량이 표시되며 상대 AI도 쉽니다.<br>
      · <b>F 블링크</b>: 커서 방향 3m 순간 이동(벽 중심을 넘으면 벽 너머로). 쿨 90초, Lv12·18 빌드는 2레벨 — 쿨 45초 + 2.5초 이속 15%.<br>
      · <b>시야(1:1 결투)</b>: 시야 낮 8.5m / 밤 3.4m→6.4m. 높은 벽은 시야를 가리고(암시야), 낮은 턱·창문 벽은 너머가 보입니다. 부쉬 안에선 밖이 보이고 밖에선 안이 안 보입니다. 시야 밖 상대의 스킬·평타는 빨간 <b>!</b>, 이동은 발자국(부쉬 안 제외)으로 표시됩니다. <b>C</b> 망원 카메라(커서 방향 4m 설치, 반경 13m, 60초, 은신 감지, 최대 2개, 평타 한 번에 파괴) · <b>V</b> 정찰 드론(커서 지점 5초 시야, 벽 무시).<br>
      · 수치는 코드 맨 위 <code>CONFIG</code>에서 바꿀 수 있습니다.</div>
      <h3>안내</h3><div class="sub">${NOTICE.long}</div>
      <div class="row"><button class="btn" data-a="back">← 뒤로 <kbd>Esc</kbd></button></div>`, { back: () => this.showMenu() }, { Escape: 'back' });
  },

  showRecords() {
    const all = Records.all(), keys = Object.keys(all).filter(k => !/^(skillshot|challenge)/.test(k));   // 삭제된 모드 기록은 숨김
    this.show(`<h2>📊 기록</h2><div class="sub">모드별 최고 기록과 최근 10판 추이.</div>
      ${keys.length ? keys.map((k, i) => `<h3>${esc(all[k].title || k)} — 최고 ${all[k].best} <span class="lock">(${esc(all[k].label || '')})</span></h3><canvas class="chart" id="rec-${i}"></canvas>`).join('') : '<div class="sub">아직 기록이 없습니다.</div>'}
      <div class="row" style="margin-top:12px"><button class="btn" data-a="back">← 뒤로</button>${keys.length ? '<button class="btn" data-a="clear">기록 초기화</button>' : ''}</div>`, {
      back: () => this.showMenu(),
      clear: () => { if (confirm('모든 기록을 삭제할까요?')) { Store.set('records', {}); Store.set('challenges', {}); this.showRecords(); } },
    }, { Escape: 'back' });
    keys.forEach((k, i) => Charts.trend('rec-' + i, all[k].hist));
  },

  showResults(r) {
    Side.update();
    const dan = Game.player && Game.player.charKey === 'daniel';   // 다니엘: 캐시 전용 통계 숨김
    const St = Stats, { c, h } = St.totalCasts(), waste = Object.values(St.waste).reduce((a, b) => a + b, 0);
    const gc = { S: CONFIG.theme.gold, A: CONFIG.theme.accent2, B: '#7aa2ff', C: '#c0c4cc', D: '#ff5d5d' }[r.grade];
    const stat = (k, v) => `<div class="stat"><span>${k}</span><b>${v}</b></div>`;
    const skillRows = SKILL_KEYS.map(k => {
      const name = dan && k !== 'F' ? `${k} ${Game.player.skillDef(k).name}` : k === 'D' ? (Settings.weapon === 'dagger' ? 'D 단검' : 'D 쌍검') : SRC_LABEL[k];
      return `<tr><td>${name}</td><td>${St.casts[k] || 0}</td><td>${St.hits[k] || 0}</td><td>${pct(St.hits[k] || 0, St.casts[k] || 0)}</td><td>${Math.round(St.dmgBy[k] || 0)}</td><td>${fmt(St.waste[k] || 0, 1)}s</td></tr>`;
    }).join('');
    const mist = Object.entries(St.mistakes).sort((a, b) => b[1] - a[1]);
    const comp = r.components.filter(x => x.w > 0).map(x => `<div class="sbar" style="height:16px"><i style="width:${Math.round(x.v * 100)}%;background:${gc}44;border-right:2px solid ${gc}"></i><em style="line-height:16px;font-size:11px">${x.label} ${Math.round(x.v * 100)}% (가중치 ${x.w})</em></div>`).join('');
    const H = { retry: () => Game.restart(), menu: () => this.showMenu() };
    this.show(`<div style="display:flex;gap:22px;align-items:center;flex-wrap:wrap">
        <div class="grade" style="color:${gc}">${r.grade}</div>
        <div style="flex:1;min-width:220px"><h2 style="margin:0">${esc(r.title)}</h2>
          <div class="sub" style="margin:4px 0">${esc(r.scoreLabel || '점수')}: <b style="color:#fff;font-size:18px">${r.score}</b>
          ${r.isBest ? ' <b style="color:#ffc857">🏅 최고 기록!</b>' : r.prevBest != null ? ` · 최고 ${r.prevBest}` : ''} · 종합 ${r.gradeScore}점</div>${comp}
          <div class="row" style="margin-top:8px"><button class="btn primary" data-a="retry">다시 하기 <kbd>R</kbd></button><button class="btn" data-a="menu">메인 메뉴 <kbd>M</kbd></button></div></div></div>
      <div class="stat-grid">${stat('세션 시간', fmt(St.t, 1) + 's')}${stat('APM', Math.round(St.apm()))}${stat('스킬 적중률', pct(h, c))}${stat(dan ? '평타' : '평타 / 강화 평타', dan ? St.aaHits : `${St.aaHits} / ${St.enhAA}`)}
        ${stat('쿨타임 낭비', fmt(waste, 1) + 's')}${stat('콤보 완성률', St.comboAtt ? `${pct(St.comboOk, St.comboAtt)} (${St.comboOk}/${St.comboAtt})` : '-')}${stat('가한 피해', Math.round(St.dealtTotal))}
        ${stat(Game.modeId === 'dodge' ? '피격 횟수' : '받은 피해', Game.modeId === 'dodge' ? St.playerHits : Math.round(St.takenTotal))}
        ${dan ? '' : stat('치명적 외상', St.criticals) + stat('2인 수쳐 / 벽꿍', `${St.eDouble} / ${St.eWall}`)}${stat('예측샷 성공률', pct(St.leadHits, St.movingHits))}</div>
      ${r.extraHtml || ''}
      <h3>🎯 다음 목표</h3><div class="sub" style="color:#e6e9ef">${esc(r.nextGoal)}</div>
      <h3>실수 분석</h3>${mist.length ? `<ul class="mist">${mist.map(([k, v]) => `<li>${esc(k)} <b style="color:#ffb347">${v}회</b></li>`).join('')}</ul>` : '<div class="sub">기록된 실수가 없습니다. 👍</div>'}
      <h3>스킬별 기록</h3><table><tr><th>스킬</th><th>시전</th><th>적중</th><th>적중률</th><th>피해</th><th>쿨 낭비</th></tr>${skillRows}</table>
      <h3>시간별 DPS</h3><canvas class="chart" id="cv-dps"></canvas>
      <h3>스킬별 기여도</h3><canvas class="chart" id="cv-contrib"></canvas>
      ${r.heatmap ? '<h3>피격 위치 히트맵</h3><canvas class="chart" id="cv-heat"></canvas>' : ''}
      <h3>최근 10판 추이 (${esc(r.scoreLabel || '')})</h3><canvas class="chart" id="cv-trend"></canvas>
      <div class="row" style="margin-top:14px"><button class="btn primary" data-a="retry">다시 하기 <kbd>R</kbd></button><button class="btn" data-a="menu">메인 메뉴 <kbd>M</kbd></button></div>${NOTICE.html()}`, H, { r: 'retry', Enter: 'retry', m: 'menu', Escape: 'menu' });
    Charts.dps('cv-dps'); Charts.contrib('cv-contrib'); Charts.trend('cv-trend', r.hist); if (r.heatmap) Charts.heat('cv-heat', r.heatmap);
  },
};

// ============================== 메인 루프 ==============================
let lastT = performance.now(), acc = 0, fps = 60, sideT = 0;
function loop(now) {
  let dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  fps = lerp(fps, 1 / Math.max(dt, 1e-4), 0.05);
  if (Game.state === 'play' && !Game.paused) {
    acc += dt * Settings.gameSpeed; let n = 0;
    while (acc >= CONFIG.sim.step && n < CONFIG.sim.maxSteps && Game.state === 'play') { Game.step(CONFIG.sim.step); acc -= CONFIG.sim.step; n++; }
    if (n >= CONFIG.sim.maxSteps) acc = 0;
  } else acc = 0;
  try { Renderer.frame(); } catch (e) { console.error(e); }
  if ((sideT -= dt) <= 0) { sideT = 0.25; Side.update(); }
  requestAnimationFrame(loop);
}
Renderer.init(); Input.init(Renderer.inputCanvas()); UI.init(); UI.showMenu();
requestAnimationFrame(loop);
</script>
</body>
</html>
