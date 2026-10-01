/**
 * GLSL ES 1.00 — the dialect every WebGL 1 and 2 context accepts, including expo-gl's.
 *
 * No extensions are assumed. In particular no `OES_standard_derivatives` and no
 * `EXT_shader_texture_lod`: border widths are passed in as texel offsets from the
 * camera instead, and seam-free mipmapping comes from unwrapping the exact per-fragment
 * longitude against the interpolated vertex UV (see `earthUv`).
 */

export const GLOBE_VERTEX = `
attribute vec3 aPos;
attribute vec2 aUv;
uniform mat4 uMVP;
uniform mat3 uRot;
varying vec3 vGeo;
varying vec3 vView;
varying vec2 vUv;
void main() {
  vGeo = aPos;
  vView = uRot * aPos;
  vUv = aUv;
  gl_Position = uMVP * vec4(aPos, 1.0);
}
`

/**
 * State codes match `STATE_CODES` in GlobeRenderer.ts: 0 none, 1 subject, 2 selected,
 * 3 correct, 4 incorrect, 5 context. A texel of `uStates` holds the code of one raster
 * ID, so changing what is highlighted is a 4 KB upload, never a geometry rebuild.
 */
export const GLOBE_FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif

uniform sampler2D uEarth;
uniform sampler2D uIds;
uniform sampler2D uStates;
uniform vec2 uIdSize;
uniform float uBorderTexels;
uniform float uGlowTexels;
uniform vec3 uStateColor[6];
uniform float uStateFill[6];
uniform vec3 uBorderColor;
uniform float uBorderAlpha;
uniform vec3 uRimColor;
uniform vec3 uLight;
uniform float uFlat;
uniform vec3 uFlatLand;
uniform vec3 uFlatWater;
uniform float uSaturation;

varying vec3 vGeo;
varying vec3 vView;
varying vec2 vUv;

const float PI = 3.14159265358979;

float decodeId(vec2 uv) {
  vec4 c = texture2D(uIds, uv);
  return floor(c.r * 255.0 + 0.5) + 256.0 * floor(c.g * 255.0 + 0.5);
}

float stateOf(float id) {
  float x = mod(id, 256.0);
  float y = floor(id / 256.0);
  return floor(texture2D(uStates, vec2((x + 0.5) / 256.0, (y + 0.5) / 4.0)).r * 255.0 + 0.5);
}

vec3 stateColor(float s) {
  vec3 c = uStateColor[0];
  if (s > 0.5) c = uStateColor[1];
  if (s > 1.5) c = uStateColor[2];
  if (s > 2.5) c = uStateColor[3];
  if (s > 3.5) c = uStateColor[4];
  if (s > 4.5) c = uStateColor[5];
  return c;
}

float stateFill(float s) {
  float a = 0.0;
  if (s > 0.5) a = uStateFill[1];
  if (s > 1.5) a = uStateFill[2];
  if (s > 2.5) a = uStateFill[3];
  if (s > 3.5) a = uStateFill[4];
  if (s > 4.5) a = uStateFill[5];
  return a;
}

void main() {
  vec3 n = normalize(vGeo);
  float lat = asin(clamp(n.y, -1.0, 1.0));
  float lon = atan(n.x, n.z);
  float u = lon / (2.0 * PI) + 0.5;
  // Unwrap against the interpolated UV so a 2x2 quad never straddles the seam.
  u = vUv.x + (fract(u - vUv.x + 0.5) - 0.5);
  vec2 uv = vec2(u, 0.5 - lat / PI);

  vec3 base;
  if (uFlat > 0.5) {
    float land = step(0.5, decodeId(uv));
    base = mix(uFlatWater, uFlatLand, land);
  } else {
    base = texture2D(uEarth, uv).rgb;
    float grey = dot(base, vec3(0.299, 0.587, 0.114));
    base = mix(vec3(grey), base, uSaturation);
  }

  // Highlight fill, bilinear over the four nearest ID texels so its edge is smooth.
  vec2 tc = uv * uIdSize - 0.5;
  vec2 f = fract(tc);
  vec2 b = (floor(tc) + 0.5) / uIdSize;
  vec2 o = 1.0 / uIdSize;
  float i00 = decodeId(b);
  float i10 = decodeId(b + vec2(o.x, 0.0));
  float i01 = decodeId(b + vec2(0.0, o.y));
  float i11 = decodeId(b + o);
  float s00 = stateOf(i00);
  float s10 = stateOf(i10);
  float s01 = stateOf(i01);
  float s11 = stateOf(i11);
  vec4 h00 = vec4(stateColor(s00), 1.0) * stateFill(s00);
  vec4 h10 = vec4(stateColor(s10), 1.0) * stateFill(s10);
  vec4 h01 = vec4(stateColor(s01), 1.0) * stateFill(s01);
  vec4 h11 = vec4(stateColor(s11), 1.0) * stateFill(s11);
  vec4 h = mix(mix(h00, h10, f.x), mix(h01, h11, f.x), f.y);
  vec3 color = base * (1.0 - h.a) + h.rgb;

  // Country borders: an ID change within a camera-scaled distance. Coasts are left to
  // the surface texture, which draws them better than a raster edge could.
  float id = decodeId(uv);
  float s = stateOf(id);
  float border = 0.0;
  if (id > 0.5) {
    vec2 d = o * uBorderTexels;
    float e = decodeId(uv + vec2(d.x, 0.0));
    float w = decodeId(uv - vec2(d.x, 0.0));
    float nn = decodeId(uv + vec2(0.0, d.y));
    float ss = decodeId(uv - vec2(0.0, d.y));
    if ((e > 0.5 && e != id) || (w > 0.5 && w != id) || (nn > 0.5 && nn != id) || (ss > 0.5 && ss != id)) border = 1.0;
  }
  color = mix(color, uBorderColor, border * uBorderAlpha);

  // Edge and glow for highlighted shapes: a bright inner edge, a soft outer halo.
  float glow = 0.0;
  float edge = 0.0;
  vec3 glowColor = vec3(0.0);
  vec2 g = o * uGlowTexels;
  if (uGlowTexels > 0.0) for (int k = 0; k < 8; k++) {
    float a = float(k) * PI / 4.0;
    vec2 p = uv + vec2(cos(a) * g.x, sin(a) * g.y);
    float sk = stateOf(decodeId(p));
    if (s < 0.5 && sk > 0.5 && sk < 4.5) {
      glow += 1.0 / 8.0;
      glowColor = stateColor(sk);
    }
    if (s > 0.5 && s < 4.5 && abs(sk - s) > 0.5) edge = 1.0;
  }
  color = mix(color, glowColor, min(1.0, glow * 1.4) * 0.55);
  color = mix(color, mix(stateColor(s), vec3(1.0), 0.55), edge * 0.85);

  // Soft daylight: never dark enough to hide a country on the far side of the disc.
  vec3 nv = normalize(vView);
  float diffuse = max(dot(nv, normalize(uLight)), 0.0);
  color *= 0.78 + 0.32 * diffuse;
  float rim = pow(1.0 - max(nv.z, 0.0), 3.0);
  color = mix(color, uRimColor, rim * 0.55);
  gl_FragColor = vec4(color, 1.0);
}
`

/** A full-viewport quad that draws the atmosphere halo behind the disc. */
export const HALO_VERTEX = `
attribute vec2 aCorner;
uniform vec2 uViewport;
varying vec2 vOffset;
void main() {
  // Pixel offset from the disc centre, computed here so no uniform is shared between
  // stages: GLSL ES requires a shared uniform to have the same precision in both, and
  // the fragment stage may only have mediump.
  vOffset = aCorner * 0.5 * uViewport;
  gl_Position = vec4(aCorner, 0.0, 1.0);
}
`

export const HALO_FRAGMENT = `
precision mediump float;
uniform float uRadius;
uniform vec3 uHaloColor;
uniform vec3 uBackground;
varying vec2 vOffset;
void main() {
  float r = length(vOffset);
  float t = (r - uRadius) / max(uRadius * 0.09, 1.0);
  float a = r < uRadius ? 0.0 : exp(-t * 1.6) * 0.75;
  gl_FragColor = vec4(mix(uBackground, uHaloColor, a), 1.0);
}
`

/** Thin lines lifted just off the surface: the subject's crisp outline. */
export const LINE_VERTEX = `
attribute vec3 aPos;
uniform mat4 uMVP;
void main() {
  gl_Position = uMVP * vec4(aPos * 1.0015, 1.0);
}
`

export const LINE_FRAGMENT = `
precision mediump float;
uniform vec4 uColor;
void main() {
  gl_FragColor = uColor;
}
`
