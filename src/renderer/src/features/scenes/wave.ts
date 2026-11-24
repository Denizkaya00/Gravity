import { HEADER } from './glsl'

/**
 * Kanagawa, by day and by night. Hokusai's print, "Under the Wave off Kanagawa"
 * (c. 1831, public domain; the Metropolitan Museum of Art's scan via Wikimedia
 * Commons). By day it's the print itself, a little muted. By night it's re-inked as a nocturne in Gravity's own palette, as if
 * pulled on dark paper: the beige paper becomes graphite (keeping its mottling),
 * the grey bokashi at the horizon becomes a faint moonlit haze, Prussian blue
 * becomes muted indigo and slate, foam and snow the interface's warm cream, the
 * boats a quiet sepia.
 *
 * Only what's already in the print moves: the water heaves along long, slow
 * swells and the frame drifts slightly. Nothing is drawn over the foam, and the
 * woodblock lines stay put.
 */
export const WAVE = /* glsl */ `${HEADER}
uniform sampler2D uTex;
uniform vec2 uTexSize;
uniform float uHasTex;

const vec3 INK      = vec3(0.028, 0.032, 0.046);
const vec3 PAPER    = vec3(0.235, 0.215, 0.188);
const vec3 MOON     = vec3(0.880, 0.850, 0.780);

// The print at night: one smooth tone curve from cool ink black up to a dark,
// warm paper, so foam and sky stay the same paper they are in the original (in a
// woodblock print the white is bare paper) and the blues keep their depth below
// it. A little of the print's own colour survives, muted.
vec3 nocturne(vec3 c) {
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  float tone = pow(clamp(L, 0.0, 1.0), 1.55);
  vec3 col = mix(INK, PAPER, tone);
  col += (c - L) * 0.16 * mix(0.6, 1.0, tone);
  return max(col, 0.0);
}

// The print by day: its own colours, a little muted and dimmed so the clock
// still reads over the paper, and warmed toward Gravity's film stock.
vec3 daylight(vec3 c) {
  float L = dot(c, vec3(0.299, 0.587, 0.114));
  vec3 col = mix(vec3(L), c, 0.78) * 0.66;
  return col * vec3(1.0, 0.985, 0.96);
}

void main() {
  // Centred on the window, not shifted beside the sidebar: shifting would need
  // a much closer crop. The sidebar's glass sits over the back of the wave.
  vec2 uv = (gl_FragCoord.xy - 0.5 * uRes) / uRes.y;
  float t = uTime;
  float night = clamp(uNight, 0.0, 1.0);
  if (uHasTex < 0.5) {
    outColor = vec4(finish(INK * 2.0, uv), 1.0);
    return;
  }

  // Cover the window with the print, a little larger to leave room to drift.
  float aImg = uTexSize.x / uTexSize.y;
  float aScr = uRes.x / uRes.y;
  float k = max(aScr / aImg, 1.0) * 1.035;
  vec2 drift = vec2(sin(t * 0.05), cos(t * 0.041)) * 0.008 - uParallax * vec2(0.008, 0.005);
  vec2 p = vec2(uv.x / (aImg * k), uv.y / k) + 0.5 + drift;

  vec3 printed = texture(uTex, p).rgb;
  // The water, for the heave: the print's blues (its white is bare paper, like the sky).
  float isWater = smoothstep(0.03, 0.14, printed.b - printed.r);
  float paperish = smoothstep(0.75, 0.9, dot(printed, vec3(0.299, 0.587, 0.114)));

  // The water heaves: a long swell rolling through under shorter waves, only
  // where there is water.
  vec2 heave = vec2(
    sin(p.y * 21.0 + p.x * 7.0 + t * 0.7) * 0.0028 + sin(p.y * 47.0 - t * 1.0) * 0.0009 + sin(p.x * 5.0 - t * 0.35) * 0.0012,
    sin(p.x * 15.0 - p.y * 4.0 - t * 0.55) * 0.0036 + sin(p.x * 39.0 + t * 0.9) * 0.001 + sin(p.x * 6.0 + p.y * 3.0 - t * 0.3) * 0.0016
  ) * isWater;
  vec3 heaved = texture(uTex, p + heave).rgb;
  // By day the top is darkened a little, as a graduated filter would, so the clock reads over the paper.
  vec3 day = daylight(heaved) * mix(1.0, 0.8, smoothstep(-0.05, 0.5, uv.y));
  vec3 col = mix(day, nocturne(heaved), night);

  // By night, a full moon in the clear sky: an even disc laid over the paper, a
  // fine halo and a wide pool of light. By day the print is left as it is.
  vec2 mp = (p - vec2(0.83, 0.79)) * vec2(aImg, 1.0);
  float md = length(mp);
  col *= 1.0 + 0.5 * exp(-md * 2.2) * paperish * night;
  // (No per-pixel sky mask on the disc itself: the paper's age spots would show through it.)
  float disc = fill(md - 0.021) * night;
  col = mix(col, MOON * 0.8, disc);
  col += MOON * (exp(-md * 22.0) * 0.06 + exp(-abs(md - 0.042) * 120.0) * 0.012) * (1.0 - disc) * (1.0 + 0.6 * uFlare) * night;
  // A closing tab brightens the print for a moment.
  col *= 1.0 + 0.1 * uFlare;

  outColor = vec4(finish(col, uv), 1.0);
}
`
