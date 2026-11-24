import { HEADER } from './glsl'

/**
 * A photograph as a background, by day and by night, with only small changes:
 * the frame drifts very slowly (a long, slow camera move), the photo's own fog
 * and cloud flow gently where there is any, and the two photos cross at sunrise
 * and sunset. Where a scene has no night photo, its day photo is graded down to
 * moonlight instead. Nothing is painted over the picture.
 */
export interface PhotoLook {
  /** How far the photo's fog and cloud drift in one flow cycle, in image widths. 0 for none. */
  flow: number
  /** The direction the fog drifts (it's normalised). */
  wind?: [number, number]
}

export function photoScene({ flow, wind = [1, 0.08] }: PhotoLook): string {
  const len = Math.hypot(wind[0], wind[1]) || 1
  const f = (n: number) => n.toFixed(5)
  return /* glsl */ `${HEADER}
uniform sampler2D uTex;      // the day photo
uniform vec2 uTexSize;
uniform float uHasTex;
uniform sampler2D uTex2;     // the night photo, if there is one
uniform vec2 uTex2Size;
uniform float uHasTex2;

const float FLOW = ${f(flow)};
const vec2 WIND = vec2(${f(wind[0] / len)}, ${f(wind[1] / len)});

float luma(vec3 c) {
  return dot(c, vec3(0.299, 0.587, 0.114));
}

// Where in a photo of this size the pixel falls: the photo covers the window,
// a little larger than it so there is room to drift.
vec2 cover(vec2 uv, vec2 size, float zoom, vec2 drift) {
  float aImg = size.x / size.y;
  float aScr = uRes.x / uRes.y;
  float k = max(aScr / aImg, 1.0) * zoom;
  return vec2(uv.x / (aImg * k), uv.y / k) + 0.5 + drift;
}

// The photo, with its fog drifting: bright, colourless areas (fog, cloud, haze)
// slide slowly downwind, in two staggered phases that cross-fade so the drift
// never jumps back. Everything else stays put.
vec3 photo(sampler2D tex, vec2 p, float t) {
  vec3 still = texture(tex, p).rgb;
  if (FLOW <= 0.0) return still;
  float L = luma(still);
  float sat = max(still.r, max(still.g, still.b)) - min(still.r, min(still.g, still.b));
  float fog = smoothstep(0.32, 0.72, L) * (1.0 - smoothstep(0.06, 0.2, sat));
  // Soften the mask with the blurred photo, so the moving area has no hard edge.
  vec3 soft = textureLod(tex, p, 4.0).rgb;
  fog *= smoothstep(0.28, 0.62, luma(soft));
  float cycle = 14.0;
  float ph0 = fract(t / cycle);
  float ph1 = fract(t / cycle + 0.5);
  vec2 step0 = WIND * FLOW * (ph0 - 0.5) * fog;
  vec2 step1 = WIND * FLOW * (ph1 - 0.5) * fog;
  float w0 = 1.0 - abs(1.0 - 2.0 * ph0);
  return texture(tex, p - step0).rgb * w0 + texture(tex, p - step1).rgb * (1.0 - w0);
}

// The day photo, quietened to sit with the rest of Gravity: a little of its
// colour taken out, and the top darkened as a graduated filter would, so the
// clock still reads over a bright sky.
vec3 daylight(vec3 c, vec2 uv) {
  vec3 col = mix(vec3(luma(c)), c, 0.84) * 0.92;
  return col * mix(1.0, 0.74, smoothstep(-0.05, 0.5, uv.y));
}

// A day photo taken down to moonlight: a couple of stops darker, cool, with
// the colour mostly gone and the shadows deeper, while fog and sky keep a
// little more light, as they do under the moon.
vec3 moonlit(vec3 c) {
  float L = luma(c);
  vec3 grey = mix(vec3(L), c, 0.32);
  vec3 col = pow(grey, vec3(1.25)) * vec3(0.30, 0.37, 0.48);
  col += vec3(0.05, 0.065, 0.09) * smoothstep(0.45, 0.9, L);
  return col;
}

void main() {
  // Centred on the window, like the great wave: the sidebar's glass sits over the left.
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float night = clamp(uNight, 0.0, 1.0);
  if (uHasTex < 0.5) {
    outColor = vec4(finish(vec3(0.03), uv), 1.0);
    return;
  }

  // A very slow camera move: drifting a little and breathing in and out, and
  // leaning away from the pointer.
  vec2 drift = vec2(sin(t * 0.021), cos(t * 0.017)) * 0.007 - uParallax * vec2(0.008, 0.005);
  float zoom = 1.06 + 0.012 * sin(t * 0.011);

  vec3 raw = photo(uTex, cover(uv, uTexSize, zoom, drift), t);
  vec3 col = daylight(raw, uv);
  if (night > 0.0) {
    vec3 dark = uHasTex2 > 0.5 ? photo(uTex2, cover(uv, uTex2Size, zoom, drift), t) : moonlit(raw);
    col = mix(col, dark, night);
  }
  // A closing tab brightens the picture for a moment.
  col *= 1.0 + 0.12 * uFlare;

  outColor = vec4(finish(col, uv), 1.0);
}
`
}
