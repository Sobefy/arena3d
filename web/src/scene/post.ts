// Bloom for the neon, then tone mapping and sRGB output.
import { HalfFloatType, Vector2, Vector4, WebGLRenderTarget, type Camera, type Scene, type WebGLRenderer } from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';

// Final grade on the display image: a little more contrast and saturation, cool shadows against warm highlights, soft vignette.
const GradeShader = {
  uniforms: { tDiffuse: { value: null }, uGain: { value: 1 }, uVig: { value: 0.3 }, uBlur: { value: 0 }, uFocus: { value: new Vector4(0.5, 0.5, 0.2, 0.2) }, uFocusAmt: { value: 0 } },
  vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uGain; uniform float uVig; uniform float uBlur; uniform vec4 uFocus; uniform float uFocusAmt; varying vec2 vUv;
    void main() {
      vec3 c = texture2D(tDiffuse, vUv).rgb;
      if (uBlur > 0.001) { // camera in flight: smear outwards from the centre, more towards the edges
        vec2 d = (vUv - 0.5) * uBlur;
        for (int i = 1; i < 10; i++) c += texture2D(tDiffuse, vUv - d * float(i) / 9.0).rgb;
        c /= 10.0;
      }
      c *= uGain;
      // pointing at a section: everything outside a soft oval around it steps back
      float away = length((vUv - uFocus.xy) / uFocus.zw);
      c *= 1.0 - 0.46 * uFocusAmt * smoothstep(0.85, 1.7, away);
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.05);                                  // saturation
      c = (c - 0.5) * 1.1 + 0.5;                                  // contrast
      c += vec3(-0.012, 0.0, 0.03) * (1.0 - smoothstep(0.0, 0.45, l)); // cool shadows
      c += vec3(0.02, 0.006, -0.012) * smoothstep(0.55, 1.0, l);  // warm highlights
      vec2 e = vUv - 0.5; c *= 1.0 - uVig * smoothstep(0.12, 0.8, dot(e, e) * 2.0);
      gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
    }`,
};

export function createComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, withAO = true) {
  const size = renderer.getSize(new Vector2());
  const target = new WebGLRenderTarget(size.x, size.y, { type: HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, target);
  composer.addPass(new RenderPass(scene, camera));
  // Worked out at half size and blended in: the shade is soft anyway, and it halves the cost.
  const ao = withAO ? new GTAOPass(scene, camera, size.x / 2, size.y / 2) : null;
  if (ao) {
    ao.updateGtaoMaterial({ radius: 0.9, distanceExponent: 1.4, thickness: 1.2, scale: 1.25, samples: 10, distanceFallOff: 1, screenSpaceRadius: false });
    ao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, radiusExponent: 1, rings: 2, samples: 12 });
    ao.blendIntensity = 1.0;
    composer.addPass(ao);
  }
  const bloom = new UnrealBloomPass(new Vector2(size.x, size.y), 0.16, 0.3, 0.95);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grade = new ShaderPass(GradeShader);
  composer.addPass(grade);
  const resize = (w: number, h: number) => { composer.setSize(w, h); const pr = renderer.getPixelRatio(); ao?.setSize((w * pr) / 2, (h * pr) / 2); };
  resize(size.x, size.y);
  return { composer, bloom, grade, resize, ao };
}

/** A small offscreen composer for the seat-view thumbnail: same tone mapping, no bloom. */
export function createThumbComposer(renderer: WebGLRenderer, scene: Scene, camera: Camera, w = 320, h = 180) {
  const composer = new EffectComposer(renderer, new WebGLRenderTarget(w, h, { type: HalfFloatType, samples: 4 }));
  composer.renderToScreen = false;
  composer.setPixelRatio(1);
  composer.setSize(w, h);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new OutputPass());
  return composer;
}
