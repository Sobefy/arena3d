# Faces whose winding disagrees with their stored normals (mirrored copies exported without reversing them) are turned the right way round.
# Run: blender -b arena_game.blend --python fix_flipped.py      (env DRY=1 to only report)
import bpy, bmesh, os
from mathutils import Vector
DRY = os.environ.get('DRY') == '1'
total = 0
for ob in bpy.data.collections['Game'].all_objects:
    if ob.type != 'MESH':
        continue
    me = ob.data
    cn = me.corner_normals
    bad = []
    for p in me.polygons:
        s = Vector((0, 0, 0))
        for li in p.loop_indices:
            s += cn[li].vector
        if s.length > 1e-6 and s.normalized().dot(p.normal) < -0.2:
            bad.append(p.index)
    if not bad:
        continue
    xs = [me.vertices[v].co.x for i in bad[:2000] for v in me.polygons[i].vertices]
    print('FLIPPED', ob.name, len(bad), 'of', len(me.polygons), 'x', round(min(xs), 1), round(max(xs), 1), flush=True)
    total += len(bad)
    if DRY:
        continue
    bm = bmesh.new(); bm.from_mesh(me); bm.faces.ensure_lookup_table()
    for i in bad:
        bm.faces[i].normal_flip()
    bm.to_mesh(me); bm.free(); me.update()
print('TOTAL', total)
if not DRY:
    bpy.ops.wm.save_mainfile()
