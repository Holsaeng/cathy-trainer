// =====================================================================
// 캐시 수련장 회귀 테스트 — `node build.js --test` 로 cathy_trainer.test.html 에 포함되어 페이지 로드 후 자동 실행
// 결과: 화면 상단 <pre id="__test"> + document.title ("TEST PASS n" / "TEST FAIL n/m")
// 모든 렌더러 작업(2D/3D)은 이 테스트를 통과해야 다음 단계로 진행
// =====================================================================
(function () {
  // 재현 가능한 난수 (mulberry32)
  let seed = 20261006; Math.random = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
  const T = { pass: 0, fail: [], group: '', ok(name, cond, info = '') { if (cond) this.pass++; else this.fail.push(`[${this.group}] ${name}${info !== '' ? ' (' + info + ')' : ''}`); } };
  const step = () => Game.step(CONFIG.sim.step), run = n => { for (let i = 0; i < n; i++) step(); };
  const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
  const click = sel => { const el = document.querySelector(sel); if (!el) throw new Error('요소 없음 ' + sel); el.click(); return el; };
  const errs = []; window.addEventListener('error', e => errs.push(e.message));
  const saved = JSON.stringify(Settings);
  const reset = () => { Object.assign(Settings, JSON.parse(saved)); Settings.lastPlay = null; Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.build = 'mid'; Settings.tactical = 'blink'; Settings.moveButton = 'right'; Settings.fog = true; };
  const groups = [];
  const G = (name, fn) => groups.push([name, fn]);

  // ---------------- 메뉴·UI ----------------
  G('메뉴·UI', () => {
    reset(); UI.showMenu();
    T.ok('모드 카드 4개', document.querySelectorAll('.mode').length === 4);
    T.ok('비공식 표기', document.getElementById('card').innerText.includes('비공식 팬 제작'));
    T.ok('바로 시작 4개', document.querySelectorAll('[data-a="quick"]').length === 4);
    T.ok('전술 스킬 10개', document.querySelectorAll('[data-in="tac"] option').length === 10);
    click('[data-a="char"][data-v="daniel"]'); T.ok('다니엘 제목', document.querySelector('#card h1').innerText.includes('DANIEL'));
    click('[data-a="char"][data-v="cathy"]'); click('[data-a="weapon"][data-v="dual"]'); T.ok('쌍검 선택', Settings.weapon === 'dual'); click('[data-a="weapon"][data-v="dagger"]');
    click('[data-a="build"][data-v="early"]'); T.ok('빌드 선택', Settings.build === 'early'); click('[data-a="build"][data-v="mid"]');
    const sel = document.querySelector('[data-in="tac"]'); sel.value = 'quake'; sel.dispatchEvent(new Event('change', { bubbles: true })); T.ok('전술 스킬 저장', Settings.tactical === 'quake'); Settings.tactical = 'blink';
    for (const [i, h] of [['1', '결투'], ['2', '허수아비'], ['3', '콤보'], ['4', '회피']]) { key(i); T.ok('키 ' + i, document.querySelector('#card h2').innerText.includes(h)); key('Escape'); T.ok('Esc ' + i, !!document.querySelector('[data-a="quick"]')); }
    click('[data-a="mode"][data-v="duel"]'); click('[data-a="diff"][data-v="hard"]'); click('[data-a="motif"][data-v="aya"]'); click('[data-a="map"][data-v="jungle"]'); click('[data-a="dtime"][data-v="night"]');
    const sph = document.querySelector('[data-in="sphere"]'); sph.checked = true; sph.dispatchEvent(new Event('change', { bubbles: true }));
    T.ok('결투 옵션 저장', Settings.duelDiff === 'hard' && Settings.duelMotif === 'aya' && Settings.duelMap === 'jungle' && Settings.duelTime === 'night' && Settings.duelSphere === true);
    key('Enter'); T.ok('결투 시작', Game.state === 'play' && Game.modeId === 'duel' && Vision.night && Sphere.active && Game.mapKey === 'jungle' && Modes.duel.motifKey === 'aya');
    run(60); Game.togglePause(); T.ok('일시정지', document.querySelector('#card h2').innerText.includes('일시정지'));
    click('[data-a="settings"]'); T.ok('설정', document.querySelector('#card h2').innerText.includes('설정'));
    for (const k of ['fog', 'pointerLock', 'showRange', 'showHitbox', 'sound', 'reduceShake']) T.ok('설정 ' + k, !!document.querySelector(`[data-in="${k}"]`));
    click('[data-a="mbtn"][data-v="left"]'); T.ok('이동 버튼 좌클릭', Settings.moveButton === 'left'); click('[data-a="mbtn"][data-v="right"]'); T.ok('이동 버튼 우클릭', Settings.moveButton === 'right');
    click('[data-a="bind"][data-k="X"]'); key('z'); T.ok('키 재설정', Settings.keys.X === 'z'); click('[data-a="bind"][data-k="X"]'); key('x');
    click('[data-a="back"]'); click('[data-a="resume"]'); T.ok('계속', !Game.paused);
    Game.togglePause(); click('[data-a="end"]'); T.ok('결과 화면', Game.state === 'result' && !!document.querySelector('#cv-dps'));
    key('m'); T.ok('M 메뉴', Game.state === 'menu'); T.ok('최근 플레이', !!document.querySelector('[data-a="last"]'));
    key('Enter'); T.ok('Enter 최근 플레이', Game.state === 'play' && Game.modeId === 'duel'); Game.finish('manual'); key('r'); T.ok('R 다시', Game.state === 'play');
    UI.showMenu(); click('[data-a="records"]'); T.ok('기록', document.querySelector('#card h2').innerText.includes('기록')); key('Escape');
    click('[data-a="help"]'); T.ok('조작법', document.querySelector('#card h2').innerText.includes('조작법')); key('Escape');
    T.ok('메뉴 복귀', !!document.querySelector('[data-a="quick"]'));
  });

  // ---------------- 캐시 ----------------
  G('캐시 스킬', () => {
    for (const wp of ['dagger', 'dual']) for (const b of ['early', 'mid', 'late']) {
      reset(); Settings.weapon = wp; Settings.build = b;
      Game.start('dummy', { count: 2, hp: 9000, def: 50, infinite: false }); run(10);
      const p = Game.player, ds = Game.units.filter(u => u.kind === 'dummy'), d = ds[0]; p.pos = { x: 10, y: 9 }; d.pos = { x: 12.5, y: 9 }; ds[1].pos = { x: 14, y: 9.3 }; p.cmdStop();
      const tag = `${wp}/${b}`, hp0 = d.hp;
      p.cmdSkill('E', d.pos); Input.aiming = null; run(90); T.ok(tag + ' E', (Stats.hits.E || 0) >= 1);
      p.cmdSkill('W', d.pos); Input.aiming = null; run(60); p.cmdAttack(d); run(80); p.cmdSkill('Q', d.pos); Input.aiming = null; run(80);
      T.ok(tag + ' 피해', d.hp < hp0); T.ok(tag + ' 외상', d.trauma > 0 || d.crit > 0 || Stats.criticals > 0);
      if (p.skills.R.lv > 0) { p.skills.R.cd = 0; p.cmdSkill('R', d.pos); Input.aiming = null; run(150); T.ok(tag + ' R', (Stats.casts.R || 0) >= 1); }
      p.skills.D.cd = 0; p.cmdSkill('D', d.pos); run(5);
      if (wp === 'dagger') { T.ok(tag + ' 단검 1차', p.daggerReady > 0); p.cmdSkill('D', d.pos); run(40); T.ok(tag + ' 단검 2차', p.daggerReady <= 0 && p.skills.D.cd > 0); }
      else { Input.aiming = null; run(120); T.ok(tag + ' 쌍검', (Stats.casts.D || 0) >= 1); }
      p.skills.F.cd = 0; const x0 = p.pos.x; p.cmdSkill('F', { x: p.pos.x - 5, y: p.pos.y }); run(3); T.ok(tag + ' 블링크', Math.abs(p.pos.x - x0) > 2.5);
      run(120 * 5); Renderer.frame();
    }
  });

  // ---------------- 다니엘 ----------------
  G('다니엘 스킬', () => {
    for (const b of ['early', 'mid', 'late']) {
      reset(); Settings.character = 'daniel'; Settings.build = b; Game.start('dummy', { count: 1, hp: 9000, def: 50, infinite: false }); run(10);
      const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: 8, y: 9 }; d.pos = { x: 13, y: 9 }; p.cmdStop(); const tag = b, hp0 = d.hp;
      T.ok(tag + ' 클래스', p.constructor.name === 'DanielPlayer');
      p.cmdSkill('Q', d.pos); Input.aiming = null; run(80); T.ok(tag + ' Q', p.qShots === 3);
      p.cmdSkill('W', d.pos); Input.aiming = null; T.ok(tag + ' W', !!p.mark);
      p.cmdSkill('E', d.pos); Input.aiming = null; run(25); T.ok(tag + ' E', p.stealthT > 0 && p.shadowT > 0);
      p.cmdAttack(d); run(60); T.ok(tag + ' 그림자 평타', p.pos.x > d.pos.x);
      run(120 * 4); T.ok(tag + ' 영감 폭발', !p.mark && hp0 - d.hp > 0);
      p.skills.D.cd = 0; p.cmdSkill('D', d.pos); run(5); p.cmdSkill('D', d.pos); run(30); T.ok(tag + ' 단검', p.skills.D.cd > 0);
      if (p.skills.R.lv > 0) { p.cmdStop(); p.pos = { x: d.pos.x - 1.5, y: d.pos.y }; Combat.damage(p, d, 1, { type: 'normal' }); p.skills.R.cd = 0; p.cmdSkill('R', d.pos); Input.aiming = null; run(5); T.ok(tag + ' R 진입', !!p.shadow && p.untargetable > 0); key('r'); run(60); T.ok(tag + ' R 탈출', !p.shadow); }
      Renderer.frame();
    }
  });

  // ---------------- 시야 ----------------
  G('시야', () => {
    reset(); Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'jungle', rounds: 3, time: 'day' }); run(240);
    const p = Game.player, e = Modes.duel.enemy; e.stun = 9999; p.cmdStop();
    T.ok('시야 켜짐', Vision.fogOn);
    const across = w => { const hz = w.w > w.h, c = { x: w.x + w.w / 2, y: w.y + w.h / 2 }; p.pos = hz ? { x: c.x, y: w.y - 1.2 } : { x: w.x - 1.2, y: c.y }; e.pos = hz ? { x: c.x, y: w.y + w.h + 1.2 } : { x: w.x + w.w + 1.2, y: c.y }; return Vision.visible(p, e); };
    T.ok('높은 벽 차단', !across(CONFIG.walls.find(w => !w.kind))); T.ok('창문 벽 투과', across(CONFIG.walls.find(w => w.kind === 'glass'))); T.ok('낮은 턱 투과', across(CONFIG.walls.find(w => w.kind === 'low')));
    p.pos = { x: 3, y: 1 }; e.pos = { x: 10.5, y: 1 }; T.ok('7.5m 보임', Vision.visible(p, e)); e.pos = { x: 13, y: 1 }; T.ok('10m 안 보임', !Vision.visible(p, e));
    const b = CONFIG.bushes[1]; e.pos = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; p.pos = { x: b.x + b.w / 2, y: b.y + b.h + 3 };   // 벽 없는 쪽
    T.ok('부쉬 속 안 보임', !Vision.visible(p, e)); T.ok('부쉬 안에서 밖 보임', Vision.visible(e, p));
    p.pos = { x: 4, y: 9 }; e.pos = { x: 15, y: 9 }; VisionItems.camera(p, { x: 8, y: 9 }); run(2); T.ok('카메라 시야', Vision.visible(p, e)); e.stealthT = 2; T.ok('카메라 은신 감지', Vision.visible(p, e)); e.stealthT = 0;
    e.pos = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; VisionItems.drone(p, e.pos); run(120); T.ok('드론', Vision.visible(p, e));
    Vision.noises = []; e.pos = { x: 12, y: 9 }; Vision.act(e, 'skill'); T.ok('소음', Vision.noises.some(n => n.team === 1));
    Renderer.frame();
    Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 3, time: 'night' }); run(240); Modes.duel.enemy.stun = 9999;
    T.ok('밤 시야 3.4m~', Vision.sightOf(Game.player) < 4); run(120 * 20.5); T.ok('밤 시야 6.4m', Math.abs(Vision.sightOf(Game.player) - 6.4) < 0.05);
  });

  // ---------------- 휴식·전술 스킬 ----------------
  G('휴식·전술', () => {
    reset(); Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 3 }); run(240);
    const p = Game.player, e = Modes.duel.enemy; e.stun = 9999; e.pos = { x: 30, y: 16 }; p.cmdStop(); run(130);
    p.hp = p.maxHp * 0.1; key('x'); const h0 = p.hp; run(Math.round(120 * 2.9)); T.ok('단계 중 회복 없음', p.hp === h0); run(24); T.ok('1단계 15%', Math.abs((p.hp - h0) / p.maxHp - 0.15) < 0.005);
    run(120 * 7); T.ok('누적 80%', Math.abs((p.hp - h0) / p.maxHp - 0.8) < 0.005); T.ok('완료 유지', Rest.done(p) && !!p.rest); key('x'); T.ok('X 취소', !p.rest && p.restCd > 0);
    for (const k of TACTICAL_ORDER) { reset(); Settings.tactical = k; Game.start('dummy', { count: 1, hp: 5000, def: 50 }); run(5); const q = Game.player, d = Game.units.find(u => u.kind === 'dummy'); q.pos = { x: 10, y: 9 }; d.pos = { x: 12, y: 9 }; q.cmdStop(); q.cmdSkill('F', { x: 16, y: 9 }); Input.aiming = null; run(120); T.ok(CONFIG.tactical[k].name, q.skills.F.cd > 0); Renderer.frame(); }
  });

  // ---------------- 모드 ----------------
  G('모드', () => {
    reset(); Game.start('dummy', { count: 3, hp: 2000, def: 30, infinite: false }); run(10); const p = Game.player;
    for (let i = 0; i < 120 * 15; i++) { step(); if (i % 30 === 0) { const t = Game.enemies().sort((a, b) => V.dist(a.pos, p.pos) - V.dist(b.pos, p.pos))[0]; if (t) { for (const k of ['E', 'W', 'Q', 'R']) if (p.skills[k].cd <= 0 && p.skills[k].lv > 0) { p.cmdSkill(k, t.pos); Input.aiming = null; break; } if (!p.cast) p.cmdAttack(t); } } }
    T.ok('허수아비 처치', Stats.kills >= 1); Game.finish('manual'); T.ok('허수아비 결과', Game.state === 'result' && !!document.querySelector('.grade'));
    const combo = UI.allCombos()[0]; Game.start('combo', { combo, diff: 'intro' }); run(30); const pc = Game.player, tgt = Game.enemies()[0];
    for (const tok of combo.steps) { const k = String(tok).split('|')[0].replace(/[?~].*$/, ''); if (k === 'AA') { pc.cmdAttack(tgt); run(90); } else if (k === 'D1' || k === 'D') { pc.skills.D.cd = 0; pc.cmdSkill('D', tgt.pos); run(40); } else { if (pc.skills[k]) pc.skills[k].cd = 0; pc.cmdSkill(k, tgt.pos); Input.aiming = null; run(100); } }
    T.ok('콤보 진행', Stats.comboAtt >= 1 || Object.keys(Stats.casts).length >= 2); Game.finish('manual'); T.ok('콤보 결과', Game.state === 'result');
    Game.start('dodge', {}); let g = 0; while (Game.state === 'play' && g < 120 * 240) { step(); g++; if (g % 600 === 0) Renderer.frame(); } T.ok('회피 수련 종료', Game.state === 'result'); T.ok('히트맵', !!document.querySelector('#cv-heat'));
    Game.start('duel', { diff: 'easy', motif: 'rio', enemyBuild: 'mid', map: 'basic', rounds: 3 }); g = 0; const rounds = new Set();
    while (Game.state === 'play' && g < 120 * 400) { step(); g++; rounds.add(Modes.duel.round); const e = Modes.duel.enemy; if (Game.freeze <= 0 && !Modes.duel.inter && g % 3 === 0 && !e.dead) { e.hp -= e.maxHp * 0.01; if (e.hp <= 0) Combat.kill(Game.player, e); } }
    T.ok('결투 2선승', Game.state === 'result' && Modes.duel.wins.p === 2); T.ok('라운드 진행', rounds.size >= 2); T.ok('라운드 요약', document.querySelector('#card').innerText.includes('라운드 요약'));
    // 크로노 스피어
    Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 1, sphere: true }); run(200); const ps = Game.player, es = Modes.duel.enemy; es.stun = 9999; ps.cmdStop(); ps.pos = { x: 3, y: 3 }; es.pos = { x: 29, y: 15 };
    g = 0; while (Game.state === 'play' && g < 120 * 120) { step(); g++; } T.ok('크로노 스피어 판정 종료', Game.state === 'result' && Modes.duel.history[0] && Modes.duel.history[0].time > 95);
  });

  // ---------------- 입력 ----------------
  G('입력', () => {
    reset(); Game.start('duel', { diff: 'easy', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 1 }); Game.freeze = 0; Modes.duel.banner = null; run(2);
    const cv = Renderer.inputCanvas(), pm = Game.player; Modes.duel.enemy.stun = 99;
    const fire = (type, o, tg = cv) => tg.dispatchEvent(new MouseEvent(type, Object.assign({ bubbles: true, cancelable: true }, o)));
    const s = Renderer.toScreen({ x: 14, y: 12 });
    fire('mousedown', { button: 2, buttons: 2, clientX: s.x, clientY: s.y }); T.ok('우클릭 이동', !!pm.moveTarget && V.dist(pm.moveTarget, { x: 14, y: 12 }) < 0.3, pm.moveTarget && `${pm.moveTarget.x.toFixed(2)},${pm.moveTarget.y.toFixed(2)}`); fire('mouseup', { button: 2 }, window);
    const w = Renderer.toWorld(s.x, s.y); T.ok('화면↔월드 좌표 왕복', V.dist(w, { x: 14, y: 12 }) < 0.05);
    Settings.moveButton = 'left'; pm.cmdStop(); fire('mousedown', { button: 0, buttons: 1, clientX: s.x, clientY: s.y }); T.ok('좌클릭 이동 모드', !!pm.moveTarget); fire('mouseup', { button: 0 }, window); Settings.moveButton = 'right';
  });

  // ---------------- 벽 넘기·AI 매치업 ----------------
  G('벽·AI', () => {
    const W0 = CONFIG.maps.basic.walls[0], yy = W0.y + W0.h / 2;
    const tryDash = (ch, k, f, len) => { reset(); Settings.character = ch; Settings.build = 'late'; Game.start('dummy', { count: 1, hp: 3000, def: 0, infinite: true }); run(5); const p = Game.player; Game.units.filter(u => u.kind === 'dummy').forEach(u => u.pos = { x: 30, y: 16 }); const start = 10.8 + 1.2 * f - len; p.pos = { x: start, y: yy }; p.skills[k].cd = 0; p.cmdSkill(k, { x: start + len, y: yy }); Input.aiming = null; run(300); return p.pos.x > 12; };
    T.ok('Q 80% 못 넘음', !tryDash('cathy', 'Q', 0.8, 4)); T.ok('Q 90% 넘음', tryDash('cathy', 'Q', 0.9, 4));
    T.ok('R 75% 못 넘음', !tryDash('cathy', 'R', 0.75, 6)); T.ok('R 85% 넘음', tryDash('cathy', 'R', 0.85, 6));
    T.ok('다니엘 E 40% 못 넘음', !tryDash('daniel', 'E', 0.4, 3)); T.ok('다니엘 E 60% 넘음', tryDash('daniel', 'E', 0.6, 3));
    const bot = (p, e) => { if (p.dead || e.dead || p.cast || p.fear > 0 || p.shadow || p.stasis) return; if (!Vision.visible(p, e) || e.untargetable > 0) { const g = Vision.ghosts[e.id]; if (!p.moveTarget) p.cmdMove(g ? g.pos : (Sphere.active ? Sphere.c : { x: 16, y: 9 })); return; } const d = V.dist(p.pos, e.pos); for (const k of ['E', 'W', 'Q', 'R', 'D', 'F']) if (p.skills[k].lv > 0 && p.skills[k].cd <= 0 && d < 5.5 && Math.random() < 0.5) { if (k === 'R' && p.charKey === 'daniel' && !p.rTarget(e.pos)) continue; if (k === 'F' && Math.random() < 0.8) continue; p.cmdSkill(k, e.pos); Input.aiming = null; return; } if (p.attackTarget !== e) p.cmdAttack(e); };
    let done = 0, n = 0;
    for (const ch of ['cathy', 'daniel']) for (const m of ['katja', 'rio', 'aya', 'nadine', 'daniel']) {
      n++; reset(); Settings.character = ch; Settings.build = ['early', 'mid', 'late'][n % 3]; Settings.tactical = TACTICAL_ORDER[n % 10];
      Game.start('duel', { diff: ['easy', 'normal', 'hard'][n % 3], motif: m, enemyBuild: Settings.build, map: n % 2 ? 'jungle' : 'basic', animals: n % 3 === 0, rounds: 1, time: ['day', 'night', 'cycle'][n % 3], sphere: n % 4 === 0 });
      let g = 0; while (Game.state === 'play' && g < 120 * 110) { step(); g++; if (Game.freeze <= 0 && g % 6 === 0) bot(Game.player, Modes.duel.enemy); if (g % 240 === 0) Renderer.frame(); if (g % 600 === 0) Side.update(); }
      if (Game.state === 'result') done++; else T.fail.push(`[벽·AI] 미종료 ${ch} vs ${m}`);
    }
    T.ok('AI 매치업 정상 종료', done === n, done + '/' + n);
  });

  // ---------------- 3D 렌더러 ----------------
  G('3D', () => {
    if (!window.THREE) { T.ok('Three.js 로드', false, 'CDN 차단 또는 오프라인'); return; }
    reset(); UI.showMenu(); click('[data-a="gfx"][data-v="3d"]');
    T.ok('메뉴에서 3D 전환', Renderer.mode === '3d' && Settings.gfx === '3d' && Render3D.cv.style.display === 'block');
    click('[data-a="gfx"][data-v="2d"]'); T.ok('메뉴에서 2D 전환', Renderer.mode === '2d' && Render3D.cv.style.display === 'none');
    Settings.gfx = '3d';
    T.ok('3D 전환', Renderer.setMode('3d', true) && Renderer.mode === '3d' && Render3D.cv.style.display === 'block');
    UI.showMenu(); Renderer.frame(); T.ok('메뉴 화면 렌더', true);
    for (const [id, o] of [['dummy', { count: 2, hp: 3000, def: 50, infinite: true }], ['combo', { combo: UI.allCombos()[0], diff: 'intro' }], ['dodge', {}], ['duel', { diff: 'normal', motif: 'nadine', enemyBuild: 'mid', map: 'jungle', rounds: 3, animals: true, sphere: true, time: 'night' }]]) {
      Game.start(id, o); for (let i = 0; i < 240; i++) { step(); if (i % 40 === 0) Renderer.frame(); }
      Renderer.frame(); T.ok(id + ' 3D 렌더', Render3D.unitMeshes.size === Game.units.length, `${Render3D.unitMeshes.size}/${Game.units.length}`);
    }
    T.ok('숲길 맵 메시', Render3D.mapKey === 'jungle' && Render3D.bushMeshes.length === CONFIG.bushes.length);
    const p = Game.player, e = Modes.duel.enemy; e.stun = 9999; const b = CONFIG.bushes[1];
    e.pos = { x: b.x + b.w / 2, y: b.y + b.h / 2 }; p.pos = { x: b.x + b.w / 2, y: b.y + b.h + 3 }; step(); Renderer.frame();
    T.ok('부쉬 속 적 메시 숨김', Render3D.unitMeshes.get(e.id).visible === false);
    p.pos = { x: e.pos.x, y: e.pos.y + 0.8 }; step(); Renderer.frame(); T.ok('같은 부쉬면 보임', Render3D.unitMeshes.get(e.id).visible === true);
    // 좌표 왕복 (창 크기가 있을 때만)
    if (innerWidth > 100 && innerHeight > 100) {
      Game.start('duel', { diff: 'easy', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 1 }); Game.freeze = 0; Modes.duel.banner = null; run(2); Modes.duel.enemy.stun = 99; Renderer.frame();
      let worst = 0; for (const q of [{ x: Game.player.pos.x, y: Game.player.pos.y }, { x: Game.player.pos.x + 3, y: Game.player.pos.y - 2 }, { x: Game.player.pos.x - 2, y: Game.player.pos.y + 3 }]) { const s = Renderer.toScreen(q), w = Renderer.toWorld(s.x, s.y); worst = Math.max(worst, V.dist(w, q)); }
      T.ok('3D 화면↔월드 왕복', worst < 0.05, worst.toFixed(3));
      const tgt = { x: Game.player.pos.x + 3, y: Game.player.pos.y + 1 }, s = Renderer.toScreen(tgt), cv = Renderer.inputCanvas();
      cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, clientX: s.x, clientY: s.y, bubbles: true, cancelable: true })); window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
      T.ok('3D 우클릭 이동 위치', Game.player.moveTarget && V.dist(Game.player.moveTarget, tgt) < 0.1);
      const o = Renderer.overhead(Game.player), f = Renderer.toScreen(Game.player.pos); T.ok('머리 위 체력바가 발보다 위', o.top < f.y);
    } else T.ok('창 크기 0 — 3D 좌표 검사는 화면이 보일 때 실행', true);
    // CC0 인물 모델(6_y_models.js): 웹에서 로딩이 끝났으면 모델, 아니면(file:// · 로딩 중 · 실패 · 끄기) 인형으로 대체
    T.ok('모델 매핑', Models.keyFor({ kind: 'player' }) === 'cathy' && Models.keyFor({ kind: 'player', charKey: 'daniel' }) === 'daniel' && Models.keyFor({ kind: 'dummy' }) === null && Models.keyFor({ kind: 'ranged', motifKey: 'nadine' }) === 'nadine');
    Game.start('duel', { diff: 'easy', motif: 'aya', enemyBuild: 'mid', map: 'basic', rounds: 1 }); run(2); Renderer.frame();
    const rigOf = u => Render3D.unitMeshes.get(u.id).userData.body.userData.rig;
    if (Models.state === 'ready') {
      const r = rigOf(Game.player); T.ok('캐시 CC0 모델', !!r && !!r.actions.run && !!r.actions.slash && !!r.actions.idle);
      T.ok('무기 손에 부착', !!r && !!r.obj.getObjectByName('WristR').children.find(c => c.type === 'Group'));
      const re = rigOf(Modes.duel.enemy); T.ok('아야 모델(원딜 동작)', !!re && re.ranged && !!re.actions.shoot);
      Settings.models3d = false; Render3D.refreshModels(); Renderer.frame(); T.ok('모델 끄기 → 인형', !rigOf(Game.player));
      Settings.models3d = true; Render3D.refreshModels();
    } else T.ok('모델 ' + Models.state + ' → 인형 대체', !rigOf(Game.player) && Render3D.unitMeshes.get(Game.player.id).userData.body.children.length > 5);
    T.ok('2D 복귀', Renderer.setMode('2d', true) && Renderer.mode === '2d' && Render3D.cv.style.display === 'none');
    Renderer.frame(); Settings.gfx = '2d';
  });

  // ---------------- 실행 ----------------
  function runAll() {
    const t0 = performance.now(), times = [];
    for (const [name, fn] of groups) { T.group = name; const t1 = performance.now(); try { fn(); } catch (e) { T.fail.push(`[${name}] 예외: ${e.message} ${(e.stack || '').split('\n')[1] || ''}`); } times.push(`${name} ${((performance.now() - t1) / 1000).toFixed(1)}s`); }
    errs.forEach(m => T.fail.push('[페이지 오류] ' + m));
    Object.assign(Settings, JSON.parse(saved)); saveSettings(); UI.showMenu();
    const ok = T.fail.length === 0, txt = `${ok ? 'TEST PASS' : 'TEST FAIL'} — 통과 ${T.pass} · 실패 ${T.fail.length} (${((performance.now() - t0) / 1000).toFixed(1)}s)\n${T.fail.join('\n')}\n— ${times.join(' · ')}`;
    document.title = ok ? `TEST PASS ${T.pass}` : `TEST FAIL ${T.fail.length}/${T.pass + T.fail.length}`;
    const pre = document.createElement('pre'); pre.id = '__test'; pre.textContent = txt;
    pre.style.cssText = `position:fixed;left:8px;top:8px;z-index:99999;max-width:90vw;max-height:60vh;overflow:auto;background:${ok ? '#0d2a17' : '#3a1010'};color:#fff;font:12px/1.5 monospace;padding:10px;border-radius:8px;white-space:pre-wrap`;
    document.body.appendChild(pre); window.__testResult = { ok, pass: T.pass, fail: T.fail };
  }
  // 웹(http)에서는 CC0 모델 로딩을 기다렸다가 실행 → 모델 경로까지 검사 (최대 10초, file://은 바로 실행)
  if (window.THREE && Models.supported()) Models.load();
  const t0w = performance.now(), wait = () => (Models.state === 'loading' && performance.now() - t0w < 10000) ? setTimeout(wait, 100) : runAll();
  setTimeout(wait, 300);
})();
