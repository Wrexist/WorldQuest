import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render } from '@testing-library/react'
import { TreasureChest } from './TreasureChest.js'
import { soundUnlock } from '../lib/sound.js'
vi.mock('../lib/sound.js', () => ({ soundUnlock: vi.fn() }))
vi.mock('../lib/haptics.js', () => ({ hapticCelebrate: vi.fn(), hapticSelect: vi.fn() }))
afterEach(() => vi.restoreAllMocks())
describe('Chest reveal', () => {
  it('reveals a newly opened chest once with reduced motion', () => {
    vi.mocked(soundUnlock).mockClear()
    const reveal = vi.fn(), open = vi.fn()
    const view = render(<TreasureChest opened={false} onOpen={open} onReveal={reveal} />)
    expect(reveal).not.toHaveBeenCalled()
    fireEvent.click(view.getByTestId('streak-chest'))
    expect(open).toHaveBeenCalledOnce()
    view.rerender(<TreasureChest opened onOpen={open} onReveal={reveal} />)
    expect(reveal).toHaveBeenCalledOnce()
    expect(soundUnlock).toHaveBeenCalledOnce()
    view.rerender(<TreasureChest opened onOpen={open} onReveal={() => reveal()} />)
    expect(reveal).toHaveBeenCalledOnce()
  })
  it('restores an already-open receipt without replaying reward sound', () => {
    vi.mocked(soundUnlock).mockClear()
    const reveal = vi.fn()
    render(<TreasureChest opened onOpen={() => {}} onReveal={reveal} />)
    expect(reveal).toHaveBeenCalledOnce()
    expect(soundUnlock).not.toHaveBeenCalled()
  })
  it('does not reveal an unopened reward when image decoding fails', () => {
    const NativeImage = window.Image
    const requests: HTMLImageElement[] = []
    vi.spyOn(window, 'Image').mockImplementation(function () {
      const image = new NativeImage()
      requests.push(image)
      return image
    })
    const reveal = vi.fn(), open = vi.fn()
    const view = render(<TreasureChest opened={false} onOpen={open} onReveal={reveal} />)
    const request = requests.find(image => image.onerror !== null)
    expect(request).toBeTruthy()
    // RN Web decodes a separate Image. The rendered accessibility img has no handler.
    act(() => { fireEvent.error(request!) })
    expect(reveal).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
    expect(view.getByRole('button', { name: 'Open chest' }).getAttribute('aria-disabled')).not.toBe('true')
    fireEvent.click(view.getByTestId('streak-chest'))
    expect(open).toHaveBeenCalledOnce()
  })
  it('leaves an already-open chest disabled instead of offering another claim', () => {
    const open = vi.fn()
    const view = render(<TreasureChest opened onOpen={open} />)
    expect(view.getByTestId('streak-chest').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(view.getByTestId('streak-chest'))
    expect(open).not.toHaveBeenCalled()
  })
})

