// 직접 만든 모델(models/<키>_custom.glb)에서 동작(animations)과 그것만 쓰던 데이터를 빼서 파일을 줄임
// 게임은 이 파일에서 모양(메시·음영·뼈 가중치)만 가져오고 동작은 원본 CC0 파일 것을 씀 (src/6_y_procgen.js rebind)
// 사용: node tools/strip_glb_anim.js models/chloe_custom.glb [...]   (제자리에서 고쳐 씀, 이미 동작이 없으면 그대로)
const fs = require('fs');
const pad4 = n => (n + 3) & ~3;
for (const file of process.argv.slice(2)) {
  const b = fs.readFileSync(file);
  if (b.readUInt32LE(0) !== 0x46546c67) throw new Error(file + ': GLB가 아님');
  const jl = b.readUInt32LE(12), J = JSON.parse(b.slice(20, 20 + jl).toString('utf8'));
  const binStart = 20 + jl + 8, bin = b.slice(binStart, binStart + b.readUInt32LE(20 + jl));
  if (!(J.animations || []).length) { console.log(file, '동작 없음 — 그대로'); continue; }
  delete J.animations;
  // 남은 참조로 쓰는 accessor 모으기
  const usedAcc = new Set(), keep = k => { if (k != null) usedAcc.add(k); };
  for (const m of J.meshes || []) for (const p of m.primitives) {
    for (const k of Object.values(p.attributes)) keep(k); keep(p.indices);
    for (const t of p.targets || []) for (const k of Object.values(t)) keep(k);
  }
  for (const s of J.skins || []) keep(s.inverseBindMatrices);
  const accMap = new Map(), accs = [];
  (J.accessors || []).forEach((a, i) => { if (usedAcc.has(i)) { accMap.set(i, accs.length); accs.push(a); } });
  // 쓰는 bufferView만 새 버퍼로 다시 담기
  const usedBv = new Set(accs.map(a => a.bufferView).filter(v => v != null));
  for (const im of J.images || []) if (im.bufferView != null) usedBv.add(im.bufferView);
  const bvMap = new Map(), bvs = [], parts = []; let off = 0;
  J.bufferViews.forEach((v, i) => {
    if (!usedBv.has(i)) return;
    const data = bin.slice(v.byteOffset || 0, (v.byteOffset || 0) + v.byteLength), start = pad4(off);
    if (start > off) parts.push(Buffer.alloc(start - off));
    parts.push(data); off = start + data.length;
    bvMap.set(i, bvs.length); bvs.push(Object.assign({}, v, { byteOffset: start }));
  });
  for (const a of accs) if (a.bufferView != null) a.bufferView = bvMap.get(a.bufferView);
  for (const im of J.images || []) if (im.bufferView != null) im.bufferView = bvMap.get(im.bufferView);
  const re = k => k == null ? k : accMap.get(k);
  for (const m of J.meshes || []) for (const p of m.primitives) {
    for (const n of Object.keys(p.attributes)) p.attributes[n] = re(p.attributes[n]);
    if (p.indices != null) p.indices = re(p.indices);
    for (const t of p.targets || []) for (const n of Object.keys(t)) t[n] = re(t[n]);
  }
  for (const s of J.skins || []) if (s.inverseBindMatrices != null) s.inverseBindMatrices = re(s.inverseBindMatrices);
  J.accessors = accs; J.bufferViews = bvs;
  const newBin = Buffer.concat(parts.concat(Buffer.alloc(pad4(off) - off))); J.buffers = [{ byteLength: newBin.length }];
  let js = Buffer.from(JSON.stringify(J), 'utf8'); js = Buffer.concat([js, Buffer.alloc(pad4(js.length) - js.length, 0x20)]);
  const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 8 + js.length + 8 + newBin.length, 8);
  const ch = (len, type) => { const c = Buffer.alloc(8); c.writeUInt32LE(len, 0); c.writeUInt32LE(type, 4); return c; };
  const out = Buffer.concat([head, ch(js.length, 0x4e4f534a), js, ch(newBin.length, 0x004e4942), newBin]);
  fs.writeFileSync(file, out);
  console.log(file, b.length, '→', out.length, `(${Math.round(out.length / b.length * 100)}%)`);
}
