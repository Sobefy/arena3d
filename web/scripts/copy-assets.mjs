// Copies the non-optimized assets the app loads into public/.
import { copyFileSync, mkdirSync } from 'node:fs';
mkdirSync('public', { recursive: true });
for (const [from, to] of [['../export/chairs.glb', 'public/chairs.glb'], ['../export/seats.json', 'public/seats.json'], ['../textures/water_normal.png', 'public/water_normal.png']]) {
  copyFileSync(from, to); console.log('copied', to);
}
