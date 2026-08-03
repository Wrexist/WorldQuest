import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { SettingsScreen } from './SettingsScreen.js'
import { DEFAULTS } from './usePreferences.js'

const renderSettings = (overrides: Partial<Parameters<typeof SettingsScreen>[0]> = {}) => {
  const onChange = vi.fn()
  const result = render(
    <SettingsScreen version="1.2.3" preferences={DEFAULTS} onChange={onChange} {...overrides} />,
  )
  return { ...result, onChange }
}

describe('Settings', () => {
  it('renders every section', () => {
    renderSettings()
    for (const heading of ['Learning', 'Sound & feel', 'Language', 'Privacy & data', 'About']) {
      expect(screen.getByText(heading)).toBeTruthy()
    }
  })

  it('announces each toggle as one element with its state', () => {
    // A settings list sees more screen-reader use than any other screen. A reader
    // that has to sweep a label, then a paragraph, then an unlabelled control is a
    // toggle nobody flips.
    renderSettings()
    // Haptics, not sound: haptics default ON and sound defaults OFF, so this is the
    // one that proves a switch renders its state rather than a constant.
    const haptics = screen.getByRole('switch', { name: 'Vibration' })
    expect(haptics.getAttribute('aria-checked')).toBe('true')
  })

  it('starts with sound OFF, because nobody has been asked yet', () => {
    // design-system.md §9. A game that starts making noise on a bus, in a classroom,
    // or next to a sleeping baby has made an enemy in its first ten seconds. This
    // default read `true` for as long as there was no sound to play, and would have
    // been wrong the moment there was.
    renderSettings()
    expect(screen.getByRole('switch', { name: 'Sound effects' }).getAttribute('aria-checked')).toBe(
      'false',
    )
  })

  it('reflects a changed preference rather than its own state', () => {
    renderSettings({ preferences: { ...DEFAULTS, sound: true } })
    expect(screen.getByRole('switch', { name: 'Sound effects' }).getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('offers the daily goal as visible radios, not a hidden picker', () => {
    // Three options behind a sheet costs a tap and hides that a choice exists.
    renderSettings()
    const selected = screen.getByRole('radio', { name: '10 minutes a day' })
    expect(selected.getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('radio', { name: '5 minutes a day' })).toBeTruthy()
    expect(screen.getByRole('radio', { name: '20 minutes a day' })).toBeTruthy()
  })

  it('changes the language and reports the new value', () => {
    const { onChange } = renderSettings()
    fireEvent.click(screen.getByRole('radio', { name: 'Svenska' }))
    expect(onChange).toHaveBeenCalledWith('language', 'sv')
  })

  it('writes language names in their own language', () => {
    // "Swedish" is no help to someone who has accidentally set the app to a language
    // they cannot read. "Svenska" is.
    renderSettings()
    expect(screen.getByRole('radio', { name: 'Svenska' })).toBeTruthy()
    expect(screen.queryByRole('radio', { name: 'Swedish' })).toBeNull()
  })

  it('shows the build version rather than a placeholder', () => {
    renderSettings()
    expect(screen.getByText('1.2.3')).toBeTruthy()
  })

  it('renders a row with no destination as text, not as a dead button', () => {
    // A button role promises an action. Promising one that does not exist is worse
    // than showing plain text.
    renderSettings({ onOpenPrivacyPolicy: undefined })
    expect(screen.queryByRole('button', { name: 'Privacy policy' })).toBeNull()
    expect(screen.getByText('Privacy policy')).toBeTruthy()
  })

  it('makes a row a button once it has somewhere to go', () => {
    const onOpenPrivacyPolicy = vi.fn()
    renderSettings({ onOpenPrivacyPolicy })
    fireEvent.click(screen.getByRole('button', { name: 'Privacy policy' }))
    expect(onOpenPrivacyPolicy).toHaveBeenCalledOnce()
  })

  it('has no export or delete button while there is no account to act on', () => {
    // Both are GDPR obligations that arrive with accounts. A button that cannot work
    // is worse than an explanation of why it is not there yet.
    renderSettings()
    // Assert on CONTROLS, not on text. The explanatory copy legitimately contains
    // the word "exporting", so matching text made this pass for the wrong reason.
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /delete/i })).toBeNull()
    expect(screen.getByText(/learning without an account/i)).toBeTruthy()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderSettings()
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})

describe('Settings — work waiting to sync', () => {
  const withSync = (parked: number, onRetry = vi.fn()) => {
    render(
      <SettingsScreen
        version="1.0.0"
        preferences={DEFAULTS}
        onChange={vi.fn()}
        sync={{ parked, onRetry }}
      />,
    )
    return onRetry
  }

  it('says nothing at all when nothing is waiting', () => {
    // A permanent "0 items waiting" row is anxiety with no cause.
    const { container } = render(
      <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} sync={{ parked: 0, onRetry: vi.fn() }} />,
    )
    expect(container.textContent).not.toMatch(/waiting to sync/i)
  })

  it('names what is waiting, and says it is safe', () => {
    withSync(2)
    expect(screen.getByText(/2 lessons haven't reached the server yet/i)).toBeTruthy()
    expect(screen.getByText(/Nothing is lost/i)).toBeTruthy()
  })

  it('handles the singular without reading like a template', () => {
    withSync(1)
    expect(screen.getByText(/1 lesson hasn't reached the server yet/i)).toBeTruthy()
  })

  it('never says sync failed', () => {
    // The work IS safe — it just has not arrived. A child reading "failed" hears
    // "your lessons are gone".
    const { container } = render(
      <SettingsScreen version="1.0.0" preferences={DEFAULTS} onChange={vi.fn()} sync={{ parked: 3, onRetry: vi.fn() }} />,
    )
    expect(container.textContent).not.toMatch(/failed|error|couldn'?t sync|problem/i)
  })

  it('offers a way to try again', () => {
    const onRetry = withSync(2)
    fireEvent.click(screen.getByText('Try sending again'))
    expect(onRetry).toHaveBeenCalledOnce()
  })
})
