// 캐시 수련장 빌드: src/ 조각들을 순서대로 합쳐 cathy_trainer.html 생성 + 스크립트 문법 검사
// 사용법: node build.js          → cathy_trainer.html
//         node build.js --test   → + cathy_trainer.test.html (tests/regression.js 포함, 열면 회귀 테스트 자동 실행)
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'cathy_trainer.html');
const parts = fs.readdirSync(SRC).filter(f => /^\d+_/.test(f)).sort();

const check = (code, name) => {
  try { new vm.Script(code, { filename: name }); }
  catch (e) { console.error(`✗ 문법 오류 (${name}):`, e.message); process.exit(1); }
};

let html = parts.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('✗ <script> 블록을 찾지 못했습니다'); process.exit(1); }
check(m[1], 'cathy_trainer.html');
// 게임 버전: 내용 해시 8자리 (온라인 대전 버전 확인용)
html = html.replace("const BUILD_ID = '__BUILD__';", `const BUILD_ID = '${require('crypto').createHash('sha1').update(html).digest('hex').slice(0, 8)}';`);
fs.writeFileSync(OUT, html);
console.log(`✓ ${parts.length}개 조각 → cathy_trainer.html (${(html.length / 1024).toFixed(0)} KB)`);
parts.forEach(f => console.log('  - src/' + f));

if (process.argv.includes('--test')) {
  const test = fs.readFileSync(path.join(__dirname, 'tests', 'regression.js'), 'utf8');
  check(test, 'tests/regression.js');
  const out = html.replace(/<\/body>\s*<\/html>\s*$/, `<script>\n${test}\n</script>\n</body>\n</html>\n`);
  if (out === html) { console.error('✗ </body> 위치를 찾지 못했습니다'); process.exit(1); }
  fs.writeFileSync(path.join(__dirname, 'cathy_trainer.test.html'), out);
  console.log('✓ 테스트 빌드 → cathy_trainer.test.html');
}
