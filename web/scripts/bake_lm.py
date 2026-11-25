# Bakes path-traced light (direct + bounce, with every shadow) for the bowl and concourses into lightmap atlases,
# gives those objects a second UV set for it, and re-exports the venue GLB carrying that UV set.
# Run: blender -b arena_game.blend --python bake_lm.py      (env: OUT = folder for the atlases, GLB_NODES = json list of export names)
import bpy, os, re, json, time
import numpy as np

ROOT = os.path.dirname(bpy.data.filepath)
OUT = os.environ['OUT']
O = bpy.data.objects
sc = bpy.context.scene
RANGE = 2.0      # light values 0..RANGE are stored in the 8-bit atlas
SPP = int(os.environ.get('SPP', '16'))

k = float(os.environ.get('LIGHT_SCALE', '0.045'))
for ob in bpy.data.collections['GameLights'].objects:
    ob.data.energy *= k
sc.render.use_compositing = False

misc = ['Conc_Ceiling_Main', 'Conc_Ceiling_Upper', 'Conc_Columns', 'Concourse_Ground', 'Concourse_Main', 'Concourse_Upper', 'Suite_Floor',
        'Slab_Edges', 'Slab_Edges_U', 'Upper_BackWall', 'Roof_Interior', 'Roof_Interior_Cap', 'Concession_Counters', 'Concession_Stands', 'Vom_Frames']
groups = {
    'A': (4096, sorted(n for n in O.keys() if re.match(r'^(SEC|AISLE)_1\d\d$', n))),
    'B': (4096, sorted(n for n in O.keys() if re.match(r'^(SEC|AISLE)_3\d\d$', n))),
    'C': (4096, [n for n in misc if n in O]),
}
manifest = {}


def select(names):
    bpy.ops.object.select_all(action='DESELECT')
    for n in names:
        O[n].hide_set(False); O[n].select_set(True)
    bpy.context.view_layer.objects.active = O[names[0]]


t0 = time.time()
for key, (size, names) in groups.items():
    # ---- a second UV set, all objects of the group packed into one square ----
    for n in names:
        me = O[n].data
        first = me.uv_layers[0]
        lm = me.uv_layers.get('LM') or me.uv_layers.new(name='LM')
        me.uv_layers.active = lm            # the one being edited and baked to
        first.active_render = True          # the materials keep using the first one
    prev = os.path.join(os.environ.get('PREV', ''), 'lm_%s.png' % key)
    if not os.path.exists(prev):
        select(names)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.smart_project(angle_limit=1.15, island_margin=0.0, area_weight=0.0, correct_aspect=True, scale_to_bounds=False)
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(margin=0.0025, rotate=True)
        bpy.ops.object.mode_set(mode='OBJECT')
    else:
        # Second pass: the first bake shows which faces never see light (undersides, backs, faces buried in the structure).
        # They are parked on one corner texel, and the faces people do see are repacked to fill the whole atlas.
        im = bpy.data.images.load(prev); w = im.size[0]
        px = np.empty(w * w * 4, dtype=np.float32); im.pixels.foreach_get(px); lum = px.reshape(w, w, 4)[:, :, :3].max(axis=2)
        bpy.data.images.remove(im)
        kept = dropped = 0
        for n in names:
            me = O[n].data; uvd = me.uv_layers['LM'].data
            for p in me.polygons:
                pts = [uvd[li].uv.copy() for li in p.loop_indices]
                cx = sum(q.x for q in pts) / len(pts); cy = sum(q.y for q in pts) / len(pts)
                samples = [(cx, cy)] + [(cx + (q.x - cx) * 0.7, cy + (q.y - cy) * 0.7) for q in pts] + [(cx + (q.x - cx) * 0.35, cy + (q.y - cy) * 0.35) for q in pts]
                lit = bool(max(lum[min(w - 1, max(0, int(v * w))), min(w - 1, max(0, int(u * w)))] for u, v in samples) > 0.03)
                p.hide = not lit; p.select = lit
                if lit:
                    kept += 1
                else:
                    dropped += 1
                    for li in p.loop_indices:
                        uvd[li].uv = (0.0004, 0.0004)
        print('REPACK', key, 'kept', kept, 'dropped', dropped, flush=True)
        select(names)
        bpy.ops.object.mode_set(mode='EDIT')
        bpy.ops.mesh.select_all(action='SELECT')      # hidden (dark) faces stay out of it
        bpy.ops.uv.select_all(action='SELECT')
        bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
        bpy.ops.mesh.reveal(select=False)
        bpy.ops.object.mode_set(mode='OBJECT')

    # ---- every material on these objects points its active image node at the atlas ----
    img = bpy.data.images.new('LM_' + key, size, size, alpha=False, float_buffer=True)
    img.generated_color = (0, 0, 0, 1)
    for n in names:
        for slot in O[n].material_slots:
            nt = slot.material.node_tree
            node = nt.nodes.get('LM_TARGET') or nt.nodes.new('ShaderNodeTexImage')
            node.name = 'LM_TARGET'; node.image = img
            for other in nt.nodes:
                other.select = False
            node.select = True; nt.nodes.active = node
        manifest[n] = key

    sc.cycles.samples = SPP; sc.cycles.use_denoising = True
    sc.render.bake.margin = 8; sc.render.bake.use_clear = False
    select(names)
    tb = time.time()
    bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, use_clear=False, margin=8)
    print('BAKED', key, len(names), 'objects', size, 'px in', round(time.time() - tb), 's', flush=True)

    # ---- float light -> 8-bit sRGB PNG holding light / RANGE ----
    px = np.empty(size * size * 4, dtype=np.float32); img.pixels.foreach_get(px)
    px.reshape(size, size, 4)[:6, :6, :3] = 0.0   # the corner where unseen faces are parked
    rgb = px.reshape(-1, 4)[:, :3]
    print('STATS', key, 'median', float(np.median(rgb)), 'p99', float(np.percentile(rgb, 99)), 'max', float(rgb.max()), flush=True)
    lin = np.clip(rgb / RANGE, 0, 1)
    srgb = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
    out8 = bpy.data.images.new('LM8_' + key, size, size, alpha=False)
    o = np.ones((size * size, 4), dtype=np.float32); o[:, :3] = srgb
    out8.pixels.foreach_set(o.ravel())
    out8.filepath_raw = os.path.join(OUT, 'lm_%s.png' % key); out8.file_format = 'PNG'; out8.save()
    bpy.data.images.remove(img)

json.dump({'range': RANGE, 'meshes': manifest}, open(os.path.join(OUT, 'lightmaps.json'), 'w'))
print('ALL BAKED in', round(time.time() - t0), 's')

# materials go back to having no bake target selected; keep the UV sets
for m in bpy.data.materials:
    if m.use_nodes and m.node_tree.nodes.get('LM_TARGET'):
        m.node_tree.nodes.remove(m.node_tree.nodes['LM_TARGET'])
for ob in bpy.data.collections['GameLights'].objects:
    ob.data.energy /= k
bpy.ops.wm.save_mainfile()

# ---- export the venue with both UV sets. The game file's colour tints are bypassed for the export: the web app applies its own. ----
for m in bpy.data.materials:
    if not m.use_nodes:
        continue
    nt = m.node_tree
    for node in list(nt.nodes):
        if node.type == 'MIX' and not node.name.startswith('pbr_') and node.inputs[6].links and node.outputs[2].links:
            src = node.inputs[6].links[0].from_socket
            for l in list(node.outputs[2].links):
                nt.links.new(src, l.to_socket)
names = set(json.load(open(os.environ['GLB_NODES'])))
bpy.ops.object.select_all(action='DESELECT')
n = 0
for ob in bpy.context.view_layer.objects:
    if ob.name in names:
        ob.hide_set(False); ob.select_set(True); n += 1
print('EXPORT selecting', n, 'of', len(names))
bpy.ops.export_scene.gltf(filepath=os.path.join(ROOT, 'export', 'arena_venue.glb'), export_format='GLB', use_selection=True, export_apply=True,
                          export_extras=True, export_yup=True, export_cameras=False, export_lights=False)
print('EXPORTED')
