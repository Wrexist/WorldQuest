import { describe, expect, it, vi } from 'vitest'
import { AccessibilityInfo } from 'react-native'
import { render, waitFor } from '@testing-library/react'
import { withFullMotion } from '../test/setup.js'
import { ConfettiBurst } from './ConfettiBurst.js'

describe('ConfettiBurst', () => {
  it('throws its pieces when motion is allowed', async () => {
    // Reduced until the OS answers, so the pieces arrive a tick after mount.
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(false)
    await withFullMotion(async () => {
      const { findByTestId } = render(<ConfettiBurst size={240} />)
      expect((await findByTestId('confetti-burst')).childElementCount).toBe(28)
    })
  })

  it('is not there at all under Reduce Motion — the still underneath is the celebration', async () => {
    vi.spyOn(AccessibilityInfo, 'isReduceMotionEnabled').mockResolvedValue(true)
    const { queryByTestId } = render(<ConfettiBurst size={240} />)
    await waitFor(() => expect(queryByTestId('confetti-burst')).toBeNull())
  })
})
