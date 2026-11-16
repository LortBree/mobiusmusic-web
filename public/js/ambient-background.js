/* ==========================================================================
   Mobius Music — macOS Desktop Atmospheric Ambient Glow (GLSL Port)
   Faithful WebGL port of `app/mobius/shaders/ambient_glow.frag`.
   Deep violet/magenta/blue/cyan organic light fields drifting at the top,
   softly easing into the #09090D obsidian base below.
   Runs capped at ~30 FPS on GPU for zero CPU impact.
   ========================================================================== */
(() => {
  'use strict';

  const canvas = document.getElementById('ambient-canvas');
  if (!canvas) return;

  const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
  if (!gl) {
    canvas.style.display = 'none';
    return;
  }

  const vsSource = `
    attribute vec2 position;
    void main() {
      gl_Position = vec4(position, 0.0, 1.0);
    }
  `;

  const fsSource = `
    precision highp float;
    uniform vec2 uResolution;
    uniform float uTime;

    // Palette (linear matching MobiusColors in app/mobius/lib/app/theme/colors.dart)
    const vec3 uBase    = vec3(0.035, 0.035, 0.051); // #09090D
    const vec3 uViolet  = vec3(0.427, 0.231, 0.710); // #6D3BB5
    const vec3 uMagenta = vec3(0.690, 0.267, 0.647); // #B044A5
    const vec3 uBlue    = vec3(0.416, 0.294, 0.753); // #6A4BC0
    const vec3 uCyan    = vec3(0.231, 0.435, 0.620); // #3B6F9E

    const float uIntensity     = 0.58;
    const float uFalloffTop    = 0.02;
    const float uFalloffBottom = 0.85;

    float field(vec2 p, vec2 c, vec2 r, float rot) {
      vec2 d = p - c;
      float s = sin(rot);
      float co = cos(rot);
      vec2 dl = vec2(d.x * co - d.y * s, d.x * s + d.y * co);
      dl.y += 0.12 * r.y * sin(dl.x / max(r.x, 0.1) * 2.0);
      vec2 q = dl / r;
      float dist2 = dot(q, q);
      return exp(-dist2 * 1.85);
    }

    vec2 warp(vec2 p, float t) {
      float w1x = sin(p.y * 2.7 + t * 0.09) + 0.5 * sin(p.y * 5.2 - t * 0.13);
      float w1y = cos(p.x * 2.3 - t * 0.10) + 0.5 * cos(p.x * 4.8 + t * 0.14);
      return p + vec2(w1x, w1y) * 0.058;
    }

    vec3 hueShift(vec3 c, float a) {
      const vec3 k = vec3(0.57735);
      float cosA = cos(a);
      return c * cosA + cross(k, c) * sin(a) + k * dot(k, c) * (1.0 - cosA);
    }

    void main() {
      vec2 uv = gl_FragCoord.xy / uResolution.xy;
      uv.y = 1.0 - uv.y; // Flip Y so 0 is at top

      float aspect = uResolution.x / uResolution.y;
      vec2 p = vec2(uv.x * aspect, uv.y);
      float t = uTime;

      vec2 pw = warp(p, t);

      float breathe1 = 0.82 + 0.22 * sin(t / 11.0);
      float breathe2 = 0.82 + 0.22 * sin(t / 13.0 + 2.1);
      float breathe3 = 0.82 + 0.22 * sin(t / 15.0 + 4.2);
      float breathe4 = 0.80 + 0.25 * cos(t / 12.0 + 1.1);

      // FIELD 1 -- wide primary glow (violet)
      vec2 c1 = vec2(
        (0.28 + 0.10 * sin(t / 24.0) + 0.04 * cos(t / 15.0)) * aspect,
        0.15 + 0.05 * cos(t / 20.0) + 0.02 * sin(t / 29.0)
      );
      float f1 = field(pw, c1, vec2(0.72 * aspect, 0.38), 0.35) * 0.58 * breathe1;

      // FIELD 2 -- wide deep glow (magenta)
      vec2 c2 = vec2(
        (0.52 + 0.11 * cos(t / 19.0) + 0.04 * sin(t / 27.0)) * aspect,
        0.12 + 0.05 * sin(t / 23.0) + 0.02 * cos(t / 17.0)
      );
      float f2 = field(pw, c2, vec2(0.66 * aspect, 0.36), -0.25) * 0.60 * breathe2;

      // FIELD 3 -- upper-right atmospheric sweep (blue)
      vec2 c3 = vec2(
        (0.76 + 0.09 * sin(t / 28.0) + 0.04 * cos(t / 18.0)) * aspect,
        0.18 + 0.05 * cos(t / 25.0) + 0.02 * sin(t / 33.0)
      );
      float f3 = field(pw, c3, vec2(0.76 * aspect, 0.44), 0.45) * 0.42 * breathe3;

      // FIELD 4 -- soft sea-glass cyan veil
      vec2 c4 = vec2(
        (0.60 + 0.11 * cos(t / 31.0) + 0.04 * sin(t / 21.0)) * aspect,
        0.28 + 0.06 * sin(t / 26.0) + 0.02 * cos(t / 35.0)
      );
      float f4 = field(pw, c4, vec2(0.82 * aspect, 0.50), -0.18) * 0.22 * breathe4;

      vec3 cViolet  = hueShift(uViolet,  0.35 + 0.85 * sin(t / 14.0));
      vec3 cMagenta = hueShift(uMagenta, 0.35 + 0.95 * sin(t / 17.0 + 1.7));
      vec3 cBlue    = hueShift(uBlue,    0.35 + 0.80 * sin(t / 21.0 + 3.1));
      vec3 cCyan    = hueShift(uCyan,    0.35 + 0.70 * sin(t / 25.0 + 0.6));

      float morphA = 0.5 + 0.5 * sin(t / 13.0);
      float morphB = 0.5 + 0.5 * cos(t / 16.0 + 1.2);
      vec3 col1 = mix(cViolet,  cBlue,    morphA * 0.34);
      vec3 col2 = mix(cMagenta, cBlue,    morphB * 0.28);
      vec3 col3 = mix(cBlue,    cCyan,    morphA * 0.36);
      vec3 col4 = mix(cCyan,    cViolet,  morphB * 0.26);

      vec3 light = col1 * f1 + col2 * f2 + col3 * f3 + col4 * f4;

      // Top-right directional lift
      vec2 sunPos = vec2(1.0 * aspect, 0.0);
      float sunDist = distance(pw, sunPos);
      float sun = exp(-sunDist * sunDist * 0.9) * (0.85 + 0.15 * sin(t / 28.0));
      vec3 sunCol = hueShift(uBlue, 0.35 + 0.5 * sin(t / 23.0 + 0.9));
      light += sunCol * sun * 0.12;

      // Vertical falloff: strong near top, softly maintaining ambient atmospheric warmth throughout
      float vmask = mix(0.22, 1.0, 1.0 - smoothstep(0.02, 0.95, uv.y));
      vec3 finalColor = mix(uBase, uBase + light * uIntensity * 1.5, vmask);

      gl_FragColor = vec4(finalColor, 1.0);
    }
  `;

  function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      console.error('Ambient shader compile error:', gl.getShaderInfoLog(shader));
      gl.deleteShader(shader);
      return null;
    }
    return shader;
  }

  const vs = createShader(gl, gl.VERTEX_SHADER, vsSource);
  const fs = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) return;

  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error('Ambient program link error:', gl.getProgramInfoLog(program));
    return;
  }
  gl.useProgram(program);

  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(
    gl.ARRAY_BUFFER,
    new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]),
    gl.STATIC_DRAW
  );

  const posLoc = gl.getAttribLocation(program, 'position');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  const resLoc = gl.getUniformLocation(program, 'uResolution');
  const timeLoc = gl.getUniformLocation(program, 'uTime');

  let width = 0;
  let height = 0;

  function resize() {
    // Render at 0.5x resolution for silky performance on mobile/tablets
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const w = Math.floor(window.innerWidth * dpr * 0.5);
    const h = Math.floor(window.innerHeight * dpr * 0.5);
    if (width !== w || height !== h) {
      width = w;
      height = h;
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
      gl.uniform2f(resLoc, w, h);
    }
  }

  window.addEventListener('resize', resize, { passive: true });
  resize();

  let startTime = performance.now();
  let lastFrameTime = 0;
  const TARGET_FPS = 30;
  const FRAME_INTERVAL = 1000 / TARGET_FPS;
  let isRunning = true;

  function animate(now) {
    if (!isRunning) return;
    requestAnimationFrame(animate);

    const elapsed = now - lastFrameTime;
    if (elapsed < FRAME_INTERVAL) return;
    lastFrameTime = now - (elapsed % FRAME_INTERVAL);

    const t = (now - startTime) / 1000.0;
    gl.uniform1f(timeLoc, t);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  document.addEventListener('visibilitychange', () => {
    isRunning = !document.hidden;
    if (isRunning) {
      lastFrameTime = performance.now();
      requestAnimationFrame(animate);
    }
  });

  requestAnimationFrame(animate);
})();
