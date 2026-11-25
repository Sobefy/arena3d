// Gradient sky dome: orange at the horizon through pink and purple to near-black at the zenith.
import { BackSide, Color, Mesh, ShaderMaterial, SphereGeometry } from 'three';

const STOPS: [height: number, hex: string][] = [
  [0.0, '#FF8020'], [0.07, '#FF1A6B'], [0.2, '#8C149E'], [0.42, '#240D61'], [1.0, '#05051F'],
];

export function createSky(radius = 1500): Mesh {
  const colors = STOPS.map(([, h]) => new Color(h)); // converted to linear working space
  const mat = new ShaderMaterial({
    side: BackSide, depthWrite: false, fog: false,
    uniforms: { uColors: { value: colors }, uStops: { value: STOPS.map(([s]) => s) } },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 p = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        gl_Position = p.xyww; // always at the far plane
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColors[5];
      uniform float uStops[5];
      varying vec3 vDir;
      void main() {
        float h = vDir.y;
        vec3 c = uColors[0];
        if (h < 0.0) {
          c = mix(uColors[0], uColors[0] * 0.25, clamp(-h * 4.0, 0.0, 1.0)); // a little below the horizon fades darker
        } else {
          for (int i = 0; i < 4; i++) {
            float t = clamp((h - uStops[i]) / (uStops[i + 1] - uStops[i]), 0.0, 1.0);
            if (h >= uStops[i]) c = mix(uColors[i], uColors[i + 1], smoothstep(0.0, 1.0, t));
          }
        }
        gl_FragColor = vec4(c, 1.0);
      }`,
  });
  const sky = new Mesh(new SphereGeometry(radius, 48, 24), mat);
  sky.name = 'Sky';
  sky.frustumCulled = false;
  sky.renderOrder = -1;
  return sky;
}
