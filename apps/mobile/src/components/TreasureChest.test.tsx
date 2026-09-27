import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'
import { TreasureChest } from './TreasureChest.js'
import { soundUnlock } from '../lib/sound.js'
vi.mock('../lib/sound.js', () => ({ soundUnlock: vi.fn() }))
vi.mock('../lib/haptics.js', () => ({ hapticCelebrate: vi.fn() }))
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
    const reveal = vi.fn()
    const view = render(<TreasureChest opened={false} onOpen={() => {}} onReveal={reveal} />)
    const image = view.container.querySelector('img')
    expect(image).not.toBeNull()
    fireEvent.error(image!)
    expect(reveal).not.toHaveBeenCalled()
  })
})

