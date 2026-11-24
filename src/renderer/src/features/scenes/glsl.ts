/**
 * Shared GLSL for the painted scenes (the photographs and the wave). Each scene is a
 * single fragment shader drawn at a reduced resolution and stretched to fit, so
 * it costs a fraction of the black hole. Colours are authored directly in
 * display space, in the same muted, warm film stock as the rest of Gravity.
 */

export const VERTEX = /* glsl */ `#version 300 es
in vec2 aPos;
void main() {
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`

/** Uniforms and helpers every scene starts with. */
export const HEADER = /* glsl */ `#version 300 es
precision highp float;

uniform vec2  uRes;
uniform float uTime;
uniform vec2  uCenter;    // where the composition's centre sits, as an offset in uv units
uniform vec2  uParallax;  // smoothed pointer position, -0.5..0.5
uniform float uFlare;     // a tab was just closed, 0..1
uniform float uDensity;   // how many tabs are open, 0..1
uniform float uNight;     // 0 day … 1 night, easing across at sunrise and sunset

out vec4 outColor;

const float PI = 3.14159265;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

vec2 hash22(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.xx + p3.yz) * p3.zy);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1.0, 0.0)), u.x),
             mix(hash12(i + vec2(0.0, 1.0)), hash12(i + vec2(1.0, 1.0)), u.x), u.y);
}

// Each octave is rotated, so the grid of the value noise never shows.
const mat2 OCT = mat2(1.6, 1.2, -1.2, 1.6);

float fbm(vec2 p, int octaves) {
  float s = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    if (i >= octaves) break;
    s += a * noise(p);
    p = OCT * p + vec2(1.7, 9.2);
    a *= 0.5;
  }
  return s;
}

// Screen position: y runs -0.5..0.5 bottom to top, x is scaled to match.
vec2 sceneUV() {
  return (gl_FragCoord.xy - 0.5 * uRes) / uRes.y - uCenter;
}

// Antialiased coverage of a shape from a signed distance (negative inside).
float fill(float d) {
  float w = max(fwidth(d), 1e-5);
  return clamp(0.5 - d / w, 0.0, 1.0);
}

// A thin line along d = 0, about px pixels wide.
float stroke(float d, float px) {
  float w = max(fwidth(d), 1e-5);
  return clamp(px * 0.5 - abs(d) / w + 0.5, 0.0, 1.0);
}

// The same, for code inside branches and early-out loops, where screen-space
// derivatives are undefined (fwidth there draws stray lines at the branch's
// edge). d is in uv units, so one pixel is 1 / uRes.y.
float fillUV(float d) {
  return clamp(0.5 - d * uRes.y, 0.0, 1.0);
}

float strokeUV(float d, float px) {
  return clamp(px * 0.5 + 0.5 - abs(d) * uRes.y, 0.0, 1.0);
}

// Vignette, a fine film grain and dithering, shared by every scene.
vec3 finish(vec3 col, vec2 uv) {
  float v = smoothstep(1.25, 0.25, length(uv * vec2(0.78, 1.0)));
  col *= mix(0.72, 1.0, v);
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  float grain = hash12(gl_FragCoord.xy + fract(uTime * 13.0) * 97.0) - 0.5;
  col += grain * 0.035 * (0.35 + lum);
  col += (hash12(gl_FragCoord.yx * 1.37 + 11.0) - 0.5) / 255.0;
  return clamp(col, 0.0, 1.0);
}
`
