/**
 * The globe, drawn with raw WebGL on whatever context `expo-gl` (or a browser) hands us.
 *
 * Why not three.js: the native bundle sits at 5.01 MB against a 5.1 MB budget
 * (scripts/bundle-native.cjs) and three is ~0.6 MB of it alone, for a scene that is one
 * sphere, two textures and a quad. ADR 0017 records the measurement and the decision.
 *
 * ## Ownership
 *
 * Every GL object here belongs to ONE context and is deleted in `dispose()`. Nothing is
 * shared across views: a GL texture cannot outlive its context, and two mounted atlases
 * are two contexts. What IS shared — the parsed geometry, the asset files on disk — is
 * plain data held outside (see `atlasResources.ts`).
 *
 * ## Render on demand
 *
 * `render()` draws one frame and returns. Nothing here runs a loop: the view calls it
 * when the camera or the scene changes and stops calling when they stop, so a still
 * globe costs no GPU time at all.
 */

import { toVec3 } from '../geo/sphere.js'
import { globeRotation, viewProjection, discRadius } from '../geo/camera.js'
import type { Camera } from '../geo/types.js'
import type { HighlightState } from '../scene/types.js'
import { GLOBE_FRAGMENT, GLOBE_VERTEX, HALO_FRAGMENT, HALO_VERTEX, LINE_FRAGMENT, LINE_VERTEX } from './shaders.js'

/** What `uStates` stores per raster ID. Order matches the shader's `uStateColor`. */
export const STATE_CODES: Readonly<Record<HighlightState, number>> = {
  subject: 1,
  selected: 2,
  correct: 3,
  incorrect: 4,
  context: 5,
}

export type Rgb = readonly [number, number, number]

export type GlobeTheme = {
  readonly background: Rgb
  readonly halo: Rgb
  readonly border: Rgb
  readonly borderAlpha: number
  readonly rim: Rgb
  readonly states: Readonly<Record<HighlightState, Rgb>>
  readonly flat: boolean
  readonly flatLand: Rgb
  readonly flatWater: Rgb
  readonly saturation: number
  /** The app's ocean, which the sea is graded toward. */
  readonly water: Rgb
  /** The lifted subject's shadow. */
  readonly shadow: Rgb
}

export type GlobeQuality = 'high' | 'low'

/** The minimum a GL context must offer. Typed narrowly so tests can supply a fake. */
export type GL = WebGLRenderingContext & { endFrameEXP?: () => void }

/** A texture source: an HTMLImageElement on web, an expo-asset `Asset` on native. */
export type TextureSource = unknown

/** Per-frame GL error checks: development and `/atlas-lab` builds only. */
const DEBUG_GL = __DEV__ || process.env.EXPO_PUBLIC_ATLAS_LAB === '1'

/** How strongly each state tints its country. The subject is unmistakable; context is a hint. */
const FILL: Readonly<Record<HighlightState, number>> = {
  subject: 0.78,
  selected: 0.72,
  correct: 0.78,
  incorrect: 0.66,
  context: 0.4,
}

const STATE_TEX_W = 256
const STATE_TEX_H = 4

export function hexToRgb(hex: string): Rgb {
  const h = hex.replace('#', '')
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h.slice(0, 6), 16)
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]
}

function compile(gl: GL, type: number, source: string): WebGLShader {
  const shader = gl.createShader(type)
  if (shader === null) throw new Error('atlas: createShader failed')
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(shader)
    gl.deleteShader(shader)
    throw new Error(`atlas: shader compile failed: ${log ?? ''}`)
  }
  return shader
}

function link(gl: GL, vs: string, fs: string): WebGLProgram {
  const program = gl.createProgram()
  if (program === null) throw new Error('atlas: createProgram failed')
  const v = compile(gl, gl.VERTEX_SHADER, vs)
  const f = compile(gl, gl.FRAGMENT_SHADER, fs)
  gl.attachShader(program, v)
  gl.attachShader(program, f)
  gl.linkProgram(program)
  gl.deleteShader(v)
  gl.deleteShader(f)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    throw new Error(`atlas: program link failed: ${gl.getProgramInfoLog(program) ?? ''}`)
  }
  return program
}

/**
 * A UV sphere with a duplicated seam column, so the surface texture's UVs are continuous
 * inside every triangle. 128×64 keeps the silhouette round at full-screen size and stays
 * under 65 536 vertices for 16-bit indices.
 */
export function buildSphere(lonSegments = 128, latSegments = 64): { positions: Float32Array; uvs: Float32Array; indices: Uint16Array } {
  const positions = new Float32Array((lonSegments + 1) * (latSegments + 1) * 3)
  const uvs = new Float32Array((lonSegments + 1) * (latSegments + 1) * 2)
  let p = 0
  let t = 0
  for (let j = 0; j <= latSegments; j++) {
    const lat = 90 - (j / latSegments) * 180
    for (let i = 0; i <= lonSegments; i++) {
      const lon = -180 + (i / lonSegments) * 360
      const [x, y, z] = toVec3({ lat, lon })
      positions[p++] = x
      positions[p++] = y
      positions[p++] = z
      uvs[t++] = i / lonSegments
      uvs[t++] = j / latSegments
    }
  }
  const indices = new Uint16Array(lonSegments * latSegments * 6)
  let k = 0
  const row = lonSegments + 1
  for (let j = 0; j < latSegments; j++) {
    for (let i = 0; i < lonSegments; i++) {
      const a = j * row + i
      const b = a + row
      indices[k++] = a
      indices[k++] = b
      indices[k++] = a + 1
      indices[k++] = a + 1
      indices[k++] = b
      indices[k++] = b + 1
    }
  }
  return { positions, uvs, indices }
}

/** Row-major 3×3 → column-major for `uniformMatrix3fv`. */
function columnMajor3(m: readonly number[]): Float32Array {
  return new Float32Array([m[0]!, m[3]!, m[6]!, m[1]!, m[4]!, m[7]!, m[2]!, m[5]!, m[8]!])
}

export class GlobeRenderer {
  private readonly gl: GL
  private readonly globe: WebGLProgram
  private readonly halo: WebGLProgram
  private readonly line: WebGLProgram
  private readonly buffers: WebGLBuffer[] = []
  private readonly textures: WebGLTexture[] = []
  private readonly indexCount: number
  private readonly sphere: { pos: WebGLBuffer; uv: WebGLBuffer; idx: WebGLBuffer }
  private readonly quad: WebGLBuffer
  private readonly earth: WebGLTexture
  private readonly ids: WebGLTexture
  private readonly states: WebGLTexture
  private readonly stateData = new Uint8Array(STATE_TEX_W * STATE_TEX_H * 4)
  private outline: { buffer: WebGLBuffer; count: number } | null = null
  private focus = false
  private surfaceReady = false
  private idsReady = false
  private disposed = false
  private idSize: readonly [number, number] = [4096, 2048]

  constructor(
    gl: GL,
    private theme: GlobeTheme,
    private quality: GlobeQuality,
    private readonly browser: boolean,
  ) {
    this.gl = gl
    this.globe = link(gl, GLOBE_VERTEX, GLOBE_FRAGMENT)
    this.halo = link(gl, HALO_VERTEX, HALO_FRAGMENT)
    this.line = link(gl, LINE_VERTEX, LINE_FRAGMENT)

    const sphere = buildSphere(quality === 'high' ? 128 : 96, quality === 'high' ? 64 : 48)
    this.indexCount = sphere.indices.length
    this.sphere = {
      pos: this.buffer(gl.ARRAY_BUFFER, sphere.positions),
      uv: this.buffer(gl.ARRAY_BUFFER, sphere.uvs),
      idx: this.buffer(gl.ELEMENT_ARRAY_BUFFER, sphere.indices),
    }
    this.quad = this.buffer(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]))

    this.earth = this.texture()
    this.ids = this.texture()
    this.states = this.texture()
    gl.bindTexture(gl.TEXTURE_2D, this.states)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.uploadStates()
  }

  /** The drawing buffer's current width, device pixels. */
  get bufferWidth(): number {
    return this.gl.drawingBufferWidth
  }

  get contextLost(): boolean {
    return typeof this.gl.isContextLost === 'function' && this.gl.isContextLost()
  }

  get ready(): boolean {
    return this.surfaceReady && this.idsReady
  }

  setTheme(theme: GlobeTheme): void {
    this.theme = theme
  }

  /** The 4096×2048 surface. Mipmapped: it is minified at every zoom but the closest. */
  setSurface(source: TextureSource): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.earth)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR)
    gl.generateMipmap(gl.TEXTURE_2D)
    this.check('surface texture upload')
    this.surfaceReady = true
  }

  /**
   * The country ID raster. NEAREST and never mipmapped: averaging two IDs produces a
   * third country's ID, which is a wrong highlight, not a softer one.
   */
  setCountryIds(source: TextureSource, width: number, height: number): void {
    const gl = this.gl
    this.idSize = [width, height]
    gl.bindTexture(gl.TEXTURE_2D, this.ids)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    // A browser may colour-manage an image on upload, which would turn ID 57 into 58.
    // expo-gl decodes with stb_image and never does; it also warns on this parameter.
    if (this.browser) gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source as TexImageSource)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    this.check('country ID texture upload')
    this.idsReady = true
  }

  /** Highlight states by raster ID. Replaces everything; unlisted IDs are neutral. */
  setHighlights(byRasterId: ReadonlyMap<number, HighlightState>): void {
    // Anything but search-match context puts the rest of the land into soft focus.
    this.focus = [...byRasterId.values()].some((state) => state !== 'context')
    this.stateData.fill(0)
    for (const [id, state] of byRasterId) {
      if (id <= 0 || id >= STATE_TEX_W * STATE_TEX_H) continue
      this.stateData[id * 4] = STATE_CODES[state]
    }
    this.uploadStates()
  }

  /** A crisp outline for one country, as lon/lat segment pairs; null removes it. */
  setOutline(segments: Float64Array | null): void {
    const gl = this.gl
    if (this.outline !== null) {
      gl.deleteBuffer(this.outline.buffer)
      this.buffers.splice(this.buffers.indexOf(this.outline.buffer), 1)
      this.outline = null
    }
    if (segments === null || segments.length === 0) return
    const count = segments.length / 2
    const data = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const [x, y, z] = toVec3({ lon: segments[i * 2]!, lat: segments[i * 2 + 1]! })
      data[i * 3] = x
      data[i * 3 + 1] = y
      data[i * 3 + 2] = z
    }
    this.outline = { buffer: this.buffer(gl.ARRAY_BUFFER, data), count }
  }

  /** True after a complete frame is submitted; incomplete surfaces stay transparent. */
  render(camera: Camera, viewport: { width: number; height: number }): boolean {
    if (this.disposed || !this.ready) return false
    const gl = this.gl
    const width = gl.drawingBufferWidth
    const height = gl.drawingBufferHeight
    if (width === 0 || height === 0) return false
    const scale = width / Math.max(1, viewport.width)
    gl.viewport(0, 0, width, height)
    const [br, bg, bb] = this.theme.background
    gl.clearColor(br, bg, bb, 1)
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT)

    // Atmosphere first, behind everything, without depth.
    gl.disable(gl.DEPTH_TEST)
    gl.useProgram(this.halo)
    this.attribute(this.halo, 'aCorner', this.quad, 2)
    gl.uniform2f(this.uniform(this.halo, 'uViewport'), width, height)
    gl.uniform1f(this.uniform(this.halo, 'uRadius'), discRadius(camera, viewport) * scale)
    this.vec3(this.uniform(this.halo, 'uHaloColor'), this.theme.halo)
    this.vec3(this.uniform(this.halo, 'uBackground'), this.theme.background)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    // getError stalls the pipeline, so only development and lab builds pay for it — enough to turn
    // a silently black frame into a named failure while native acceptance is open.
    if (DEBUG_GL) this.check('halo pass')

    const mvp = viewProjection(camera, width / height)
    const rotation = columnMajor3(globeRotation(camera))

    gl.enable(gl.DEPTH_TEST)
    gl.depthFunc(gl.LEQUAL)
    gl.enable(gl.CULL_FACE)
    gl.cullFace(gl.BACK)
    // buildSphere's triangles wind counter-clockwise seen from outside.
    gl.frontFace(gl.CCW)
    gl.useProgram(this.globe)
    this.attribute(this.globe, 'aPos', this.sphere.pos, 3)
    this.attribute(this.globe, 'aUv', this.sphere.uv, 2)
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.sphere.idx)
    const u = (name: string) => this.uniform(this.globe, name)
    gl.uniformMatrix4fv(u('uMVP'), false, mvp)
    gl.uniformMatrix3fv(u('uRot'), false, rotation)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.earth)
    gl.uniform1i(u('uEarth'), 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.ids)
    gl.uniform1i(u('uIds'), 1)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.states)
    gl.uniform1i(u('uStates'), 2)
    gl.uniform2f(u('uIdSize'), this.idSize[0], this.idSize[1])

    // How many ID texels one screen pixel spans at the disc centre: borders and glows are
    // sized in pixels, so the offsets scale with the zoom.
    const radiusPx = discRadius(camera, viewport) * scale
    const texelsPerPixel = this.idSize[1] / (Math.PI * Math.max(1, radiusPx))
    gl.uniform1f(u('uBorderTexels'), Math.max(0.75, texelsPerPixel * 1.1))
    // With no highlighted subject, every halo sample resolves to no glow. Avoid the
    // 8-direction neighbourhood pass for an unselected Explore globe.
    gl.uniform1f(u('uGlowTexels'), this.focus && this.quality === 'high' ? Math.max(2, texelsPerPixel * 7) : 0)
    // Element by element, with scalar setters — valid on every WebGL implementation. (They
    // were suspected during the first Android run's black globe and ruled out by bisecting:
    // the cause was the texture path, see assetSource.ts. They stay because they are the
    // most portable form, and the locations are cached, so they cost nothing extra.)
    const order: HighlightState[] = ['subject', 'selected', 'correct', 'incorrect', 'context']
    this.vec3(u('uStateColor[0]'), [0, 0, 0])
    gl.uniform1f(u('uStateFill[0]'), 0)
    order.forEach((state, i) => {
      this.vec3(u(`uStateColor[${i + 1}]`), this.theme.states[state])
      gl.uniform1f(u(`uStateFill[${i + 1}]`), FILL[state])
    })
    this.vec3(u('uBorderColor'), this.theme.border)
    gl.uniform1f(u('uBorderAlpha'), this.theme.borderAlpha)
    this.vec3(u('uRimColor'), this.theme.rim)
    gl.uniform3f(u('uLight'), -0.45, 0.55, 0.7)
    gl.uniform1f(u('uFlat'), this.theme.flat ? 1 : 0)
    this.vec3(u('uFlatLand'), this.theme.flatLand)
    this.vec3(u('uFlatWater'), this.theme.flatWater)
    gl.uniform1f(u('uSaturation'), this.theme.saturation)
    this.vec3(u('uWater'), this.theme.water)
    this.vec3(u('uShadowColor'), this.theme.shadow)
    gl.uniform1f(u('uFocus'), this.focus ? 1 : 0)
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_SHORT, 0)
    if (DEBUG_GL) this.check('globe pass')
    gl.disable(gl.CULL_FACE)

    if (this.outline !== null) {
      gl.useProgram(this.line)
      this.attribute(this.line, 'aPos', this.outline.buffer, 3)
      gl.uniformMatrix4fv(this.uniform(this.line, 'uMVP'), false, mvp)
      gl.uniform4f(this.uniform(this.line, 'uColor'), 1, 1, 1, 0.95)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
      gl.drawArrays(gl.LINES, 0, this.outline.count)
      gl.disable(gl.BLEND)
    }
    gl.flush()
    gl.endFrameEXP?.()
    return true
  }

  /** Delete every GL object this renderer created. Safe to call twice. */
  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    const gl = this.gl
    for (const b of this.buffers) gl.deleteBuffer(b)
    for (const t of this.textures) gl.deleteTexture(t)
    gl.deleteProgram(this.globe)
    gl.deleteProgram(this.halo)
    gl.deleteProgram(this.line)
  }

  /**
   * Fail loudly on a GL error. An upload that fails silently draws a BLACK globe — which
   * the first Android run did — and a black globe is a renderer failure the lesson should
   * replace with the fallback, not a picture to show.
   */
  private check(what: string): void {
    const error = this.gl.getError()
    if (error !== this.gl.NO_ERROR) throw new Error(`atlas: ${what} failed (GL error 0x${error.toString(16)})`)
  }

  /**
   * Uniform locations, looked up once per program. On expo-gl every `getUniformLocation`
   * is a synchronous call across to the GL thread; ~40 of them per frame was most of the
   * 21 ms draw time the Android emulator measured.
   */
  private readonly locations = new Map<WebGLProgram, Map<string, WebGLUniformLocation | null>>()
  private uniform(program: WebGLProgram, name: string): WebGLUniformLocation | null {
    let table = this.locations.get(program)
    if (table === undefined) {
      table = new Map()
      this.locations.set(program, table)
    }
    if (!table.has(name)) table.set(name, this.gl.getUniformLocation(program, name))
    return table.get(name) ?? null
  }

  private vec3(location: WebGLUniformLocation | null, [r, g, b]: Rgb): void {
    this.gl.uniform3f(location, r, g, b)
  }

  private uploadStates(): void {
    const gl = this.gl
    gl.bindTexture(gl.TEXTURE_2D, this.states)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, STATE_TEX_W, STATE_TEX_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.stateData)
  }

  private buffer(target: number, data: ArrayBufferView): WebGLBuffer {
    const gl = this.gl
    const buffer = gl.createBuffer()
    if (buffer === null) throw new Error('atlas: createBuffer failed')
    gl.bindBuffer(target, buffer)
    gl.bufferData(target, data as BufferSource, gl.STATIC_DRAW)
    this.buffers.push(buffer)
    return buffer
  }

  private texture(): WebGLTexture {
    const texture = this.gl.createTexture()
    if (texture === null) throw new Error('atlas: createTexture failed')
    this.textures.push(texture)
    return texture
  }

  /**
   * Bind one attribute, first disabling whatever the previous program left enabled: an
   * array left pointing at the sphere's UVs would make the outline's longer draw read
   * past its end, which WebGL refuses with an error and a blank frame.
   */
  private attribute(program: WebGLProgram, name: string, buffer: WebGLBuffer, size: number): void {
    const gl = this.gl
    if (this.boundProgram !== program) {
      for (const location of this.enabled) gl.disableVertexAttribArray(location)
      this.enabled.clear()
      this.boundProgram = program
    }
    const key = `attribute:${name}`
    let table = this.attributes.get(program)
    if (table === undefined) this.attributes.set(program, (table = new Map()))
    if (!table.has(key)) table.set(key, gl.getAttribLocation(program, name))
    const location = table.get(key)!
    if (location < 0) return
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
    gl.enableVertexAttribArray(location)
    this.enabled.add(location)
    gl.vertexAttribPointer(location, size, gl.FLOAT, false, 0, 0)
  }
  private readonly attributes = new Map<WebGLProgram, Map<string, number>>()
  private boundProgram: WebGLProgram | null = null
  private readonly enabled = new Set<number>()
}
