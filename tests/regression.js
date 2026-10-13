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
    T.ok('모드 카드 5개', document.querySelectorAll('.mode').length === 5);
    T.ok('비공식 표기', document.getElementById('card').innerText.includes('비공식 팬 제작'));
    T.ok('바로 시작 5개', document.querySelectorAll('[data-a="quick"]').length === 5);
    T.ok('전술 스킬 10개', document.querySelectorAll('[data-in="tac"] option').length === 10);
    click('[data-a="char"][data-v="daniel"]'); T.ok('다니엘 제목', document.querySelector('#card h1').innerText.includes('DANIEL'));
    click('[data-a="char"][data-v="cathy"]'); click('[data-a="weapon"][data-v="dual"]'); T.ok('쌍검 선택', Settings.weapon === 'dual'); click('[data-a="weapon"][data-v="dagger"]');
    click('[data-a="build"][data-v="early"]'); T.ok('빌드 선택', Settings.build === 'early'); click('[data-a="build"][data-v="mid"]');
    const sel = document.querySelector('[data-in="tac"]'); sel.value = 'quake'; sel.dispatchEvent(new Event('change', { bubbles: true })); T.ok('전술 스킬 저장', Settings.tactical === 'quake'); Settings.tactical = 'blink';
    for (const [i, h] of [['1', '결투'], ['2', '허수아비'], ['3', '콤보'], ['4', '회피'], ['5', '팀 대전']]) { key(i); T.ok('키 ' + i, document.querySelector('#card h2').innerText.includes(h)); key('Escape'); T.ok('Esc ' + i, !!document.querySelector('[data-a="quick"]')); }
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
    { const W = CONFIG.walls.find(w => !w.kind && w.w < w.h), cy = W.y + W.h / 2; p.items.camera = 3; p.itemCd.camera = 0; p.pos = { x: W.x - 0.8, y: cy };   // 벽 너머 설치(원작: 던져서 설치)
      const cw = VisionItems.camera(p, { x: W.x + W.w + 1.5, y: cy }), mid = { x: W.x + W.w / 2, y: cy }; p.items.camera = 3; p.itemCd.camera = 0;
      const cw2 = VisionItems.camera(p, mid);   // 벽 속을 찍으면 벽 밖으로
      T.ok('카메라 벽 너머 설치', cw && cw.pos.x > W.x + W.w && Math.abs(cw.pos.y - cy) < 0.01 && V.dist(p.pos, cw.pos) <= CONFIG.vision.camera.range + 1e-6);
      T.ok('카메라 벽 속 지점 → 벽 밖', cw2 && !Geo.inWall(cw2.pos, 0.29)); p.items.camera = 3; p.itemCd.camera = 0; }
    Vision.noises = []; e.pos = { x: 12, y: 9 }; Vision.act(e, 'skill'); T.ok('소음', Vision.noises.some(n => n.team === 1));
    Renderer.frame();
    Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 3, time: 'night' }); run(240); Modes.duel.enemy.stun = 9999;
    T.ok('밤 시야 3.4m~', Vision.sightOf(Game.player) < 4); run(120 * 20.5); T.ok('밤 시야 6.4m', Math.abs(Vision.sightOf(Game.player) - 6.4) < 0.05);
  });

  // ---------------- 휴식·전술 스킬 ----------------
  G('휴식·전술', () => {
    reset(); Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 3 }); run(240);
    const p = Game.player, e = Modes.duel.enemy; e.stun = 9999; e.pos = { x: 30, y: 16 }; p.cmdStop(); run(130);
    p.regen = 0; p.hp = p.maxHp * 0.1; key('x'); const h0 = p.hp; run(Math.round(120 * 2.9)); T.ok('단계 중 회복 없음', p.hp === h0); run(24); T.ok('1단계 15%', Math.abs((p.hp - h0) / p.maxHp - 0.15) < 0.005);
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
    T.ok('폭발 타이머 시작 30초(20 + 6일차 밤 10)', ps.boom === 30 && es.boom === 30);
    g = 0; while (Game.state === 'play' && g < 120 * 160) { step(); g++; if (g === 120 * 110) { T.ok('스피어 소멸 후 전 지역 금지구역 → 타이머 감소', Sphere.done && ps.boom < 30 && es.boom < 30 && Sphere.draining(ps), fmt(ps.boom, 1)); } }
    T.ok('크로노 스피어: 타이머가 다 되면 폭사로 끝남(동시 폭사 → 체력 판정)', Game.state === 'result' && Modes.duel.history[0] && Modes.duel.history[0].time > 125 && ps.dead && es.dead && Modes.duel.history[0].winner === 'p', Modes.duel.history[0] && fmt(Modes.duel.history[0].time, 1));
    // 최종 안전지대: 차단벽 없음 — 밖으로 나갈 수 있고, 밖에 있으면 폭발 타이머 감소 · 활성화 순간 즉사 없음
    { Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'arena', rounds: 1, sphere: 'final' }); run(200);
      const pf = Game.player, ef = Modes.duel.enemy; ef.stun = 9999; pf.cmdStop();
      T.ok('최종 안전지대 시작', Sphere.active && Sphere.kind === 'final' && !Sphere.wall && Modes.duel.title.includes('최종 안전지대'));
      Sphere.r = 3; const out = V.add(Sphere.c, { x: 6, y: 0 }); pf.pos = V.copy(out); const b0 = pf.boom; run(120);
      T.ok('최종 안전지대: 밖에 서 있어도 밀려 들어오지 않음', V.dist(pf.pos, out) < 0.05 && !pf.dead);
      T.ok('최종 안전지대: 밖에 있으면 폭발 타이머 감소', Math.abs(b0 - pf.boom - 1) < 0.02, fmt(pf.boom, 2));
      pf.pos = V.copy(Sphere.c); const b1 = pf.boom; run(120); T.ok('안으로 돌아오면 멈춤', pf.boom === b1);
      Sphere.start('final'); pf.pos = V.add(Sphere.c, { x: 40, y: 0 }); Sphere.update(1 / 120); T.ok('최종 안전지대: 활성화 순간 밖이어도 즉사 없음', !pf.dead);
      Sphere.start('temp'); T.ok('임시 안전지대(기존): 차단벽', Sphere.wall && Sphere.kind === 'temp');
    }
    // 투사체 지형 규칙: 낮은 턱(화단)은 투사체가 넘어감 · 대상 지정 평타(원거리 실험체 플레이어)는 벽에 막히지 않음
    { reset(); Game.start('dummy', { count: 1, hp: 99999, def: 50, infinite: true, map: 'arena' }); Game.freeze = 0; const pc = Game.player, dm = Game.units.find(u => u.kind === 'dummy'), low = CONFIG.walls.find(w => w.kind === 'low');
      pc.pos = { x: low.x - 1.5, y: low.y + low.h / 2 }; dm.pos = { x: low.x + low.w + 1.2, y: low.y + low.h / 2 }; pc.cmdStop(); pc.skills.E.cd = 0; let pr = null;
      pc.cmdSkill('E', dm.pos); for (let i = 0; i < 240; i++) { Game.step(1 / 120); pr = pr || Game.projectiles.find(q => q.kind === 'needle'); }
      T.ok('캐시 E: 낮은 턱 너머 적중', !!pr && pr.first === dm, pr && fmt(pr.traveled, 2));
      const hi = CONFIG.walls.find(w => !w.edge && !w.kind && w.w > 1); pc.pos = { x: hi.x - 1.2, y: hi.y + hi.h / 2 }; dm.pos = { x: hi.x + hi.w + 1.2, y: hi.y + hi.h / 2 }; pc.skills.E.cd = 0; Game.projectiles = []; pr = null;
      pc.cmdSkill('E', dm.pos); for (let i = 0; i < 240; i++) { Game.step(1 / 120); pr = pr || Game.projectiles.find(q => q.kind === 'needle'); }
      T.ok('캐시 E: 높은 벽에는 막힘(원작)', !!pr && !pr.first);
      reset(); Settings.character = 'katja'; Game.start('dummy', { count: 1, hp: 99999, def: 50, infinite: true, map: 'arena' }); Game.freeze = 0; const pk = Game.player, dk = Game.units.find(u => u.kind === 'dummy');
      pk.pos = { x: hi.x - 1.2, y: hi.y + hi.h / 2 }; dk.pos = { x: hi.x + hi.w + 1.2, y: hi.y + hi.h / 2 }; let hitK = false;
      const sh = pk.shot({ dir: V.norm(V.sub(dk.pos, pk.pos)), speed: 30, home: dk, onHit: u => { hitK = u === dk; } }); for (let i = 0; i < 240 && !sh.dead; i++) sh.update(1 / 120);
      T.ok('카티야(플레이어) 대상 지정 평타: 벽에 막히지 않음(AI와 같음)', hitK && sh.ignoreWalls);
      const sh2 = pk.shot({ dir: V.norm(V.sub(dk.pos, pk.pos)), speed: 30, range: 6, onHit: () => {} }); for (let i = 0; i < 240 && !sh2.dead; i++) sh2.update(1 / 120);
      T.ok('논타깃 스킬샷은 높은 벽에 막힘', sh2.traveled < V.dist(pk.pos, dk.pos) - 1);
      Settings.character = 'cathy';
    }
    // 금지구역 폭발 카운트: 처치 관여 +7(최대 30) · 경직 중 정지 · 0이면 빈사·보호막 무관 즉사 · 활성화 순간 차단벽 밖은 즉사
    { Game.start('team', { diff: 'normal', map: 'arena', rounds: 1, seed: 21, sphere: true }); run(200);
      const M = Game.mode, [a, b] = M.allies, [x, y] = M.enemies;
      T.ok('팀 대전 3:3 고정', M.size === 3 && M.team(0).length === 3 && M.team(1).length === 3 && Sphere.active);
      Sphere.done = true; a.boom = 10; b.boom = 28; x.stasis = { t: 5 }; const xb = x.boom; run(120);
      T.ok('금지구역에선 1초에 1초씩 감소', Math.abs(a.boom - 9) < 0.02 && Math.abs(b.boom - 27) < 0.02, fmt(a.boom, 2));
      T.ok('아티팩트 경직 중엔 정지', x.boom === xb); x.stasis = null;
      Combat.damage(b, y, 10, { type: 'true' }); Combat.damage(a, y, 10, { type: 'true' }); Combat.kill(a, y);
      T.ok('처치 관여 +7초 (처치자·관여자, 최대 30)', Math.abs(a.boom - 16) < 0.02 && Math.abs(b.boom - 30) < 0.02, fmt(a.boom, 2) + '/' + fmt(b.boom, 2));
      x.boom = 0.004; x.shield = 9999; run(2);
      T.ok('0이 되면 보호막과 무관하게 폭사', x.dead && x.boom === 0);
      Sphere.start(); const far = M.enemies[2]; far.pos = { x: Sphere.c.x + Sphere.r + 2, y: Sphere.c.y }; const kept = M.alive(0).length; Sphere.update(1 / 120);
      T.ok('활성화 순간 차단벽 밖 실험체는 즉사', far.dead && M.alive(0).length === kept);
      Renderer.frame(); T.ok('폭발 타이머 HUD 표시 오류 없음', true);
    }
    // 팀 AI 폭발 타이머 운영: 밖 감점 가중 · 급히 복귀 · 소멸 뒤 push/stall · 킬각 가중
    { Game.start('team', { diff: 'normal', map: 'arena', rounds: 1, seed: 22, sphere: 'final' }); run(200);
      const M = Game.mode, [a] = M.allies, [x] = M.enemies, heroes = t => Game.units.filter(u => isHero(u) && u.team === t && !u.dead);
      Sphere.start('final'); Sphere.r = 8; const out = V.add(Sphere.c, { x: 12, y: 0 });
      a.boom = 5; const pLow = Sphere.penalty(out, a); a.boom = 30; const pHigh = Sphere.penalty(out, a);
      T.ok('최종 안전지대: 타이머가 적을수록 밖 지점 감점이 큼', pLow > pHigh * 2 && pHigh > 0, fmt(pLow, 1) + '/' + fmt(pHigh, 1));
      T.ok('안쪽 지점은 감점 없음', Sphere.penalty(Sphere.c, a) === 0);
      a.pos = V.copy(out); a.boom = 3; const back = Sphere.urgent(a);
      T.ok('밖에서 타이머가 바닥나기 직전 → 안쪽 복귀 지점', !!back && V.dist(back, Sphere.c) < Sphere.r, back && fmt(V.dist(back, Sphere.c), 1));
      a.boom = 30; T.ok('타이머 넉넉하면 급히 복귀 안 함', Sphere.urgent(a) === null);
      a.boom = 3; Sphere.start('temp'); T.ok('임시 안전지대(차단벽)에선 급히 복귀 판단 없음', Sphere.urgent(a) === null);
      Sphere.start('final'); Sphere.done = true;
      for (const u of heroes(0)) u.boom = 5; for (const u of heroes(1)) u.boom = 25;
      T.ok('소멸 뒤 타이머 적은 팀 = push · 많은 팀 = stall', Sphere.stance(a) === 'push' && Sphere.stance(x) === 'stall');
      T.ok('소멸 뒤엔 밖 감점 없음(전 지역 금지구역)', Sphere.penalty(out, a) === 0);
      x.hp = x.maxHp; a.hp = a.maxHp;
      T.ok('push 팀: 진입 허락 · 궁 아끼지 않음', TeamAI.mayEngage(a, x) === true && TeamAI.holdUlt(a, x) === false);
      T.ok('stall 팀: 멀쩡한 적에겐 진입 안 함', TeamAI.mayEngage(x, a) === false);
      a.hp = a.maxHp * 0.2; T.ok('stall 팀: 빈사(30% 미만) 적은 진입', TeamAI.mayEngage(x, a) === true); a.hp = a.maxHp;
      for (const u of heroes(1)) u.boom = 5.5; T.ok('타이머 차이가 작으면 자세 없음', Sphere.stance(a) === null);
      Sphere.done = false; for (const u of heroes(0)) u.boom = 25; T.ok('소멸 전·타이머 넉넉하면 운영 판단 없음', !Sphere.pressing(a) && Sphere.stance(a) === null);
    }
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
    // 봇 전용 난수: 효과음(실제 시간으로 35ms 제한)도 Math.random을 쓰므로, 같은 걸 쓰면 컴퓨터 속도에 따라 봇 행동이 달라져 가끔 실패함
    let bs = 777; const brnd = () => { bs = bs + 0x6D2B79F5 | 0; let t = Math.imul(bs ^ bs >>> 15, 1 | bs); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const bot = (p, e) => { if (p.dead || e.dead || p.cast || p.fear > 0 || p.shadow || p.stasis) return; if (!Vision.visible(p, e) || e.untargetable > 0) { const g = Vision.ghosts[e.id]; if (!p.moveTarget) p.cmdMove(g ? g.pos : (Sphere.active ? Sphere.c : { x: CONFIG.world.w / 2, y: CONFIG.world.h / 2 })); return; } const d = V.dist(p.pos, e.pos); for (const k of ['E', 'W', 'Q', 'R', 'D', 'F']) if (p.skills[k].lv > 0 && p.skills[k].cd <= 0 && d < 5.5 && brnd() < 0.5) { if (k === 'R' && p.charKey === 'daniel' && !p.rTarget(e.pos)) continue; if (k === 'F' && brnd() < 0.8) continue; p.cmdSkill(k, e.pos); Input.aiming = null; return; } if (p.attackTarget !== e) p.cmdAttack(e); };
    let done = 0, n = 0, outC = 0, outWho = '';
    for (const ch of ['cathy', 'daniel']) for (const m of ['katja', 'rio', 'aya', 'nadine', 'daniel']) {
      n++; reset(); Settings.character = ch; Settings.build = ['early', 'mid', 'late'][n % 3]; Settings.tactical = TACTICAL_ORDER[n % 10];
      Game.start('duel', { diff: ['easy', 'normal', 'hard'][n % 3], motif: m, enemyBuild: Settings.build, map: ['basic', 'jungle', 'arena'][n % 3 === 2 ? 2 : n % 2], animals: n % 3 === 0, rounds: 1, time: ['day', 'night', 'cycle'][n % 3], sphere: n % 4 === 0 });
      let g = 0; while (Game.state === 'play' && g < 120 * 110) { step(); g++; if (Game.map.round) for (const u of Game.units) if (!u.dead && u.kind !== 'ward' && V.dist(u.pos, Game.map.round.c) > Game.map.round.r + 0.3) { outC++; if (!outWho) outWho = `${ch} vs ${m}: ${u === Game.player ? '플레이어' : (u.motifKey || u.kind || '?')} ${fmt(V.dist(u.pos, Game.map.round.c) - Game.map.round.r, 2)}m 밖 · ${fmt(g / 120, 1)}초 · ${Settings.tactical}${u.cast ? ' · 시전 ' + u.cast.k : ''}`; } if (Game.freeze <= 0 && g % 6 === 0) bot(Game.player, Modes.duel.enemy); if (g % 240 === 0) Renderer.frame(); if (g % 600 === 0) Side.update(); }
      if (Game.state === 'result') done++; else T.fail.push(`[벽·AI] 미종료 ${ch} vs ${m}`);
    }
    T.ok('AI 매치업 정상 종료', done === n, done + '/' + n);
    T.ok('원형 투기장: 대전 중 원 밖으로 안 나감', outC === 0, outC + ' ' + outWho);
    { const M = CONFIG.maps.arena, rd = M.round, ed = M.walls.filter(w => w.edge);   // 원형 투기장 경계
      let inC = 0; for (let a = 0; a < 360; a += 1) for (let r = 0; r < rd.r - 0.02; r += 0.1) { const p = { x: rd.c.x + r * Math.cos(a / 57.3), y: rd.c.y + r * Math.sin(a / 57.3) }; if (ed.some(w => p.x > w.x && p.x < w.x + w.w && p.y > w.y && p.y < w.y + w.h)) inC++; }
      T.ok('원형 투기장: 경계 벽이 원 안으로 안 들어옴', inC === 0, inC);
      reset(); Settings.character = 'cathy'; Game.start('duel', { map: 'arena', motif: 'rio', rounds: 1 }); run(5);
      const p = Game.player, t = Vision.rayBlock({ x: rd.c.x, y: rd.c.y + 0.5 }, { x: 1, y: 0 }, 20);
      T.ok('원형 투기장: 시야가 원 경계에서 끊김', Math.abs(t - Math.sqrt(rd.r * rd.r - 0.25)) < 0.01, t);
      p.pos = { x: rd.c.x + rd.r - 3, y: rd.c.y }; Modes.duel.enemy.pos = { x: rd.c.x - 6, y: rd.c.y }; p.skills.R.cd = 0; p.cmdSkill('R', { x: rd.c.x + rd.r + 5, y: rd.c.y }); Input.aiming = null; run(400);
      T.ok('원형 투기장: 경계로 돌진해도 원 안', V.dist(p.pos, rd.c) <= rd.r + 0.3, V.dist(p.pos, rd.c));
      Sphere.start(); let sm = 0; for (let i = 0; i < 100; i++) sm = Math.max(sm, V.dist(Sphere.pickTarget(), rd.c)); Sphere.stop();
      T.ok('원형 투기장: 크로노 스피어 이동 목표가 원 안', sm <= rd.r - 3, sm);
      T.ok('원형 투기장: 별개 공간(36×36)·지름 34.4m·2D 카메라 따라감', CONFIG.world.w === 36 && CONFIG.world.h === 36 && Math.abs(rd.r * 2 - 34.4) < 1e-6 && Render.L.follow === true);
      reset(); Game.start('duel', { map: 'basic', motif: 'rio', rounds: 1 }); run(2);
      T.ok('원형 투기장 다음 다른 맵: 공간 크기 원래대로', CONFIG.world.w === 32 && CONFIG.world.h === 18 && !Render.L.follow && !Geo.round());
      T.ok('원형 투기장: 시작 위치 원 안', V.dist(M.spawns.p, rd.c) < rd.r - 1 && V.dist(M.spawns.e, rd.c) < rd.r - 1); }
  });

  // ---------------- 결과 화면 코칭 ----------------
  // 여러 번 때리는 스킬(알론소 D 3타·W 파동·R 틱, 클로에 W 회전 등)도 시전 1회당 적중 1회
  G('스킬 적중률', () => {
    for (const ch of ['alonso', 'chloe', 'rio', 'aya', 'nadine', 'daniel']) {
      reset(); Settings.character = ch; Game.start('dummy', { count: 1, hp: 20000, def: 0, infinite: true }); Game.freeze = 0; Game.mode.banner = null;
      const p = Game.player, d = Game.units.find(u => u.team !== p.team && !u.dead); d.pos = V.add(p.pos, { x: 2, y: 0 });
      for (let i = 0; i < 40; i++) { for (const k of ['D', 'W', 'Q', 'E', 'R']) if (p.skills[k].lv > 0 && p.skills[k].cd <= 0 && !p.cast) { p.cmdSkill(k, d.pos); Input.aiming = null; break; } run(30); d.pos = V.add(p.pos, { x: 2, y: 0 }); }
      const { c, h } = Stats.totalCasts(), over = SKILL_KEYS.filter(k => (Stats.hits[k] || 0) > (Stats.casts[k] || 0));
      T.ok(`${ch}: 적중 ≤ 시전 (스킬별)`, c > 3 && h > 0 && !over.length, `${h}/${c} ${over.join('')}`);
    }
    Settings.character = 'cathy';
  });

  // 단계별 능력치: 랭크 영상 HUD 실측값이 플레이어·AI에 그대로 들어감 (docs/er_notes_playables.md 12장)
  G('HUD 실측 능력치', () => {
    for (const [ch, hp, def, as] of [['chloe', 2161, 118, 1.89], ['nadine', 2171, 125, 2.16], ['alonso', 4104, 196, 1.03]]) {
      reset(); Settings.character = ch; Settings.build = 'late'; Game.start('dummy', { count: 1, hp: 3000, def: 0, infinite: true }); const p = Game.player;
      T.ok(`${ch} 플레이어 Lv18: 체력·방어 실측값`, Math.abs(p.maxHp - (ch === 'alonso' ? 4100 : hp)) < 1 && p.def === def, `${p.maxHp}/${p.def}`);
      Game.start('duel', { diff: 'normal', motif: ch, enemyBuild: 'late', map: 'basic', rounds: 1, seed: 2 }); const e = Game.mode.enemy;
      T.ok(`${ch} AI Lv18: 체력·방어 실측값`, Math.abs(e.maxHp - (ch === 'alonso' ? 4100 : hp)) < 1 && e.def === def && Math.abs(CONFIG.rangedMotifs[ch].as[2] - as) < 1e-9, `${e.maxHp}/${e.def}`);
    }
    // 쿨감 = HUD 「수치 (감소%)」의 수치 — 플레이어·AI 같은 값 (알론소 55 → 35%, 다니엘 33 → 25%)
    for (const [ch, v] of [['alonso', 55], ['daniel', 33]]) {
      reset(); Settings.character = ch; Settings.build = 'late'; Game.start('dummy', { count: 1, hp: 3000, def: 0, infinite: true }); const pc = Game.player.cdr;
      Game.start('duel', { diff: 'normal', motif: ch, enemyBuild: 'late', map: 'basic', rounds: 1, seed: 2 });
      T.ok(`${ch} Lv18 쿨감 수치 ${v}: 플레이어·AI 같음`, Math.abs(pc * 100 - v) < 1e-6 && Math.abs(Game.mode.enemy.cdrAi - v) < 1e-6, `${pc}/${Game.mode.enemy.cdrAi}`);
    }
    Settings.character = 'cathy';
  });

  // 추정값 확정(2026-10-14): 위키·공식 영상 근거 — docs/er_notes_playables.md 13장
  G('추정값 확정', () => {
    const KC = CONFIG.rangedKits;
    T.ok('마름쇠 반경 2m · 알론소 방패 감속 15% · E 돌진 15m/s · 어퍼컷 사거리 1.35m(추가 이동 없음)', KC.chloe.D.r === 2 && KC.alonso.W.slow === 0.15 && KC.alonso.E.dashSpeed === 15 && KC.alonso.D.hop === 0);
    T.ok('캐시 단검 D 시전 0.2초 · 클로에 R 초당 3틱', CONFIG.skills.D_dagger.windup === 0.2 && Math.abs(KC.chloe.R.tick - 1 / 3) < 1e-9);
    // 알론소 W 파동: 14m/s로 나아감 — 5m 앞 적은 쏜 순간이 아니라 약 0.3초 뒤에 맞음
    reset(); Settings.character = 'alonso'; Game.start('dummy', { count: 1, hp: 50000, def: 0, infinite: true }); Game.freeze = 0; Game.mode.banner = null;
    const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: 8, y: 9 }; d.pos = { x: 12.3, y: 9 };
    AlonsoCore.wStart(p, { x: 1, y: 0 }); AlonsoCore.wWave(p, false); const h0 = Stats.dmgBy.W || 0; run(12); const h1 = Stats.dmgBy.W || 0; run(36); const h2 = Stats.dmgBy.W || 0;
    T.ok('알론소 W 파동: 투사체처럼 나아가 늦게 맞음(14m/s)', h0 === 0 && h1 === 0 && h2 > 0, `${h0}/${h1}/${Math.round(h2)}`);
    p.alW = null; p.alWaves = [];
    // 나딘 Q: 2초 충전이 다 차면 바로 발사
    reset(); Settings.character = 'nadine'; Game.start('dummy', { count: 1, hp: 50000, def: 0, infinite: true }); Game.freeze = 0; Game.mode.banner = null;
    const q = Game.player; q.cmdSkill('Q', V.add(q.pos, { x: 5, y: 0 })); Input.aiming = null; run(Math.round(1.9 * 120)); const still = !!q.charge; run(Math.round(0.2 * 120));
    T.ok('나딘 Q: 2초 충전 끝에 자동 발사(더 기다리지 않음)', still && !q.charge && (Stats.casts.Q || 0) >= 1);
    // 원거리 AI 평타 거리: 가장자리끼리(플레이어와 같음) — 카티야 6.0 + 몸 → 중심 거리 약 6.4m+에서도 쏨
    reset(); Settings.character = 'cathy'; Game.start('duel', { diff: 'normal', motif: 'katja', enemyBuild: 'mid', map: 'basic', rounds: 1, seed: 2 }); Game.freeze = 0; Modes.duel.banner = null;
    const e = Modes.duel.enemy, pc = Game.player; pc.untargetable = 0; e.pos = { x: 8, y: 9 }; pc.pos = { x: 8 + 6.0 + pc.r + e.r - 0.05, y: 9 }; pc.stun = 9; e.aaCd = 0; e.kiteT = 0; e.moveTarget = null;
    const aa0 = e.stats.aa || 0; let fired = false; const keep = Events.emit; for (let i = 0; i < 60 && !fired; i++) { pc.pos = { x: 8 + 6.0 + pc.r + e.r - 0.05, y: 9 }; e.pos = { x: 8, y: 9 }; step(); fired = e.aa && e.aa.phase && e.aa.phase !== 'none' || e.aaCd > 0.05; }
    T.ok('카티야 AI: 무기 사거리 6.0m(가장자리 기준) 끝에서 평타', fired);
    Settings.character = 'cathy';
  });

  // 근접 실험체 코칭: 다니엘 영감 표식 폭발 · 알론소 자력 연결 기절 · 붙어 있는데 평타 쉼
  G('근접 코칭', () => {
    reset(); Settings.character = 'daniel'; Game.start('dummy', { count: 1, hp: 900000, def: 0, infinite: true }); Game.freeze = 0; Game.mode.banner = null;
    let p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: d.pos.x - 3, y: d.pos.y };
    p.cmdSkill('W', d.pos); Input.aiming = null; run(Math.round(4.4 * 120)); p.cmdAttack(d); run(240);
    T.ok('다니엘: 표식 4초 뒤 공격 → 폭발 기록', Stats.counts.markOn === 1 && Stats.counts.markPop === 1, JSON.stringify(Stats.counts));
    reset(); Settings.character = 'alonso'; Game.start('dummy', { count: 1, hp: 900000, def: 0, infinite: true }); Game.freeze = 0; Game.mode.banner = null;
    p = Game.player; d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: d.pos.x - 4, y: d.pos.y };
    p.cmdSkill('Q', d.pos); Input.aiming = null; run(120); p.cmdAttack(d); run(240);
    T.ok('알론소: 연결 후 평타 → 기절 기록', Stats.counts.linkOn === 1 && Stats.counts.linkPop === 1, JSON.stringify(Stats.counts));
    Object.assign(Stats, { t: 60, combatT: 40, aaIdle: 12, counts: { linkOn: 6, linkPop: 1 } });
    const ids = Coach.metrics(Stats).map(x => x.id);
    T.ok('알론소 코칭: 연결 못 이음 · 붙어서 평타 쉼 · 원딜 항목 없음', ids.includes('linkPop') && ids.includes('aaIdle') && !ids.includes('kite') && !ids.includes('markPop'), ids.join(','));
    Game.finish('test'); const card = document.getElementById('card').innerText;
    T.ok('알론소 결과 화면: 자력 연결 기절 · 평타 공백 · 캐시 통계 숨김', card.includes('자력 연결 → 기절') && card.includes('평타 공백') && !card.includes('2인 수쳐'));
    Settings.character = 'cathy';
  });

  // 실측값 입력: 넣으면 설정값에 바로 적용 · 범위 제한 · 지우면 추정값으로
  G('실측값 입력', () => {
    reset(); const K = CONFIG.rangedKits;
    T.ok('실측 항목 21개 · 경로가 모두 숫자', Measure.ITEMS.length === 21 && Measure.ITEMS.every(it => typeof Measure.value(it) === 'number'));
    Measure.put('alonsoLink', 3.2); T.ok('입력 → 바로 적용', K.alonso.Q.markDur === 3.2 && Measure.measured(Measure.ITEMS[0]) && Measure.count() === 1);
    Measure.put('sphereMove', 9); T.ok('여러 경로 항목(임시·최종 스피어 이동)', CONFIG.sphere.phases[3].dur === 9 && CONFIG.sphere.finalPhases[3].dur === 9);
    Measure.put('plasmaShots', 7.6); T.ok('정수 항목은 반올림', CONFIG.tactical.plasmadash.shots === 8);
    Measure.put('ninaRange', 99); T.ok('범위 밖은 최대값으로', K.chloe.P.range === 4);
    Measure.put('ruptureR', 3); T.ok('아이템 효과(ItemFx)도 적용', ItemFx.RUPTURE.r === 3);
    UI.showSettings(() => UI.showMenu()); click('[data-a="measure"]'); T.ok('설정 → 실측값 화면', document.querySelectorAll('[data-in="mv"]').length === 21 && document.getElementById('card').innerText.includes('✔ 실측 적용'));
    click('[data-a="mclear"]'); T.ok('모두 지우기 → 추정값 복원', K.alonso.Q.markDur === 4 && CONFIG.sphere.phases[3].dur === 6 && CONFIG.tactical.plasmadash.shots === 5 && K.chloe.P.range === 1 && ItemFx.RUPTURE.r === 2.5 && Measure.count() === 0);
    UI.showMenu();
  });

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
    // 원거리 실험체: 평타 공백 · 쏘고 움직이기 · 사거리 · 조준 스킬 적중률 — 캐시 전용 항목은 안 나옴
    reset(); Settings.character = 'nadine'; Game.start('dummy', { count: 1, hp: 9000, def: 50, infinite: true }); run(5);
    Object.assign(Stats, { t: 40, combatT: 30, aaIdle: 10, heroAA: 20, kiteAA: 2, rangeSum: 9, closeAA: 12, aaHits: 20, enhAA: 0, casts: { Q: 6, E: 5, R: 2 }, hits: { Q: 1, E: 0, R: 0 }, mistakes: { '평타 선딜 중 이동 → 평타 취소': 2 } });
    const RA = Coach.analyze(Stats), ids = RA.top.map(x => x.id), all = Coach.metrics(Stats).map(x => x.id);
    T.ok('원거리 코칭: 평타 공백·무빙·사거리·Q 적중률', ['aaIdle', 'kite', 'aaRange', 'aimQ'].every(k => all.includes(k)) && ids.includes('kite'), all.join(',') + ' / 상위 ' + ids.join(','));
    T.ok('원거리 코칭: 캐시 전용(수쳐·강화 평타)·버프 스킬(E) 없음', !all.some(k => ['eAim', 'enhLow', 'aimE'].includes(k)));
    T.ok('원거리 코칭: 스킬 이름', Coach.metrics(Stats).find(x => x.id === 'aimQ').title.includes('황소의 눈'));
    T.ok('원거리 코칭: 캐시 문구 없음', !RA.top.some(x => /강화 평타를 쓰|수쳐/.test(x.title + x.tip)));
    Object.assign(Stats, { combatT: 30, aaIdle: 0.5, heroAA: 20, kiteAA: 15, rangeSum: 17 });
    const RG = Coach.analyze(Stats).good.join(' ');
    T.ok('원거리 코칭: 잘한 점(무빙·사거리·평타 유지)', RG.includes('쏘고 움직이기') && RG.includes('사거리 관리'), RG);
    Game.finish('test'); const card = document.getElementById('card').innerText;
    T.ok('원거리 결과 화면: 실험체 스킬 이름 · 무빙 통계 · 캐시 통계 숨김', card.includes('Q 황소의 눈') && card.includes('무빙 비율') && card.includes('평타 거리') && !card.includes('2인 수쳐'));
    click('[data-a="drill"][data-v="0"]'); T.ok('원거리 코칭: 연습하기는 그 실험체로', Game.state === 'play' && Game.player.charKey === 'nadine');
    Settings.character = 'cathy';
  });

  // ---------------- 콤보 시범(모범 간격) ----------------
  G('실험체별 콤보', () => {
    const e0 = errs.length, chars = ['cathy', 'daniel', 'aya', 'rio', 'nadine', 'katja', 'chloe', 'alonso'];
    T.ok('모든 실험체에 콤보가 있고, 그 실험체 콤보만 보임', chars.every(ch => UI.combosFor(ch).length >= (ch === 'cathy' ? 6 : 2) && UI.combosFor(ch).every(c => UI.comboChar(c) === ch)));
    // 시범 보기: 실험체별 모든 콤보가 실제로 성공 (그 실험체로 시작)
    const fails = [];
    for (const ch of chars.slice(1)) for (const c of UI.combosFor(ch)) {
      reset(); Game.start('combo', { combo: c, diff: 'skilled' }); Game.freeze = 0; const M = Modes.combo; M.startDemo(); let g = 0;
      while (g < 120 * 25 && (M.demo || M.state !== 'result')) { step(); g++; }
      if (!M.resultOk || (Game.player.charKey || 'cathy') !== ch) fails.push(c.id + ':' + M.msg);
    }
    T.ok('시범 보기: 다니엘·아야·리오·나딘·카티야·클로에·알론소 콤보 전부 성공', !fails.length && errs.length === e0, fails.join(' / '));
    // 콤보 성공 후 초기화: 클로에 니나는 하나만(새로 만들지 않음) · 쿨 초기화
    reset(); Game.start('combo', { combo: UI.combosFor('chloe')[0], diff: 'intro' }); Game.freeze = 0; Modes.combo.startDemo(); let g2 = 0; while (g2 < 120 * 25 && (Modes.combo.demo || Modes.combo.state !== 'result')) { step(); g2++; }
    run(Math.round(CONFIG.modes.combo.resetDelay * 1.6 * 120) + 10);
    T.ok('초기화: 니나 1명 · 쿨 0 · 스킬 상태 해제', Modes.combo.state === 'idle' && Game.units.filter(u => u.kind === 'doll').length === 1 && Game.player.skills.Q.cd === 0 && !Game.player.eRe && !Game.player.spin);
    // 사용자 콤보: 지금 고른 실험체로 저장
    reset(); Settings.character = 'alonso'; Store.set('combos', []); UI.showModeOptions('combo'); document.getElementById('o-json').value = '{"name":"테스트 콤보","steps":["Q","AA"]}'; click('[data-a="add"]');
    const mine = UI.customCombos()[0]; T.ok('사용자 콤보 = 고른 실험체(알론소) 콤보', mine && mine.char === 'alonso' && UI.combosFor('alonso').includes(mine) === false && UI.combosFor('alonso').some(c => c.id === mine.id) && !UI.combosFor('cathy').some(c => c.id === mine.id));
    click('[data-a="del"]'); T.ok('사용자 콤보 삭제', !UI.customCombos().length); Store.set('combos', []); Settings.character = 'cathy'; UI.showMenu();
  });

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
    let p = Game.player, d = Game.units.find(u => u.kind === 'dummy');
    const R = Sfx.spatial({ x: p.pos.x + 6, y: p.pos.y }), L = Sfx.spatial({ x: p.pos.x - 6, y: p.pos.y }), F = Sfx.spatial({ x: p.pos.x, y: p.pos.y + 30 });
    T.ok('사운드: 오른쪽 소리는 오른쪽 스피커', R.pan > 0.5 && L.pan < -0.5, `${R.pan} / ${L.pan}`);
    T.ok('사운드: 멀수록 작게(최소 30%)', F.vol === 0.3 && R.vol > 0.9 && Sfx.spatial({ x: p.pos.x + 3, y: p.pos.y }).vol === 1 && Sfx.spatial(null).pan === 0);
    const aya = { motif: CONFIG.rangedMotifs.aya }, rio = { motif: CONFIG.rangedMotifs.rio };
    p.weapon = 'dual'; const twin = Sfx.hitKind(p, 'normal'); p.weapon = 'dagger';
    T.ok('사운드: 무기별 타격음', Sfx.hitKind(p, 'normal') === 'hitBlade' && twin === 'hitTwin' && Sfx.hitKind(aya, 'normal') === 'hitGun' && Sfx.hitKind(rio, 'normal') === 'hitArrow' && Sfx.hitKind({ charKey: 'daniel' }, 'normal') === 'hitShadow');
    T.ok('사운드: 치명타·스킬·고정 피해 구분', Sfx.hitKind(p, 'normal', { crit: true }) === 'hitCrit' && Sfx.hitKind(p, 'skill') === 'hitSkill' && Sfx.hitKind(p, 'true') === null);
    // 캐시 외 플레이어는 무기 소리(예전엔 플레이어면 무조건 칼 소리) · 클로에 암기 · 니나 가위 · 알론소 글러브
    const kindAs = ch => { Settings.character = ch; Game.start('dummy', { count: 1, hp: 3000, def: 0 }); const q = Game.player; return [Sfx.hitKind(q, 'normal'), q.nina ? Sfx.hitKind(q.nina, 'normal') : null]; };
    const [kc, kn] = kindAs('chloe'), [ka] = kindAs('alonso'), [kd] = kindAs('nadine'), [kk] = kindAs('katja');
    T.ok('사운드: 플레이어 실험체별 타격음', kc === 'hitNeedle' && kn === 'hitScissor' && ka === 'hitPunch' && kd === 'hitArrow' && kk === 'hitGun', [kc, kn, ka, kd, kk].join(','));
    Settings.character = 'cathy'; Game.start('dummy', { count: 1, hp: 3000, def: 0 }); run(5); p = Game.player; d = Game.units.find(u => u.kind === 'dummy');
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

  // ---------------- 명령 계층·결정성 (리플레이) ----------------
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

  // ---------------- 상대 팀 사람 캐릭터 ----------------
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

  // ---------------- AI 팀 대전 (2:2 · 3:3) ----------------
  G('팀 대전', () => {
    reset(); Settings.character = 'cathy'; Settings.fog = true;
    Game.start('team', { size: 3, diff: 'normal', map: 'arena', rounds: 1, seed: 11, allies: ['aya', 'rio'], enemies: ['katja', 'nadine', 'daniel'] }); run(2);
    const M = Game.mode, p = Game.player;
    T.ok('팀 구성: 블루 3(나+AI 2) vs 레드 3', M.team(0).length === 3 && M.team(1).length === 3 && M.allies.every(u => u.team === 0 && u.kind !== 'player') && M.enemies.map(u => u.motifKey).join() === 'katja,nadine,daniel');
    T.ok('팀 대전 = 원형 투기장 · 시야 시스템', Game.mapKey === 'arena' && Vision.fogOn);
    // 팀 시야 공유: 나는 못 보고 아군만 보는 적 → 나도 보임
    const a = M.allies[0], e = M.enemies[0]; p.pos = { x: 4, y: 18 }; a.pos = { x: 20, y: 18 }; e.pos = { x: 24, y: 18 }; e.revealT = 0;
    T.ok('팀 시야 공유: 아군이 보는 적은 나도 보임', !Vision.soloSees(p, e) && Vision.soloSees(a, e) && Vision.visible(p, e));
    // 아군 AI는 내가 찍은 대상을 함께 침(집중 공격)
    const e2 = M.enemies[1]; e.pos = { x: 22, y: 16.5 }; e2.pos = { x: 22, y: 19.5 }; p.pos = { x: 19, y: 18 };
    p.attackTarget = e2; const f2 = M.pickFoe(a, M.team(1), null); p.attackTarget = e; const f1 = M.pickFoe(a, M.team(1), null); p.attackTarget = null;
    T.ok('아군 AI: 내가 찍은 대상을 따라 침', f1 === e && f2 === e2, `${f1 && f1.motifKey} / ${f2 && f2.motifKey}`);
    T.ok('AI 상대 쿨 읽기(플레이어 skills · AI cds)', foeCd(p, 'Q') === p.skills.Q.cd && foeCd(e, 'Q') === e.cds.Q && foeCd(e, 'Z') === 99);
    // 끝까지 진행: 봇(나) + AI 6명, 오류 없이 라운드가 끝남
    const bot = () => { const q = Game.player; if (q.dead || Game.freeze > 0) return; const t = Game.nearestEnemy(q.pos, 9, q); if (t) { if (q.attackTarget !== t) q.cmdAttack(t); } else if (!q.moveTarget) q.cmdMove({ x: 18, y: 18 }); };
    const e0 = errs.length; let g = 0; Game.start('team', { size: 3, diff: 'hard', map: 'arena', rounds: 1, seed: 5 });
    while (Game.state === 'play' && g < 120 * 120) { step(); g++; if (g % 12 === 0) bot(); if (g % 240 === 0) Renderer.frame(); }
    T.ok('3:3 한 판이 오류 없이 끝남', Game.state === 'result' && errs.length === e0, `${Game.state} ${(g / 120).toFixed(1)}s ${errs.slice(e0).join('/')}`);
    // 3:3 + 다니엘(나) · 숲길
    Settings.character = 'daniel'; g = 0; Game.start('team', { diff: 'normal', map: 'jungle', rounds: 1, seed: 8 });
    while (Game.state === 'play' && g < 120 * 120) { step(); g++; if (g % 12 === 0) bot(); }
    T.ok('3:3 (다니엘·숲길) 한 판이 끝남', Game.state === 'result' && errs.length === e0 && Game.mode.team(0).length === 3 && Game.mode.team(1).length === 3, `${Game.state} ${(g / 120).toFixed(1)}s ${errs.slice(e0).join('/')}`);
    Settings.character = 'cathy';
    // 영상 학습 규칙: 프리딜 못 견디는 상대 먼저 · 아군이 멀면 궁 아낌 · 팔 길이로 팀 자세
    { reset(); Game.start('team', { size: 3, diff: 'normal', map: 'arena', rounds: 1, seed: 3, allies: ['aya', 'rio'], enemies: ['katja', 'nadine', 'aya'] }); run(5);
      const M2 = Game.mode, a2 = M2.allies[0], [x1, x2] = M2.enemies; a2.pos = { x: 18, y: 18 }; x1.pos = { x: 22, y: 16.8 }; x2.pos = { x: 22, y: 19.2 }; M2.enemies[2].pos = { x: 30, y: 30 }; x1.ad = 400; x2.ad = 80; x2.def = 300;
      T.ok('팀 AI: 딜 강하고 약한 상대 먼저(단단한 상대는 뒤로)', TeamAI.pickFoe(a2, M2.team(1), null) === x1);
      const b2 = M2.allies[1]; b2.pos = { x: 4, y: 18 }; Game.player.pos = { x: 4, y: 20 }; const far = TeamAI.holdUlt(a2, x1); b2.pos = { x: 21, y: 18 };
      T.ok('팀 AI: 아군이 멀면 궁 아낌, 가까우면 씀', far && !TeamAI.holdUlt(a2, x1));
      T.ok('팀 AI: 팔 길이 비교(짧은 팀 = 먼저 진입)', TeamAI.reach(0) > 0 && ['dive', 'hold'].includes(TeamAI.stance(0))); }
    // 결정성: 같은 시드 + 같은 입력 → 같은 판
    const h = () => { Game.start('team', { size: 3, diff: 'normal', map: 'arena', rounds: 1, seed: 77 }); run(120 * 8); return Cmd.hash(); };
    T.ok('팀 대전 결정성: 같은 시드 = 같은 판', h() === h());
  });

  // ---------------- 플레이어블 원거리 실험체 (아야·리오·나딘·카티야) ----------------
  G('원거리 실험체', () => {
    const K = CONFIG.rangedKits;
    T.ok('12.5 수치: 리오 곡사 90 · 벽꿍 1초 · 비상 16초 · 나딘 와이어 7초 · 다니엘 단검 추공 40%', K.rio.D.base[0] === 90 && K.rio.D.innerBad === 1.7 && K.rio.R.short.recast.stun === 1.0 && K.rio.E.cd[0] === 16 && K.nadine.E.life === 7 && K.nadine.D.mark.incSp === 0.05 && K.daniel.D.bad === 0.4 && K.katja.R.shots.length === 3);
    const setup = (ch, mode = 'dummy', o = { count: 1, hp: 30000, def: 50, infinite: true }) => { reset(); Settings.character = ch; Settings.fog = true; Game.start(mode, Object.assign({ seed: 5 }, o)); run(10); const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); if (d) d.pos = { x: p.pos.x + 5, y: p.pos.y }; return { p, d }; };
    const cast = (p, k, aim) => { if (!p.recastReady(k)) p.skills[k].cd = 0; p.cmdSkill(k, aim); Input.aiming = null; };
    // 실험체마다: 플레이어 클래스 · 모든 스킬이 피해를 줌 · 평타는 유도 투사체
    const e0 = errs.length;
    for (const ch of ['aya', 'rio', 'nadine', 'katja']) {
      const { p, d } = setup(ch);
      T.ok(`${ch}: 플레이어블 (원거리)`, p instanceof RangedPlayer && p.ranged && p.charKey === ch && p.kind === 'player' && p.aaCfg().range === (PKits[ch].aaRange ? PKits[ch].aaRange(p) : CONFIG.rangedMotifs[ch].aaRange));
      p.cmdAttack(d); run(180); const aa = Stats.dmgBy.AA || 0; p.cmdStop();
      T.ok(`${ch}: 평타(유도 투사체)`, aa > 0, Math.round(aa));
      const keys = { aya: ['Q', 'W', 'R'], rio: ['W', 'E', 'R', 'D'], nadine: ['D'], katja: ['Q', 'E', 'R'] }[ch];
      for (const k of keys) { const b = Stats.dmgBy[k] || 0; cast(p, k, { ...d.pos }); run(260); if (k === 'R' && ch === 'rio' && p.rRecast) { cast(p, 'R', { ...d.pos }); run(60); } T.ok(`${ch} ${k}: 피해`, (Stats.dmgBy[k] || 0) > b, Math.round((Stats.dmgBy[k] || 0) - b)); d.pos = { x: p.pos.x + 5, y: p.pos.y }; }
    }
    T.ok('원거리 실험체: 오류 없음', errs.length === e0, errs.slice(e0).join(' / '));
    // 아야: Q 사거리 밖이면 다가가서 시전 · W 재입력 중단 · R 공포 · D 평타 불가 후 공속
    { const { p, d } = setup('aya'); d.pos = { x: p.pos.x + 8, y: p.pos.y }; cast(p, 'Q', { ...d.pos }); run(200); T.ok('아야 Q: 다가가서 시전', (Stats.casts.Q || 0) === 1 && V.dist(p.pos, d.pos) < 8);
      cast(p, 'W', { ...d.pos }); run(30); const w = p.ayaW; cast(p, 'W', { ...d.pos }); run(2); T.ok('아야 W: 재입력 = 중단', !!w && !p.ayaW && p.skills.W.cd > 0);
      cast(p, 'D', p.pos); T.ok('아야 D: 1초 평타 불가', p.noAA > 0.9); run(130); T.ok('아야 D: 다음 평타 2회 공속', p.reload === 2 && p.asBuffs.some(a => a.tag === 'reload')); }
    // 리오: Q 활 교체(사거리·공속) · 단궁 R 강한 화살 벽꿍 기절 1초
    { const { p } = setup('rio', 'duel', { diff: 'normal', map: 'basic', motif: 'aya', rounds: 1 }); run(200); const e = Game.mode.enemy;
      const r0 = p.aaCfg().range, as0 = p.atkSpd(); cast(p, 'Q', p.pos); T.ok('리오 Q: 화궁 → 단궁 (사거리 4.85m, 공속 증가)', p.stance === 'short' && p.aaCfg().range === 4.85 && r0 > 6.2 && p.atkSpd() > as0);
      const W0 = CONFIG.walls[0]; e.pos = { x: W0.x - 1.5, y: W0.y + W0.h / 2 }; p.pos = { x: W0.x - 6, y: W0.y + W0.h / 2 }; e.stun = 0.45;
      cast(p, 'R', { ...e.pos }); run(30); cast(p, 'R', { ...e.pos }); let mx = 0; for (let i = 0; i < 150; i++) { step(); mx = Math.max(mx, e.stun); }
      T.ok('리오 단궁 R: 강한 화살 벽꿍 기절 1초', Math.abs(mx - 1.0) < 0.02, mx.toFixed(2)); }
    // 나딘: Q 충전 → 재입력 발사(사거리 증가) · W 두 번 = 연결 덫(AI가 밟으면 발동) · E 와이어 11m 끊김
    { const { p, d } = setup('nadine'); cast(p, 'Q', { ...d.pos }); run(180); const ch = !!p.charge; cast(p, 'Q', { ...d.pos }); T.ok('나딘 Q: 충전 → 재입력 발사', ch && !p.charge && p.skills.Q.cd > 0);
      cast(p, 'W', { x: p.pos.x + 3, y: p.pos.y - 2.4 }); const a = !!p.trapA; cast(p, 'W', { x: p.pos.x + 3, y: p.pos.y + 2.4 }); T.ok('나딘 W: 두 번 던지면 연결', a && p.traps.length === 1 && !p.trapA);
      const hp0 = d.hp; d.pos = { x: p.pos.x + 4.5, y: p.pos.y }; run(2); d.pos = { x: p.pos.x + 1.5, y: p.pos.y }; run(2); T.ok('나딘 W: 연결선을 지나가면 발동', d.hp < hp0 && p.traps.length === 0);
      d.pos = { x: p.pos.x + 4, y: p.pos.y }; cast(p, 'R', p.pos); p.cmdAttack(d); run(150); T.ok('나딘 R: 첫 평타부터 늑대', (Stats.dmgBy.R || 0) > 0); p.cmdStop();
      cast(p, 'E', { x: p.pos.x - 3, y: p.pos.y }); const wr = !!p.wire; p.pos = { x: p.pos.x + 9, y: p.pos.y }; run(2); T.ok('나딘 E: 와이어에서 11m 넘게 멀어지면 끊김', wr && !p.wire); }
    // 카티야: D 저격 모드 3발(3발째 데드아이) · 이동하면 해제·0발이면 쿨 50% · R 사다리꼴 안 3명에게 발마다 강해지는 탄
    { const { p, d } = setup('katja'); cast(p, 'D', { ...d.pos }); run(80); const b = Stats.dmgBy.D || 0; for (let i = 0; i < 3; i++) { p.cmdSkill('D', { ...d.pos }); run(40); }
      T.ok('카티야 D: 저격 3발 후 모드 끝', !p.snipe && (Stats.casts.D || 0) >= 3 && (Stats.dmgBy.D || 0) > b && p.skills.D.cd > 20);
      p.skills.D.cd = 0; cast(p, 'D', { ...d.pos }); run(10); p.cmdMove({ x: p.pos.x - 2, y: p.pos.y }); run(5); T.ok('카티야 D: 이동하면 해제 · 0발 쿨 50%', !p.snipe && Math.abs(p.skills.D.cd - p.skills.D.cdMax * 0.5) < 0.2); }
    { reset(); Settings.character = 'katja'; Game.start('team', { size: 3, diff: 'normal', map: 'arena', rounds: 1, seed: 4 }); run(200); const p = Game.player, es = Game.mode.enemies;
      es.forEach((u, i) => { u.pos = { x: p.pos.x + 10 + i * 0.8, y: p.pos.y + (i - 1) * 0.6 }; u.stun = 3; }); Game.mode.allies.forEach(a => { a.pos = { x: 3, y: 18 }; a.stun = 3; });
      const h0 = es.map(u => u.hp); cast(p, 'R', { x: p.pos.x + 10.8, y: p.pos.y }); run(300); const dm = es.map((u, i) => h0[i] - u.hp);
      T.ok('카티야 R: 사다리꼴 안 3명 모두, 뒤로 갈수록 강한 탄', dm.every(x => x > 0) && dm[2] > dm[0], dm.map(Math.round).join('/')); }
    // 결정성: 원거리 플레이어 + 명령 기록 → 같은 판
    { const go = () => { reset(); Settings.character = 'rio'; Game.start('duel', { diff: 'normal', map: 'arena', motif: 'nadine', rounds: 1, seed: 21 }); run(220); const p = Game.player, e = Game.mode.enemy;
        Cmd.attack(e); run(120); Cmd.skill('W', { ...e.pos }); run(60); Cmd.skill('Q', p.pos); run(30); Cmd.skill('R', { ...e.pos }); run(200); return Cmd.hash(); };
      T.ok('원거리 실험체 결정성: 같은 시드·명령 = 같은 판', go() === go()); }
    Settings.character = 'cathy';
  });

  // ---------------- 리플레이 (저장·다시 보기) ----------------
  G('클로에', () => {
    const K = CONFIG.rangedKits.chloe, e0 = errs.length;
    const setup = (o = { count: 1, hp: 99999, def: 50, infinite: true }) => { reset(); Settings.character = 'chloe'; Game.start('dummy', Object.assign({ seed: 9 }, o)); Game.freeze = 0; run(10); const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: 8, y: 9 }; d.pos = { x: 11, y: 9 }; p.cmdStop(); return { p, n: p.nina, d }; };
    T.ok('수치: 나무위키 + 12.2(니나 방어 20/35/50 · Q 80%) · 마름쇠 60/90/120', K.P.bonusDef[0] === 20 && K.Q.ninaAd === 0.8 && K.W.range === 6.5 && K.E.ninaDist === 7 && K.R.hitShare === 0.7 && K.R.linkShare === 0.6 && K.D.base[2] === 120 && K.D.decay === 0.45);
    let { p, n, d } = setup();
    T.ok('플레이어블: 원거리 + 니나(실험체 아님)', p instanceof RangedPlayer && p.charKey === 'chloe' && n instanceof Doll && n.kind === 'doll' && !isHero(n) && Game.units.includes(n) && p.aaCfg().range === 4.8);
    const k = Math.min(1, K.P.ratio + K.P.ratioLv * p.build.level);
    T.ok('니나 능력치 = 클로에 × (60% + 레벨당 2%) + 추가', Math.abs(n.ad - (p.ad * k + K.P.bonusAd[p.L('P') - 1])) < 1e-6 && n.maxHp === Math.round(p.maxHp * k + K.P.bonusHp[p.L('P') - 1]), fmt(n.ad, 1));
    T.ok('메뉴: 실험체 선택에 클로에', !!PKits.chloe && Object.keys(PKits).includes('chloe'));
    // 평타 → 니나가 같은 대상 공격 · 2타 표식 → 니나 찌르기
    p.cmdAttack(d); run(360); p.cmdStop();
    T.ok('니나가 클로에의 평타 대상을 같이 공격', (Stats.dmgBy.Nina || 0) > 0 && V.dist(n.pos, d.pos) < K.P.range + d.r + n.r + 0.7, Math.round(Stats.dmgBy.Nina || 0));
    T.ok('2타 표식 → 니나 찌르기(P)', (Stats.dmgBy.P || 0) > 0, Math.round(Stats.dmgBy.P || 0));
    // Q: 니나 주변 2.5m 베기 + 둔화 (0.2초 뒤)
    ({ p, n, d } = setup()); n.pos = { x: 10, y: 9 }; n.mode = 'idle'; let h = d.hp; p.cmdSkill('Q', p.pos); run(12); const qEarly = h - d.hp; run(20);
    T.ok('Q: 0.2초 뒤 니나 주변 피해 + 둔화', qEarly === 0 && h - d.hp > 0 && d.slows.length > 0 && p.skills.Q.cd > 0, Math.round(h - d.hp));
    // W: 회전(고정 피해·평타 불가) → 던지기 → 니나 내려찍기 에어본 / 안 던지면 쿨 50%
    ({ p, n, d } = setup()); d.pos = { x: 10, y: 9 }; h = d.hp; p.cmdSkill('W', p.pos); run(130);
    T.ok('W1: 주변 고정 피해 + 둔화 + 평타 불가', !!p.spin && h - d.hp > 0 && d.slows.length > 0 && p.noAA > 0, Math.round(h - d.hp));
    d.pos = { x: 13, y: 9 }; p.cmdSkill('W', d.pos); run(Math.round((K.W.throwTime + K.W.slamDelay) * 120) + 4);
    T.ok('W2: 던지기 → 니나 순간이동 내려찍기 에어본', !p.spin && d.airborneT > Game.time - 0.6 && V.dist(n.pos, d.pos) < 1 && p.skills.W.cd > 5);
    ({ p, n, d } = setup()); p.cmdSkill('W', p.pos); run(Math.round(K.W.spin * 120) + 5);
    T.ok('W: 3초 안에 안 던지면 쿨 50% 반환', !p.spin && Math.abs(p.skills.W.cd - lv(K.W.cd, p.L('W')) * 0.5) < 0.1, fmt(p.skills.W.cd, 2));
    // E: 4m 돌진(벽 통과) → 1초 뒤 재입력 = 니나 돌진, 적중 시 Q 초기화
    ({ p, n, d } = setup()); n.pos = { x: 14, y: 9 }; n.mode = 'idle'; p.skills.Q.cd = 3; p.cmdSkill('E', { x: 4, y: 9 }); run(40);
    T.ok('E1: 4m 돌진 + 재사용 대기', Math.abs(V.dist(p.pos, { x: 8, y: 9 }) - K.E.dist) < 0.05 && !!p.eRe && !p.recastReady('E'));
    n.pos = { x: 14, y: 9 }; run(100); T.ok('E: 1초 뒤 재사용 가능', p.recastReady('E') && p.instantKey('E'));
    h = d.hp; p.cmdSkill('E', p.pos); run(60);
    T.ok('E2: 니나 돌진 적중 → Q 쿨 초기화 + E 쿨 시작', h - d.hp > 0 && p.skills.Q.cd === 0 && p.skills.E.cd > 5 && !p.eRe);
    // R: 피해 분담 70%/60% · 둘 다 체력이 다 떨어져야 사망 · W·E 남은 쿨 30% 감소 · 연결선 피해
    ({ p, n, d } = setup()); p.skills.W.cd = 10; p.skills.E.cd = 10; p.cmdSkill('R', p.pos); run(2);
    T.ok('R: 링크 + W·E 남은 쿨 30% 감소 + 니나 공속·이속', !!p.link && Math.abs(p.skills.W.cd - 7) < 0.05 && Math.abs(p.skills.E.cd - 7) < 0.05 && n.asB > 0 && n.msB > 0);
    let ph = p.hp, nh = n.hp; Combat.damage(d, p, 1000, { type: 'true' });
    T.ok('R: 맞은 쪽 70% + 니나 60%', Math.abs(ph - p.hp - 700) < 1 && Math.abs(nh - n.hp - 600) < 1, Math.round(ph - p.hp) + '/' + Math.round(nh - n.hp));
    p.hp = 50; Combat.damage(d, p, 300, { type: 'true' }); T.ok('R: 니나가 살아 있으면 클로에는 죽지 않음(체력 1)', !p.dead && p.hp === 1);
    n.hp = 5; Combat.damage(d, n, 300, { type: 'true' }); run(2); T.ok('R: 둘 다 체력이 다 떨어지면 함께 사망', p.dead && n.dead);
    ({ p, n, d } = setup()); d.pos = { x: 10, y: 10.5 }; n.pos = { x: 12, y: 12 }; n.mode = 'idle'; p.cmdSkill('R', p.pos); h = d.hp; for (let i = 0; i < 120; i++) { n.pos = { x: 12, y: 12 }; step(); }
    T.ok('R: 연결선에 닿은 적에게 고정 피해', h - d.hp > 0, Math.round(h - d.hp));
    // D 마름쇠: 밟을 때마다 피해 45% 감소 + 둔화
    ({ p, n, d } = setup()); n.mode = 'self'; d.pos = { x: 11, y: 9 }; p.cmdSkill('D', d.pos); run(32); const z = p.traps[0];
    T.ok('D: 0.25초 뒤 마름쇠', !!z && z.life > 5.5);
    const dmgD = []; let last = d.hp; for (let i = 0; i < 3; i++) { run(Math.round(K.D.rehit * 120) + 1); dmgD.push(last - d.hp); last = d.hp; }
    T.ok('D: 밟을 때마다 피해 감소 + 둔화', dmgD[0] > 0 && dmgD[1] < dmgD[0] * 0.6 && dmgD[2] < dmgD[1] && d.slows.length > 0, dmgD.map(v => Math.round(v)).join('/'));
    // 니나 소멸 → Q·R 불가 → 부활(클로에 현재 체력 20%, 니나 80%)
    ({ p, n, d } = setup()); n.hp = 1; Combat.damage(d, n, 999, { type: 'true' }); run(2);
    p.skills.Q.cd = 0; p.skills.R.cd = 0; p.cmdSkill('Q', p.pos); p.cmdSkill('R', p.pos); run(2);
    T.ok('니나 소멸 중 Q·R 사용 불가', n.dead && p.skills.Q.cd === 0 && p.skills.R.cd === 0 && !p.link);
    const chp = p.hp; run(Math.round(lv(K.P.respawn, p.L('P')) * 120) + 5);
    T.ok('니나 부활: 클로에 현재 체력 20% 소모 · 니나 80%', !n.dead && Math.abs((chp - p.hp) / chp - 0.2) < 0.01 && Math.abs(n.hp / n.maxHp - 0.8) < 0.01);
    // 조종: 명령(리플레이 기록) · Alt + 우클릭 · 휠 클릭 · 10m 순간이동
    ({ p, n, d } = setup()); Cmd.pet({ x: 12, y: 12 }, null); run(2); T.ok('조종: 지점 이동(명령 기록)', n.mode === 'point' && Cmd.log.some(c => c.t === 'pet'));
    run(240); T.ok('조종: 도착하면 대기', n.mode === 'idle' && V.dist(n.pos, n.goal) < 0.3, fmt(V.dist(n.pos, n.goal), 2));
    Cmd.pet(p.pos, null); run(2); T.ok('조종: 클로에 지정 = 따라오기(공격 안 함)', n.mode === 'self');
    const cv = Renderer.inputCanvas(), sp = Renderer.toScreen(d.pos); cv.dispatchEvent(new MouseEvent('mousemove', { clientX: sp.x, clientY: sp.y, bubbles: true }));
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 2, buttons: 2, altKey: true, clientX: sp.x, clientY: sp.y, bubbles: true, cancelable: true })); window.dispatchEvent(new MouseEvent('mouseup', { button: 2, bubbles: true }));
    run(2); T.ok('입력: Alt + 우클릭 → 니나가 그 적 공격 (클로에는 안 움직임)', n.mode === 'enemy' && n.order === d && !p.attackTarget && !p.moveTarget);
    cv.dispatchEvent(new MouseEvent('mousedown', { button: 1, buttons: 4, clientX: sp.x + 60, clientY: sp.y, bubbles: true, cancelable: true })); run(2);
    T.ok('입력: 휠 클릭 → 니나 지점 이동', n.mode === 'point');
    n.pos = { x: 25, y: 9 }; run(2); T.ok('10m 넘게 떨어지면 클로에 옆으로', V.dist(n.pos, p.pos) < 2.5);
    // 결정성: 니나 명령 포함 같은 기록 = 같은 결과
    ({ p, n, d } = setup()); const bot = t => { if (t === 10) Cmd.attack(d); if (t === 200) Cmd.pet({ x: 12, y: 7 }, null); if (t === 400) Cmd.skill('Q', p.pos); if (t === 500) Cmd.skill('W', p.pos); if (t === 700) Cmd.skill('W', d.pos); if (t === 900) Cmd.skill('R', p.pos); };
    for (let t = 0; t < 1200; t++) { bot(t); step(); } const rec = Cmd.record(), hA = Cmd.hash();
    Game.start('dummy', { count: 1, hp: 99999, def: 50, infinite: true, seed: 9 }); Cmd.replay(rec.log); Game.freeze = 0; run(10); Game.player.pos = { x: 8, y: 9 }; Game.units.find(u => u.kind === 'dummy').pos = { x: 11, y: 9 }; Game.player.cmdStop(); run(1200);
    T.ok('결정성: 니나 명령 포함 같은 기록 = 같은 결과', rec.log.some(c => c.t === 'pet') && Cmd.valid(rec.log.find(c => c.t === 'pet')) && Cmd.hash() === hA, hA + ' / ' + Cmd.hash());
    // AI 클로에: 결투·팀 대전이 오류 없이 끝남 · 니나를 데리고 스킬 사용
    for (const [ch, map] of [['cathy', 'basic'], ['katja', 'arena']]) {
      reset(); Settings.character = ch; let g = 0; Game.start('duel', { diff: 'normal', motif: 'chloe', enemyBuild: 'mid', map, rounds: 1, seed: 3 }); const ai = Modes.duel.enemy; let used = 0;
      const botP = () => { const q = Game.player; if (q.dead || Game.freeze > 0) return; if (q.attackTarget !== ai && !ai.dead) q.cmdAttack(ai); };
      while (Game.state === 'play' && g < 120 * 90) { step(); g++; if (g % 12 === 0) botP(); if (ai.spin || ai.link || ai.traps.length) used++; }
      T.ok(`AI 클로에(${ch} 상대·${map}): 결투가 끝나고 니나·스킬 사용`, Game.state === 'result' && ai.nina instanceof Doll && used > 0 && errs.length === e0, `${(g / 120).toFixed(1)}s`);
    }
    reset(); Settings.character = 'chloe'; let g2 = 0; Game.start('team', { diff: 'normal', map: 'arena', rounds: 1, seed: 2, allies: ['chloe', 'rio'], enemies: ['chloe', 'katja', 'daniel'] });
    while (Game.state === 'play' && g2 < 120 * 120) { step(); g2++; if (g2 % 12 === 0) { const q = Game.player; if (!q.dead && Game.freeze <= 0) { const t = Game.nearestEnemy(q.pos, 9, q); if (t && q.attackTarget !== t) q.cmdAttack(t); else if (!t && !q.moveTarget) q.cmdMove({ x: 18, y: 18 }); } } }
    T.ok('팀 대전: 클로에 2명(나·상대 AI) 오류 없이 끝남 · 니나는 생존 판정에서 빠짐', Game.state === 'result' && errs.length === e0 && Game.mode.team(0).length === 3, `${(g2 / 120).toFixed(0)}s`);
    Renderer.frame(); T.ok('그리기 오류 없음', errs.length === e0, errs.slice(e0).join('/'));
    Settings.character = 'cathy';
  });

  G('알론소', () => {
    const K = CONFIG.rangedKits.alonso, e0 = errs.length;
    const setup = () => { reset(); Settings.character = 'alonso'; Game.start('dummy', { count: 1, hp: 30000, def: 50, infinite: true, seed: 4 }); Game.freeze = 0; run(10); const p = Game.player, d = Game.units.find(u => u.kind === 'dummy'); p.pos = { x: 8, y: 9 }; d.pos = { x: 12, y: 9 }; p.cmdStop(); return { p, d }; };
    T.ok('수치: 나무위키(12.1 패시브 3/4/5%) + 영상(R 3.5초)', K.P.healPct[2] === 0.05 && K.Q.range === 7.5 && K.Q.stun === 0.9 && K.W.reduce === 0.6 && K.E.windup === 0.8 && K.E.cancel === 8.25 && K.R.dur === 3.5 && K.R.r === 4.75 && K.D.cd[2] === 5);
    let { p, d } = setup();
    T.ok('플레이어블: 근접 탱커(평타 1.2m · 팀 AI 근접 판정)', p instanceof RangedPlayer && p.charKey === 'alonso' && p.melee && TeamAI.isMelee(p) && p.aaCfg().range === 1.2 && !!PKits.alonso);
    // 근접 평타: 투사체 없이 즉시
    p.cmdAttack(d); run(200); p.cmdStop(); T.ok('근접 평타(투사체 없음)', (Stats.dmgBy.AA || 0) > 0 && !Game.projectiles.some(q => q.owner === p), Math.round(Stats.dmgBy.AA || 0));
    // Q: 직선 투사체 → 연결 → 평타로 기절(최대 체력 비례 추가 피해)
    ({ p, d } = setup()); p.cmdSkill('Q', d.pos); run(80);
    T.ok('Q: 적중 → 자력 연결', !!p.alMark && p.alMark.u === d && (Stats.dmgBy.Q || 0) > 0);
    const q0 = Stats.dmgBy.Q || 0; p.cmdAttack(d); let stunned = false; for (let i = 0; i < 300; i++) { step(); if (d.stun > 0) stunned = true; }
    T.ok('Q: 연결된 적 평타 → 추가 피해 + 0.9초 기절', stunned && !p.alMark && (Stats.dmgBy.Q || 0) - q0 > d.maxHp * K.Q.popPct[p.L('Q') - 1] * 0.5);
    // Q 연결 중 대상을 바라보면 이속 증가
    ({ p, d } = setup()); p.cmdSkill('Q', d.pos); run(80); p.cmdMove(d.pos); run(3); T.ok('Q: 연결 대상 쪽으로 가면 이속 증가', p.msBuffs.some(m => m.tag === 'alQ') && p.speed() > p.baseMs);
    // W: 전방 피해 60% 감소(뒤는 그대로) · 파동 · 마무리
    ({ p, d } = setup()); d.pos = { x: 10.5, y: 9 }; p.cmdSkill('W', d.pos); run(2);
    let ph = p.hp; Combat.damage(d, p, 100, { type: 'true' }); const fr = ph - p.hp; d.pos = { x: 5.5, y: 9 }; ph = p.hp; Combat.damage(d, p, 100, { type: 'true' }); const bk = ph - p.hp; d.pos = { x: 10.5, y: 9 };
    T.ok('W: 앞에서 맞으면 60% 감소, 뒤는 그대로', Math.abs(fr - 40) < 0.5 && Math.abs(bk - 100) < 0.5, fr + '/' + bk);
    run(320); T.ok('W: 파동 5회 + 마무리 피해', !p.alW && (Stats.dmgBy.W || 0) > 0 && Stats.hits.W >= 1, Math.round(Stats.dmgBy.W || 0));
    // E: 대상 지정 → 0.8초 뒤 돌진 + 속박 · 8.25m 밖으로 나가면 취소(쿨 30% 반환)
    ({ p, d } = setup()); d.pos = { x: 12, y: 9 }; p.cmdSkill('E', d.pos); run(60); const mid = V.dist(p.pos, { x: 8, y: 9 });
    let rooted = false; for (let i = 0; i < 80; i++) { step(); if (d.root > 0) rooted = true; }
    T.ok('E: 0.8초 동안 제자리 → 돌진 + 속박', mid < 0.05 && rooted && V.dist(p.pos, d.pos) < p.r + d.r + 0.3 && (Stats.dmgBy.E || 0) > 0);
    ({ p, d } = setup()); d.pos = { x: 12, y: 9 }; p.cmdSkill('E', d.pos); run(30); d.pos = { x: 18, y: 9 }; run(80);
    T.ok('E: 대상이 8.25m 밖이면 취소 · 쿨 30% 반환', V.dist(p.pos, { x: 8, y: 9 }) < 0.05 && Math.abs(p.skills.E.cd - lv(K.E.cd, p.L('E')) * 100 / (100 + p.cdr * 100) * 0.7 + 0.6) < 0.2, fmt(p.skills.E.cd, 2));
    // R: 당기기 · 회복 · 3.5초 정신 집중 · 마무리 / 재입력 = 바로 마무리 / CC로 끊김
    ({ p, d } = setup()); d.pos = { x: 11.5, y: 9 }; p.hp = p.maxHp * 0.5; const h0 = p.hp, dd0 = V.dist(p.pos, d.pos); p.cmdSkill('R', p.pos); run(30);
    T.ok('R: 주변 적 당기기', V.dist(p.pos, d.pos) < dd0 - 1 && !!p.alR, fmt(V.dist(p.pos, d.pos), 2));
    p.cmdMove({ x: 4, y: 9 }); run(5); T.ok('R: 정신 집중 중 이동 불가', V.dist(p.pos, { x: 8, y: 9 }) < 0.05);
    run(420); T.ok('R: 3.5초 뒤 마무리 + 체력 회복', !p.alR && p.hp - h0 > 400 && (Stats.dmgBy.R || 0) > 0, Math.round(p.hp - h0));
    ({ p, d } = setup()); d.pos = { x: 11, y: 9 }; p.cmdSkill('R', p.pos); run(60); const r0 = Stats.dmgBy.R || 0; p.cmdSkill('R', p.pos); run(3);
    T.ok('R: 재입력 = 바로 마무리', !p.alR && (Stats.dmgBy.R || 0) > r0);
    ({ p, d } = setup()); p.alBar.ready = false; p.alBar.immune = 0; p.cmdSkill('R', p.pos); run(30); const rr0 = Stats.dmgBy.R || 0; p.applyCC('stun', 0.5); run(3);
    T.ok('R: 기절하면 끊김(마무리 없음)', !p.alR && (Stats.dmgBy.R || 0) === rr0);
    // P: 이동 불가 1회 무효 + 0.1초 면역 · 피해 없이 일정 시간 → 다시 준비 · 적 실험체를 이동 불가로 만들면 회복
    ({ p, d } = setup()); T.ok('P: 시작 시 배리어 준비', p.alBar.ready);
    p.applyCC('stun', 1); p.applyCC('root', 1); T.ok('P: 첫 이동 불가 무효 + 0.1초 동안 추가 CC도 면역', p.stun === 0 && p.root === 0 && !p.alBar.ready);
    run(20); p.applyCC('stun', 0.3); T.ok('P: 면역이 끝나면 CC 적용', p.stun > 0);
    run(Math.round(lv(K.P.cd, p.L('P')) * 120) + 10); T.ok('P: 피해 없이 쿨이 지나면 다시 준비', p.alBar.ready);
    // D 어퍼컷: 사거리 1.35m까지 다가가 피해 + 연결된 적 기절
    ({ p, d } = setup()); p.cmdSkill('Q', d.pos); run(80); d.pos = { x: p.pos.x + 2.6, y: 9 }; p.skills.D.cd = 0; p.cmdSkill('D', d.pos); run(60);   // 사거리 1.35m — 밖이면 걸어가서 사용
    T.ok('D 어퍼컷: 다가가서 피해 + 연결 기절', (Stats.dmgBy.D || 0) > 0 && d.stun > 0 && V.dist(p.pos, d.pos) < p.r + d.r + K.D.range + 0.1);
    // AI 알론소: 결투·팀 대전 — 팀에서는 앞라인
    for (const [ch, map] of [['katja', 'basic'], ['cathy', 'arena']]) {
      reset(); Settings.character = ch; let g = 0; Game.start('duel', { diff: 'normal', motif: 'alonso', enemyBuild: 'mid', map, rounds: 1, seed: 6 }); const ai = Modes.duel.enemy; let used = 0, last = Object.assign({}, ai.cds);
      while (Game.state === 'play' && g < 120 * 90) { step(); g++; if (g % 12 === 0) { const q = Game.player; if (!q.dead && Game.freeze <= 0 && q.attackTarget !== ai && !ai.dead) q.cmdAttack(ai); } for (const k in ai.cds) if (ai.cds[k] > last[k] + 0.5) used++; last = Object.assign({}, ai.cds); }
      T.ok(`AI 알론소(${ch} 상대·${map}): 결투가 끝나고 스킬 사용`, Game.state === 'result' && ai.melee && used >= 2 && errs.length === e0, `${(g / 120).toFixed(1)}s · 스킬 ${used}`);
    }
    reset(); Settings.character = 'rio'; Game.start('team', { diff: 'normal', map: 'arena', rounds: 1, seed: 2, allies: ['alonso', 'chloe'], enemies: ['alonso', 'katja', 'aya'] });
    T.ok('팀 대전: 알론소 = 앞라인', Game.mode.team(0).concat(Game.mode.team(1)).filter(u => u.motifKey === 'alonso').every(u => u.role === 'frontline'));
    let g2 = 0; while (Game.state === 'play' && g2 < 120 * 120) { step(); g2++; if (g2 % 12 === 0) { const q = Game.player; if (!q.dead && Game.freeze <= 0) { const t = Game.nearestEnemy(q.pos, 9, q); if (t && q.attackTarget !== t) q.cmdAttack(t); else if (!t && !q.moveTarget) q.cmdMove({ x: 18, y: 18 }); } } }
    T.ok('팀 대전: 알론소 2명 오류 없이 끝남', Game.state === 'result' && errs.length === e0, `${(g2 / 120).toFixed(0)}s`);
    Renderer.frame(); T.ok('그리기 오류 없음', errs.length === e0, errs.slice(e0).join('/'));
    Settings.character = 'cathy';
  });

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
    // 리플레이 분석: 표시 지점·이동(같은 장면)·조작·끝나면 정리
    {
      Settings.weapon = 'dagger'; Settings.tactical = 'blink';
      const o2 = { diff: 'hard', motif: 'aya', enemyBuild: 'late', map: 'basic', rounds: 3, animals: false, sphere: false, time: 'day', seed: 31 };
      Game.start('duel', o2);
      for (let i = 0; i < 120 * 40 && Game.state === 'play'; i++) { const p = Game.player, e = Modes.duel.enemy, t = Game.tick; if (p && e && !p.dead) { if (t % 60 === 0) Cmd.move({ x: e.pos.x - 2 + Math.sin(t * 0.01) * 3, y: e.pos.y + 1 }); if (t % 110 === 30) Cmd.skill(['Q', 'W', 'E', 'R'][(t / 110 | 0) % 4], { x: e.pos.x + 1.5, y: e.pos.y - 1 }); if (t % 170 === 90) Cmd.attack(e); } step(); }
      const r2 = JSON.parse(JSON.stringify(Replay.capture())), mistakes0 = Object.values(Stats.mistakes).reduce((a, b) => a + b, 0);
      const marks = Replay.watch(r2), kinds = new Set(marks.map(m => m.kind));
      T.ok('리플레이 분석: 실수·빗나감·피격 지점', marks.length >= 5 && kinds.has('mistake') && kinds.has('miss') && kinds.has('hurt') && marks.every((m, i) => i === 0 || m.tick >= marks[i - 1].tick), `${marks.length}개 ${[...kinds].join(',')}`);
      T.ok('리플레이 분석: 실수 수 = 실제 판의 실수 기록', marks.filter(m => m.kind === 'mistake').length <= mistakes0 && marks.filter(m => m.kind === 'mistake').length > 0);
      T.ok('리플레이 분석: 타임라인 표시', !!document.getElementById('replay-bar') && document.querySelectorAll('#replay-bar [data-rm]').length === marks.length && Replay.active && Game.tick === 0);
      const tk = Math.round(r2.ticks * 0.6); Replay.seek(tk); const hs = Cmd.hash();
      Replay.seek(10); const back = Game.tick; Replay.seek(tk);
      T.ok('리플레이 이동: 앞·뒤로 정확히 그 장면', back === 10 && Game.tick === tk && Cmd.hash() === hs);
      Replay.seek(0); Replay.jump(1); const firstAfter = marks.find(m => m.tick - 240 > 5);
      T.ok('리플레이: 다음 표시로', !firstAfter || Game.tick === firstAfter.tick - 240);
      Replay.key('='); Replay.key('='); T.ok('리플레이 속도', Replay.speed === 4); Replay.key('-'); Replay.key('-'); Replay.key('-'); T.ok('리플레이 속도 내리기', Replay.speed === 0.5);
      Replay.key('p'); T.ok('리플레이 일시정지', Replay.paused && Game.paused); Replay.key('p'); T.ok('리플레이 다시 재생', !Replay.paused && !Game.paused);
      Replay.seek(r2.ticks); T.ok('리플레이 끝: 타임라인 닫힘', !Replay.active && !document.getElementById('replay-bar') && /리플레이 끝/.test(document.querySelector('#card').innerText));
      UI.showMenu(); T.ok('메뉴로 나가면 정리', !Replay.active && !Replay.markers.length);
    }
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
    // 체력 재생(초당) · 장비 체력 재생% · AI 궁 쿨감(현자의 로브)
    { const lv = L.level, base = 1.8 + 0.135 * (lv - 1);
      Game.start('dummy', { count: 1, hp: 3000, def: 50, gear: null }); const c = Game.player;
      T.ok('캐시 체력 재생 = 기본(레벨 성장)', Math.abs(c.regen - base) < 1e-9, fmt(c.regen, 3));
      c.hp = c.maxHp - 100; const h0 = c.hp; for (let i = 0; i < 240; i++) c.tickStatus(1 / 120); T.ok('2초에 재생만큼 회복', Math.abs(c.hp - h0 - base * 2) < 0.01, fmt(c.hp - h0, 2));
      const qh = Object.assign({}, D1, { chest: 202502 }); Game.start('dummy', { count: 1, hp: 3000, def: 50, gear: qh });
      T.ok('퀸 오브 하트: 체력 재생 +100%', Math.abs(Game.player.regen - base * 2) < 1e-9, fmt(Game.player.regen, 3));
      const G0 = Builds.resolveAI('nadine', 'late', 0); T.ok('AI 장비: 현자의 로브 궁 쿨감 20', G0.ultCdr === 20);
      Game.start('duel', { diff: 'normal', motif: 'nadine', enemyBuild: 'late', map: 'basic', rounds: 1, enemyGear: 0 }); const e = Modes.duel.enemy;
      e.cds.R = 10; e.cds.Q = 10; e.cdTick(1); const rq = 10 - e.cds.Q, rr = 10 - e.cds.R;
      T.ok('AI 궁 쿨감: R만 20%p 더 빨리 돎', e.ultCdrAi === 20 && Math.abs(rr - rq - 0.2) < 1e-9, fmt(rq, 2) + '/' + fmt(rr, 2));
      T.ok('AI 체력 재생 = 나딘 기본값', Math.abs(e.regen - Builds.regen('nadine', CONFIG.rangedAI.stages.late.level)) < 1e-9 && e.regen > 0);
      reset(); Settings.character = 'cathy'; Settings.weapon = 'dagger'; Settings.build = 'late';
    }
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
    // 나머지 고유 효과 16종 (허수아비 방어 0)
    {
      const setup = (w, gear) => { Settings.weapon = w; Game.start('dummy', { count: 1, hp: 20000, def: 0, infinite: true, seed: 3, gear }); run(5); const q = Game.player, dd = Game.units.find(u => u.kind === 'dummy'); q.pos = { x: dd.pos.x - 1.2, y: dd.pos.y }; run(2); return [q, dd]; };
      const dm = k => Stats.dmgBy[k] || 0, res = [];
      let [q, dd] = setup('dagger', { weapon: 101401 }); Cmd.attack(dd); run(60); res.push(['충전 - 섬광', dd.slows.length > 0 && q.flashCd > 0]);
      [q, dd] = setup('dagger', { weapon: 101405 }); q.pos = { x: dd.pos.x - 12, y: dd.pos.y }; run(1); Cmd.move({ x: dd.pos.x - 1.2, y: dd.pos.y }); run(420); const st = q.steps; Cmd.attack(dd); run(120);
      res.push(['가벼운 발걸음', st > 10 && Math.abs(dm('가벼운 발걸음') - 100 * st / 100) < 0.5 && q.steps < st]);
      [q, dd] = setup('dagger', { weapon: 101502 }); const ad0 = q.ad; Cmd.attack(dd); run(360); res.push(['신속 - 루드라의 단검', q.rudraCd > 0 && (q.rudraT > 0 ? Math.abs(q.ad - ad0 * 1.12) < 0.01 : q.ad === ad0)]);
      [q, dd] = setup('dual', { weapon: 103503 }); Cmd.attack(dd); run(300); res.push(['현란함', q.dazzleN >= 1 && q.msBuffs.some(m => m.tag === 'dazzle')]);
      [q, dd] = setup('dagger', { head: 201505 }); Cmd.attack(dd); run(500); res.push(['포톤 런처', dm('포톤 런처') > 0]);
      [q, dd] = setup('dagger', { head: 201526 }); for (const k of ['Q', 'W', 'E']) { q.skills[k].cd = 0; Cmd.skill(k, dd.pos); run(90); } res.push(['예열 - 증강', q.warmN >= 2]);
      [q, dd] = setup('dagger', { arm: 203413 }); const as0 = q.atkSpd(); Cmd.attack(dd); run(60); res.push(['열정 - 순환', dm('열정 - 순환') > 0 && Math.abs(q.atkSpd() / as0 - 1.15) < 1e-6]);
      [q, dd] = setup('dagger', { chest: 202518 }); Cmd.attack(dd); run(600); res.push(['돌풍', dm('돌풍') > 0]);
      [q, dd] = setup('dagger', { chest: 202526 }); q.skills.R.cd = 0; Cmd.skill('R', dd.pos); run(240); res.push(['차원 균열', dm('차원 균열') > 0]);
      [q, dd] = setup('dagger', { chest: 202209 }); q.shield = 0; run(120 * 8); const lvq = q.build.level; res.push(['명경지수', q.shield > 0 && q.shield <= 50 + 10 * lvq + q.sp * 0.4 + 1e-6]);
      [q, dd] = setup('dagger', { chest: 202502 }); for (const k of ['Q', 'W']) { q.skills[k].cd = 0; Cmd.skill(k, dd.pos); run(60); } run(240); res.push(['응집', q.cohCd > 0]);
      [q, dd] = setup('dagger', { head: 201701 }); const sp0 = q.sp; Cmd.attack(dd); run(40); res.push(['개시', q.sp === sp0 + 16 && q.onsetT > 0]);
      [q, dd] = setup('dagger', { arm: 205406 }); q.skills.D.cd = 0; Cmd.skill('D', dd.pos); run(120); res.push(['달인', Math.abs(dm('달인') - (40 + q.sp * 0.25 + 2 * q.build.level)) < 0.5]);
      [q, dd] = setup('dagger', { leg: 204409 }); Combat.damage(dd, q, 1, { type: 'true' }); Combat.damage(q, dd, 1, { type: 'true' }); run(300); res.push(['격동', dm('격동') > 0]);
      [q, dd] = setup('dagger', { leg: 204511 }); q.skills.R.cd = 0; Cmd.skill('R', dd.pos); run(60); res.push(['각성', Math.abs(q.penPct - 0.1) < 1e-9]);
      [q, dd] = setup('dagger', { leg: 204513 }); q.skills.Q.cd = 0; Cmd.skill('Q', dd.pos); run(60); res.push(['순풍', q.msBuffs.some(m => m.tag === 'breeze')]);
      const bad = res.filter(r => !r[1]).map(r => r[0]);
      T.ok('고유 효과 16종 동작', !bad.length && res.length === 16, bad.join(', '));
      T.ok('모든 고유 효과 적용 표시', Object.values(CONFIG.itemPassives).every(p => p.impl));
      Settings.weapon = 'dagger';
    }
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
    Settings.character = 'daniel'; Settings.gearOnBy = {}; T.ok('다니엘: 장비를 켜지 않으면 장비 없음(캐시 장비와 별개)', Builds.current() === null); Settings.character = 'cathy';
    const est = Builds.estimate('late', P.daggerD1.gear, 'dagger'), est0 = Builds.estimate('late', null, 'dagger');
    T.ok('예상 DPS: 같은 값·화면 상태 복구', est > 0 && est0 > 0 && est === Builds.estimate('late', P.daggerD1.gear, 'dagger') && Game.state === 'menu' && Settings.weapon === 'dagger', `${est0} → ${est}`);
    Settings.gearOn = false; Settings.gearSets = null;
    // AI 상대 장비 (결투 옵션 「상대 장비」)
    T.ok('AI 장비 데이터: 5명 × 빌드 3개, 아이템 다 있음', ['aya', 'rio', 'nadine', 'katja', 'daniel'].every(m => { const C = CONFIG.aiGear.characters[m]; return C && C.builds.length === 3 && C.builds.every(b => Builds.SLOTS.every(s => { const it = Builds.aiItem(b.gear[s]); return it && it.slot === s; })); }));
    const ga = Builds.resolveAI('aya', 'late', 0), Ca = CONFIG.aiGear.characters.aya, lvA = CONFIG.rangedAI.stages.late.level;
    T.ok('AI 장비 계산: 레벨 공식·캐릭터 숙련도', ga.hp === Math.round(Ca.base.hp[0] + Ca.base.hp[1] * (lvA - 1)) && ga.as === +Math.min(2.5, (Ca.weaponAs + Ca.base.asBonus) * (1 + Ca.mastery.as * Builds.MASTERY_LV.late + 40 / 100)).toFixed(3), `${ga.hp} ${ga.as}`);
    const gr = Builds.resolveAI('rio', 'late', 0);
    T.ok('AI 장비: 원거리 기본 공격 증폭·치명 상한', gr.aaAmp > 0 && gr.crit <= 1 && gr.sp === 0);
    const late = CONFIG.rangedMotifs.katja, gk = Builds.resolveAI('katja', 'late', 0);
    T.ok('AI 장비: 실측과 같은 범위(공격력 ±15%)', Math.abs(gk.ad - late.ad[2]) / late.ad[2] <= 0.15, `${gk.ad} / ${late.ad[2]}`);
    Settings.character = 'cathy'; Settings.weapon = 'dagger';
    Game.start('duel', { diff: 'normal', motif: 'aya', enemyBuild: 'late', map: 'basic', rounds: 3, enemyGear: 0, seed: 3 }); run(5);
    const ea = Modes.duel.enemy;
    T.ok('AI 장비 적용', ea.gearInfo && ea.ad === ga.ad && ea.sp === ga.sp && ea.as === ga.as && ea.cdrAi === ga.cdr && ea.maxHp === ga.hp);
    { let w = 0; while (Game.freeze > 0 && w++ < 1000) step(); }   // 라운드 시작 배너 동안은 멈춰 있음
    ea.cds.Q = 10; step(); T.ok('AI 장비 쿨감 = 쿨 × 100/(100+쿨감)', Math.abs((10 - ea.cds.Q) - CONFIG.sim.step * (1 + ga.cdr / 100)) < 1e-9);
    Game.start('duel', { diff: 'normal', motif: 'aya', enemyBuild: 'late', map: 'basic', rounds: 3, seed: 3 }); run(5);
    T.ok('AI 장비 없으면 실측', !Modes.duel.enemy.gearInfo && Modes.duel.enemy.ad === CONFIG.rangedMotifs.aya.ad[2]);
    UI.showModeOptions('duel'); T.ok('결투 옵션: 상대 장비', document.querySelectorAll('[data-a="egear"]').length === 4);
    click('[data-a="egear"][data-v="1"]'); T.ok('상대 장비 고르기 → 바로 시작 옵션', Settings.duelEnemyGear === 1 && UI.quickOpts('duel').enemyGear === 1 && /상대 장비 인기 2/.test(UI.quickLabel('duel')));
    click('[data-a="egear"][data-v="-1"]'); T.ok('상대 장비 실측으로', Settings.duelEnemyGear === null && UI.quickOpts('duel').enemyGear === undefined);
    Game.start('duel', { diff: 'normal', motif: 'nadine', enemyBuild: 'late', map: 'basic', rounds: 1, enemyGear: 0, seed: 4 }); run(5); Game.finish('test');
    T.ok('기록은 상대 장비별로', Object.keys(Records.all()).some(k => k.includes('|eg0')));
  });

  // ---------------- 온라인 대전 제거 확인 ----------------
  G('실험체 장비', () => {
    const chars = ['aya', 'rio', 'nadine', 'katja', 'daniel', 'chloe', 'alonso'], e0 = errs.length;
    T.ok('인기 빌드 데이터: 7명 모두 완성 1·2위 + 시작 (dak.gg 12.5)', chars.every(ch => Builds.charHasGear(ch) && CONFIG.aiGear.characters[ch].builds.length === 3 && CONFIG.aiGear.characters[ch].builds.every(b => Builds.SLOTS.every(sl => Builds.aiItem(b.gear[sl])))));
    T.ok('클로에·알론소 빌드(12.5 다이아+)', CONFIG.aiGear.characters.chloe.builds[0].gear.weapon === 113501 && CONFIG.aiGear.characters.alonso.builds[0].gear.weapon === 110502 && CONFIG.aiGear.items[202522].stats.hpLv === 24);
    // 장비 켜기 → 판 옵션(실험체 표시) → 그 능력치로 시작 · 끄면 실측
    const bad = [];
    for (const ch of chars) {
      reset(); Settings.character = ch; Settings.build = 'late'; Settings.gearOnBy = { [ch]: false }; UI.start('dummy', { count: 1, hp: 30000, def: 50, infinite: true }); const a = Game.player;
      if (a.gear || Game.opts.gear) bad.push(ch + ':끔인데 장비');
      Settings.gearOnBy = { [ch]: true }; Settings.charGear = { [ch]: CONFIG.aiGear.characters[ch].builds[0].gear }; UI.start('dummy', { count: 1, hp: 30000, def: 50, infinite: true }); const p = Game.player, G = Builds.resolveGear(ch, 'late', Game.opts.gear);
      if (!(Game.opts.gear && Game.opts.gear.char === ch && p.gear && p.maxHp === G.hp && Math.abs(p.ad - G.ad) < 1e-6 && Math.abs(p.as - G.as) < 1e-6 && Math.abs(p.cdr - G.cdr / 100) < 1e-6)) bad.push(ch + ':적용');
    }
    T.ok('장비 켜면 인기 빌드 능력치로 시작 · 끄면 실측 (7명)', !bad.length, bad.join(','));
    // 탱커 장비: 레벨당 최대 체력 · 기록은 장비별로 따로
    reset(); Settings.character = 'alonso'; Settings.build = 'late'; Settings.gearOnBy = { alonso: true }; Settings.charGear = { alonso: CONFIG.aiGear.characters.alonso.builds[0].gear };
    UI.start('dummy', { count: 1, hp: 30000, def: 50, infinite: true }); const al = Game.player, base = 1000 + 94 * 17;
    T.ok('알론소 장비: 레벨당 체력(드레스 24·투구 16·팔 16) + EOD 100', al.maxHp === base + 100 + (24 + 16 + 16) * 18, al.maxHp);
    // 궁 쿨감(현자의 로브): 플레이어 R 쿨에도
    reset(); Settings.character = 'nadine'; Settings.build = 'late'; Settings.gearOnBy = { nadine: true }; Settings.charGear = { nadine: CONFIG.aiGear.characters.nadine.builds[0].gear }; UI.start('dummy', { count: 1, hp: 30000, def: 50, infinite: true });
    const nd = Game.player; nd.startCd('R'); const rcd = nd.skills.R.cd, base2 = lv(CONFIG.rangedKits.nadine.R.cd, nd.skills.R.lv);
    T.ok('플레이어 R: 궁 쿨감 20 반영', nd.ultCdr === 20 && Math.abs(rcd - base2 * 100 / (100 + nd.cdr * 100 + 20)) < 1e-6, fmt(rcd, 2));
    // 장비 화면: 인기 빌드 버튼 → 켜짐 + 그 조합
    reset(); Settings.character = 'chloe'; Settings.gearOnBy = {}; Settings.charGear = {}; UI.showGear(); click('[data-a="cpre"][data-v="2"]');
    T.ok('장비 화면: 시작(영웅) 버튼 → 장비 켜짐 + 조합', Settings.gearOnBy.chloe === true && Builds.sig(Builds.charGearOf('chloe')) === Builds.sig(CONFIG.aiGear.characters.chloe.builds[2].gear) && !!document.querySelector('[data-in="cgs"]'));
    T.ok('오류 없음', errs.length === e0, errs.slice(e0).join('/'));
    Settings.gearOnBy = {}; Settings.charGear = {}; Settings.character = 'cathy'; UI.showMenu();
  });

  G('온라인 대전 제거', () => {
    reset();
    T.ok('게임 버전이 빌드 때 채워짐', /^[0-9a-f]{8}$/.test(BUILD_ID), BUILD_ID);
    UI.showMenu(); T.ok('메뉴에 온라인 대전 버튼 없음', !document.querySelector('[data-a="online"]') && !/온라인 대전/.test(document.querySelector('#card').innerText));
    T.ok('대전 모드·네트워크 코드 없음', !Modes.pvp && typeof Net === 'undefined' && typeof Rtc === 'undefined' && typeof Snap === 'undefined' && typeof NetLab === 'undefined');
    T.ok('리플레이 명령 검사', Cmd.valid({ t: 'sk', s: 'Q', x: 1, y: 2 }) && Cmd.valid({ t: 'atk', id: 2 }) && !Cmd.valid({ t: 'sk', s: 'Z', x: 1, y: 2 }) && !Cmd.valid({ t: 'move' }) && !Cmd.valid({ t: 'eval' }));
  });

  // ---------------- 3D 렌더러 ----------------
  // 그래픽 품질: 낮음 = 해상도 배율 1 · 그림자 끔 / 자동 = 3D에서 4초 넘게 40fps 아래면 낮음으로
  G('그래픽 품질', () => {
    reset(); Settings.gfxQ = 'low'; Gfx.autoLow = false;
    T.ok('품질 낮음: 해상도 배율 1', Gfx.low() && Gfx.dpr() === 1);
    Settings.gfxQ = 'high'; T.ok('품질 높음', !Gfx.low() && Gfx.dpr() === Math.min(2, devicePixelRatio || 1));
    Settings.gfxQ = 'auto'; Game.start('dummy', { count: 1, hp: 3000, def: 0 }); const m0 = Renderer.mode; Renderer.mode = '3d';
    for (let i = 0; i < 100; i++) Gfx.watch(0.03, 55); const keep = Gfx.low();
    for (let i = 0; i < 100; i++) Gfx.watch(0.03, 30); const early = Gfx.autoLow; for (let i = 0; i < 50; i++) Gfx.watch(0.03, 30); const cut = Gfx.autoLow;
    Renderer.mode = m0; Gfx.autoLow = false;
    T.ok('품질 자동: 프레임이 괜찮으면 유지, 3초는 버티고 4초 넘게 낮으면 낮춤', !keep && !early && cut);
    Settings.gfxQ = 'high'; Renderer.mode = '3d'; for (let i = 0; i < 200; i++) Gfx.watch(0.03, 20); Renderer.mode = m0;
    T.ok('품질 높음 고정이면 자동으로 안 바뀜', !Gfx.autoLow && !Gfx.low());
    Settings.gfxQ = 'auto';
  });

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
      T.ok('쌍검 직접 만든 동작(대각 2연타·X자·대기)', ['dualAA', 'dualX', 'dualIdle'].every(k => r.actions[k] && r.actions[k].getClip().tracks.length > 20) && Math.abs(Models.MELEE.dualAA.hit2 - Models.MELEE.dualAA.hit - 0.12) < 1e-6 && Models.MELEE.dualAA.hit === Motions.CLIPS.DualAA.keys.find(k => k[1].includes('hitR'))[0]);
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
      // 원거리 실험체 4명: 직접 만든 모델·Blender 모델(공용 설계, 여성 뼈대) — 같은 뼈대·동작, 무기는 실험체 무기
      for (const k of ['aya', 'rio', 'nadine', 'katja', 'chloe']) {
        reset(); Settings.character = k; Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2);
        T.ok(k + ' 직접 만든 모델 생성', !!Models.src[k + 'Proc'] && Models.src[k + 'Proc'].design === DESIGNS[k] && DESIGNS[k].rig === 'cathy');
        for (const m of ['proc', 'blend']) {
          if (m === 'blend' && !Models.src[k + 'Blend']) continue;
          Settings.models3dBy = { [k]: m }; Models.ver++; Renderer.frame(); const rr = rigOf(Game.player); let n = 0; rr && rr.obj.traverse(o => { if (o.isSkinnedMesh && o.material.name === m) n++; });
          T.ok(k + ' ' + m + ' 모델(스키닝·사격 동작·무기)', !!rr && n >= 1 && rr.ranged && !!rr.actions.shoot && !!rr.actions.idleGun && !!rr.obj.getObjectByName('WristR').children.find(c => c.type === 'Group') && Models.weaponKind(Game.player, Models.src[k + 'Proc']) === CONFIG.rangedMotifs[k].weapon, 'meshes ' + n);
          if (m === 'blend') T.ok(k + ' Blender 모델 축척 = 원본', Math.abs(Models.src[k + 'Blend'].scale - Models.src.cathy.scale) < 1e-9);
        }
        Settings.models3dBy = {}; Models.ver++; Renderer.frame();
        T.ok(k + ' 기본 = Blender 모델(있으면)', Models.choice(k) === (Models.src[k + 'Blend'] ? 'blend' : 'cc0'));
      }
      // 알론소(근접 탱커, 남성 뼈대): 직접 만든·Blender 모델 · 평타 = 펀치 동작
      { reset(); Settings.character = 'alonso'; Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2);
        T.ok('알론소 직접 만든 모델 생성', !!Models.src.alonsoProc && DESIGNS.alonso.rig === 'male');
        for (const m of ['proc', 'blend']) {
          if (m === 'blend' && !Models.src.alonsoBlend) continue;
          Settings.models3dBy = { alonso: m }; Models.ver++; Renderer.frame(); const ra = rigOf(Game.player);
          T.ok('알론소 ' + m + ' 모델(근접 · 펀치 동작)', !!ra && !ra.ranged && !!ra.actions.stabR && !!ra.actions.stabL && !!ra.actions.run);
        }
        Settings.models3dBy = {}; Models.ver++; Renderer.frame();
      }
      // 니나(클로에 인형): 직접 만든·Blender 모델, 아이 크기로 축소, 휘두를 때 공격 동작
      { reset(); Settings.character = 'chloe'; Game.start('dummy', { count: 1, hp: 3000, def: 50, infinite: true }); run(2); const nn = Game.player.nina;
        T.ok('니나 직접 만든 모델 생성', !!Models.src.ninaProc && DESIGNS.nina.scale < 1 && Models.keyFor(nn) === 'nina');
        for (const m of ['proc', 'blend']) {
          if (m === 'blend' && !Models.src.ninaBlend) continue;
          Settings.models3dBy = { nina: m }; Models.ver++; Renderer.frame(); const rn = rigOf(nn);
          T.ok('니나 ' + m + ' 모델(작게 · 동작)', !!rn && Math.abs(rn.obj.scale.x - Models.src.cathy.scale * DESIGNS.nina.scale) < 1e-6 && !!rn.actions.slash && !!rn.actions.run, rn && fmt(rn.obj.scale.x, 3));
        }
        Settings.models3dBy = {}; Models.ver++; Renderer.frame();
      }
      Settings.character = 'cathy';
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
      // 판 시작 멈칫 제거: 같은 맵이면 맵을 다시 만들지 않음 · 인물 모델은 보관했다 재사용 · 뼈대는 사람당 하나 · 판을 반복해도 GPU 텍스처가 늘지 않음
      const go = () => { Game.start('team', { diff: 'normal', map: 'arena', rounds: 1, seed: 5, sphere: 'final' }); Renderer.frame(); };
      go(); go(); const ground = Render3D.mapGroup.children[0], tex0 = Render3D.gl.info.memory.textures; go(); go();
      T.ok('3D: 같은 맵 다시 시작 → 맵 재사용', Render3D.mapGroup.children[0] === ground);
      T.ok('3D: 판을 반복해도 텍스처가 늘지 않음', Render3D.gl.info.memory.textures <= tex0 + 2, `${tex0} → ${Render3D.gl.info.memory.textures}`);
      let bad = 0; for (const [, m] of Render3D.unitMeshes) { const sk = new Set(); m.traverse(o => { if (o.isSkinnedMesh) sk.add(o.skeleton); }); if (sk.size > 1) bad++; }
      T.ok('3D: 인물 뼈대는 사람당 하나', bad === 0, bad);
      UI.showMenu();
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
