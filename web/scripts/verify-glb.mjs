// Checks an optimized venue GLB still has every SEC_* node with its section extras, and prints the file size.
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder } from 'meshoptimizer';
import { statSync } from 'node:fs';

const file = process.argv[2];
await MeshoptDecoder.ready;
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ 'meshopt.decoder': MeshoptDecoder });
const doc = await io.read(file);
const nodes = doc.getRoot().listNodes();
const secs = nodes.filter((n) => n.getName().startsWith('SEC_'));
const keys = ['section_id', 'level', 'status', 'tier', 'tier_name', 'price', 'rows', 'seat_count', 'kind'];
const broken = secs.filter((n) => { const e = n.getExtras(); return !keys.every((k) => k in e) || e.kind !== 'section'; });
const named = ['Bay_Water', 'Beam_Cone_0', 'Beam_Cone_1', 'Beam_Cone_2', 'Beam_Cone_3'].filter((n) => !nodes.some((x) => x.getName() === n));
const mb = (statSync(file).size / 1048576).toFixed(2);
console.log(`${file}: ${mb} MB, ${nodes.length} nodes, ${secs.length} SEC_* nodes, ${broken.length} with missing extras, missing named nodes: ${named.join(', ') || 'none'}`);
if (secs.length !== 64 || broken.length || named.length) process.exit(1);
