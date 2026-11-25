# Builds arena_game.blend from arena.blend: the venue as the web app shows it (basketball set-up), lit for path-traced rendering.
# Run: blender -b arena.blend --python build_game.py
import bpy, bmesh, os, re, math
from mathutils import Vector

ROOT = os.path.dirname(bpy.data.filepath)
O = bpy.data.objects
sc = bpy.context.scene

# ---------- 1. bring in what the web app adds: court, baskets, courtside, boards, suite seating and decor, the moulded chair ----------
before = set(O.keys())
bpy.ops.import_scene.gltf(filepath=os.path.join(ROOT, 'export', 'addons_game.glb'))
new = [O[n] for n in O.keys() if n not in before]
game = bpy.data.collections.new('Game')
sc.collection.children.link(game)
for ob in new:
    for c in list(ob.users_collection):
        c.objects.unlink(ob)
    game.objects.link(ob)
print('IMPORTED', len(new), sorted(o.name for o in new)[:40])


def principled(m):
    return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None)


# instanced things were merged with a colour per vertex: make their materials use it
for ob in new:
    if ob.type != 'MESH' or not ob.data.color_attributes:
        continue
    for slot in ob.material_slots:
        m = slot.material
        if not m or m.get('vc_done') or m.name.startswith('Game_Steel'):
            continue
        b = principled(m)
        if not b:
            continue
        nt = m.node_tree
        if any(n.type in ('VERTEX_COLOR', 'ATTRIBUTE') for n in nt.nodes):
            m['vc_done'] = 1
            continue
        attr = nt.nodes.new('ShaderNodeVertexColor')
        attr.layer_name = ob.data.color_attributes[0].name
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        src = b.inputs['Base Color'].links[0].from_socket if b.inputs['Base Color'].links else None
        if src:
            nt.links.new(src, mix.inputs[6])
        else:
            mix.inputs[6].default_value = b.inputs['Base Color'].default_value
        nt.links.new(attr.outputs['Color'], mix.inputs[7])
        nt.links.new(mix.outputs[2], b.inputs['Base Color'])
        m['vc_done'] = 1

# the court: lacquered wood
court = bpy.data.materials.get('Game_Court')
if court:
    b = principled(court); b.inputs['Roughness'].default_value = 0.16
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = 0.6; b.inputs['Coat Roughness'].default_value = 0.08

# ---------- 2. the moulded chair replaces the box chair in every seat instance ----------
shell, frame = O.get('ChairHD_Shell'), O.get('ChairHD_Frame')
steel = bpy.data.materials['Seat_Steel']
bpy.ops.object.select_all(action='DESELECT')
shell.select_set(True); frame.select_set(True); bpy.context.view_layer.objects.active = shell
bpy.ops.object.join()
hd = shell.data
for p in hd.polygons:
    p.use_smooth = True
for name, mname in (('Chair_Lower', 'Seat_Lower'), ('Chair_Upper', 'Seat_Upper'), ('Chair_Floor', 'Seat_Floor')):
    ch = O[name]
    me = hd.copy(); me.name = name + '_HD'
    slots = [s.name if s else '' for s in me.materials]
    for i, mn in enumerate(slots):
        me.materials[i] = steel if 'Steel' in mn else bpy.data.materials[mname]
    ch.data = me
shell.hide_render = True; shell.hide_viewport = True
print('CHAIR polys', len(hd.polygons), 'materials', [m.name for m in O['Chair_Lower'].data.materials])

# ---------- 3. basketball set-up: the concert rig, floor seats and the event floor do not render ----------
CONCERT = re.compile(r'^(Stage_|LED_Upstage|LED_IMAG|LED_DeckFront|Backline|Barricade|FOH_|Cable_Ramps|Beam_Cone|Drape_BehindStage|SEATS_FL|SEC_FL|EventFloor$|Haze$)')
hidden = [ob for ob in O if CONCERT.match(ob.name)]
for ob in hidden:
    ob.hide_render = True
print('HIDDEN', len(hidden))
# suite furniture: the web app swaps the stool boxes for chairs; do the same on a render-only copy and keep the original for export
src = O['Suite_Wood_Furniture']
cp = src.copy(); cp.data = src.data.copy(); cp.name = 'Suite_Counters_Render'; game.objects.link(cp)
bm = bmesh.new(); bm.from_mesh(cp.data); bm.verts.ensure_lookup_table()
seen, kill = set(), []
for v in bm.verts:
    if v.index in seen:
        continue
    st, isl = [v], []
    while st:
        a = st.pop()
        if a.index in seen:
            continue
        seen.add(a.index); isl.append(a)
        st.extend(e.other_vert(a) for e in a.link_edges)
    cs = [cp.matrix_world @ a.co for a in isl]
    ext = [max(c[i] for c in cs) - min(c[i] for c in cs) for i in range(3)]
    if ext[0] <= 1 and ext[1] <= 1 and ext[2] <= 1:
        kill.extend(isl)
bmesh.ops.delete(bm, geom=kill, context='VERTS'); bm.to_mesh(cp.data); bm.free()
src.hide_render = True

# ---------- 4. the web look: dark blue structure, palette accents, blue carpet in the suites ----------
def tint(mname, rgb):
    m = bpy.data.materials.get(mname)
    if not m:
        return
    b = principled(m); nt = m.node_tree
    link = b.inputs['Base Color'].links[0] if b.inputs['Base Color'].links else None
    if link:
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        nt.links.new(link.from_socket, mix.inputs[6]); mix.inputs[7].default_value = (*rgb, 1); nt.links.new(mix.outputs[2], b.inputs['Base Color'])
    else:
        c = b.inputs['Base Color'].default_value; b.inputs['Base Color'].default_value = (c[0] * rgb[0], c[1] * rgb[1], c[2] * rgb[2], 1)


tint('AisleConcrete', (0.3, 0.34, 0.6)); tint('ConcourseFloor', (0.3, 0.34, 0.6)); tint('Concrete', (0.55, 0.58, 0.8))
srgb = lambda h: tuple(((c / 255) / 12.92 if c / 255 <= 0.04045 else ((c / 255 + 0.055) / 1.055) ** 2.4) for c in ((h >> 16) & 255, (h >> 8) & 255, h & 255))
for mname, hexc in (('AccentTeal', 0xff9b55), ('NeonCyan', 0xff9b55), ('AccentMagenta', 0xc9349b), ('NeonPink', 0xc9349b), ('RoofHalo', 0x7b208f)):
    m = bpy.data.materials.get(mname)
    if m:
        b = principled(m); b.inputs['Base Color'].default_value = (*srgb(hexc), 1); b.inputs['Emission Color'].default_value = (*srgb(hexc), 1)
carpet = bpy.data.materials['ConcourseFloor'].copy(); carpet.name = 'SuiteCarpet'
cb = principled(carpet)
for l in list(cb.inputs['Base Color'].links):
    carpet.node_tree.links.remove(l)
cb.inputs['Base Color'].default_value = (*srgb(0x2b2f63), 1); cb.inputs['Roughness'].default_value = 0.95
O['Suite_Floor'].data.materials.clear(); O['Suite_Floor'].data.materials.append(carpet)
# neon and screens: light sources, but not so strong that they tint the whole hall
for m in bpy.data.materials:
    if m.use_nodes:
        b = principled(m)
        if b and b.inputs['Emission Strength'].default_value > 3.0:
            b.inputs['Emission Strength'].default_value = 3.0 if 'LED' in m.name else 2.2

# ---------- 5. house lights for rendering: soft panels under the roof, brightest over the court ----------
for ob in O:
    if ob.type == 'LIGHT':
        ob.hide_render = True
lights = bpy.data.collections.new('GameLights'); sc.collection.children.link(lights)


def panel(name, x, y, sx, sy, watts, z=28.6):
    d = bpy.data.lights.new(name, 'AREA'); d.shape = 'RECTANGLE'; d.size = sx; d.size_y = sy
    d.energy = watts; d.color = (1.0, 0.93, 0.84)
    ob = bpy.data.objects.new(name, d); ob.location = (x, y, z); lights.objects.link(ob)   # area lights shine down their -Z by default
    return ob


for i, x in enumerate((-19, 0, 19)):
    panel('House_Court_%d' % i, x, 0, 16, 22, 150000)
for i in range(10):
    a = 2 * math.pi * i / 10
    panel('House_Bowl_%d' % i, 47 * math.cos(a), 36 * math.sin(a), 13, 13, 60000)
for i in range(12):
    a = 2 * math.pi * (i + 0.5) / 12
    panel('House_Upper_%d' % i, 62 * math.cos(a), 50 * math.sin(a), 9, 9, 26000, z=31.5)
bg = sc.world.node_tree.nodes['Background']; bg.inputs['Strength'].default_value = 0.02

# ---------- 6. path tracing ----------
sc.render.engine = 'CYCLES'
prefs = bpy.context.preferences.addons['cycles'].preferences
prefs.compute_device_type = 'METAL'; prefs.get_devices()
for d in prefs.devices:
    d.use = True
sc.cycles.device = 'GPU'; sc.cycles.samples = 64; sc.cycles.use_denoising = True; sc.cycles.use_adaptive_sampling = True; sc.cycles.adaptive_threshold = 0.03
sc.cycles.max_bounces = 6; sc.cycles.diffuse_bounces = 3; sc.cycles.glossy_bounces = 3; sc.cycles.transmission_bounces = 4
sc.cycles.sample_clamp_indirect = 8.0
sc.view_settings.exposure = 0.0
print('VIEW', sc.view_settings.view_transform, sc.view_settings.look, 'DEVICES', [(d.name, d.type, d.use) for d in prefs.devices])

bpy.ops.wm.save_as_mainfile(filepath=os.path.join(ROOT, 'arena_game.blend'))
print('SAVED arena_game.blend')
