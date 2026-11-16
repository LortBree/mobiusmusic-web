/* ==========================================================================
   Mobius Music — 3D Hero Object: The Parametric Möbius Strip
   Dark anodized titanium + laser-etched glowing edge, Fresnel clearcoat.
   Idle rotation · pointer / gyroscope tracking (lerp inertia) · scroll dolly.
   ========================================================================== */
import * as THREE from 'three';
import { ParametricGeometry } from 'three/addons/geometries/ParametricGeometry.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const canvas = document.getElementById('mobius-canvas');
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function hasWebGL() {
  try {
    const c = document.createElement('canvas');
    return !!(window.WebGLRenderingContext && (c.getContext('webgl2') || c.getContext('webgl')));
  } catch {
    return false;
  }
}

if (!canvas || !hasWebGL()) {
  document.documentElement.classList.add('no-webgl');
} else {
  init();
}

function init() {
  /* -------------------------------------------------------------------
     Renderer / Scene / Camera
     ------------------------------------------------------------------- */
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();

  // Studio reflections for the anodized titanium
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.85;

  const camera = new THREE.PerspectiveCamera(35, 1, 0.1, 100);
  const CAM_START_Z = 8.2;
  const CAM_END_Z = 5.0;
  camera.position.set(0, 0, CAM_START_Z);

  /* -------------------------------------------------------------------
     1. Parametric Equation for Möbius Strip
        x(u,v) = (a + v·cos(u/2))·cos(u)
        y(u,v) = (a + v·cos(u/2))·sin(u)
        z(u,v) = v·sin(u/2)
        u ∈ [0, 2π], v ∈ [-0.4, 0.4]
     ------------------------------------------------------------------- */
  const A = 1.6;        // Loop radius
  const HALF_W = 0.4;   // Strip half-width (v ∈ [-0.4, 0.4])

  function mobiusStrip(u, v, target) {
    u = u * Math.PI * 2;
    v = (v - 0.5) * (HALF_W * 2); // Strip width

    const x = (A + v * Math.cos(u / 2)) * Math.cos(u);
    const y = (A + v * Math.cos(u / 2)) * Math.sin(u);
    const z = v * Math.sin(u / 2);

    target.set(x, y, z);
  }

  /* -------------------------------------------------------------------
     2. Geometry & Anodized Titanium Material
     ------------------------------------------------------------------- */
  const geometry = new ParametricGeometry(mobiusStrip, 128, 32);
  geometry.computeVertexNormals();

  const material = new THREE.MeshPhysicalMaterial({
    color: 0x16181d,
    metalness: 0.95,
    roughness: 0.22,
    reflectivity: 0.8,
    clearcoat: 0.3,
    clearcoatRoughness: 0.1,
    anisotropy: 0.65,              // brushed / anisotropic highlight
    anisotropyRotation: Math.PI / 2,
    side: THREE.DoubleSide,
  });

  // Subtle Fresnel rim (glints as the viewing angle changes)
  material.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
      #include <dithering_fragment>
      vec3 fV = normalize(vViewPosition);
      float fres = pow(1.0 - abs(dot(normalize(vNormal), fV)), 3.0);
      gl_FragColor.rgb += vec3(0.85, 0.88, 0.92) * fres * 0.16;
      `
    );
  };

  const mesh = new THREE.Mesh(geometry, material);

  /* -------------------------------------------------------------------
     Laser-etched glowing edge (the strip's single boundary: u ∈ [0, 4π])
     ------------------------------------------------------------------- */
  const edgePts = [];
  const EDGE_SEG = 512;
  const edgeV = HALF_W * 0.995;
  for (let i = 0; i < EDGE_SEG; i++) {
    const u = (i / EDGE_SEG) * Math.PI * 4;
    edgePts.push(
      new THREE.Vector3(
        (A + edgeV * Math.cos(u / 2)) * Math.cos(u),
        (A + edgeV * Math.cos(u / 2)) * Math.sin(u),
        edgeV * Math.sin(u / 2)
      )
    );
  }
  const edgeCurve = new THREE.CatmullRomCurve3(edgePts, true);
  const edgeGeo = new THREE.TubeGeometry(edgeCurve, 1024, 0.0065, 6, true);
  const edgeMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 },
      uAmber: { value: new THREE.Color(0xd4a373) },
      uAccent: { value: new THREE.Color(0xf1f5f9) }, // Pure neutral platinum (no blue)
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() {
        vUv = uv;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }
    `,
    fragmentShader: /* glsl */ `
      uniform float uTime;
      uniform vec3 uAmber;
      uniform vec3 uAccent;
      varying vec2 vUv;
      void main() {
        float t = vUv.x;
        float mixF = 0.5 + 0.5 * sin(t * 6.28318 * 2.0 + uTime * 0.6);
        vec3 col = mix(uAccent, uAmber, mixF);
        // travelling "data packet" pulse along the infinite edge
        float pulse = smoothstep(0.985, 1.0, fract(t * 3.0 - uTime * 0.12));
        float a = 0.5 + pulse * 0.8;
        gl_FragColor = vec4(col * (0.8 + pulse * 1.5), a);
      }
    `,
  });
  const edge = new THREE.Mesh(edgeGeo, edgeMat);

  const strip = new THREE.Group(); // idle spin
  strip.add(mesh, edge);

  const rig = new THREE.Group();   // pointer + scroll orientation
  rig.add(strip);
  scene.add(rig);

  /* -------------------------------------------------------------------
     3. Ambient & Studio Lighting
     ------------------------------------------------------------------- */
  const dirLight1 = new THREE.DirectionalLight(0xffffff, 2.5);
  dirLight1.position.set(5, 10, 7);
  scene.add(dirLight1);

  const dirLight2 = new THREE.DirectionalLight(0xffffff, 0.9); // Clean neutral platinum studio rim
  dirLight2.position.set(-5, -5, -5);
  scene.add(dirLight2);

  const dirLight3 = new THREE.DirectionalLight(0xd4a373, 0.6); // warm amber kicker
  dirLight3.position.set(6, -3, 2);
  scene.add(dirLight3);

  scene.add(new THREE.AmbientLight(0xffffff, 0.08));

  /* -------------------------------------------------------------------
     Interaction state
     ------------------------------------------------------------------- */
  const pointer = { x: 0, y: 0 };      // target (-1..1)
  const smooth = { x: 0, y: 0 };       // lerped
  let scrollT = 0;                     // hero progress 0..1
  let pageT = 0;                       // whole page progress 0..1
  let smoothScroll = 0;
  let smoothPage = 0;

  window.addEventListener(
    'pointermove',
    (e) => {
      pointer.x = (e.clientX / window.innerWidth) * 2 - 1;
      pointer.y = (e.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true }
  );

  // Gyroscope (mobile)
  const onOrient = (e) => {
    if (e.gamma == null || e.beta == null) return;
    pointer.x = THREE.MathUtils.clamp(e.gamma / 30, -1, 1);
    pointer.y = THREE.MathUtils.clamp((e.beta - 45) / 30, -1, 1);
  };
  if (window.DeviceOrientationEvent) {
    if (typeof DeviceOrientationEvent.requestPermission === 'function') {
      // iOS: needs a user gesture
      window.addEventListener(
        'touchend',
        () => {
          DeviceOrientationEvent.requestPermission()
            .then((s) => s === 'granted' && window.addEventListener('deviceorientation', onOrient))
            .catch(() => {});
        },
        { once: true }
      );
    } else {
      window.addEventListener('deviceorientation', onOrient);
    }
  }

  const updateScroll = () => {
    const vh = window.innerHeight;
    const max = document.documentElement.scrollHeight - vh;
    scrollT = THREE.MathUtils.clamp(window.scrollY / vh, 0, 1);
    pageT = max > 0 ? THREE.MathUtils.clamp(window.scrollY / max, 0, 1) : 0;
  };
  window.addEventListener('scroll', updateScroll, { passive: true });
  updateScroll();

  /* -------------------------------------------------------------------
     Resize
     ------------------------------------------------------------------- */
  let isMobile = false;
  const resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    isMobile = w < 720;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    const s = isMobile ? 0.62 : w < 1080 ? 0.82 : 1;
    rig.scale.setScalar(s);
  };
  window.addEventListener('resize', resize);
  resize();

  /* -------------------------------------------------------------------
     Animation loop
     ------------------------------------------------------------------- */
  const clock = new THREE.Clock();
  const IDLE_SPEED = 0.003; // rad per frame (~60fps)
  const BASE_TILT_X = -0.7;
  const BASE_YAW = 0.5;
  let running = true;

  const easeInOut = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  function render() {
    if (!running) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const k = 1 - Math.pow(0.001, dt); // frame-rate independent lerp (soft inertia)

    smooth.x += (pointer.x - smooth.x) * k * 0.9;
    smooth.y += (pointer.y - smooth.y) * k * 0.9;
    smoothScroll += (scrollT - smoothScroll) * k;
    smoothPage += (pageT - smoothPage) * k;

    // Idle continuous rotation
    if (!reduceMotion) strip.rotation.z += IDLE_SPEED * (dt * 60);

    // Scroll-driven dolly + narrative tilt
    const s = easeInOut(smoothScroll);
    camera.position.z = THREE.MathUtils.lerp(CAM_START_Z, CAM_END_Z, s);

    const narrative = smoothPage * Math.PI * 2;
    rig.rotation.x = BASE_TILT_X + smooth.y * 0.28 + s * 0.55 + Math.sin(narrative) * 0.25;
    rig.rotation.y = BASE_YAW + smooth.x * 0.45 + smoothPage * 1.2;
    rig.rotation.z = Math.sin(narrative * 0.5) * 0.15;

    // drift aside after hero so content stays readable
    const side = isMobile ? 0 : 1.15;
    rig.position.x = s * side * Math.cos(narrative * 0.5);
    rig.position.y = isMobile ? -0.22 + s * 0.4 : -0.15 + s * 0.4;

    edgeMat.uniforms.uTime.value = clock.elapsedTime;

    renderer.render(scene, camera);
    requestAnimationFrame(render);
  }

  document.addEventListener('visibilitychange', () => {
    const wasRunning = running;
    running = !document.hidden;
    if (running && !wasRunning) {
      clock.getDelta();
      requestAnimationFrame(render);
    }
  });

  // Prime first frame then fade the canvas in
  renderer.render(scene, camera);
  requestAnimationFrame(() => document.documentElement.classList.add('is-3d-ready'));
  requestAnimationFrame(render);
}
