# Bayfront Arena: 3D ticketing prototype assets

An original concert-configured arena (inspired by a Miami waterfront arena, not a replica, no branding).
Built procedurally in Blender 5.3. The generator code lives inside arena.blend (Text: arena_lib.py).

## Files
| Path | What |
|---|---|
| arena.blend | Master scene: collections ARENA/Bowl_Sections, Floor_Sections, Seats, Stage, Interior, Exterior, Bowl_Detail, Lighting, Cameras |
| export/arena_venue.glb | Whole venue for three.js (Y-up, meters). Lights/cameras/seats NOT included |
| export/chairs.glb | Chair_Lower, Chair_Upper, Chair_Floor: origin on the tread, facing +X |
| export/seats.json | 24,334 seats (19,972 sellable), sections > rows > seats |
| textures/ | Poly Haven CC0 PBR maps + dusk HDRI (kiara_9_dusk_2k.hdr) + LED content |
| renders/ | Preview renders incl. seat POVs |

## Clickable sections
Every section is a mesh named `SEC_<id>` (101-126, 301-332, FLA-FLF). glTF extras -> `mesh.userData`:
`section_id, level (100|300|FLOOR), status (open|side_view|closed), tier, tier_name, price, rows, seat_count, kind:"section"`.
Raycast against meshes where `userData.kind === "section"`; ignore status "closed" (masked by the black drape behind the stage).

## seats.json
```
section: { id, mesh, name, level, status, tier, price, chair, center:[x,y,z],
           zoom_camera:{pos,target}, row_count, seat_count,
           rows:[ { label:"A", seats:[ [seat_number, x, y, z, yaw], ... ] } ] }
```
- Render seats with one InstancedMesh per chair type (`section.chair`), `rotation.y = yaw`.
- Seat POV camera: eye = seat + (cos(yaw)*0.05, 1.17, -sin(yaw)*0.05), lookAt(`stage.look_target`). FOV about 70 degrees.
- Seat numbering: seat 1 is on the left when facing the stage/floor. Rows run A..V (lower), A..V (upper, no I/O), 1..n (floor).
- Tiers & prices live in `tiers` (placeholder prices).

## Suggested UX flow (three.js)
1. Overview camera (`camera_presets.overview`), sections tinted by tier/availability.
2. Click section -> tween to `zoom_camera`, show that section's rows (highlight via instance colors).
3. Pick row -> pick seat (instance id -> seat).
4. "View from seat" -> tween camera to the seat eye, look at the stage; allow orbit-in-place.
5. Add to cart.

## Regenerating
Open arena.blend > Scripting > arena_lib.py holds the parametric bowl (LX, LY, R0, LOWER/UPPER configs, STAGE).
Seat instancing in Blender uses Geometry Nodes (GN_Seats_*); viewport display of seats is OFF for speed:
enable the 'Seats' modifier viewport toggle on SEATS_* objects to see them in the viewport.

## Look (neon Miami sunset)
Palette: pink #FF148C, cyan #00D9FF, purple #731AE6, orange #FF6B1A. Seats: lower pink, upper teal, floor purple.
- Blender renders use the helpers in arena_lib.py: `shot(camera_name, "exterior"|"interior")` (sets sky strength, exposure, haze).
- Bloom is a compositor Glare node (ArenaComp). In three.js use UnrealBloomPass (threshold ~0.9) for the neon tubes (materials Neon*, FinGlow*, RoofHalo, Accent*).
- Sky is a Blender world gradient (not exported). In three.js use a gradient sky dome: horizon #FF8020 -> #FF1A6B -> #8C149E -> #240D61 -> #05051F.
- Water: Blender uses procedural ripples (not exportable). In three.js use the Water addon on mesh `Bay_Water` with textures/water_normal.png.
- textures/: Poly Haven CC0 sets plus generated facade_emission.png / facade_base.png (lit windows), water_normal.png, led_content.png (original retro-sunset screen art).
- Beam cones (Beam_Cone_*) use a view-angle alpha fade in Blender; in three.js give them additive blending + low opacity.

## Signage pass (2026-11-24)
- `textures/signage/sig_*.png`: artwork for every formerly plain panel, board, band and fascia (section signs, menus, banners, mural, ticker, suite walls, grilles and so on). All brand names on them are invented. They are drawn by a script (browser canvas) and can be regenerated.
- Materials `Sig_*` in arena.blend carry them; UVs were laid out per panel, per band or as repeats. `arena.pre-signage.blend` is the file as it was before this pass.
- Chairs: `Seat_Lower/Upper/Floor` are now blue moulded plastic, with a second slot `Seat_Steel` for the frames. `export/chairs.glb` was not re-exported (the web app builds its own chair).
- `renders/after_*.png` are renders made after the pass; the files without the prefix are from before it.

## Path-traced pass (2026-11-24)
- `arena_game.blend`: the venue as the web app shows it (basketball court, baskets, moulded chairs, suite decor imported from `export/addons_game.glb`, which the web app writes with `?export`), with house lights and Cycles settings. `arena.blend` stays the concert master.
- Lightmaps: direct and bounce light baked for the bowl and concourses into `web/public/lightmaps/lm_A|B|C.jpg` (second UV set `LM`, exported as TEXCOORD_1). `?nolm` in the web app turns them off.
- Seat views: one panorama per open section, rendered from its middle seat, in `web/public/panos/` with `panos.json`. `?nopano` turns them off.
- The scripts that did this are in `web/scripts/`: `build_game.py`, `bake_lm.py`, `pano.py` (run with `blender -b <file> --python <script>`; see the header of each), plus `sign_apply.py` and `signage.mjs` from the signage pass.
