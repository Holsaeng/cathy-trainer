// 캐시 수련장 빌드: src/ 조각들을 순서대로 합쳐 cathy_trainer.html 생성 + 스크립트 문법 검사
// 사용법: node build.js
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SRC = path.join(__dirname, 'src');
const OUT = path.join(__dirname, 'cathy_trainer.html');
const parts = fs.readdirSync(SRC).filter(f => /^\d+_/.test(f)).sort();

const html = parts.map(f => fs.readFileSync(path.join(SRC, f), 'utf8')).join('');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) { console.error('✗ <script> 블록을 찾지 못했습니다'); process.exit(1); }
try {
  new vm.Script(m[1], { filename: 'cathy_trainer.html' });
} catch (e) {
  console.error('✗ 문법 오류:', e.message);
  process.exit(1);
}
fs.writeFileSync(OUT, html);
console.log(`✓ ${parts.length}개 조각 → cathy_trainer.html (${(html.length / 1024).toFixed(0)} KB)`);
parts.forEach(f => console.log('  - src/' + f));
