# Path-traces the view from the middle of each section as a wide panorama (the web app shows it as "view from seat").
# Run: blender -b arena_game.blend --python pano.py     (env: OUT folder, optional SECTIONS=115,110  to limit, SPP, PXDEG)
import bpy, os, json, math, time

ROOT = os.path.dirname(bpy.data.filepath)
OUT = os.environ['OUT']
os.makedirs(OUT, exist_ok=True)
sc = bpy.context.scene
LON, LAT = (-110.0, 110.0), (-75.0, 45.0)
PXDEG = float(os.environ.get('PXDEG', '13'))
BACK, UP = 0.95, 1.6      # the same eye point the web app uses: just behind and above the seat

k = float(os.environ.get('LIGHT_SCALE', '0.045'))
for ob in bpy.data.collections['GameLights'].objects:
    ob.data.energy *= k
sc.render.use_compositing = False
sc.render.use_persistent_data = True
sc.cycles.samples = int(os.environ.get('SPP', '24')); sc.cycles.use_denoising = True
sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0.0
sc.render.resolution_x = int((LON[1] - LON[0]) * PXDEG); sc.render.resolution_y = int((LAT[1] - LAT[0]) * PXDEG); sc.render.resolution_percentage = 100
sc.render.image_settings.file_format = 'JPEG'; sc.render.image_settings.quality = 88

cd = bpy.data.cameras.new('PanoCam'); cam = bpy.data.objects.new('PanoCam', cd); sc.collection.objects.link(cam)
cd.type = 'PANO'
tgt = cd if hasattr(cd, 'panorama_type') else cd.cycles
tgt.panorama_type = 'EQUIRECTANGULAR'
tgt.longitude_min, tgt.longitude_max = math.radians(LON[0]), math.radians(LON[1])
tgt.latitude_min, tgt.latitude_max = math.radians(LAT[0]), math.radians(LAT[1])
cd.clip_start = 0.05
sc.camera = cam

seats = json.load(open(os.path.join(ROOT, 'export', 'seats.json')))
only = [s for s in os.environ.get('SECTIONS', '').split(',') if s]
index_path = os.path.join(OUT, 'panos.json')
index = json.load(open(index_path)) if os.path.exists(index_path) else {'lon': LON, 'lat': LAT, 'sections': {}}
# Nine views per section: front, middle and back rows, each at the left, centre and right. The middle one is the section's main view;
# the web app shows whichever was rendered nearest to the chosen seat. Views are added to the index only once their picture exists.
FR = (1 / 6, 1 / 2, 5 / 6)
GRID = ([(1, 1)] + [(r, c) for r in range(3) for c in range(3) if (r, c) != (1, 1)])[:int(os.environ.get('MAXV', '9'))]
VER = 2      # scene version: pictures made before the mirrored basket was repaired (no version) are rendered again
for gi, (gr, gc) in enumerate(GRID):
    for sec in seats['sections']:
        sid = sec['id']
        if sec['level'] == 'FLOOR' or sec['status'] == 'closed' or (only and sid not in only):
            continue
        centre = gi == 0
        fn = 'pano_%s.jpg' % sid if centre else 'pano_%s_%d%d.jpg' % (sid, gr, gc)
        row = sec['rows'][min(len(sec['rows']) - 1, int(len(sec['rows']) * FR[gr]))]
        num, x, y, z, yaw = row['seats'][min(len(row['seats']) - 1, int(len(row['seats']) * FR[gc]))]
        # web coordinates (y up) -> eye point, then to Blender (z up): (x, y, z) -> (x, -z, y)
        ex, ey, ez = x - math.cos(yaw) * BACK, y + UP, z + math.sin(yaw) * BACK
        hx, hz = -ex, -ez; hl = math.hypot(hx, hz); hx, hz = hx / hl, hz / hl          # level heading towards centre court
        entry = {'file': fn, 'eye': [round(ex, 3), round(ey, 3), round(ez, 3)], 'heading': [round(hx, 5), round(hz, 5)], 'row': row['label'], 'seat': num, 'v': VER}
        old = index['sections'].get(sid, {}) if centre else next((v for v in index['sections'].get(sid, {}).get('views', []) if v['file'] == fn), {})
        have = os.path.exists(os.path.join(OUT, fn)) and old.get('v') == VER and not only
        if not have:
            cam.location = (ex, -ez, ey)
            dx, dy = hx, -hz                                                             # heading in Blender's ground plane
            cam.rotation_euler = (math.pi / 2, 0.0, math.atan2(-dx, dy))
            sc.render.filepath = os.path.join(OUT, fn)
            t = time.time(); bpy.ops.render.render(write_still=True)
            print('PANO', fn, round(time.time() - t), 's', flush=True)
        if have:
            continue
        if centre:
            entry['views'] = index['sections'].get(sid, {}).get('views', [])
            index['sections'][sid] = entry
        elif sid in index['sections']:
            vs = [v for v in index['sections'][sid].setdefault('views', []) if v['file'] != fn] + [entry]
            index['sections'][sid]['views'] = vs
        if not have:
            json.dump(index, open(index_path + '.tmp', 'w')); os.replace(index_path + '.tmp', index_path)
json.dump(index, open(index_path + '.tmp', 'w')); os.replace(index_path + '.tmp', index_path)
print('PANOS DONE', len(index['sections']), 'sections', sum(1 + len(v.get('views', [])) for v in index['sections'].values()), 'views')
