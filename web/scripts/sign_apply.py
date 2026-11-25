# Arena3D: fills every plain flat surface with artwork, turns the chairs into blue plastic on steel frames,
# saves the .blend and re-exports the venue GLB. Run: blender -b arena.blend --python sign_apply.py
import bpy, bmesh, math, os, json, shutil
from mathutils import Vector

ROOT = os.path.dirname(bpy.data.filepath)
TEX = os.path.join(ROOT, 'textures', 'signage')
Z = Vector((0, 0, 1))
report = []


def image(fn, folder=TEX, color=True):
    im = bpy.data.images.load(os.path.join(folder, fn), check_existing=True)
    if not color:
        im.colorspace_settings.name = 'Non-Color'
    return im


def sign_mat(name, fn, emit=0.0, rough=0.55, metal=0.0):
    """A material that shows one image, optionally self-lit with the same image."""
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial')
    b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    t = nt.nodes.new('ShaderNodeTexImage')
    t.image = image(fn)
    nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
    b.inputs['Roughness'].default_value = rough
    b.inputs['Metallic'].default_value = metal
    if emit > 0:
        nt.links.new(t.outputs['Color'], b.inputs['Emission Color'])
        b.inputs['Emission Strength'].default_value = emit
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    m.use_backface_culling = False
    return m


def setmat(o, m):
    o.data.materials.clear()
    o.data.materials.append(m)


def uv_layer(me):
    return me.uv_layers.active or me.uv_layers.new(name='UVMap')


def islands(me):
    bm = bmesh.new()
    bm.from_mesh(me)
    bm.faces.ensure_lookup_table()
    seen, out = set(), []
    for f in bm.faces:
        if f.index in seen:
            continue
        stack, isl = [f], []
        while stack:
            a = stack.pop()
            if a.index in seen:
                continue
            seen.add(a.index)
            isl.append(a.index)
            for e in a.edges:
                for g in e.link_faces:
                    if g.index not in seen:
                        stack.append(g)
        out.append(isl)
    bm.free()
    return out


def face_axes(o, p):
    """World-space (right, up-coordinate function) for a polygon, so artwork reads left to right from the side the face looks at."""
    n = (o.matrix_world.to_3x3() @ p.normal).normalized()
    if abs(n.z) < 0.7:
        r = Z.cross(n).normalized()
        return (lambda c: c.dot(r)), (lambda c: c.z), True
    s = 1.0 if n.z > 0 else -1.0
    return (lambda c: c.x), (lambda c: c.y * s), False


def fit_islands(o, cols, rows, pick, min_ratio=0.45, min_area=0.0, vertical_only=False):
    """Each loose part gets one tile of the atlas on its large faces; small faces take a border colour of that tile."""
    me, mw = o.data, o.matrix_world
    uv = uv_layer(me).data
    tw, th = 1.0 / cols, 1.0 / rows
    n_art = 0
    for i, isl in enumerate(islands(me)):
        polys = [me.polygons[k] for k in isl]
        amax = max(p.area for p in polys)
        cen = sum((mw @ p.center for p in polys), Vector()) / len(polys)
        col, row = pick(i, cen)
        u0, v0 = col * tw, 1.0 - (row + 1) * th
        for p in polys:
            fu, fv, vertical = face_axes(o, p)
            art = p.area >= min_ratio * amax and amax >= min_area and (vertical or not vertical_only)
            if not art:
                for li in p.loop_indices:
                    uv[li].uv = (u0 + 0.035 * tw, v0 + 0.035 * th)
                continue
            cs = [mw @ me.vertices[me.loops[li].vertex_index].co for li in p.loop_indices]
            us, vs = [fu(c) for c in cs], [fv(c) for c in cs]
            ua, ub, va, vb = min(us), max(us), min(vs), max(vs)
            for li, a, b in zip(p.loop_indices, us, vs):
                uv[li].uv = (u0 + tw * (0.004 + 0.992 * (a - ua) / max(1e-6, ub - ua)), v0 + th * (0.004 + 0.992 * (b - va) / max(1e-6, vb - va)))
            n_art += 1
    return n_art


def tile_box(o, sx, sy):
    """Repeat a texture over every face: one copy per sx by sy metres."""
    me, mw = o.data, o.matrix_world
    uv = uv_layer(me).data
    for p in me.polygons:
        fu, fv, _ = face_axes(o, p)
        for li in p.loop_indices:
            c = mw @ me.vertices[me.loops[li].vertex_index].co
            uv[li].uv = (fu(c) / sx, fv(c) / sy)


def band(o, tile_len, v0=0.0, v1=1.0):
    """A strip that runs round the building: the image repeats along its length, and fills its height."""
    me, mw = o.data, o.matrix_world
    uv = uv_layer(me).data
    cs = [mw @ v.co for v in me.vertices]
    rx = max(abs(c.x) for c in cs)
    ry = max(abs(c.y) for c in cs)
    za, zb = min(c.z for c in cs), max(c.z for c in cs)
    perim = math.pi * (3 * (rx + ry) - math.sqrt((3 * rx + ry) * (rx + 3 * ry)))
    reps = max(1, round(perim / tile_len))
    ang = lambda c: math.atan2(c.y / ry, c.x / rx)
    # which way does the angle run for someone facing the wall? decide from the first upright face
    sign = 1.0
    for p in me.polygons:
        n = (mw.to_3x3() @ p.normal).normalized()
        if abs(n.z) < 0.5:
            r = Z.cross(n)
            c = mw @ p.center
            sign = 1.0 if (ang(c + r * 0.05) - ang(c)) > 0 else -1.0
            break
    for p in me.polygons:
        ts = [ang(cs[me.loops[li].vertex_index]) for li in p.loop_indices]
        if max(ts) - min(ts) > math.pi:
            ts = [t + 2 * math.pi if t < 0 else t for t in ts]
        for li, t in zip(p.loop_indices, ts):
            z = cs[me.loops[li].vertex_index].z
            uv[li].uv = (sign * t / (2 * math.pi) * reps, v0 + (v1 - v0) * (z - za) / max(1e-6, zb - za))
    return reps


def note(surface, what):
    report.append((surface, what))


O = bpy.data.objects

# ---------- signs and boards: one piece of artwork per panel ----------
seats = json.load(open(os.path.join(ROOT, 'export', 'seats.json')))
ids = [s['id'] for s in seats['sections'] if s['level'] != 'FLOOR']
sec_pos = {}
for sid in ids:
    ob = O.get('SEC_' + sid)
    if ob:
        bb = [ob.matrix_world @ Vector(c) for c in ob.bound_box]
        sec_pos[sid] = sum(bb, Vector()) / 8


def nearest_section(i, cen):
    lower = cen.z < 20
    best = min((sid for sid in sec_pos if (sid[0] == '1') == lower), key=lambda sid: (sec_pos[sid].xy - cen.xy).length)
    k = ids.index(best)
    return k % 8, k // 8


o = O['SecSign_Panels']; setmat(o, sign_mat('Sig_Sections', 'sig_sections.png', emit=1.6))
n = fit_islands(o, 8, 8, nearest_section); note('Section sign panels (58, were plain cyan)', 'Lit signs with each section\'s own number, level and an arrow')
o = O['ExitSigns']; setmat(o, sign_mat('Sig_Exit', 'sig_exit.png', emit=3.0))
fit_islands(o, 1, 1, lambda i, c: (0, 0)); note('Exit signs (58, were plain green)', 'EXIT lettering with an arrow')
o = O['Menu_Boards']; setmat(o, sign_mat('Sig_Menus', 'sig_menus.png', emit=1.6))
fit_islands(o, 4, 2, lambda i, c: (i % 4, (i // 4) % 2)); note('Concession menu boards (18, were plain pink)', 'Eight menus for invented stands: Taco Tide, Slice Harbor, Frozen Pelican, Dockside Drip, Bayfront Grill, Fizzberg Bar, Koala Krunch, Team Store')
rafter = sign_mat('Sig_Rafter', 'sig_rafter.png', emit=0.25, rough=0.8)
for name, off in (('Rafter_Banners_A', 0), ('Rafter_Banners_B', 3), ('Rafter_Banners_C', 5)):
    o = O[name]; setmat(o, rafter); fit_islands(o, 8, 1, lambda i, c, off=off: ((i + off) % 8, 0))
note('Rafter banners (28, were plain pink, cyan and white)', 'Eight hanging banner designs: Home Court, retired numbers, Season Opener, Bay Nights and others')
facade = sign_mat('Sig_Facade', 'sig_facade.png', emit=0.6, rough=0.7)
o = O['Banner_Crimson']; setmat(o, facade); fit_islands(o, 10, 1, lambda i, c: ((i * 2) % 10, 0))
o = O['Banner_Navy']; setmat(o, facade); fit_islands(o, 10, 1, lambda i, c: ((i * 2 + 1) % 10, 0))
note('Outside facade banners (20, were plain pink and cyan)', 'Tall banners alternating event lines with invented partners (Fizzberg, Otterline, Sundial Trust, Voltara, Taco Tide)')
o = O['Vom_Portals']; setmat(o, sign_mat('Sig_Tunnel', 'sig_tunnel.png', emit=0.5, rough=0.8))
fit_islands(o, 1, 1, lambda i, c: (0, 0), vertical_only=True); note('Tunnel entrances (26, were plain black)', 'A lit passage with an overhead CONCOURSE sign and a hazard strip')
o = O['Lobby_Glow']; setmat(o, sign_mat('Sig_Mural', 'sig_mural.png', emit=1.2))
fit_islands(o, 1, 1, lambda i, c: (0, 0)); note('Lobby wall behind the entrance glass (was plain pink)', 'A sunset-over-the-bay mural with WELCOME TO BAYFRONT ARENA')
o = O['Suite_Partitions']; setmat(o, sign_mat('Sig_Suite', 'sig_suite.png', emit=0.35, rough=0.6))
fit_islands(o, 4, 2, lambda i, c: (i % 4, (i // 4) % 2), min_area=5.0); note('Suite dividing walls (were flat dark slabs)', 'Timber panelling with light washing down from above, shade at the floor, a framed print and the suite number')

# ---------- strips that run round the building ----------
o = O['Suite_BackWall']; setmat(o, sign_mat('Sig_SuiteWall', 'sig_suitewall.png', emit=0.45, rough=0.6))
band(o, 9.2); note('Suite back wall (was a flat orange glow)', 'Slatted timber with a cone of light from each ceiling fitting, shading into the corners and down to a skirting')
o = O['Suite_Ceiling']; setmat(o, sign_mat('Sig_SuiteCeiling', 'sig_suiteceiling.png', emit=0.8, rough=0.8))
tile_box(o, 2.4, 2.4); note('Suite ceiling (was a flat orange glow)', 'Dark acoustic tiles with recessed downlights')
o = O['Suite_Rail']; setmat(o, sign_mat('Sig_Ads', 'sig_ads.png', emit=0.9, rough=0.5))
band(o, 20.0, v0=0.5, v1=1.0); note('Suite fascia band facing the bowl', 'A run of boards for invented sponsors: Palmojo, Fizzberg, Nimblo, Otterline')
o = O['Conc_Wall_Stripe']; setmat(o, sign_mat('Sig_Wayfinding', 'sig_wayfinding.png', emit=0.8))
band(o, 16.0); note('Concourse wall stripe (was plain pink)', 'A wayfinding band: Sections, Food Hall, Restrooms, Team Store, with arrows')
o = O['Concourse_Glow']; setmat(o, sign_mat('Sig_Ticker', 'sig_ticker.png', emit=2.0))
band(o, 16.0); note('Upper concourse light band (was plain pink)', 'A dot-matrix ticker with house messages and sponsor names')

# ---------- repeating surfaces ----------
grille = sign_mat('Sig_Grille', 'sig_grille.png', rough=0.6, metal=0.3)
for name in ('Backline', 'House_Speakers', 'Stage_PA', 'Stage_Fixtures'):
    setmat(O[name], grille); tile_box(O[name], 1.0, 1.0)
note('Speaker cabinets: house, stage PA, backline, lighting fixtures (were plain black)', 'Perforated steel grilles with an ORCA AUDIO badge')
rig = sign_mat('Sig_RigPanel', 'sig_rigpanel.png', rough=0.55, metal=0.4)
for name in ('Catwalks', 'LED_IMAG_Frame_-1', 'LED_IMAG_Frame_1', 'LED_Upstage_Frame', 'Marquee_Frame', 'Scoreboard_Core', 'Scoreboard_Frame', 'Street_Poles', 'Cam_Platforms'):
    setmat(O[name], rig); tile_box(O[name], 4.0, 2.0)
note('Camera decks, catwalks, screen and scoreboard housings, marquee frame, street poles (were plain black)', 'Riveted sheet-metal panels stencilled BAYFRONT ARENA RIGGING and CAMERA DECK, with hazard chevrons')
case = sign_mat('Sig_Case', 'sig_case.png', rough=0.5, metal=0.2)
for ob in [x for x in O if x.type == 'MESH' and x.material_slots and x.material_slots[0].material and x.material_slots[0].material.name == 'FOH_Riser']:
    setmat(ob, case); tile_box(ob, 1.2, 1.2)
note('Mixing desk, riser and tent (were plain black)', 'Flight-case panels with alloy edges and FRONT OF HOUSE stencils')
drape = sign_mat('Sig_Drape', 'sig_drape.png', rough=0.95)
for ob in [x for x in O if x.type == 'MESH' and x.material_slots and x.material_slots[0].material and x.material_slots[0].material.name == 'StageSkirt']:
    setmat(ob, drape); tile_box(ob, 4.0, 2.0)
note('Stage skirts, wings and canopy (were plain black)', 'Pleated drape with a step-and-repeat of NEON NIGHTS TOUR and BAY NIGHTS LIVE')
o = O['Cable_Ramps']; setmat(o, sign_mat('Sig_Hazard', 'sig_hazard.png', rough=0.7)); tile_box(o, 2.0, 1.0)
note('Cable ramps (were plain black)', 'Yellow hazard chevrons and CABLE CROSSING')
o = O['Barricade']; setmat(o, sign_mat('Sig_Barricade', 'sig_barricade.png', rough=0.35, metal=0.8)); tile_box(o, 8.0, 1.1)
note('Crowd barricade (was plain steel)', 'Brushed panels with a BAYFRONT ARENA EVENT STAFF ONLY strip')
o = O['Lobby_Canopy_Soffit']; setmat(o, sign_mat('Sig_Soffit', 'sig_soffit.png', emit=0.7, rough=0.6)); tile_box(o, 4.0, 4.0)
note('Entrance canopy underside (was plain pink)', 'Timber slats with recessed strip lights')

# ---------- chairs: blue moulded plastic on steel frames ----------
plastic_n = image('plastic010_nor_gl_1k.jpg', os.path.join(ROOT, 'textures'), color=False)


def plastic(name, rgb):
    m = bpy.data.materials.get(name) or bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new('ShaderNodeOutputMaterial'); b = nt.nodes.new('ShaderNodeBsdfPrincipled')
    b.inputs['Base Color'].default_value = (*rgb, 1); b.inputs['Roughness'].default_value = 0.32; b.inputs['Metallic'].default_value = 0.0
    if 'Coat Weight' in b.inputs:
        b.inputs['Coat Weight'].default_value = 0.25; b.inputs['Coat Roughness'].default_value = 0.15
    co = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (6, 6, 6)
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = plastic_n; t.projection = 'BOX'
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = 0.6
    nt.links.new(co.outputs['Object'], mp.inputs[0]); nt.links.new(mp.outputs[0], t.inputs[0]); nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs[0], b.inputs['Normal'])
    nt.links.new(b.outputs['BSDF'], out.inputs['Surface'])
    return m


steel = bpy.data.materials.get('Seat_Steel') or bpy.data.materials.new('Seat_Steel')
steel.use_nodes = True
sb = steel.node_tree.nodes['Principled BSDF']
sb.inputs['Base Color'].default_value = (0.78, 0.8, 0.84, 1); sb.inputs['Metallic'].default_value = 1.0; sb.inputs['Roughness'].default_value = 0.24
for name, mname, rgb in (('Chair_Lower', 'Seat_Lower', (0.012, 0.115, 0.74)), ('Chair_Upper', 'Seat_Upper', (0.028, 0.19, 0.87)), ('Chair_Floor', 'Seat_Floor', (0.017, 0.093, 0.58))):
    ch = O[name]
    setmat(ch, plastic(mname, rgb))
    ch.data.materials.append(steel)
    for p in ch.data.polygons:
        p.material_index = 1 if p.center.z < 0.37 else 0
note('Chairs', 'Blue moulded plastic shells (slightly glossy, fine grain) on brushed-steel legs and frames')

# ---------- save, then export exactly the objects the web GLB already carries ----------
backup = os.path.join(ROOT, 'arena.pre-signage.blend')
if not os.path.exists(backup):
    shutil.copy2(bpy.data.filepath, backup)
bpy.ops.wm.save_mainfile()

names = set(json.load(open(os.environ['GLB_NODES'])))
bpy.ops.object.select_all(action='DESELECT')
sel = 0
for ob in bpy.context.view_layer.objects:
    if ob.name in names:
        ob.hide_set(False); ob.select_set(True); sel += 1
print('EXPORT selecting', sel, 'of', len(names))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'export', 'arena_venue.glb'), export_format='GLB', use_selection=True, export_apply=True,
                          export_extras=True, export_yup=True, export_cameras=False, export_lights=False)
json.dump(report, open(os.environ['REPORT'], 'w'), indent=1)
print('DONE', len(report), 'surface groups')
