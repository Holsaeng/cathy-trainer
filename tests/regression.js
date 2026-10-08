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
    // R 이머전시 OP: 사용 순간(정신집중)부터 돌진 끝까지 저지 불가 — 공포·기절·넉백 무시
    reset(); Settings.build = 'late'; Game.start('dummy', { count: 1, hp: 9000, def: 50, infinite: true }); run(10);
    { const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: 10, y: 9 }; d.pos = { x: 14, y: 9 }; p.cmdStop(); p.skills.R.cd = 0;
      p.cmdSkill('R', d.pos); Input.aiming = null; step();
      T.ok('R 정신집중 중 저지 불가', p.cast && p.cast.k === 'R' && p.cast.phase === 'windup' && p.unstoppable > 0);
      const x0 = p.pos.x; T.ok('R 중 기절 무시', p.applyCC('stun', 1) === false && p.stun === 0);
      T.ok('R 중 공포 무시', p.applyFear(1, { x: 20, y: 9 }) === false && p.fear === 0);
      KU.knock(p, { x: -1, y: 0 }, 3, 0.2); T.ok('R 중 넉백 무시', !p.forced && p.pos.x === x0);
      run(80); T.ok('R 끊기지 않고 돌진', (Stats.casts.R || 0) >= 1 && p.pos.x > x0 + 1);
      run(120); T.ok('R 끝나면 저지 불가 해제', p.unstoppable === 0 && p.applyCC('stun', 0.1) === true); }
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

  // ---------------- 결과 화면 코칭 ----------------
  G('코칭', () => {
    reset(); Settings.character = 'cathy'; Game.start('dummy', { count: 1, hp: 9000, def: 50, infinite: true }); run(5);
    Object.assign(Stats, { t: 40, mistakes: { '강화 평타를 쓰지 않고 다음 스킬 연계': 5, 'Q 선딜 중 이동 입력으로 캔슬됨': 2, '평타 선딜 중 이동 → 평타 취소': 4 }, casts: { Q: 8, W: 5, E: 6 }, hits: { Q: 7, W: 5, E: 2 }, waste: { Q: 6, W: 9 }, aaHits: 20, enhAA: 4, criticals: 4 });
    const A = Coach.analyze(Stats);
    T.ok('코칭: 개선점 3개(무게순)', A.top.length === 3 && A.top[0].id === 'enhSkip' && A.top.every(x => x.tip && x.drill && x.drill.label), A.top.map(x => x.id).join(','));
    T.ok('코칭: 통계 기반 항목(E 적중률)', Coach.metrics(Stats).some(x => x.id === 'eAim'));
    T.ok('코칭: 잘한 점', A.good.some(g => g.includes('치명적 외상')));
    Game.finish('test'); T.ok('코칭: 결과 화면 표시', document.querySelectorAll('.coach').length === 3 && !!document.querySelector('[data-a="drill"]'));
    click('[data-a="drill"][data-v="0"]'); T.ok('코칭: 연습하기 → 기본 콤보', Game.state === 'play' && Game.modeId === 'combo' && Modes.combo.combo && Modes.combo.combo.id === 'basic');
    Stats.reset(); T.ok('코칭: 실수 없으면 빈 목록', Coach.analyze(Stats).top.length === 0);
  });

  // ---------------- 콤보 시범(모범 간격) ----------------
  G('콤보 시범', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger';
    const combo = UI.allCombos().find(c => c.id === 'basic');
    Game.start('combo', { combo, diff: 'intro' }); run(10);
    const M = Modes.combo, att0 = Stats.comboAtt;
    M.startDemo(); T.ok('시범: 시작하면 입력 잠금', !!M.demo && Game.demoLock === true);
    let n = 0; while (n++ < 1500 && M.demo) step();
    T.ok('시범: 성공으로 끝남', !M.demo && M.state === 'result' && /시범/.test(M.msg), M.msg);
    T.ok('시범: 모범 간격 기록', Array.isArray(M.ideal) && M.ideal.length === M.steps.length && M.ideal.slice(1).every(g => g > 0 && g < 3), JSON.stringify(M.ideal));
    const saved = Store.get('comboIdeal', {})[combo.id + ':dagger'];
    T.ok('시범: 모범 간격 저장', Array.isArray(saved) && saved.length === M.ideal.length);
    T.ok('시범: 통계는 시범 전으로 복원', Stats.comboAtt === att0, `${att0} → ${Stats.comboAtt}`);
    T.ok('시범: 끝나면 입력 잠금 해제', !Game.demoLock);
    Game.start('combo', { combo, diff: 'intro' }); T.ok('시범: 다시 시작해도 모범 유지', Array.isArray(M.ideal) && !M.demo);
  });

  // ---------------- 사운드 ----------------
  G('사운드', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.sound = true; Settings.ambient = true;
    Game.start('dummy', { count: 1, hp: 3000, def: 0 }); run(5);
    const p = Game.player, d = Game.units.find(u => u.kind === 'dummy');
    const R = Sfx.spatial({ x: p.pos.x + 6, y: p.pos.y }), L = Sfx.spatial({ x: p.pos.x - 6, y: p.pos.y }), F = Sfx.spatial({ x: p.pos.x, y: p.pos.y + 30 });
    T.ok('사운드: 오른쪽 소리는 오른쪽 스피커', R.pan > 0.5 && L.pan < -0.5, `${R.pan} / ${L.pan}`);
    T.ok('사운드: 멀수록 작게(최소 30%)', F.vol === 0.3 && R.vol > 0.9 && Sfx.spatial({ x: p.pos.x + 3, y: p.pos.y }).vol === 1 && Sfx.spatial(null).pan === 0);
    const aya = { motif: CONFIG.rangedMotifs.aya }, rio = { motif: CONFIG.rangedMotifs.rio };
    p.weapon = 'dual'; const twin = Sfx.hitKind(p, 'normal'); p.weapon = 'dagger';
    T.ok('사운드: 무기별 타격음', Sfx.hitKind(p, 'normal') === 'hitBlade' && twin === 'hitTwin' && Sfx.hitKind(aya, 'normal') === 'hitGun' && Sfx.hitKind(rio, 'normal') === 'hitArrow' && Sfx.hitKind({ charKey: 'daniel' }, 'normal') === 'hitShadow');
    T.ok('사운드: 치명타·스킬·고정 피해 구분', Sfx.hitKind(p, 'normal', { crit: true }) === 'hitCrit' && Sfx.hitKind(p, 'skill') === 'hitSkill' && Sfx.hitKind(p, 'true') === null);
    Sfx.init();
    if (!Sfx.ctx) { T.ok('사운드: 오디오 장치', true, '오디오 없음 — 재생 테스트 생략'); return; }
    Sfx.last = {}; Combat.damage(p, d, 10, { type: 'normal' });
    T.ok('사운드: 타격음이 대상 위치에서', Sfx.lastPlay && Sfx.lastPlay.n === 'hitBlade' && Math.abs(Sfx.lastPlay.pan - clamp((d.pos.x - p.pos.x) / 9, -0.85, 0.85)) < 1e-6, JSON.stringify(Sfx.lastPlay));
    Sfx.last = {}; Combat.damage(p, d, 99999, { type: 'true' }); T.ok('사운드: 처치음', d.dead && Sfx.lastPlay.n === 'kill');
    Vision.setTime('day'); Sfx.tick(0.016); const day = Sfx.ambLevel;
    Vision.setTime('night'); Sfx.tick(0.016); const night = Sfx.ambLevel;
    T.ok('사운드: 낮밤 환경음', day > 0 && night > 0 && Sfx.ambF && Math.abs(day - night) > 0.003, `${day.toFixed(3)} / ${night.toFixed(3)}`);
    Settings.ambient = false; Sfx.tick(0.016); T.ok('사운드: 환경음 끄기', Sfx.ambLevel === 0);
    Settings.ambient = true; Vision.setTime('day');
  });

  // ---------------- 명령 계층·결정성 (리플레이·온라인 대전 준비) ----------------
  G('명령·결정성', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.fog = true;
    const opts = { diff: 'normal', motif: 'aya', enemyBuild: 'mid', map: 'jungle', rounds: 3, animals: true, sphere: true, time: 'night', seed: 777 };
    // 정해진 규칙으로 명령을 보내는 봇 (Cmd 경유 = 실제 입력과 같은 길)
    const bot = () => {
      const p = Game.player, e = Modes.duel.enemy, t = Game.tick; if (!p || !e || p.dead) return;
      if (t % 60 === 0) Cmd.move({ x: e.pos.x + Math.sin(t * 0.013) * 4, y: e.pos.y + Math.cos(t * 0.017) * 3 });
      if (t % 150 === 30) Cmd.skill(['Q', 'W', 'E'][(t / 150 | 0) % 3], e.pos);
      if (t % 200 === 100) Cmd.attack(e);
      if (t === 1500) Cmd.camera({ x: p.pos.x + 3, y: p.pos.y });
    };
    const N = 120 * 25;
    Game.start('duel', opts); for (let i = 0; i < N; i++) { bot(); step(); }
    const rec = Cmd.record(), hA = Cmd.hash(), stA = JSON.stringify([Stats.casts, Stats.hits]);
    T.ok('명령: 입력이 틱과 함께 기록', rec.log.length > 30 && rec.log.every(c => Number.isInteger(c.k) && c.t) && rec.log.some(c => c.t === 'atk' && c.id !== null) && rec.seed === 777, `${rec.log.length}개`);
    T.ok('명령: 스킬이 실제로 나감', (Stats.casts.Q || 0) + (Stats.casts.W || 0) + (Stats.casts.E || 0) >= 5, stA);
    Game.start('duel', opts); Cmd.replay(rec.log); run(N);
    T.ok('결정성: 같은 시드 + 같은 명령 = 같은 결과', Cmd.hash() === hA && JSON.stringify([Stats.casts, Stats.hits]) === stA, `${hA} / ${Cmd.hash()}`);
    T.ok('결정성: 재생 기록도 같음', Cmd.log.length === rec.log.length);
    Game.start('duel', Object.assign({}, opts, { seed: 778 })); Cmd.replay(rec.log); run(N);
    T.ok('결정성: 시드가 다르면 결과가 달라짐(검사가 유효함)', Cmd.hash() !== hA);
    Game.start('duel', opts); Cmd.replay(rec.log); Cmd.stop(); T.ok('재생 중엔 실제 입력 무시', Cmd.log.length === 0);
    // 실제 키·마우스 입력 → 명령
    Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(5);
    key(Settings.keys.S); key(Settings.keys.X);
    T.ok('키 입력 → 명령(정지·휴식)', Cmd.log.some(c => c.t === 'stop') && Cmd.log.some(c => c.t === 'rest') && !!Game.player.rest);
    const ticks0 = Game.tick; run(3); T.ok('틱 카운터', Game.tick === ticks0 + 3);
    // 선입력 버퍼는 게임 시간 기준 (게임 속도와 무관)
    const p = Game.player; key(Settings.keys.X); run(2); p.buffer = { k: 'Q', aim: V.copy(p.pos), time: Game.time - CONFIG.input.bufferMs / 1000 * 2 };
    p.cast = null; const m0 = Stats.mistakes['너무 이른 선입력 (입력 씹힘)'] || 0; step();
    T.ok('선입력 버퍼: 게임 시간 기준', (Stats.mistakes['너무 이른 선입력 (입력 씹힘)'] || 0) === m0 + 1);
    // 그리기(2D·3D)는 판정 난수를 쓰지 않음 — 쓰면 화면을 켜고 끄는 것만으로 결과가 달라짐
    const mode0 = Renderer.mode; let bad = '';
    Game.start('duel', opts); run(240);
    for (const m of ['2d'].concat(window.THREE && Render3D.ready !== false ? ['3d'] : [])) {
      if (!Renderer.setMode(m, true) && m === '3d') continue;
      for (let i = 0; i < 6; i++) { run(40); const s1 = Rng.s; Renderer.frame(); if (Rng.s !== s1) bad += m + ' '; }
    }
    Renderer.setMode(mode0 === '3d' ? '3d' : '2d', true);
    T.ok('그리기는 판정 난수를 쓰지 않음', !bad, bad);
    // 다니엘 플레이어: 걸작(R) 탈출 방향(커서)까지 재생이 같아야 함
    Settings.character = 'daniel';
    const dop = { diff: 'normal', motif: 'rio', enemyBuild: 'mid', map: 'basic', rounds: 3, animals: false, sphere: false, time: 'day', seed: 99 };
    const dbot = () => {
      const p = Game.player, e = Modes.duel.enemy, t = Game.tick; if (!p || !e || p.dead || e.dead) return;
      if (p.shadow) { if (t % 20 === 0) Cmd.cursor({ x: e.pos.x - 3 + (t % 7), y: e.pos.y - 2 }); return; }
      if (t % 45 === 0) Cmd.move({ x: e.pos.x + Math.sin(t * 0.02) * 1.2, y: e.pos.y + 1.0 });
      if (t % 130 === 10) Cmd.skill(['Q', 'W', 'E'][(t / 130 | 0) % 3], e.pos);
      if (t % 170 === 60) Cmd.attack(e);
      if (t % 30 === 0 && p.skills.R.cd <= 0 && p.skills.R.lv > 0 && V.dist(p.pos, e.pos) < 2.8) Cmd.skill('R', e.pos);   // 상태는 읽기만(직접 바꾸면 재생 때 안 일어남)
    };
    Game.start('duel', dop); for (let i = 0; i < 120 * 20; i++) { dbot(); step(); }
    const drec = Cmd.record(), dh = Cmd.hash();
    Game.start('duel', dop); Cmd.replay(drec.log); run(120 * 20);
    T.ok('결정성: 다니엘(걸작 탈출 커서 포함)', Cmd.hash() === dh && drec.log.some(c => c.t === 'cur') && (Stats.casts.R || 0) >= 1, `${drec.log.filter(c => c.t === 'cur').length}개 커서 명령`);
    Settings.character = 'cathy';
  });

  // ---------------- 상대 팀 사람 캐릭터 (온라인 대전 준비) ----------------
  //   팀 1에 두 번째 캐시를 세우고 명령(Cmd.apply)으로 조종 → 내 캐릭터를 맞히고, 자기·자기 편은 안 맞고, 외상은 그 캐시 기준, 내 통계엔 안 섞임
  G('상대 팀 캐릭터', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger';
    Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(5);
    const p = Game.player, u2 = new Cathy(p.pos.x + 2.5, p.pos.y), d = Game.units.find(u => u.kind === 'dummy');
    u2.team = 1; u2.name = '상대 캐시'; Game.units.push(u2); d.pos = { x: p.pos.x - 7, y: p.pos.y };
    const hit = [], o0 = Combat.damage; Combat.damage = function (src, tgt) { if (src === u2) hit.push(tgt === p ? 'me' : tgt === u2 ? 'self' : tgt.kind); return o0.apply(this, arguments); };
    const st0 = JSON.stringify([Stats.casts, Stats.mistakes, Stats.inputs]);
    try {
      for (const k of ['Q', 'W', 'E']) { u2.skills[k].cd = 0; Cmd.apply(u2, { t: 'sk', s: k, x: p.pos.x, y: p.pos.y }); run(120); }
      Cmd.apply(u2, { t: 'atk', id: Cmd.rel(p) }); run(150);
    } finally { Combat.damage = o0; }
    T.ok('상대 캐시: 스킬·평타가 나를 맞힘', hit.filter(h => h === 'me').length >= 4, hit.join(','));
    T.ok('상대 캐시: 자기·자기 편은 안 맞음', !hit.includes('self') && !hit.includes('dummy'));
    T.ok('상대 캐시: 외상 주인은 상대 캐시', (p.bleeds || []).length > 0 && p.bleeds.every(b => b.src === u2) || p.crit > 0, `외상 ${p.trauma}`);
    T.ok('상대 캐시: 내 통계에 안 섞임', JSON.stringify([Stats.casts, Stats.mistakes, Stats.inputs]) === st0);
    T.ok('적 목록은 기준 유닛에 따라', Game.enemies(u2).includes(p) && !Game.enemies(u2).includes(d) && Game.enemies(p).includes(u2) && Game.enemies().includes(d));
  });

  // ---------------- 상태 스냅샷 (온라인 대전 2단계) ----------------
  //   호스트 판을 진행하며 스냅샷 → 같은 옵션으로 새로 시작한 판(손님 역할)에 적용 → 상태 요약이 같아야 함
  G('스냅샷', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.fog = true;
    const opts = { diff: 'hard', motif: 'nadine', enemyBuild: 'mid', map: 'jungle', rounds: 3, animals: true, sphere: true, time: 'night', seed: 5 };
    const bot = () => {
      const p = Game.player, e = Modes.duel.enemy, t = Game.tick; if (!p || !e || p.dead) return;
      if (t % 60 === 0) Cmd.move({ x: e.pos.x + Math.sin(t * 0.01) * 3, y: e.pos.y + 2 });
      if (t % 120 === 30) Cmd.skill(['Q', 'W', 'E', 'D'][(t / 120 | 0) % 4], e.pos);
      if (t % 170 === 90) Cmd.attack(e);
      if (t === 900) Cmd.camera({ x: p.pos.x + 3, y: p.pos.y });
      if (t === 1300) Cmd.drone({ x: e.pos.x, y: e.pos.y });
    };
    Game.start('duel', opts); const shots = [];
    for (let i = 0; i < 120 * 60; i++) { bot(); step(); const last = shots[shots.length - 1]; if (i % 240 === 0 || !last || last.n !== Game.units.length || last.round !== Modes.duel.round || (Game.projectiles.length && !shots.some(s => s.np))) shots.push({ s: Snap.pack(), h: Cmd.hash(), np: Game.projectiles.length, n: Game.units.length, round: Modes.duel.round }); }
    T.ok('스냅샷: 여러 상황 포함(라운드 변화·유닛 수 변화·투사체)', new Set(shots.map(s => s.round)).size >= 2 && new Set(shots.map(s => s.n)).size >= 2 && shots.some(s => s.np > 0), `${shots.length}개`);
    Game.start('duel', opts); let bad = [], err = '';
    for (const [i, sh] of shots.entries()) { try { Snap.unpack(sh.s); if (Cmd.hash() !== sh.h) bad.push(i); } catch (x) { err = x.message; break; } }
    T.ok('스냅샷: 손님 상태 = 호스트 상태', !bad.length && !err, err || bad.join(','));
    const big = Math.max(...shots.map(s => s.s.length));
    T.ok('스냅샷: 크기(20KB 이하)', big < 20000, `${big}B`);
    // 투사체·참조·설정 객체 복원
    const ps = shots.find(s => s.np > 0); Snap.unpack(ps.s); const pr = Game.projectiles[0], E = Modes.duel.enemy;
    T.ok('스냅샷: 투사체 복원', pr instanceof Projectile && pr.hit instanceof Set && Game.units.includes(pr.owner));
    T.ok('스냅샷: 유닛 참조', Game.units.includes(E) && E instanceof RangedDuelist && Game.player instanceof Cathy && Game.units.includes(Game.player));
    T.ok('스냅샷: 설정 객체는 같은 객체로', E.kit === Kits[E.motifKey] && E.motif === CONFIG.rangedMotifs[E.motifKey] && Game.player.build === CONFIG.builds[Game.buildId]);
    const u1 = Game.units[1]; Snap.unpack(ps.s); T.ok('스냅샷: 다시 적용하면 같은 객체 재사용', Game.units[1] === u1 && Game.projectiles[0] === pr);
    let rerr = ''; try { Renderer.frame(); } catch (x) { rerr = x.message; }
    T.ok('스냅샷: 적용 후 그리기', !rerr, rerr);
    let ferr = ''; try { Snap.apply({ v: 999 }); } catch (x) { ferr = x.message; } T.ok('스냅샷: 형식이 다르면 거부', !!ferr);
  });

  // ---------------- 온라인 대전: 델타·명령 검사·시점 이벤트·대전 모드 (두 창 시험은 ?netlab&test) ----------------
  G('온라인 대전', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger';
    // 델타 왕복
    const A = { a: 1, b: { c: [1, 2], d: { $u: 3 } }, e: 'x', n: NaN, gone: 5 }, B = { a: 2, b: { c: [1, 2, 3], d: { x: 1, y: 2 } }, e: { v: 1 }, n: NaN, add: null };
    const P = Snap.patch(A, JSON.parse(JSON.stringify(Snap.diff(A, B))));
    T.ok('델타: 바뀐 값만 보내고 그대로 복원', JSON.stringify(P) === JSON.stringify(B) && Snap.diff(B, B) === undefined && !('gone' in P), JSON.stringify(P));
    // 명령 검사
    T.ok('명령 검사', Net.validCmd({ t: 'sk', s: 'Q', x: 1, y: 2 }) && Net.validCmd({ t: 'atk', id: 2 }) && !Net.validCmd({ t: 'sk', s: 'Z', x: 1, y: 2 }) && !Net.validCmd({ t: 'move', x: NaN, y: 1 }) && !Net.validCmd({ t: 'hack' }) && !Net.validCmd({ t: 'move' }) && !Net.validCmd(null));
    // 대전 모드 구성
    Net.init(); const role0 = Net.role;
    Game.start('pvp', { seed: 7, guestWeapon: 'dual', hostWeapon: 'dagger', build: 'late', map: 'basic', rounds: 3 }); run(5);
    const M = Game.mode, me = Game.player, op = M.remote();
    T.ok('대전 모드: 캐시 두 명(팀 0·1), 옵션대로 무기', me instanceof Cathy && op instanceof Cathy && me.team === 0 && op.team === 1 && me.weapon === 'dagger' && op.weapon === 'dual' && Vision.fogOn);
    T.ok('대전 모드: 상대 기준 적 목록', Game.enemies(op).includes(me) && Game.enemies(me).includes(op));
    // 시점 이벤트: 호스트에서 손님 캐릭터가 맞으면 「아픈 소리」는 손님에게만
    try {
      Net.role = 'host'; Net.ev = []; let fr = 0; while (Game.freeze > 0 && fr++ < 400) step();
      Combat.damage(me, op, 10, { type: 'normal' }); op.skills.Q.cd = 5; op.tryCast && op.cdError && op.cdError('Q');
      const ev = Net.ev, rid = op.id - Game.uid0;
      T.ok('시점 이벤트: 맞은 소리는 맞은 사람 표시', ev.some(e => e.k === 'sfor' && e.a[0] === 'hurt' && e.f === rid) && ev.some(e => e.k === 'fx:text'), ev.map(e => e.k).join(','));
      T.ok('시점 이벤트: 상대의 오류음은 상대에게만', ev.some(e => e.k === 'sfor' && e.a[0] === 'error' && e.f === rid));
      Net.role = 'guest'; const v = M.view(); M.wins = { p: 2, e: 1 };
      T.ok('손님 시점: 점수 뒤집기', M.view().wins.p === 1 && M.view().wins.e === 2 && v !== M);
      M.wins = { p: 0, e: 0 };
    } finally { Net.role = role0; Net.ev = []; }
    T.ok('내 편 색: 내 캐릭터 팀 기준', myTeam() === 0);
    // 손님 캐릭터 전용 통계: 기록은 하되 호스트 화면엔 알림 없음, 스냅샷엔 안 실림
    const rs = M.rs, t0 = FX.toasts.length;
    op.S.mistake('테스트 실수'); op.S.cast('Q');
    T.ok('손님 통계: 따로 기록·호스트 알림 없음', op.S === rs && rs.mistakes['테스트 실수'] === 1 && rs.casts.Q >= 1 && !Stats.mistakes['테스트 실수'] && FX.toasts.length === t0);
    T.ok('손님 통계: 스냅샷에 안 실림', !JSON.stringify(Snap.capture()).includes('테스트 실수'));
    // 보는 사람 기준 색·글자
    const w = new Ward(op.pos.x, op.pos.y, op), w2 = new Ward(me.pos.x, me.pos.y, me);
    T.ok('카메라 색: 보는 사람 기준', w.color === '#ff8a8a' && w2.color === '#7fd1ff' && !Object.keys(w).includes('color'));
    T.ok('글자 보이기 규칙', FX.canSee(op, 'all', me) && !FX.canSee(op, 'owner', me) && FX.canSee(me, 'owner', me) && FX.teamColor('team', me) === '#7fd1ff' && FX.teamColor('#123', me) === '#123');
    // 손님 명령이 섞인 대전도 같은 시드 + 같은 기록이면 같은 결과
    const o = { seed: 11, guestWeapon: 'dagger', hostWeapon: 'dual', build: 'late', map: 'jungle', rounds: 3 };
    Game.start('pvp', o);
    try {
      Net.role = 'host'; Net.link = null; Net.inbox = []; Net.tx = { n: 0, prev: null, sinceKey: 0, wantKey: true, t: 0, opts: Game.opts };
      for (let i = 0; i < 120 * 15; i++) {
        const p = Game.player, e = Game.mode.enemy, t = Game.tick;
        if (t % 70 === 0) Net.inbox.push({ t: 'move', x: p.pos.x + 2, y: p.pos.y + 1 });
        if (t % 150 === 40) Net.inbox.push({ t: 'sk', s: ['Q', 'W', 'E'][(t / 150 | 0) % 3], x: p.pos.x, y: p.pos.y });
        if (t % 90 === 20) Cmd.move({ x: e.pos.x - 2, y: e.pos.y });
        step();
      }
    } finally { Net.role = role0; Net.inbox = []; }
    const rec = Cmd.record(), h = Cmd.hash();
    Game.start('pvp', o); Cmd.replay(rec.log); run(120 * 15);
    T.ok('결정성: 손님 명령이 섞인 대전 재생', Cmd.hash() === h && rec.log.some(c => c.p === 1) && rec.log.some(c => !c.p), `${rec.log.filter(c => c.p).length}개 손님 명령`);
    T.ok('온라인 중 일시정지 막힘', (() => { Net.role = 'host'; try { Game.togglePause(); return !Game.paused; } finally { Net.role = role0; } })());
  });

  // ---------------- 리플레이 (저장·다시 보기) ----------------
  G('리플레이', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.tactical = 'blink'; Settings.fog = true;
    const opts = { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'jungle', rounds: 3, animals: true, sphere: true, time: 'day', seed: 4321 };
    Game.start('duel', opts);
    for (let i = 0; i < 120 * 15; i++) {
      const p = Game.player, e = Modes.duel.enemy, t = Game.tick;
      if (p && e && !p.dead) { if (t % 60 === 0) Cmd.move({ x: e.pos.x - 2, y: e.pos.y + 1 }); if (t % 140 === 30) Cmd.skill(['Q', 'W', 'E', 'F'][(t / 140 | 0) % 4], e.pos); if (t % 200 === 100) Cmd.attack(e); }
      step();
    }
    const rec = JSON.parse(JSON.stringify(Replay.capture())), h = Cmd.hash();
    T.ok('리플레이: 기록 형식', rec.kind === 'cathy-replay' && rec.buildId === BUILD_ID && rec.log.length > 20 && rec.ticks === 120 * 15 && /^cathy-replay-duel-\d{8}-\d{4}\.json$/.test(Replay.fileName(rec)), `${JSON.stringify(rec).length}B`);
    // 설정을 바꿔 놓고 다시 보기 → 저장 때 설정으로 같은 결과, 끝나면 원래 설정
    Settings.weapon = 'dual'; Settings.tactical = 'quake';
    const recN = Object.keys(Records.all()).length;
    Replay.start(rec);
    T.ok('리플레이: 저장 때 설정 적용', Settings.weapon === 'dagger' && Settings.tactical === 'blink' && !!Replay.active);
    Cmd.stop(); T.ok('리플레이: 보는 중엔 실제 입력 무시', Cmd.log.length === 0);
    let n = 0; while (Replay.active && n++ < 120 * 20) step();
    T.ok('리플레이: 같은 결과로 끝남', !Replay.active && Cmd.hash() === h, `${h} / ${Cmd.hash()}`);
    T.ok('리플레이: 끝나면 설정 원래대로', Settings.weapon === 'dual' && Settings.tactical === 'quake');
    T.ok('리플레이: 끝 화면·기록에 안 남음', /리플레이 끝/.test(document.querySelector('#card').innerText) && Object.keys(Records.all()).length === recN && Game.state === 'result');
    // 잘못된 파일
    const bad = [null, { kind: 'x' }, Object.assign({}, rec, { mode: 'hack' }), Object.assign({}, rec, { log: [{ k: 1, t: 'boom' }] }), Object.assign({}, rec, { ticks: -1 })];
    T.ok('리플레이: 잘못된 파일 거부', bad.every(b => { try { Replay.check(b); return false; } catch (e) { return true; } }));
    // 결과 화면에 저장 버튼
    Settings.weapon = 'dagger'; Settings.tactical = 'blink';
    Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(30); Game.finish('test');
    T.ok('리플레이: 결과 화면 저장 버튼', !!document.querySelector('[data-a="replay"]') && Replay.last && Replay.last.mode === 'dummy');
    UI.showMenu(); T.ok('메뉴: 리플레이 열기', !!document.querySelector('[data-in="replayFile"]'));
  });

  // ---------------- 장비·빌드 ----------------
  G('장비', () => {
    reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.build = 'late';
    const P = CONFIG.gearPresets, D1 = P.daggerD1.gear, L = CONFIG.builds.late;
    // 데이터: 부위·무기군·등급이 올바름
    T.ok('아이템 데이터', Object.values(CONFIG.items).length >= 60 && Object.values(CONFIG.items).every(it => Builds.SLOTS.includes(it.slot) && Builds.GRADE_LABEL[it.grade] && (it.slot !== 'weapon' || ['dagger', 'dual'].includes(it.weapon))));
    T.ok('프리셋은 전부 맞는 아이템', Object.values(P).every(p => Builds.SLOTS.every(s => { const it = CONFIG.items[p.gear[s]]; return it && it.slot === s && (s !== 'weapon' || it.weapon === p.weapon); })));
    // 검산: 대표 장비(D1, 후반)가 랭크 영상 실측과 ±15% 안
    const b = Builds.resolve('late', D1, 'dagger'), near = (a, x) => Math.abs(a - x) / x <= 0.15;
    T.ok('검산: D1 후반 ≈ 실측(±15%)', near(b.hp, L.hp) && near(b.ad, L.ad) && near(b.sp, L.sp) && near(b.def, L.def), `체력 ${b.hp}/${L.hp} 공 ${b.ad}/${L.ad} 스증 ${b.sp}/${L.sp} 방 ${b.def}/${L.def}`);
    // 계산 규칙
    const lv = L.level, m = Builds.MASTERY_LV.late;
    T.ok('스증 = (고정 + 옷 레벨당) × (1 + 숙련도 + 고유)', b.sp === Math.round((77 + 14 + 5 * lv + 80 + 85 + 42) * (1 + 0.043 * m + 0.25)), `${b.sp}`);
    const b2 = Builds.resolve('late', Object.assign({}, D1, { leg: 204410 }), 'dagger');
    T.ok('부위 하나만 바꾸면 그 차이만', Math.abs((b.sp - b2.sp) - Math.round((42 - 33) * b.spMul)) <= 1 && Math.round((b2.cdr - b.cdr) * 100) === 5 && b2.hp === b.hp && b2.def === b.def);
    const both = Builds.resolve('late', Object.assign({}, D1, { chest: 202503 }), 'dagger');
    T.ok('(고유) 스증%는 중첩 안 함', Math.abs(both.spMul - (1 + 0.043 * m + 0.25)) < 1e-9);
    T.ok('잘못된 장비는 빈 칸', Builds.clean({ weapon: 103505, chest: 201503, head: 999 }, 'dagger').weapon === null && Builds.clean({ chest: 201503 }, 'dagger').chest === null && Builds.clean({ head: 999 }, 'dagger').head === null);
    // 맞춤형: 추가 공격력×2와 스증 중 높은 쪽 — 비색 단검 혼자면 공격력(20 > 0), 다른 부위 스증이 많으면 스증
    const solo = Builds.resolve('late', { weapon: 101503 }, 'dagger'), withArm = Object.assign({}, D1, { weapon: 101503 }), wa = Builds.resolve('late', withArm, 'dagger'), noW = Builds.resolve('late', Object.assign({}, D1, { weapon: null }), 'dagger');
    T.ok('맞춤형: 높은 쪽으로', solo.bonusAd === 77 && wa.bonusAd === 20 && Math.abs(wa.sp - Math.round((Math.round(noW.sp / noW.spMul) + 114) * wa.spMul)) <= 2, `${solo.bonusAd} / ${wa.bonusAd} / ${wa.sp}`);
    // 캐시에 적용: 장비 없으면 실측 그대로, 있으면 계산값
    Game.start('dummy', { count: 1, hp: 20000, def: 100, infinite: true }); run(3);
    T.ok('장비 없으면 실측 능력치', Game.player.sp === L.sp && Game.player.build === L && !Game.player.gear);
    Game.start('dummy', { count: 1, hp: 20000, def: 100, infinite: true, gear: D1 }); run(3);
    const p = Game.player, d = Game.units.find(u => u.kind === 'dummy');
    T.ok('장비 있으면 계산 능력치', p.sp === b.sp && p.maxHp === b.hp && p.penPct === 0.15 && p.as === b.as && !!p.gear);
    // 방어 관통: 적용 방어 = 방어 × (1 − 관통%) − 고정
    const h0 = d.hp; Combat.damage(p, d, 1000, { type: 'skill', source: 'test' }); T.ok('방어 관통 15%', Math.abs((h0 - d.hp) - 1000 * 100 / (100 + 100 * 0.85)) < 0.01);
    // 고유 효과: 의념·부패·치유 감소
    p.pos = { x: d.pos.x - 2, y: d.pos.y }; p.skills.Q.cd = 0; Cmd.skill('Q', d.pos); run(30); const charged = p.nianT > 0;
    Cmd.attack(d); run(150);
    T.ok('의념: 스킬 뒤 충전 → 다음 평타 추가 피해', charged && Math.abs((Stats.dmgBy['의념'] || 0) - p.sp * 0.4 * 100 / 185) < 1, `${Math.round(Stats.dmgBy['의념'] || 0)}`);
    T.ok('부패: 스킬 피해 뒤 매초 피해', (Stats.dmgBy['부패'] || 0) > 0);
    T.ok('치유 감소 20%', d.healCutT > 0 && d.healCutPct === 0.2 && Math.abs(ItemFx.healMul(d) - 0.8) < 1e-9);
    // 파열·집행자·흡혈
    Settings.weapon = 'dual'; Game.start('dummy', { count: 1, hp: 20000, def: 100, infinite: true, gear: P.dualS1.gear }); run(3);
    { const p2 = Game.player, d2 = Game.units.find(u => u.kind === 'dummy'); p2.pos = { x: d2.pos.x - 2, y: d2.pos.y }; p2.skills.Q.cd = 0; Cmd.skill('Q', d2.pos); run(150); T.ok('파열: 0.8초 뒤 폭발', (Stats.dmgBy['파열'] || 0) > 0 && p2.ruptCd > 0); }
    Game.start('dummy', { count: 1, hp: 20000, def: 0, infinite: true, gear: { weapon: 103403 } }); run(3);
    { const p3 = Game.player, d3 = Game.units.find(u => u.kind === 'dummy'); p3.hp = 1000; Combat.damage(p3, d3, 400, { type: 'skill', source: 't' }); T.ok('모든 피해 흡혈 5%', Math.abs(p3.hp - 1020) < 0.01, p3.hp); }
    Settings.weapon = 'dagger'; Game.start('dummy', { count: 1, hp: 20000, def: 0, infinite: true, gear: P.daggerD2.gear }); run(3);
    { const p4 = Game.player, d4 = Game.units.find(u => u.kind === 'dummy'); d4.hp = d4.maxHp * 0.9; let h = d4.hp; Combat.damage(p4, d4, 100, { type: 'skill', source: 't' }); const hi = h - d4.hp; d4.hp = d4.maxHp * 0.3; h = d4.hp; Combat.damage(p4, d4, 100, { type: 'skill', source: 't' }); T.ok('집행자: 40% 이하 스킬 피해 +15%', Math.abs((h - d4.hp) / hi - 1.15) < 1e-9); }
    // 테이저 건(3초 근접 뒤 평타 강화 + 스킬 피해 +10% 표식) · 저주(스킬 적중 4초 뒤 고정 피해, 풀린 뒤 8초 재저주 불가)
    Settings.weapon = 'dual'; Game.start('dummy', { count: 1, hp: 20000, def: 0, infinite: true, gear: { head: 201520, weapon: 103404 } }); run(3);
    { const p5 = Game.player, d5 = Game.units.find(u => u.kind === 'dummy'); p5.pos = { x: d5.pos.x - 1, y: d5.pos.y };
      run(120 * 3 + 10); Cmd.attack(d5); run(80);
      const tz = Stats.dmgBy['테이저 건'] || 0;
      T.ok('테이저 건: 3초 근접 뒤 평타 강화', Math.abs(tz - (30 + p5.sp * 0.2)) < 0.5 && d5.taserMark && p5.taserCd > 0, `${Math.round(tz)}`);
      Cmd.stop(); const h1 = d5.hp; Combat.damage(p5, d5, 100, { type: 'skill', source: 't' }); T.ok('테이저 건: 표식 대상 스킬 피해 +10%', Math.abs((h1 - d5.hp) - 110) < 0.01);
      p5.skills.Q.cd = 0; Cmd.skill('Q', d5.pos); run(40); const cursed = !!d5.curse; run(120 * 4 + 20);
      T.ok('저주: 4초 뒤 고정 피해 → 재저주 대기', cursed && (Stats.dmgBy['저주'] || 0) > 0 && !d5.curse && d5.curseImm > 0, `${Math.round(Stats.dmgBy['저주'] || 0)}`); }
    Settings.weapon = 'dagger';
    // 리플레이: 장비 판도 같은 결과
    const opts = { diff: 'normal', motif: 'nadine', enemyBuild: 'late', map: 'basic', rounds: 3, animals: false, sphere: false, time: 'day', seed: 55, gear: D1 };
    Game.start('duel', opts);
    for (let i = 0; i < 120 * 12; i++) { const q = Game.player, e = Modes.duel.enemy, t = Game.tick; if (q && e && !q.dead) { if (t % 60 === 0) Cmd.move({ x: e.pos.x - 2, y: e.pos.y }); if (t % 130 === 20) Cmd.skill(['Q', 'W', 'E'][(t / 130 | 0) % 3], e.pos); if (t % 170 === 90) Cmd.attack(e); } step(); }
    const rec = JSON.parse(JSON.stringify(Replay.capture())), hh = Cmd.hash();
    Replay.start(rec); let n = 0; while (Replay.active && n++ < 120 * 15) step();
    T.ok('리플레이: 장비 판도 같은 결과', Cmd.hash() === hh && !!rec.opts.gear);
    // 화면·시작·기록
    Settings.gearOn = false; UI.showMenu(); click('[data-a="gear"]');
    T.ok('장비 화면', /장비 맞추기/.test(document.querySelector('#card').innerText) && document.querySelectorAll('[data-in="gs"]').length === 5 && !!document.querySelector('[data-a="gpre"][data-v="daggerD1"]'));
    click('[data-a="gpre"][data-v="daggerD3"]'); T.ok('추천 조합 → 장비 사용 켜짐', Settings.gearOn && Builds.sig(Settings.gearSets.dagger) === Builds.sig(P.daggerD3.gear));
    UI.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2);
    T.ok('시작 시 장비가 판 옵션에', Game.opts.gear && Builds.sig(Game.opts.gear) === Builds.sig(P.daggerD3.gear) && Game.player.gear);
    Game.finish('test'); T.ok('기록은 장비별로', Object.keys(Records.all()).some(k => k.includes('|g' + Builds.sig(P.daggerD3.gear))) && /장비:/.test(document.querySelector('#card').innerText));
    Settings.character = 'daniel'; T.ok('다니엘은 장비 없음', Builds.current() === null); Settings.character = 'cathy';
    const est = Builds.estimate('late', P.daggerD1.gear, 'dagger'), est0 = Builds.estimate('late', null, 'dagger');
    T.ok('예상 DPS: 같은 값·화면 상태 복구', est > 0 && est0 > 0 && est === Builds.estimate('late', P.daggerD1.gear, 'dagger') && Game.state === 'menu' && Settings.weapon === 'dagger', `${est0} → ${est}`);
    // 대전: 호스트·손님 장비 따로
    Game.start('pvp', { seed: 9, hostWeapon: 'dagger', guestWeapon: 'dual', build: 'late', gear: P.daggerD1.gear, guestGear: P.dualS1.gear }); run(3);
    T.ok('대전: 호스트·손님 장비 따로', Game.player.sp === b.sp && Game.mode.enemy.sp === Builds.resolve('late', P.dualS1.gear, 'dual').sp && Game.mode.enemy.weapon === 'dual');
    Settings.gearOn = false; Settings.gearSets = null;
  });

  // ---------------- 온라인 연결 (연결 코드·메뉴) — 실제 연결 시험은 ?netlab&rtc&test ----------------
  G('온라인 연결', () => {
    reset();
    T.ok('게임 버전이 빌드 때 채워짐', /^[0-9a-f]{8}$/.test(BUILD_ID), BUILD_ID);
    UI.showMenu(); click('[data-a="online"]');
    T.ok('메뉴 → 온라인 대전 화면', /온라인 대전/.test(document.querySelector('#card').innerText) && !!document.querySelector('[data-a="host"]') && !!document.querySelector('[data-a="join"]') && /IP 주소/.test(document.querySelector('#card').innerText));
    click('[data-a="host"]'); T.ok('방 만들기 화면', !!document.getElementById('net-offer') && !!document.querySelector('[data-a="connect"]'));
    click('[data-a="opt"][data-k="map"][data-v="jungle"]'); T.ok('방 옵션 선택', UI.netOpts.map === 'jungle' && !!document.querySelector('[data-a="opt"][data-k="map"][data-v="jungle"].sel'));
    click('[data-a="back"]'); click('[data-a="join"]'); T.ok('참가하기 화면', !!document.getElementById('net-answer') && !!document.querySelector('[data-a="answer"]'));
    click('[data-a="back"]'); click('[data-a="back"]'); T.ok('메뉴로 돌아감', !!document.querySelector('[data-a="online"]'));
    T.ok('STUN 기본 켬·끄기 설정', Settings.netStun !== false && Rtc.config().iceServers.length === 1 && (() => { Settings.netStun = false; const n = Rtc.config().iceServers.length; Settings.netStun = true; return n === 0; })());
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
      // 카메라: 이터널 리턴처럼 높은 시점 + Y 잠금 전환 + 스페이스(누르고 있기) 내 캐릭터로
      T.ok('3D 카메라 높은 시점(63°·좁은 시야각)', Render3D.CAM.pitch >= 60 && Render3D.camera.fov <= 30 && Render3D.camera.position.y > 25);
      const lock0 = Settings.camLock !== false, key = (k, up) => window.dispatchEvent(new KeyboardEvent(up ? 'keyup' : 'keydown', { key: k, bubbles: true }));
      key('y'); key('y', true); T.ok('Y 카메라 잠금 전환', (Settings.camLock !== false) === !lock0);
      key(' '); T.ok('스페이스 누르는 동안 내 캐릭터로', Input.spaceHeld === true); key(' ', true); T.ok('스페이스 떼면 해제', !Input.spaceHeld);
      Settings.camLock = lock0;
      { const z0 = Render3D.zoom; Render3D.zoom = Render3D.CAM.min; Renderer.frame();   // 최대 줌인: 카메라가 눕고 몸 가운데를 봄, 클릭 위치는 그대로 정확
        const c = Render3D.camera.position, t = Render3D.camTarget, pitch = Math.atan2(c.y - 0.95, Math.hypot(c.x - t.x, c.z - t.z)) * 180 / Math.PI;
        const q = { x: Game.player.pos.x + 1, y: Game.player.pos.y + 0.5 }, sq = Renderer.toScreen(q), wq = Renderer.toWorld(sq.x, sq.y);
        T.ok('최대 줌인(가까이·눕힌 각도)', Render3D.CAM.min <= 8 && pitch < 50 && Render3D.camera.position.y < 8, pitch.toFixed(0));
        T.ok('줌인 상태 화면↔월드 왕복', V.dist(wq, q) < 0.05, V.dist(wq, q).toFixed(3));
        Render3D.zoom = z0; Renderer.frame(); }
    } else T.ok('창 크기 0 — 3D 좌표 검사는 화면이 보일 때 실행', true);
    // CC0 인물 모델(6_y_models.js): 웹에서 로딩이 끝났으면 모델, 아니면(file:// · 로딩 중 · 실패 · 끄기) 인형으로 대체
    T.ok('모델 매핑', Models.keyFor({ kind: 'player' }) === 'cathy' && Models.keyFor({ kind: 'player', charKey: 'daniel' }) === 'daniel' && Models.keyFor({ kind: 'dummy' }) === null && Models.keyFor({ kind: 'ranged', motifKey: 'nadine' }) === 'nadine');
    Game.start('duel', { diff: 'easy', motif: 'aya', enemyBuild: 'mid', map: 'basic', rounds: 1 }); run(2); Renderer.frame();
    const rigOf = u => Render3D.unitMeshes.get(u.id).userData.body.userData.rig;
    if (Models.state === 'ready') {
      const r = rigOf(Game.player); T.ok('캐시 CC0 모델', !!r && !!r.actions.run && !!r.actions.slash && !!r.actions.idle);
      T.ok('무기 손에 부착', !!r && !!r.obj.getObjectByName('WristR').children.find(c => c.type === 'Group'));
      T.ok('캐시 평타 동작(베기·좌우 찌르기·전투 자세)', !!r && r.melee && ['slash', 'stabR', 'stabL', 'idleSword'].every(k => r.actions[k] && r.actions[k].getClip().duration > Models.MELEE.slash.hit) && ['slash', 'stabR'].every(k => r.actions[k].clampWhenFinished));
      T.ok('쌍검 직접 만든 동작(대각 2연타·X자·대기)', ['dualAA', 'dualX', 'dualIdle'].every(k => r.actions[k] && r.actions[k].getClip().tracks.length > 20) && Math.abs(Models.MELEE.dualAA.hit2 - Models.MELEE.dualAA.hit - 0.12) < 1e-6 && Models.MELEE.dualAA.hit === Motions.HITS.DualAA.hit);
      T.ok('캐시 스킬 동작 표(Q W E R D)', ['Q', 'W', 'E', 'R', 'D', 'Ddual', 'D2'].every(k => { const A = Models.SKILL_ANIM[k]; return A && (A.flurry || r.actions[A.clip]); }) && r.root && r.root.children[0] === r.obj);
      T.ok('역할 소품 부착(가운·후드 등)', !!r && r.obj.getObjectByName('Chest').children.some(c => c.type === 'Group' && c.children.length >= 2));
      const re = rigOf(Modes.duel.enemy); T.ok('아야 모델(원딜 동작)', !!re && re.ranged && !!re.actions.shoot);
      // 직접 만든 캐시 모델(6_y_procgen.js): 같은 뼈대·동작으로 교체
      T.ok('직접 만든 캐시 모델 생성', !!Models.src.cathyProc && Models.src.cathyProc.proc);
      Settings.models3dBy = { cathy: 'proc' }; Models.ver++; Renderer.frame(); { const rp = rigOf(Game.player); let n = 0; rp && rp.obj.traverse(m => { if (m.isSkinnedMesh && m.material.name === 'proc' && m.material.skinning) n++; });
        T.ok('직접 만든 모델로 교체(스키닝·동작)', !!rp && n >= 5 && !!rp.actions.dualAA && !!rp.obj.getObjectByName('WristR').children.find(c => c.type === 'Group')); }
      if (Models.src.cathyBlend) {   // Blender 모델(models/cathy_custom.glb)이 있을 때만
        Settings.models3dBy = { cathy: 'blend' }; Models.ver++; Renderer.frame(); const rb = rigOf(Game.player);
        T.ok('Blender 모델로 교체(쌍검 동작·무기)', !!rb && !!rb.actions.dualAA && !!rb.actions.run && !!rb.obj.getObjectByName('WristR').children.find(c => c.type === 'Group') && Math.abs(Models.src.cathyBlend.scale - Models.src.cathy.scale) < 1e-9);
      }
      Settings.models3dBy = {}; Models.ver++; Renderer.frame();
      // 다니엘: 직접 만든 모델(공용 설계 6_y_designs.js) — 같은 뼈대·동작, 무기는 단검
      { reset(); Settings.character = 'daniel'; Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2);
        T.ok('직접 만든 다니엘 모델 생성', !!Models.src.danielProc && Models.src.danielProc.design === DESIGNS.daniel);
        Settings.models3dBy = { daniel: 'proc' }; Models.ver++; Renderer.frame(); const rd = rigOf(Game.player); let n = 0; rd && rd.obj.traverse(m => { if (m.isSkinnedMesh && m.material.name === 'proc') n++; });
        T.ok('다니엘 직접 만든 모델(스키닝·평타 동작)', !!rd && n >= 8 && rd.melee && rd.dan && !!rd.actions.slash && Models.weaponKind(Game.player, Models.src.danielProc) === 'dagger');
        T.ok('다니엘 스킬 동작 표(E·R·D·Q·W 손짓)', ['dE', 'dR', 'dD'].every(k => Models.SKILL_ANIM[k]) && Models.DAN_GESTURE.Q && Models.DAN_GESTURE.W);
        if (Models.src.danielBlend) { Settings.models3dBy = { daniel: 'blend' }; Models.ver++; Renderer.frame(); const rb2 = rigOf(Game.player); T.ok('다니엘 Blender 모델로 교체', !!rb2 && !!rb2.actions.run && Math.abs(Models.src.danielBlend.scale - Models.src.male.scale) < 1e-9); }
        // 다리 관절: 대기 자세에서 무릎이 옆으로 벌어지지 않고(보정), Blender 모델도 발목이 발 뼈와 붙어 있음(원본 뼈대에 다시 붙임)
        for (const m of ['cc0', 'proc', 'blend']) {
          if (m === 'blend' && !Models.src.danielBlend) continue;
          Settings.models3dBy = { daniel: m }; const rg = Models.create({ id: 'leg', kind: 'player', charKey: 'daniel', color: '#b07cff', weapon: 'dagger', team: 0 }, null, []);
          rg.mixer.stopAllAction(); const ac = rg.actions.idle; ac.reset().play(); ac.time = 0.5; ac.timeScale = 0; rg.mixer.update(0); Models.fixLegs(rg); rg.root.updateMatrixWorld(true);
          const q = rg.obj.getWorldQuaternion(new THREE.Quaternion()).invert(), P = n => rg.obj.getObjectByName(n).getWorldPosition(new THREE.Vector3()).applyQuaternion(q);
          const h = P('UpperLegL'), k = P('LowerLegL'), e = P('LowerLegL_end'), d = e.clone().sub(h).normalize(), kh = k.clone().sub(h), side = Math.abs(kh.sub(d.multiplyScalar(kh.dot(d))).x);
          const gap = rg.obj.getObjectByName('LowerLegL_end').getWorldPosition(new THREE.Vector3()).distanceTo(rg.obj.getObjectByName('FootL').getWorldPosition(new THREE.Vector3()));
          T.ok('다니엘 ' + m + ' 다리 관절(무릎 옆 벌어짐·발목)', side < 0.04 && gap < 0.03, (side * 100).toFixed(1) + 'cm / ' + (gap * 100).toFixed(1) + 'cm');
        }
        Settings.models3dBy = {}; Models.ver++; Renderer.frame(); Settings.character = 'cathy'; }
      Settings.models3d = false; Render3D.refreshModels(); Renderer.frame(); T.ok('모델 끄기 → 인형', !rigOf(Game.player));
      Settings.models3d = true; Render3D.refreshModels();
    } else T.ok('모델 ' + Models.state + ' → 인형 대체', !rigOf(Game.player) && Render3D.unitMeshes.get(Game.player.id).userData.body.children.length > 5);
    // 카툰 렌더링: 캐릭터·벽은 툰 재질 + 외곽선, 바닥·데칼·팀 링은 외곽선 제외 / 끄면 원래 재질
    { const t0 = Settings.toon; Settings.toon = true; Render3D.rebuildUnits(); Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2); Renderer.frame();
      const mats = []; Render3D.unitMeshes.get(Game.player.id).traverse(o => { if (o.material && !o.material.isMeshBasicMaterial) mats.push(o.material); });
      T.ok('카툰: 캐릭터 툰 재질', mats.length > 3 && mats.every(m => m.isMeshToonMaterial && m.gradientMap), (() => { const b = []; Render3D.unitMeshes.get(Game.player.id).traverse(o => { if (o.material && !o.material.isMeshBasicMaterial && !o.material.isMeshToonMaterial) b.push(o.type + ':' + o.name + '<' + (o.parent && o.parent.name) + '/' + (o.parent && o.parent.parent && o.parent.parent.name)); }); return b.join(','); })());
      let ground = null, wall = null; Render3D.mapGroup.traverse(o => { if (o.isMesh && o.material.map && !ground) ground = o.material; if (o.isMesh && o.material.isMeshToonMaterial && !wall) wall = o.material; });
      T.ok('카툰: 벽 툰 재질 + 바닥 외곽선 제외', !!wall && !!ground && ground.userData.outlineParameters && ground.userData.outlineParameters.visible === false);
      T.ok('카툰: 외곽선 효과 준비', !window.THREE.OutlineEffect || !!Render3D.outline);
      Settings.toon = false; Render3D.rebuildUnits(); Renderer.frame(); const m2 = []; Render3D.unitMeshes.get(Game.player.id).traverse(o => { if (o.material && !o.material.isMeshBasicMaterial) m2.push(o.material); });
      T.ok('카툰 끄면 원래 재질', m2.length > 3 && m2.every(m => !m.isMeshToonMaterial));
      Settings.toon = t0; Render3D.rebuildUnits(); Renderer.frame(); }
    // 3D 스킬 이펙트: FX 데이터 → 3D 메시(베기·좁은 궤적), 넓은 궤적(범위 표시)은 바닥, 끄면 3D 없음
    { const v0 = Settings.vfx3d; Settings.vfx3d = true; Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2); Renderer.frame();
      const P = Game.player.pos; FX.slash(P, 0, 2, 0.6, '#ff5577', 0.5); FX.trail(P, { x: P.x + 2, y: P.y }, '#ffffff', 0.2, 0.5); FX.trail(P, { x: P.x + 3, y: P.y }, '#ff0000', 2.5, 0.5); FX.burst(P, '#ffcc00', 8, 3, 0.5); Renderer.frame();
      const ks = [...VFX3D.meshes.keys()];
      T.ok('3D 이펙트: 베기·좁은 궤적 3D, 넓은 궤적은 바닥', VFX3D.on() && ks.some(k => k.R === 2) && ks.some(k => k.width === 0.2) && !ks.some(k => k.width === 2.5));
      T.ok('3D 이펙트: 파티클 높이', FX.parts.length >= 8 && FX.parts.every(p => p.h > 0) && VFX3D.points.geometry.drawRange.count >= 8);
      const rg = Render3D.unitMeshes.get(Game.player.id).userData.body.userData.rig;
      T.ok('3D 이펙트: 칼 궤적 준비(무기 날)', !rg || (rg.blades.length >= 1 && VFX3D.blades.has(Game.player.id)));
      Settings.vfx3d = false; VFX3D.clear(); Renderer.frame(); T.ok('3D 이펙트 끄기', !VFX3D.on() && VFX3D.meshes.size === 0 && !VFX3D.group.visible);
      Settings.vfx3d = v0; FX.reset(); Renderer.frame(); }
    // 환경 연출: 낮밤 전환·스피어 벽·날씨
    if (Render3D.ready) {
      const w0 = Settings.weather;
      Game.start('duel', { diff: 'normal', motif: 'aya', enemyBuild: 'mid', map: 'basic', rounds: 3, animals: false, sphere: true, time: 'day' }); run(5); Renderer.frame(); Env3D.frame(0.016);
      T.ok('환경: 낮 조명', Env3D.k === 1 && Math.abs(Render3D.hemi.intensity - 0.6) < 0.01);
      Vision.night = true; Env3D.frame(0.5); const mid = Env3D.k, sunY = Render3D.sun.position.y;
      T.ok('환경: 낮→밤은 천천히(노을)', mid > 0.7 && mid < 0.95 && sunY < 22, `k ${mid.toFixed(2)} 해 높이 ${sunY.toFixed(1)}`);
      for (let i = 0; i < 10; i++) Env3D.frame(0.5);
      T.ok('환경: 밤 조명', Env3D.k === 0 && Math.abs(Render3D.hemi.intensity - 0.28) < 0.01 && Math.abs(Render3D.sun.position.y - 22) < 0.01);
      Game.start('duel', { diff: 'normal', motif: 'aya', enemyBuild: 'mid', map: 'basic', rounds: 3, animals: false, sphere: true, time: 'night' }); run(2); Env3D.frame(0.016);
      T.ok('환경: 새 판은 바로 그 시간대', Env3D.k === 0);
      for (let i = 0; i < 60 * 8; i++) step(); Env3D.frame(0.016);
      T.ok('환경: 스피어 차단벽', Sphere.active && Env3D.wall.visible && Math.abs(Env3D.wall.scale.x - Sphere.r) < 1e-6 && Env3D.wall.position.x === Sphere.c.x, `r ${Sphere.r.toFixed(1)}`);
      Settings.weather = 'rain'; Env3D.frame(0.016);
      T.ok('환경: 비', Env3D.rain.visible && !!Render3D.scene.fog && Env3D.rain.geometry.attributes.position.getY(0) > 0);
      Settings.weather = 'fog'; Env3D.frame(0.016); T.ok('환경: 안개', !Env3D.rain.visible && Render3D.scene.fog && Render3D.scene.fog.far < Render3D.zoom * 2);
      Settings.weather = 'clear'; Env3D.frame(0.016); T.ok('환경: 맑음', !Render3D.scene.fog && !Env3D.rain.visible);
      Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2); Env3D.frame(0.016); T.ok('환경: 스피어 없으면 벽 숨김', !Env3D.wall.visible);
      UI.showSettings(); T.ok('환경: 설정에 날씨 버튼', document.querySelectorAll('[data-a="weather"]').length === 3);
      click('[data-a="weather"][data-v="rain"]'); T.ok('환경: 날씨 버튼 동작', Settings.weather === 'rain');
      Settings.weather = w0 || 'clear'; UI.showMenu();
    }
    T.ok('2D 복귀', Renderer.setMode('2d', true) && Renderer.mode === '2d' && Render3D.cv.style.display === 'none');
    Renderer.frame(); Settings.gfx = '2d';
  });

  // ---------------- 실행 ----------------
  function runAll() {
    const t0 = performance.now(), times = [];
    const counts = {};   // 그룹별 통과 수 (검사 범위가 줄었는지 확인용)
    for (const [name, fn] of groups) { T.group = name; const t1 = performance.now(), p0 = T.pass; try { fn(); } catch (e) { T.fail.push(`[${name}] 예외: ${e.message} ${(e.stack || '').split('\n')[1] || ''}`); } counts[name] = T.pass - p0; times.push(`${name} ${((performance.now() - t1) / 1000).toFixed(1)}s`); }
    window.__testCounts = counts;
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
  // 추가 파일(Blender 모델·원작풍 설계)까지 기다림 → 매번 같은 범위를 검사 (최대 15초)
  const t0w = performance.now(), wait = () => ((Models.state === 'loading' || (Models.state === 'ready' && Models.optPending > 0)) && performance.now() - t0w < 15000) ? setTimeout(wait, 100) : runAll();
  setTimeout(wait, 300);
})();
