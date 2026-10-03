import { expect, it, vi } from 'vitest'
import { colors } from '@worldquest/design'
import { fakeGl } from '../../../test/fakeGl.js'
import { WORLD_CAMERA } from '../geo/camera.js'
import { atlasTheme } from './atlasTheme.js'
import { GlobeRenderer, type GL } from './GlobeRenderer.js'

it('keeps the native surface transparent until both textures can form a complete frame', () => {
  const gl = fakeGl()
  const renderer = new GlobeRenderer(gl as unknown as GL, atlasTheme(colors, 'light'), 'high', false)
  const size = { width: 700, height: 440 }
  expect(renderer.render(WORLD_CAMERA, size)).toBe(false)
  renderer.setSurface({ surface: true })
  expect(renderer.render(WORLD_CAMERA, size)).toBe(false)
  expect(gl.calls['clear']).toBeUndefined()
  expect(gl.calls['endFrameEXP']).toBeUndefined()
  renderer.setCountryIds({ ids: true }, 4096, 2048)
  expect(renderer.render(WORLD_CAMERA, size)).toBe(true)
  expect(gl.calls['drawElements']).toBe(1)
  expect(gl.calls['endFrameEXP']).toBe(1)
  renderer.dispose()
  expect(renderer.render(WORLD_CAMERA, size)).toBe(false)
})

it('does not report a zero-size native buffer as a submitted frame', () => {
  const gl = fakeGl()
  gl.drawingBufferWidth = 0
  const renderer = new GlobeRenderer(gl as unknown as GL, atlasTheme(colors, 'light'), 'high', false)
  renderer.setSurface({ surface: true })
  renderer.setCountryIds({ ids: true }, 4096, 2048)
  expect(renderer.render(WORLD_CAMERA, { width: 700, height: 440 })).toBe(false)
  expect(gl.calls['endFrameEXP']).toBeUndefined()
  renderer.dispose()
})

it('skips the highlight neighbourhood for an unselected globe while retaining subject glow', () => {
  const gl = fakeGl()
  ;(gl.getUniformLocation as ReturnType<typeof vi.fn>).mockImplementation((_program, name) => ({ name }))
  const renderer = new GlobeRenderer(gl as unknown as GL, atlasTheme(colors, 'light'), 'high', false)
  renderer.setSurface({ surface: true })
  renderer.setCountryIds({ ids: true }, 4096, 2048)
  const glow = () => (gl.uniform1f as ReturnType<typeof vi.fn>).mock.calls
    .filter(([location]) => location.name === 'uGlowTexels').at(-1)![1] as number
  renderer.render(WORLD_CAMERA, { width: 700, height: 440 })
  expect(glow()).toBe(0)
  renderer.setHighlights(new Map([[1, 'context']]))
  renderer.render(WORLD_CAMERA, { width: 700, height: 440 })
  expect(glow()).toBe(0)
  renderer.setHighlights(new Map([[1, 'selected']]))
  renderer.render(WORLD_CAMERA, { width: 700, height: 440 })
  expect(glow()).toBeGreaterThan(0)
  renderer.dispose()
})
