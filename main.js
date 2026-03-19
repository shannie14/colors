/**
 * colors — Main Entry
 *
 * A real-time GPU fluid dynamics simulation using WebGL 2.
 *
 * ALGORITHM:
 *   Navier-Stokes equations solved on a staggered grid:
 *
 *   ∂v/∂t + (v·∇)v = -∇p + ν∇²v + f
 *   ∇·v = 0
 *
 *   Steps per frame:
 *     1. Apply external forces (mouse/auto splats)
 *     2. Advect velocity field
 *     3. Advect dye (color) field
 *     4. Compute vorticity & apply confinement
 *     5. Compute divergence
 *     6. Solve pressure (Jacobi iterations)
 *     7. Subtract pressure gradient (projection)
 *     8. Render dye with bloom post-processing
 */

import { createProgram, createFBO, createDoubleFBO } from './gl-utils.js';
import {
  baseVertexShader,
  clearShader,
  displayShader,
  splatShader,
  advectionShader,
  divergenceShader,
  curlShader,
  vorticityShader,
  pressureShader,
  gradientSubtractShader,
  bloomPrefilterShader,
  bloomBlurShader,
  bloomFinalShader,
} from './shaders.js';
import { palettes, paletteNames, getRandomColor } from './palettes.js';

// ────────────────────────────────────────────
//  CONFIG
// ────────────────────────────────────────────
const config = {
  SIM_RESOLUTION: 256,
  DYE_RESOLUTION: 1024,
  DENSITY_DISSIPATION: 0.97,
  VELOCITY_DISSIPATION: 0.98,
  PRESSURE: 0.8,
  PRESSURE_ITERATIONS: 20,
  CURL: 30,
  SPLAT_RADIUS: 0.25,
  SPLAT_FORCE: 6000,
  AUTO_SPLAT: true,
  AUTO_SPLAT_INTERVAL: 0.3, // seconds between auto-splats
  BLOOM_ENABLED: true,
  BLOOM_INTENSITY: 0.4,
  BLOOM_THRESHOLD: 0.6,
  BLOOM_SOFT_KNEE: 0.7,
  BLOOM_ITERATIONS: 8,
  PALETTE: 'Deep Ocean',
};

// ────────────────────────────────────────────
//  WEBGL INIT
// ────────────────────────────────────────────
const canvas = document.getElementById('canvas');
const gl = canvas.getContext('webgl2', {
  alpha: false,
  depth: false,
  stencil: false,
  antialias: false,
  preserveDrawingBuffer: true,
});

if (!gl) {
  document.body.innerHTML = '<h1 style="color:#fff;text-align:center;margin-top:40vh">WebGL 2.0 required</h1>';
  throw new Error('WebGL 2 not supported');
}

// Enable float textures
const ext = {
  formatRGBA: getSupportedFormat(gl, gl.RGBA16F, gl.RGBA, gl.HALF_FLOAT),
  formatRG: getSupportedFormat(gl, gl.RG16F, gl.RG, gl.HALF_FLOAT),
  formatR: getSupportedFormat(gl, gl.R16F, gl.RED, gl.HALF_FLOAT),
  halfFloatTexType: gl.HALF_FLOAT,
};

gl.getExtension('EXT_color_buffer_half_float');
gl.getExtension('OES_texture_half_float_linear');

function getSupportedFormat(gl, internalFormat, format, type) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, 4, 4, 0, format, type, null);

  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.deleteTexture(texture);
  gl.deleteFramebuffer(fbo);

  if (status === gl.FRAMEBUFFER_COMPLETE) {
    return { internalFormat, format };
  }
  // Fallback
  return { internalFormat: gl.RGBA16F, format: gl.RGBA };
}

// ────────────────────────────────────────────
//  FULLSCREEN QUAD
// ────────────────────────────────────────────
const quadVAO = gl.createVertexArray();
gl.bindVertexArray(quadVAO);

const quadVBO = gl.createBuffer();
gl.bindBuffer(gl.ARRAY_BUFFER, quadVBO);
gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, -1, 1, 1, 1, 1, -1]), gl.STATIC_DRAW);
gl.enableVertexAttribArray(0);
gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

const quadEBO = gl.createBuffer();
gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, quadEBO);
gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array([0, 1, 2, 0, 2, 3]), gl.STATIC_DRAW);

gl.bindVertexArray(null);

function blit(target) {
  if (target == null) {
    gl.viewport(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  } else {
    gl.viewport(0, 0, target.width, target.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
  }
  gl.bindVertexArray(quadVAO);
  gl.drawElements(gl.TRIANGLES, 6, gl.UNSIGNED_SHORT, 0);
  gl.bindVertexArray(null);
}

// ────────────────────────────────────────────
//  COMPILE PROGRAMS
// ────────────────────────────────────────────
const clearProg = createProgram(gl, baseVertexShader, clearShader);
const displayProg = createProgram(gl, baseVertexShader, displayShader);
const splatProg = createProgram(gl, baseVertexShader, splatShader);
const advectionProg = createProgram(gl, baseVertexShader, advectionShader);
const divergenceProg = createProgram(gl, baseVertexShader, divergenceShader);
const curlProg = createProgram(gl, baseVertexShader, curlShader);
const vorticityProg = createProgram(gl, baseVertexShader, vorticityShader);
const pressureProg = createProgram(gl, baseVertexShader, pressureShader);
const gradSubProg = createProgram(gl, baseVertexShader, gradientSubtractShader);
const bloomPrefilterProg = createProgram(gl, baseVertexShader, bloomPrefilterShader);
const bloomBlurProg = createProgram(gl, baseVertexShader, bloomBlurShader);
const bloomFinalProg = createProgram(gl, baseVertexShader, bloomFinalShader);

// ────────────────────────────────────────────
//  FRAMEBUFFERS
// ────────────────────────────────────────────
let dye, velocity, divergence, curl, pressure;
let bloomFBOs = [];
let bloomTarget;

function getResolution(resolution) {
  let aspectRatio = gl.drawingBufferWidth / gl.drawingBufferHeight;
  if (aspectRatio < 1) aspectRatio = 1.0 / aspectRatio;
  const min = Math.round(resolution);
  const max = Math.round(resolution * aspectRatio);
  return gl.drawingBufferWidth > gl.drawingBufferHeight
    ? { width: max, height: min }
    : { width: min, height: max };
}

function initFramebuffers() {
  const simRes = getResolution(config.SIM_RESOLUTION);
  const dyeRes = getResolution(config.DYE_RESOLUTION);

  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;
  const rg = ext.formatRG;
  const r = ext.formatR;

  dye = createDoubleFBO(gl, dyeRes.width, dyeRes.height, rgba.internalFormat, rgba.format, texType, gl.LINEAR);
  velocity = createDoubleFBO(gl, simRes.width, simRes.height, rg.internalFormat, rg.format, texType, gl.LINEAR);
  divergence = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  curl = createFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);
  pressure = createDoubleFBO(gl, simRes.width, simRes.height, r.internalFormat, r.format, texType, gl.NEAREST);

  initBloomFBOs();
}

function initBloomFBOs() {
  const res = getResolution(config.DYE_RESOLUTION >> 1);
  const texType = ext.halfFloatTexType;
  const rgba = ext.formatRGBA;

  bloomFBOs = [];
  let w = res.width;
  let h = res.height;

  for (let i = 0; i < config.BLOOM_ITERATIONS; i++) {
    w = Math.max(1, w >> 1);
    h = Math.max(1, h >> 1);
    bloomFBOs.push(createFBO(gl, w, h, rgba.internalFormat, rgba.format, texType, gl.LINEAR));
  }

  bloomTarget = createFBO(gl, res.width, res.height, rgba.internalFormat, rgba.format, texType, gl.LINEAR);
}

// ────────────────────────────────────────────
//  SIMULATION STEP
// ────────────────────────────────────────────
function step(dt) {
  gl.disable(gl.BLEND);

  // Curl
  gl.useProgram(curlProg.program);
  gl.uniform2f(curlProg.uniforms.texelSize, velocity.width, velocity.height);
  gl.uniform2f(curlProg.uniforms.texelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform1i(curlProg.uniforms.uVelocity, velocity.read.attach(0));
  blit(curl);

  // Vorticity confinement
  gl.useProgram(vorticityProg.program);
  gl.uniform2f(vorticityProg.uniforms.texelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform1i(vorticityProg.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(vorticityProg.uniforms.uCurl, curl.attach(1));
  gl.uniform1f(vorticityProg.uniforms.curl, config.CURL);
  gl.uniform1f(vorticityProg.uniforms.dt, dt);
  blit(velocity.write);
  velocity.swap();

  // Advect velocity
  gl.useProgram(advectionProg.program);
  gl.uniform2f(advectionProg.uniforms.texelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform2f(advectionProg.uniforms.dyeTexelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(advectionProg.uniforms.uSource, velocity.read.attach(0));
  gl.uniform1f(advectionProg.uniforms.dt, dt);
  gl.uniform1f(advectionProg.uniforms.dissipation, config.VELOCITY_DISSIPATION);
  blit(velocity.write);
  velocity.swap();

  // Advect dye
  gl.uniform2f(advectionProg.uniforms.dyeTexelSize, 1.0 / dye.width, 1.0 / dye.height);
  gl.uniform1i(advectionProg.uniforms.uVelocity, velocity.read.attach(0));
  gl.uniform1i(advectionProg.uniforms.uSource, dye.read.attach(1));
  gl.uniform1f(advectionProg.uniforms.dissipation, config.DENSITY_DISSIPATION);
  blit(dye.write);
  dye.swap();

  // Divergence
  gl.useProgram(divergenceProg.program);
  gl.uniform2f(divergenceProg.uniforms.texelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform1i(divergenceProg.uniforms.uVelocity, velocity.read.attach(0));
  blit(divergence);

  // Clear pressure
  gl.useProgram(clearProg.program);
  gl.uniform1i(clearProg.uniforms.uTexture, pressure.read.attach(0));
  gl.uniform1f(clearProg.uniforms.value, config.PRESSURE);
  blit(pressure.write);
  pressure.swap();

  // Pressure solve (Jacobi iteration)
  gl.useProgram(pressureProg.program);
  gl.uniform2f(pressureProg.uniforms.texelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform1i(pressureProg.uniforms.uDivergence, divergence.attach(0));

  for (let i = 0; i < config.PRESSURE_ITERATIONS; i++) {
    gl.uniform1i(pressureProg.uniforms.uPressure, pressure.read.attach(1));
    blit(pressure.write);
    pressure.swap();
  }

  // Gradient subtract (projection)
  gl.useProgram(gradSubProg.program);
  gl.uniform2f(gradSubProg.uniforms.texelSize, 1.0 / velocity.width, 1.0 / velocity.height);
  gl.uniform1i(gradSubProg.uniforms.uPressure, pressure.read.attach(0));
  gl.uniform1i(gradSubProg.uniforms.uVelocity, velocity.read.attach(1));
  blit(velocity.write);
  velocity.swap();
}

// ────────────────────────────────────────────
//  BLOOM POST-PROCESSING
// ────────────────────────────────────────────
function applyBloom(source) {
  if (!config.BLOOM_ENABLED || bloomFBOs.length === 0) return;

  const knee = config.BLOOM_THRESHOLD * config.BLOOM_SOFT_KNEE + 0.0001;
  const curve0 = config.BLOOM_THRESHOLD - knee;
  const curve1 = knee * 2.0;
  const curve2 = 0.25 / knee;

  // Prefilter
  gl.useProgram(bloomPrefilterProg.program);
  gl.uniform2f(bloomPrefilterProg.uniforms.texelSize, 1.0 / bloomTarget.width, 1.0 / bloomTarget.height);
  gl.uniform1i(bloomPrefilterProg.uniforms.uTexture, source.attach(0));
  gl.uniform3f(bloomPrefilterProg.uniforms.curve, curve0, curve1, curve2);
  gl.uniform1f(bloomPrefilterProg.uniforms.threshold, config.BLOOM_THRESHOLD);
  blit(bloomTarget);

  // Downsample blur
  gl.useProgram(bloomBlurProg.program);
  let last = bloomTarget;
  for (let i = 0; i < bloomFBOs.length; i++) {
    const dest = bloomFBOs[i];
    gl.uniform2f(bloomBlurProg.uniforms.texelSize, 1.0 / last.width, 1.0 / last.height);
    gl.uniform1i(bloomBlurProg.uniforms.uTexture, last.attach(0));
    blit(dest);
    last = dest;
  }

  // Upsample and accumulate
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE);

  for (let i = bloomFBOs.length - 2; i >= 0; i--) {
    const dest = bloomFBOs[i];
    gl.uniform2f(bloomBlurProg.uniforms.texelSize, 1.0 / last.width, 1.0 / last.height);
    gl.uniform1i(bloomBlurProg.uniforms.uTexture, last.attach(0));
    blit(dest);
    last = dest;
  }

  gl.disable(gl.BLEND);
}

// ────────────────────────────────────────────
//  RENDER
// ────────────────────────────────────────────
function render() {
  applyBloom(dye.read);

  gl.useProgram(displayProg.program);
  gl.uniform2f(displayProg.uniforms.texelSize, 1.0 / gl.drawingBufferWidth, 1.0 / gl.drawingBufferHeight);
  gl.uniform1i(displayProg.uniforms.uTexture, dye.read.attach(0));

  if (config.BLOOM_ENABLED && bloomFBOs.length > 0) {
    gl.uniform1i(displayProg.uniforms.uBloom, bloomFBOs[0].attach(1));
    gl.uniform1f(displayProg.uniforms.uBloomIntensity, config.BLOOM_INTENSITY);
  } else {
    gl.uniform1f(displayProg.uniforms.uBloomIntensity, 0.0);
  }

  blit(null);
}

// ────────────────────────────────────────────
//  SPLAT (inject dye + velocity)
// ────────────────────────────────────────────
function splat(x, y, dx, dy, color) {
  gl.useProgram(splatProg.program);
  gl.uniform1i(splatProg.uniforms.uTarget, velocity.read.attach(0));
  gl.uniform1f(splatProg.uniforms.aspectRatio, canvas.width / canvas.height);
  gl.uniform2f(splatProg.uniforms.point, x, y);
  gl.uniform3f(splatProg.uniforms.color, dx, dy, 0.0);
  gl.uniform1f(splatProg.uniforms.radius, correctRadius(config.SPLAT_RADIUS / 100.0));
  blit(velocity.write);
  velocity.swap();

  gl.uniform1i(splatProg.uniforms.uTarget, dye.read.attach(0));
  gl.uniform3f(splatProg.uniforms.color, color.r, color.g, color.b);
  blit(dye.write);
  dye.swap();
}

function correctRadius(radius) {
  const aspect = canvas.width / canvas.height;
  return aspect > 1 ? radius * aspect : radius;
}

function multipleSplats(count) {
  for (let i = 0; i < count; i++) {
    const color = getRandomColor(config.PALETTE);
    const x = Math.random();
    const y = Math.random();
    const angle = Math.random() * Math.PI * 2;
    const speed = 150 + Math.random() * 300;
    const dx = Math.cos(angle) * speed;
    const dy = Math.sin(angle) * speed;
    splat(x, y, dx, dy, color);
  }
}

// ────────────────────────────────────────────
//  AUTO-SPLAT SYSTEM
// ────────────────────────────────────────────
let autoSplatTimer = 0;
let flowAngle = 0;

function autoSplat(dt) {
  if (!config.AUTO_SPLAT) return;

  autoSplatTimer += dt;
  if (autoSplatTimer < config.AUTO_SPLAT_INTERVAL) return;
  autoSplatTimer = 0;

  // Organic flowing motion using multiple sine waves
  flowAngle += 0.02 + Math.random() * 0.03;
  const t = performance.now() * 0.001;

  const x = 0.5 + 0.35 * Math.sin(t * 0.7 + flowAngle);
  const y = 0.5 + 0.35 * Math.cos(t * 0.5 + flowAngle * 1.3);

  const angle = Math.sin(t * 0.3) * Math.PI + Math.random() * 0.5;
  const speed = 200 + Math.sin(t * 0.8) * 150;
  const dx = Math.cos(angle) * speed;
  const dy = Math.sin(angle) * speed;

  const color = getRandomColor(config.PALETTE);
  splat(x, y, dx, dy, color);
}

// ────────────────────────────────────────────
//  INPUT HANDLING
// ────────────────────────────────────────────
const pointers = new Map();

canvas.addEventListener('pointerdown', (e) => {
  const x = e.offsetX / canvas.clientWidth;
  const y = 1.0 - e.offsetY / canvas.clientHeight;
  pointers.set(e.pointerId, { x, y, prevX: x, prevY: y, down: true });
  canvas.setPointerCapture(e.pointerId);
});

canvas.addEventListener('pointermove', (e) => {
  const ptr = pointers.get(e.pointerId);
  const x = e.offsetX / canvas.clientWidth;
  const y = 1.0 - e.offsetY / canvas.clientHeight;

  if (ptr && ptr.down) {
    const dx = (x - ptr.prevX) * config.SPLAT_FORCE;
    const dy = (y - ptr.prevY) * config.SPLAT_FORCE;
    if (Math.abs(dx) > 0 || Math.abs(dy) > 0) {
      const color = getRandomColor(config.PALETTE);
      splat(x, y, dx, dy, color);
    }
    ptr.prevX = x;
    ptr.prevY = y;
  } else {
    pointers.set(e.pointerId, { x, y, prevX: x, prevY: y, down: false });
  }
});

canvas.addEventListener('pointerup', (e) => {
  const ptr = pointers.get(e.pointerId);
  if (ptr) ptr.down = false;
});

// Scroll to resize brush
window.addEventListener('wheel', (e) => {
  config.SPLAT_RADIUS = Math.max(0.05, Math.min(1.5, config.SPLAT_RADIUS + e.deltaY * -0.001));
});

// ────────────────────────────────────────────
//  KEYBOARD SHORTCUTS
// ────────────────────────────────────────────
window.addEventListener('keydown', (e) => {
  switch (e.key.toLowerCase()) {
    case 'p': cyclePalette(); break;
    case 'a': toggleAutoSplat(); break;
    case ' ': e.preventDefault(); triggerBurst(); break;
    case 'b': toggleBloom(); break;
    case 'r': resetSim(); break;
    case 's': captureFrame(); break;
  }
});

// ────────────────────────────────────────────
//  GLOBAL CONTROLS (called from HTML buttons)
// ────────────────────────────────────────────
let paletteIndex = 0;

window.cyclePalette = function () {
  paletteIndex = (paletteIndex + 1) % paletteNames.length;
  config.PALETTE = paletteNames[paletteIndex];
  document.getElementById('paletteName').textContent = config.PALETTE;
  // Inject a few splats with the new palette
  multipleSplats(3);
};

window.toggleAutoSplat = function () {
  config.AUTO_SPLAT = !config.AUTO_SPLAT;
};

window.triggerBurst = function () {
  multipleSplats(Math.floor(5 + Math.random() * 10));
};

window.toggleBloom = function () {
  config.BLOOM_ENABLED = !config.BLOOM_ENABLED;
};

window.resetSim = function () {
  initFramebuffers();
  multipleSplats(Math.floor(5 + Math.random() * 8));
};

window.captureFrame = function () {
  // Re-render to ensure drawingBuffer has content
  render();
  canvas.toBlob((blob) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `colors_${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  });
};

// ────────────────────────────────────────────
//  RESIZE
// ────────────────────────────────────────────
function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(canvas.clientWidth * dpr);
  canvas.height = Math.floor(canvas.clientHeight * dpr);
  initFramebuffers();
}

window.addEventListener('resize', resize);

// ────────────────────────────────────────────
//  MAIN LOOP
// ────────────────────────────────────────────
let lastTime = 0;

function animate(time) {
  const dt = Math.min((time - lastTime) / 1000, 0.016667);
  lastTime = time;

  autoSplat(dt);
  step(dt);
  render();

  requestAnimationFrame(animate);
}

// ── BOOT ──
resize();
multipleSplats(Math.floor(8 + Math.random() * 8));
requestAnimationFrame(animate);
