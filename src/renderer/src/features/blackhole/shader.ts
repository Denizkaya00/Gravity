/**
 * A Schwarzschild black hole, ray traced on the GPU in two passes.
 *
 * Units: the Schwarzschild radius is 1 (so M = 0.5, the photon sphere sits at
 * r = 1.5 and the innermost stable circular orbit at r = 3).
 *
 * Light paths are integrated with the well-known closed form for null
 * geodesics in Schwarzschild space, written in Cartesian coordinates:
 *
 *     d²x/dλ² = -3/2 · h² · x / r⁵        where h = |x × dx/dλ|
 *
 * which bends rays exactly as general relativity predicts (Einstein ring,
 * photon ring, the far side of the disk lensed over the top and bottom).
 *
 * The accretion disk is thin and lies in the y = 0 plane between the ISCO and
 * R_OUT. Its temperature follows the Shakura–Sunyaev profile, matter moves on
 * Keplerian orbits, and the observed light includes relativistic Doppler
 * beaming and gravitational redshift (g = δ·√(1 − 1/r), I ∝ g⁴T⁴).
 *
 * Pass 1 (TRACE) runs at a reduced resolution and writes two textures: the
 * light collected along each ray (HDR), and the direction the ray finally
 * escapes in. Pass 2 (COMPOSITE) runs at full Retina resolution: it upsamples
 * the light and draws the stars from the escape direction, so the stars are
 * crisp points while still being lensed correctly.
 */

export const VERTEX = /* glsl */ `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

const COMMON = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}
float noise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash13(i), hash13(i + vec3(1, 0, 0)), f.x), mix(hash13(i + vec3(0, 1, 0)), hash13(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash13(i + vec3(0, 0, 1)), hash13(i + vec3(1, 0, 1)), f.x), mix(hash13(i + vec3(0, 1, 1)), hash13(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}
float fbm(vec3 p) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    s += a * noise(p);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
  }
  return s;
}

// Where the shadow's edge is in terms of h = |camPos × dir|, the quantity both
// passes measure per pixel. Rays start at the camera with |v| = 1, which makes
// their true impact parameter 1/b² = 1/h² − 1/r³, so the edge (b = B_CRIT) sits
// at a slightly smaller h when the camera is close: 2.598 from far away, 2.538
// at r = 5. Using B_CRIT directly put the photon ring beside the shadow up close.
float criticalH(float camDist) {
  return inversesqrt(1.0 / (B_CRIT * B_CRIT) + 1.0 / (camDist * camDist * camDist));
}
`

// ── pass 1: trace ───────────────────────────────────────────────────────────
export const TRACE = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uFocal;
uniform vec2  uCenter;    // where the hole sits on screen, as an offset in uv units
uniform float uDensity;   // how much matter is in the disk, 0..1
uniform float uFlare;     // a short burst of accretion, 0..1
uniform float uBeaming;   // 0 = Interstellar-style symmetric disk, 1 = physically beamed

layout(location = 0) out vec4 oLight;  // HDR light gathered along the ray
layout(location = 1) out vec4 oSky;    // xyz: escape direction, w: how much sky shows through

const float R_IN  = 3.0;   // ISCO
const float R_OUT = 15.0;
const float T_PEAK = 5600.0;
const int   STEPS = 220;
// The critical impact parameter 3√3/2 rₛ: rays aimed closer than this fall in,
// so it is exactly the edge of the shadow, from any viewing angle.
const float B_CRIT = 2.5980762;
const float PI = 3.14159265;

${COMMON}

// Blackbody colour for a temperature in kelvin (Tanner Helland's fit), in linear light.
vec3 blackbody(float kelvin) {
  float t = clamp(kelvin, 1000.0, 40000.0) / 100.0;
  vec3 c;
  c.r = t <= 66.0 ? 1.0 : clamp(1.29294 * pow(t - 60.0, -0.1332048), 0.0, 1.0);
  c.g = t <= 66.0 ? clamp(0.39008 * log(t) - 0.63184, 0.0, 1.0) : clamp(1.12989 * pow(t - 60.0, -0.0755148), 0.0, 1.0);
  c.b = t >= 66.0 ? 1.0 : (t <= 19.0 ? 0.0 : clamp(0.54321 * log(t - 10.0) - 1.19625, 0.0, 1.0));
  return pow(c, vec3(2.2));
}

// How much of a noise octave to keep, given its frequency (cells per unit length,
// radially and along the orbit) and the pixel's footprint in those directions.
// Detail finer than about two pixels can't be shown, only aliased into beaded,
// broken lines, so it fades to its average instead.
float keepOctave(vec2 freq, vec2 foot) {
  return 1.0 - smoothstep(0.35, 0.8, max(freq.x * foot.x, freq.y * foot.y));
}

// fbm that stops at the octaves the pixel can resolve. Skipped octaves add their
// average, so brightness doesn't change with distance, and cost nothing.
float fbmLod(vec3 p, vec2 freq, vec2 foot) {
  float a = 0.5;
  float s = 0.0;
  for (int i = 0; i < 5; i++) {
    float keep = keepOctave(freq, foot);
    if (keep <= 0.0) {
      s += a * (1.0 - exp2(-float(5 - i)));
      break;
    }
    s += a * mix(0.5, noise(p), keep);
    p = p * 2.07 + vec3(1.7, 9.2, 3.1);
    a *= 0.5;
    freq *= 2.07;
  }
  return s;
}

// Light emitted by the disk where a ray crosses it. Returns colour and opacity.
// spread: the pixel's width where the ray started to cross, before a grazing view stretches it.
vec4 disk(vec3 pos, vec3 rayDir, float spread) {
  float r = length(pos.xz);
  if (r < R_IN * 0.96 || r > R_OUT) return vec4(0.0);

  // The pixel's footprint on the disk is an ellipse, stretched along the ray's
  // direction in the plane by 1/|cos|. Measure it radially and along the orbit.
  vec2 radial = pos.xz / r;
  vec2 along = normalize(rayDir.xz + vec2(1e-6));
  float c = dot(along, radial);
  float stretch = 1.0 / max(abs(rayDir.y), 0.02);
  vec2 foot = spread * vec2(length(vec2(c * stretch, sqrt(max(1.0 - c * c, 0.0)))), length(vec2(sqrt(max(1.0 - c * c, 0.0)) * stretch, c)));

  // Keplerian angular velocity Ω = √(M / r³) with M = 0.5. Inner rings lap the outer ones.
  float omega = sqrt(0.5 / (r * r * r));
  float ang = atan(pos.z, pos.x) + omega * uTime * 2.2;
  // Noise sampled on a fixed-radius circle with high radial frequency: features
  // become long arcs along the orbit, the way Keplerian shear stretches real gas.
  vec2 q = vec2(cos(ang), sin(ang));
  float broad = fbmLod(vec3(q * 1.6, r * 0.9), vec2(0.9, 1.6 / r), foot);
  float fil = fbmLod(vec3(q * 3.2 + 7.0, r * 3.4), vec2(3.4, 3.2 / r), foot);
  float fineKeep = keepOctave(vec2(11.0, 9.0 / r), foot);
  float fine = fineKeep > 0.0 ? mix(0.5, noise(vec3(q * 9.0, r * 11.0)), fineKeep) : 0.5;

  float edge = smoothstep(R_IN * 0.96, R_IN * 1.25, r) * (1.0 - smoothstep(R_OUT * 0.45, R_OUT, r));
  float density = edge * mix(0.45, 1.15, broad) * mix(0.7, 1.12, fil) * mix(0.9, 1.05, fine);
  density *= mix(0.6, 1.1, uDensity);

  // Shakura–Sunyaev temperature profile; peaks a little outside the ISCO.
  float x = R_IN / r;
  float prof = pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0) + 0.015, 0.25) / 0.488;
  float temp = T_PEAK * prof * (1.0 + uFlare * 0.6);

  // Doppler factor for matter orbiting at β = √(M / (r − 2M)), times gravitational redshift.
  float beta = clamp(sqrt(0.5 / (r - 1.0)), 0.0, 0.75);
  vec3 vel = beta * normalize(vec3(-pos.z, 0.0, pos.x));
  vec3 toCamera = -rayDir;
  float gamma = inversesqrt(1.0 - beta * beta);
  float doppler = 1.0 / (gamma * (1.0 - dot(vel, toCamera)));
  float g = mix(1.0, doppler, uBeaming) * sqrt(max(1.0 - 1.0 / r, 0.0));

  vec3 col = blackbody(temp * g) * vec3(1.0, 0.9, 0.78); // a slightly warm film stock
  float intensity = pow(g, 4.0) * pow(prof, 2.2) * 1.7 * (1.0 + uFlare * 2.5);
  float alpha = clamp(density * 0.92, 0.0, 0.93);
  return vec4(col * intensity * (0.4 + density), alpha);
}

vec3 rayDir(vec2 frag) {
  vec2 uv = (frag - 0.5 * uRes) / uRes.y - uCenter;
  return normalize(uCamFwd * uFocal + uCamRight * uv.x + uCamUp * uv.y);
}

// The bending acceleration -3/2 · h² · x / r⁵, without pow().
vec3 bend(vec3 p, float r, float h2) {
  float r2 = r * r;
  return (-1.5 * h2 / (r2 * r2 * r)) * p;
}

// Follows one light ray backwards from the camera.
// pixAngle: the angle one sample covers, for sizing its footprint on the disk.
// light: what it collected; sky.xyz: where it escaped to; sky.w: transmittance (0 if it fell in).
void trace(vec3 dir, float pixAngle, out vec3 light, out vec4 sky) {
  vec3 p = uCamPos;
  vec3 v = dir;
  vec3 hv = cross(p, v);
  float h2 = dot(hv, hv);

  vec3 col = vec3(0.0);
  vec3 glow = vec3(0.0);
  float trans = 1.0;
  bool captured = false;
  float escapeR = length(uCamPos) + 30.0;
  float travelled = 0.0;
  // How far the ray has swept around the hole (angular momentum h = r²·dφ/dλ).
  float h = sqrt(h2);
  float swept = 0.0;

  // Each step's end radius and acceleration are the next step's start, so compute them once.
  float r = length(p);
  vec3 a0 = bend(p, r, h2);

  for (int i = 0; i < STEPS; i++) {
    // Small steps near the hole where paths bend sharply, long strides far away.
    float dt = clamp(0.04 + 0.08 * (r - 1.0), 0.035, 3.0);

    vec3 prev = p;
    swept += h / (r * r) * dt;
    p += v * dt + 0.5 * a0 * dt * dt;
    float rn = length(p);
    vec3 a1 = bend(p, rn, h2);
    v += 0.5 * (a0 + a1) * dt;
    a0 = a1;
    r = rn;

    // Crossing the disk plane? Each extra half turn round the hole makes the
    // disk's image about 23 times thinner. The first lensed ring (about a full
    // turn) is still a few pixels wide; the ones after it (about 1.5 turns and
    // more) are far below a pixel, so tracing them only scatters dots along the
    // shadow's edge. The composite draws that light as the photon ring instead.
    if (prev.y * p.y < 0.0 && swept < 2.65 * PI) {
      float f = prev.y / (prev.y - p.y);
      vec3 hit = mix(prev, p, f);
      vec4 d = disk(hit, normalize(v), pixAngle * (travelled + f * dt));
      d.a *= 1.0 - smoothstep(2.35 * PI, 2.65 * PI, swept);
      col += trans * d.rgb * d.a;
      trans *= 1.0 - d.a;
    }
    travelled += dt;

    // Diffuse light scattered around the hot inner disk. It fades in and out
    // smoothly: a hard edge here shows up as straight lines across the shadow.
    float rr = length(p.xz);
    if (rr > R_IN * 0.8 && rr < R_OUT) {
      float k = R_IN / rr;
      float edges = smoothstep(R_IN * 0.8, R_IN, rr) * (1.0 - smoothstep(R_OUT * 0.8, R_OUT, rr));
      float haze = exp(-abs(p.y) * 1.8) * k * k * edges * dt;
      glow += trans * haze * vec3(1.0, 0.58, 0.28) * 0.045 * (0.6 + uDensity + uFlare * 2.0);
    }

    if (rn < 1.0) {
      captured = true;
      break;
    }
    if (rn > escapeR && dot(p, v) > 0.0) break;
    if (trans < 0.01) break;
  }

  light = col + glow;
  sky = vec4(normalize(v), captured ? 0.0 : trans);
}

// A very faint band of unresolved stars. It is smooth, so it is drawn here at
// low resolution rather than once per Retina pixel in the composite.
vec3 starBand(vec3 d) {
  float x = d.y * 2.4 + d.x * 0.6;
  float band = exp(-x * x * 3.0);
  if (band < 0.01) return vec3(0.0);
  return vec3(0.55, 0.5, 0.45) * band * 0.006 * (0.6 + 0.8 * fbm(d * 6.0));
}

void main() {
  vec2 frag = gl_FragCoord.xy;
  vec3 dir = rayDir(frag);
  float b = length(cross(uCamPos, dir));
  // How much the impact parameter changes from one pixel to the next.
  float pix = length(uCamPos) / (uRes.y * uFocal);
  float pixAngle = 1.0 / (uRes.y * uFocal);
  float edge = criticalH(length(uCamPos));

  vec3 light;
  vec4 sky;
  // At the shadow's edge neighbouring rays take wildly different paths, so a
  // single sample per pixel looks jagged. Take four (rotated grid) there only,
  // over a band sized in pixels: a fixed width covers most of the screen up close.
  if (abs(b - edge) < max(0.15, pix * 10.0)) {
    float a = pixAngle * 0.5;
    vec3 l0; vec4 s0; trace(rayDir(frag + vec2(0.125, 0.375)), a, l0, s0);
    vec3 l1; vec4 s1; trace(rayDir(frag + vec2(-0.375, 0.125)), a, l1, s1);
    vec3 l2; vec4 s2; trace(rayDir(frag + vec2(-0.125, -0.375)), a, l2, s2);
    vec3 l3; vec4 s3; trace(rayDir(frag + vec2(0.375, -0.125)), a, l3, s3);
    light = 0.25 * (l0 + l1 + l2 + l3);
    sky = vec4(normalize(s0.xyz + s1.xyz + s2.xyz + s3.xyz), 0.25 * (s0.w + s1.w + s2.w + s3.w));
  } else {
    trace(dir, pixAngle, light, sky);
  }

  // Stars lensed right next to the shadow pile up into a noisy ring: fade them there.
  sky.w *= smoothstep(edge + 0.05, edge + 1.6, b);
  if (sky.w > 0.002) light += sky.w * starBand(sky.xyz);

  oLight = vec4(light, 1.0);
  oSky = sky;
}
`

// ── pass 2: composite at full resolution ───────────────────────────────────
export const COMPOSITE = /* glsl */ `#version 300 es
precision highp float;

uniform sampler2D uLight;
uniform sampler2D uSky;
uniform vec2  uRes;
uniform float uExposure;
uniform float uTime;
uniform vec3  uCamPos;
uniform vec3  uCamRight;
uniform vec3  uCamUp;
uniform vec3  uCamFwd;
uniform float uFocal;
uniform vec2  uCenter;
uniform float uDensity;
uniform float uFlare;

out vec4 outColor;

const float B_CRIT = 2.5980762;

// Catmull–Rom upsampling in 9 bilinear taps: much sharper than plain bilinear
// when stretching the low-resolution light to Retina size.
vec3 sampleCatmullRom(sampler2D tex, vec2 uv) {
  vec2 size = vec2(textureSize(tex, 0));
  vec2 pos = uv * size;
  vec2 p1 = floor(pos - 0.5) + 0.5;
  vec2 f = pos - p1;
  vec2 w0 = f * (-0.5 + f * (1.0 - 0.5 * f));
  vec2 w1 = 1.0 + f * f * (-2.5 + 1.5 * f);
  vec2 w2 = f * (0.5 + f * (2.0 - 1.5 * f));
  vec2 w3 = f * f * (-0.5 + 0.5 * f);
  vec2 w12 = w1 + w2;
  vec2 p0 = (p1 - 1.0) / size;
  vec2 p3 = (p1 + 2.0) / size;
  vec2 p12 = (p1 + w2 / w12) / size;
  vec3 r = vec3(0.0);
  r += texture(tex, vec2(p0.x, p0.y)).rgb * w0.x * w0.y;
  r += texture(tex, vec2(p12.x, p0.y)).rgb * w12.x * w0.y;
  r += texture(tex, vec2(p3.x, p0.y)).rgb * w3.x * w0.y;
  r += texture(tex, vec2(p0.x, p12.y)).rgb * w0.x * w12.y;
  r += texture(tex, vec2(p12.x, p12.y)).rgb * w12.x * w12.y;
  r += texture(tex, vec2(p3.x, p12.y)).rgb * w3.x * w12.y;
  r += texture(tex, vec2(p0.x, p3.y)).rgb * w0.x * w3.y;
  r += texture(tex, vec2(p12.x, p3.y)).rgb * w12.x * w3.y;
  r += texture(tex, vec2(p3.x, p3.y)).rgb * w3.x * w3.y;
  return max(r, vec3(0.0));
}

${COMMON}

vec3 aces(vec3 x) {
  return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0);
}

// Distant stars as Gaussian points whose size never drops below about a pixel,
// so they stay sharp and steady at full resolution. footprint: one pixel in direction space.
vec3 starfield(vec3 d, float footprint) {
  vec3 col = vec3(0.0);
  for (int layer = 0; layer < 3; layer++) {
    float scale = 55.0 + float(layer) * 75.0;
    vec3 p = d * scale;
    vec3 cell = floor(p);
    vec3 h = hash33(cell + float(layer) * 31.7);
    if (h.x > 0.955) {
      vec3 c = cell + 0.3 + 0.4 * hash33(cell * 1.7 + 4.1);
      vec3 off = p - c;
      float sigma = max(0.045, footprint * scale * 0.55);
      float energy = pow(h.y, 12.0) * 2.4 + 0.03;
      // Keep total light constant as the point spreads, so stars don't flicker.
      float peak = energy * (0.045 * 0.045) / (sigma * sigma);
      vec3 tint = mix(vec3(1.0, 0.82, 0.66), vec3(0.76, 0.85, 1.0), h.z);
      col += tint * min(peak, 3.0) * exp(-dot(off, off) / (2.0 * sigma * sigma));
    }
  }
  // (The faint band of unresolved stars is added in the trace pass.)
  return col;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 col = sampleCatmullRom(uLight, uv);
  vec4 sky = texture(uSky, uv);
  // Derivatives must be taken outside any branch.
  vec3 dir = normalize(sky.xyz + vec3(1e-6));
  float footprint = length(fwidth(dir));
  if (sky.w > 0.002) col += sky.w * starfield(dir, footprint);

  // The photon ring: light that orbited the hole before escaping. Drawn here, at
  // full resolution, from the exact impact parameter: a perfect, smooth circle.
  vec2 suv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uCenter;
  vec3 ray = normalize(uCamFwd * uFocal + uCamRight * suv.x + uCamUp * suv.y);
  float b = length(cross(uCamPos, ray));
  float pix = length(uCamPos) / (uRes.y * uFocal);
  float ring = exp(-pow((b - criticalH(length(uCamPos)) * 1.003) / max(pix * 0.9, 0.0015), 2.0));
  col += ring * vec3(1.0, 0.74, 0.5) * (0.14 + 0.2 * uDensity + 0.6 * uFlare);
  col = aces(col * uExposure);
  col = pow(col, vec3(1.0 / 2.2));
  // Dither to avoid banding in the dark gradients.
  col += (hash13(vec3(gl_FragCoord.xy, uTime * 60.0)) - 0.5) / 255.0;
  outColor = vec4(col, 1.0);
}
`
