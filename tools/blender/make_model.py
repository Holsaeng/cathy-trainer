# 직접 만든 캐릭터 3D 모델 생성 — Blender Python 스크립트 (방법 2)
#
# 실행 (Blender 4.x ~ 5.x, 화면 없이):
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/blender/make_model.py -- cathy
#   "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe" -b -P tools/blender/make_model.py -- daniel
#   또는: bash tools/blender/run.sh            (전부)
# 결과:
#   local/<키>_custom.glb           게임이 이 PC에서만 자동으로 읽음 (깃 제외) (설정 → 그래픽 → <실험체> 3D 모델 → Blender 모델)
#   tools/blender/preview_<키>.png  정면·측면·뒷면 미리보기 렌더
#
# 설계는 게임과 공용인 src/6_y_designs.js (DESIGNS) 를 그대로 읽음 → 게임의 「직접 만든 모델」과 같은 모양.
# 뼈대·애니메이션은 CC0 모델(models/*_base.glb)의 것을 그대로 쓰므로 게임의 평타 동기화·쌍검·스킬 동작이 그대로 돌아감.
# 도형 생성식·좌우 대칭·회전 순서·가중치 규칙은 src/6_y_procgen.js 와 같음 (한쪽을 고치면 다른 쪽도 맞출 것).
# 좌표: 게임 모델 좌표(m, 위 +Y · 정면 +Z · 왼손 쪽 +X). G()가 Blender 좌표(Z 위, -Y 정면)로 바꿈.
# IP 기준선: 일반 요소만 사용, 원본 고유 디자인 요소는 넣지 않음 (README 「IP 기준선」).

import bpy, bmesh, os, re, sys, json, math
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
RIG_FILES = {'cathy': 'cathy_base.glb', 'male': 'daniel_base.glb', 'ranged': 'ranged_base.glb'}

argv = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
KEY = argv[0] if argv else 'cathy'

# ---------------------------------------------------------------- 설계 읽기 (JS 파일 안의 순수 JSON)
src = open(os.path.join(ROOT, 'src', '6_y_designs.js'), encoding='utf-8').read()
body = src[src.index('const DESIGNS = ') + len('const DESIGNS = '):]
body = body[:body.rindex('}') + 1]
DESIGNS = json.loads(body)
if KEY not in DESIGNS: sys.exit('설계 없음: ' + KEY)
D = DESIGNS[KEY]
SRC = os.path.join(ROOT, 'models', RIG_FILES[D['rig']])
OUT = os.path.join(ROOT, 'local', KEY + '_custom.glb')   # 깃 제외 — IP 정책 확인 전까지 3D 모델 데이터는 온라인 배포 안 함
os.makedirs(os.path.dirname(OUT), exist_ok=True)
PREVIEW = os.path.join(HERE, 'preview_' + KEY + '.png')

def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4

def material(key):
    name = KEY + '_' + key
    if name in bpy.data.materials: return bpy.data.materials[name]
    h = D['colors'][key].lstrip('#'); rgb = [srgb_to_linear(int(h[i:i + 2], 16) / 255) for i in (0, 2, 4)]
    m = bpy.data.materials.new(name)
    try: m.use_nodes = True
    except Exception: pass
    bsdf = m.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (*rgb, 1)
    bsdf.inputs['Roughness'].default_value = 0.78
    return m

# ---------------------------------------------------------------- 뼈대 준비
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)
arm = next(o for o in bpy.context.scene.objects if o.type == 'ARMATURE')
for o in list(bpy.context.scene.objects):
    if o.type == 'MESH': bpy.data.objects.remove(o, do_unlink=True)
arm.data.pose_position = 'REST'   # T자세(바인드 자세)에서 모양을 만듦
bpy.context.view_layer.update()

def bl(name):   # 설계 뼈 이름(UpperArmL) → Blender 뼈 이름(UpperArm.L)
    return re.sub(r'^(Shoulder|UpperArm|LowerArm|Wrist|UpperLeg|LowerLeg|Foot)([LR])$', r'\1.\2', name)

def bone_world(name):
    return arm.matrix_world @ arm.data.bones[bl(name)].head_local

F = bone_world('Head').z / {'cathy': 1.457, 'male': 1.452}.get(D['rig'], 1.457)   # 게임 m → Blender 단위
def G(v): return Vector((v[0] * F, -v[2] * F, v[1] * F))
def BP(name):   # 뼈 위치(게임 좌표)
    w = bone_world(name); return [w.x / F, w.z / F, -w.y / F]

# ---------------------------------------------------------------- 도형 생성 (src/6_y_procgen.js 와 같은 식, 게임 좌표)
def rot3(v, r):   # 오일러 XYZ — Three.js 'XYZ'와 같게 R = Rx·Ry·Rz
    if not r: return v
    M = Matrix.Rotation(r[0], 3, 'X') @ Matrix.Rotation(r[1], 3, 'Y') @ Matrix.Rotation(r[2], 3, 'Z')
    q = M @ Vector(v); return [q.x, q.y, q.z]

def g_sphere(c, s, sg, ang, r):
    w, h = sg; p0, pl, t0, tl = [x * math.pi for x in (ang or [0, 2, 0, 1])]; v = []; f = []
    for iy in range(h + 1):
        for ix in range(w + 1):
            ph = p0 + ix / w * pl; th = t0 + iy / h * tl
            q = rot3([-math.cos(ph) * math.sin(th) * s[0], math.cos(th) * s[1], math.sin(ph) * math.sin(th) * s[2]], r)
            v.append([q[0] + c[0], q[1] + c[1], q[2] + c[2]])
    idx = lambda ix, iy: iy * (w + 1) + ix
    for iy in range(h):
        for ix in range(w):
            a, b, cc, d = idx(ix + 1, iy), idx(ix, iy), idx(ix, iy + 1), idx(ix + 1, iy + 1)
            f += [(a, b, d), (b, cc, d)]
    return v, f

def g_tube(a, b, r0, r1, n, rings, over):
    A, B = Vector(a), Vector(b); d = B - A
    if over: A, B = A - d * over / 2, B + d * over / 2; d = B - A
    L = d.length; q = Vector((0, 1, 0)).rotation_difference(d.normalized()); v = []; f = []
    for j in range(rings + 1):
        t = j / rings; r = r0 + (r1 - r0) * t; y = t * L
        for i in range(n):
            th = i / n * math.tau; p = q @ Vector((r * math.sin(th), y, r * math.cos(th))) + A; v.append([p.x, p.y, p.z])
    for j in range(rings):
        for i in range(n):
            i2 = (i + 1) % n; a0, a1, b0, b1 = j * n + i, j * n + i2, (j + 1) * n + i, (j + 1) * n + i2
            f += [(a0, a1, b0), (a1, b1, b0)]
    c0 = len(v); v.append([A.x, A.y, A.z]); c1 = len(v); v.append([B.x, B.y, B.z])
    for i in range(n):
        i2 = (i + 1) % n; f += [(c0, i2, i), (c1, rings * n + i, rings * n + i2)]
    return v, f

def g_lathe(prof, cz, zs, n, p):
    p0, pl = [x * math.pi for x in (p or [0, 2])]; m = len(prof); v = []; f = []
    for i in range(n + 1):
        ph = p0 + i / n * pl
        for (r, y) in prof: v.append([r * math.sin(ph), y, r * math.cos(ph) * zs + cz])
    for i in range(n):
        for j in range(m - 1):
            a = i * m + j; b = (i + 1) * m + j; c = b + 1; d = a + 1
            f += [(a, b, d), (c, d, b)]
    return v, f

BOX_FACES = [[[1, -1, -1], [1, 1, -1], [1, 1, 1], [1, -1, 1]], [[-1, -1, 1], [-1, 1, 1], [-1, 1, -1], [-1, -1, -1]], [[-1, 1, -1], [-1, 1, 1], [1, 1, 1], [1, 1, -1]],
             [[-1, -1, 1], [-1, -1, -1], [1, -1, -1], [1, -1, 1]], [[-1, -1, 1], [1, -1, 1], [1, 1, 1], [-1, 1, 1]], [[1, -1, -1], [-1, -1, -1], [-1, 1, -1], [1, 1, -1]]]
def g_box(c, s, r):
    v = []; f = []; h = [x / 2 for x in s]
    for fc in BOX_FACES:
        b = len(v)
        for k in fc:
            q = rot3([k[0] * h[0], k[1] * h[1], k[2] * h[2]], r); v.append([q[0] + c[0], q[1] + c[1], q[2] + c[2]])
        f += [(b, b + 1, b + 2), (b, b + 2, b + 3)]
    return v, f

def g_torus(c, R, r, zs, rot, nu=14, nv=5):
    v = []; f = []
    for i in range(nu):
        for j in range(nv):
            u = i / nu * math.tau; w = j / nv * math.tau; rr = R + r * math.cos(w)
            q = rot3([rr * math.cos(u), r * math.sin(w), rr * math.sin(u) * zs], rot); v.append([q[0] + c[0], q[1] + c[1], q[2] + c[2]])
    for i in range(nu):
        for j in range(nv):
            i2 = (i + 1) % nu; j2 = (j + 1) % nv; a, b, cc, d = i * nv + j, i2 * nv + j, i2 * nv + j2, i * nv + j2
            f += [(a, d, b), (b, d, cc)]
    return v, f

# ---------------------------------------------------------------- 설계 펼치기 (좌우 대칭 · 점 위치)
def expand():
    out = []
    for p in D['parts']:
        for side in ([1, -1] if p.get('sym') else [1]):
            sn = 'L' if side > 0 else 'R'; bn = lambda n: n.replace('%', sn); mx = lambda q: [q[0] * side, q[1], q[2]]
            rel = BP(p['rel']) if p.get('rel') else [0, 0, 0]
            def pt(q):
                if isinstance(q, list): v = mx(q); return [v[0] + rel[0], v[1] + rel[1], v[2] + rel[2]]
                b = BP(bn(q['b'])); oo = mx(q.get('o', [0, 0, 0])); v = [b[0] + oo[0], b[1] + oo[1], b[2] + oo[2]]
                for k, val in q.get('set', {}).items(): v['xyz'.index(k)] = val * side if k == 'x' else val
                return v
            r = [p['rot'][0], p['rot'][1] * side, p['rot'][2] * side] if p.get('rot') else None
            t = p['t']
            if t == 'sphere': g = g_sphere(pt(p['at']), p['s'], p.get('seg', [10, 8]), p.get('ang'), r)
            elif t == 'tube': g = g_tube(pt(p['a']), pt(p['b']), p['r'][0], p['r'][1], p.get('seg', 8), p.get('rings', 2), p.get('over', 0))
            elif t == 'lathe': g = g_lathe([[rr, y + rel[1]] for rr, y in p['prof']], p.get('cz', 0) + rel[2], p.get('zs', 1), p.get('n', 12), p.get('p'))
            elif t == 'box': g = g_box(pt(p['at']), p['s'], r)
            elif t == 'torus': g = g_torus(pt(p['at']), p['R'], p['r'], p.get('zs', 1), r)
            else: continue
            out.append({'v': g[0], 'f': g[1], 'c': p['c'], 'w': [bn(x) for x in p['w']], 'skirt': bool(p.get('skirt')), 'open': t == 'lathe' and p.get('p') is not None})
    return out

# ---------------------------------------------------------------- 가중치 (src/6_y_procgen.js mergeSkinned 와 같은 규칙)
TIP = {'Hips': 'Abdomen', 'Abdomen': 'Torso', 'Torso': 'Chest', 'Chest': 'Neck', 'Neck': 'Head'}
for s_ in ('L', 'R'):
    TIP.update({'UpperArm' + s_: 'LowerArm' + s_, 'LowerArm' + s_: 'Wrist' + s_, 'UpperLeg' + s_: 'LowerLeg' + s_, 'Shoulder' + s_: 'UpperArm' + s_})
SEG = {}
def seg(n):
    if n in SEG: return SEG[n]
    a = Vector(BP(n))
    if n in TIP: t = Vector(BP(TIP[n]))
    elif n == 'Head': t = a + Vector((0, 0.24, 0))
    elif n.startswith('Wrist'): t = a + Vector((0.09 if n.endswith('L') else -0.09, 0, 0))
    elif n.startswith('LowerLeg'): t = Vector((a.x, 0.07, a.z - 0.01))
    elif n.startswith('Foot'): t = a + Vector((0, 0, 0.14))
    else: t = a + Vector((0, 0.05, 0))
    SEG[n] = (a, t); return SEG[n]
def dist_seg(p, n):
    a, t = seg(n); ab = t - a; k = max(0.0, min(1.0, (p - a).dot(ab) / max(1e-9, ab.length_squared)))
    return (a + ab * k - p).length
SK = D.get('skirt', {'top': 0.9, 'span': 0.45, 'max': 0.5})

# ---------------------------------------------------------------- 메시 만들기
objs = []
for i, p in enumerate(expand()):
    me = bpy.data.meshes.new('part%d' % i); bm = bmesh.new()
    vs = [bm.verts.new(G(q)) for q in p['v']]
    for tri in p['f']:
        try: bm.faces.new([vs[k] for k in tri])
        except ValueError: pass   # 극점의 겹친 삼각형
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new('part%d' % i, me); bpy.context.scene.collection.objects.link(o)
    o.data.materials.append(material(p['c']))
    if p['open']:   # 앞이 트인 옷 판: 두께
        mod = o.modifiers.new('두께', 'SOLIDIFY'); mod.thickness = 0.007 * F; mod.offset = 0
    # 가중치
    groups = {}
    def grp(n):
        if n not in groups: groups[n] = o.vertex_groups.new(name=bl(n))
        return groups[n]
    for vtx in o.data.vertices:
        w = vtx.co; q = Vector((w.x / F, w.z / F, -w.y / F))
        if p['skirt'] and q.y < SK['top']:
            k = max(0.0, min(1.0, (SK['top'] - q.y) / SK['span'])) * SK['max'] * max(0.0, min(1.0, abs(q.x) / 0.06))
            grp('Hips').add([vtx.index], 1 - k, 'REPLACE')
            if k > 0: grp('UpperLegL' if q.x > 0 else 'UpperLegR').add([vtx.index], k, 'REPLACE')
            continue
        ds = sorted((dist_seg(q, n), n) for n in p['w'])[:2]
        ws = [1 / (d + 0.012) ** 4 for d, _ in ds]; tot = sum(ws)
        for (d, n), wv in zip(ds, ws): grp(n).add([vtx.index], wv / tot, 'REPLACE')
    objs.append(o)

bpy.ops.object.select_all(action='DESELECT')
for o in objs: o.select_set(True)
bpy.context.view_layer.objects.active = objs[0]
bpy.ops.object.convert(target='MESH')        # 두께 모디파이어 적용 (가중치는 그대로 따라감)
bpy.ops.object.join()
body_obj = bpy.context.active_object; body_obj.name = KEY + '_custom'
try: bpy.ops.object.shade_auto_smooth(angle=math.radians(40))
except Exception: bpy.ops.object.shade_smooth()
bpy.ops.object.select_all(action='DESELECT'); body_obj.select_set(True); arm.select_set(True); bpy.context.view_layer.objects.active = arm
bpy.ops.object.parent_set(type='ARMATURE')   # 가중치는 위에서 직접 계산 (자동 가중치는 겹친 부품에서 실패)
arm.data.pose_position = 'POSE'

# ---------------------------------------------------------------- 내보내기
bpy.ops.object.select_all(action='SELECT')
bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_animations=True, export_skins=True, use_selection=False)
print('내보냄:', OUT)

# ---------------------------------------------------------------- 미리보기 렌더 (정면 · 측면 · 뒷면)
scene = bpy.context.scene
for eng in ('BLENDER_EEVEE_NEXT', 'BLENDER_EEVEE', 'BLENDER_WORKBENCH'):
    try: scene.render.engine = eng; break
    except Exception: pass
scene.render.resolution_x, scene.render.resolution_y = 1100, 700
world = bpy.data.worlds.new('w'); scene.world = world
try:
    world.use_nodes = True; world.node_tree.nodes['Background'].inputs[0].default_value = (0.03, 0.035, 0.05, 1)
except Exception: pass
for ang, en in ((50, 3.0), (-60, 1.2)):
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = en
    sun.rotation_euler = (math.radians(50), 0, math.radians(ang)); scene.collection.objects.link(sun)
arm.data.pose_position = 'REST'
for k, rz in ((1, 90), (2, 180)):
    dup = body_obj.copy(); dup.data = body_obj.data.copy(); scene.collection.objects.link(dup)
    dup.rotation_euler.z = math.radians(rz); dup.location.x = 0.62 * F * k
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.location = G([0.62, 1.0, 4.4]); cam.data.lens = 50
look = G([0.62, 0.9, 0]) - cam.location; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = look.to_track_quat('-Z', 'Y')
scene.render.filepath = PREVIEW
bpy.ops.render.render(write_still=True)
print('미리보기:', PREVIEW)
