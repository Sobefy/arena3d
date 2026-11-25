# Second step of the basket repair: flipping a face in Blender flips its stored normal with it, so the stored normals are dropped
# and rebuilt from the (now outward) faces, with hard edges kept by angle.
import bpy, bmesh, math
names = ['Basket_Part_%d' % i for i in [28, 29] + list(range(37, 54))]
for n in names:
    ob = bpy.data.objects[n]; me = ob.data
    if 'custom_normal' in me.attributes:
        me.attributes.remove(me.attributes['custom_normal'])
    bm = bmesh.new(); bm.from_mesh(me)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)      # so each solid is closed and "outside" is well defined
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    me.set_sharp_from_angle(angle=math.radians(40)); me.update()
    print('REBUILT', n, len(me.polygons), 'custom' in ''.join(a.name for a in me.attributes), flush=True)
bpy.ops.wm.save_mainfile()
