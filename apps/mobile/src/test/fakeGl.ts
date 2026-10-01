/**
 * A WebGL context that records calls and draws nothing — for testing what the atlas
 * ASKS of the GPU (how many programs, textures and uploads, and that it deletes them),
 * never what the GPU produces. Pixels are proven by scripts/atlas-evidence.cjs.
 */

import { vi } from 'vitest'

export type FakeGl = Record<string, unknown> & { calls: Record<string, number> }

export function fakeGl(options: { failCompile?: boolean } = {}): FakeGl {
  const calls: Record<string, number> = {}
  let next = 1
  const counted = <T>(name: string, value: () => T) =>
    vi.fn(() => {
      calls[name] = (calls[name] ?? 0) + 1
      return value()
    })
  const gl: FakeGl = {
    calls,
    drawingBufferWidth: 700,
    drawingBufferHeight: 440,
    VERTEX_SHADER: 1,
    FRAGMENT_SHADER: 2,
    COMPILE_STATUS: 3,
    LINK_STATUS: 4,
    createShader: counted('createShader', () => ({ id: next++ })),
    shaderSource: counted('shaderSource', () => undefined),
    compileShader: counted('compileShader', () => undefined),
    getShaderParameter: counted('getShaderParameter', () => !options.failCompile),
    getShaderInfoLog: counted('getShaderInfoLog', () => 'fake compile failure'),
    deleteShader: counted('deleteShader', () => undefined),
    createProgram: counted('createProgram', () => ({ id: next++ })),
    attachShader: counted('attachShader', () => undefined),
    linkProgram: counted('linkProgram', () => undefined),
    getProgramParameter: counted('getProgramParameter', () => true),
    getProgramInfoLog: counted('getProgramInfoLog', () => ''),
    deleteProgram: counted('deleteProgram', () => undefined),
    createBuffer: counted('createBuffer', () => ({ id: next++ })),
    bindBuffer: counted('bindBuffer', () => undefined),
    bufferData: counted('bufferData', () => undefined),
    deleteBuffer: counted('deleteBuffer', () => undefined),
    createTexture: counted('createTexture', () => ({ id: next++ })),
    bindTexture: counted('bindTexture', () => undefined),
    texImage2D: counted('texImage2D', () => undefined),
    texParameteri: counted('texParameteri', () => undefined),
    generateMipmap: counted('generateMipmap', () => undefined),
    deleteTexture: counted('deleteTexture', () => undefined),
    pixelStorei: counted('pixelStorei', () => undefined),
    activeTexture: counted('activeTexture', () => undefined),
    getUniformLocation: counted('getUniformLocation', () => ({})),
    getAttribLocation: counted('getAttribLocation', () => 0),
    enableVertexAttribArray: counted('enableVertexAttribArray', () => undefined),
    disableVertexAttribArray: counted('disableVertexAttribArray', () => undefined),
    vertexAttribPointer: counted('vertexAttribPointer', () => undefined),
    useProgram: counted('useProgram', () => undefined),
    uniform1i: counted('uniform1i', () => undefined),
    uniform1f: counted('uniform1f', () => undefined),
    uniform2f: counted('uniform2f', () => undefined),
    uniform3f: counted('uniform3f', () => undefined),
    uniform4f: counted('uniform4f', () => undefined),
    uniform1fv: counted('uniform1fv', () => undefined),
    uniform3fv: counted('uniform3fv', () => undefined),
    uniformMatrix3fv: counted('uniformMatrix3fv', () => undefined),
    uniformMatrix4fv: counted('uniformMatrix4fv', () => undefined),
    viewport: counted('viewport', () => undefined),
    clearColor: counted('clearColor', () => undefined),
    clear: counted('clear', () => undefined),
    enable: counted('enable', () => undefined),
    disable: counted('disable', () => undefined),
    depthFunc: counted('depthFunc', () => undefined),
    cullFace: counted('cullFace', () => undefined),
    frontFace: counted('frontFace', () => undefined),
    blendFunc: counted('blendFunc', () => undefined),
    drawArrays: counted('drawArrays', () => undefined),
    drawElements: counted('drawElements', () => undefined),
    flush: counted('flush', () => undefined),
    isContextLost: () => false,
    endFrameEXP: counted('endFrameEXP', () => undefined),
  }
  return gl
}
