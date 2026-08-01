import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CountryScreen, type CountryFact } from './CountryScreen.js'

const capital: CountryFact = {
  id: 'geo.SE.capital',
  attribute: 'capital',
  value: 'Stockholm',
  mastery: 'unseen',
  due: false,
  source: {
    name: 'UN Statistics Division, M49 standard',
    url: 'https://unstats.un.org/unsd/methodology/m49/',
    verifiedAt: '2026-07-31',
  },
}

const flag: CountryFact = {
  id: 'geo.SE.flag',
  attribute: 'flag',
  value: 'a yellow Nordic cross on a blue field',
  mastery: 'mastered',
  due: true,
}

const renderCountry = (facts: readonly CountryFact[] = [capital, flag]) =>
  render(
    <CountryScreen
      name="Sweden"
      region="EU"
      facts={facts}
      progress={{
        entityId: 'SE',
        mastery: 'unseen',
        factsTotal: 2,
        factsLearned: 1,
        factsDue: 1,
        factsSeen: 1,
        complete: false,
      }}
      onPractise={() => {}}
    />,
  )

describe('Country — the no-spoiler rule', () => {
  it('withholds the answer to a fact the user has never met', () => {
    // This is the whole point of the screen. A user who cannot recall Stockholm
    // opens this page, reads it, and the scheduler never learns they did not know
    // it. Retrieval has to be effortful or the mechanism is not working.
    renderCountry()
    expect(screen.queryByText('Stockholm')).toBeNull()
    expect(screen.getByText('Learn it first')).toBeTruthy()
  })

  it('still names the fact that exists', () => {
    // Hiding the answer must not hide that there IS a capital to learn.
    renderCountry()
    expect(screen.getByText('Capital')).toBeTruthy()
  })

  it('shows a learned fact in full', () => {
    // Past mastery the page is a reference, not an answer key.
    renderCountry()
    expect(screen.getByText('a yellow Nordic cross on a blue field')).toBeTruthy()
  })

  it('does not leak the answer through the accessibility label either', () => {
    // A screen reader user must get the same treatment. Putting the value in the
    // label would hand the answer to exactly the users who cannot see it hidden.
    const { container } = renderCountry()
    const labels = Array.from(container.querySelectorAll('[aria-label]'), (el) =>
      el.getAttribute('aria-label'),
    )
    expect(labels.some((label) => label?.includes('Stockholm'))).toBe(false)
    expect(labels.some((label) => label?.includes('Learn it first'))).toBe(true)
  })
})

describe('Country — provenance', () => {
  it('shows where a fact came from and when it was checked', () => {
    // A learning app that cannot say where a fact came from is asking to be trusted
    // on nothing, and a wrong fact here is the worst bug available.
    renderCountry()
    expect(screen.getByText('UN Statistics Division, M49 standard')).toBeTruthy()
    expect(screen.getByText(/Checked/)).toBeTruthy()
  })

  it('omits the section entirely when nothing carries a source', () => {
    renderCountry([flag])
    expect(screen.queryByText('Where this comes from')).toBeNull()
  })
})

describe('Country — states', () => {
  it('says so plainly when the packs do not have this country', () => {
    // A deep link can name anything. An empty page reads as a crash.
    render(
      <CountryScreen
        name={null}
        region={null}
        facts={[]}
        progress={null}
        onPractise={() => {}}
      />,
    )
    expect(screen.getByText('We do not have this one yet')).toBeTruthy()
  })

  it('flags a fact that is due', () => {
    renderCountry()
    expect(screen.getByText('Due for review')).toBeTruthy()
  })

  it('offers one primary action', () => {
    const onPractise = vi.fn()
    render(
      <CountryScreen
        name="Sweden"
        region="EU"
        facts={[capital]}
        progress={null}
        onPractise={onPractise}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Practise this country' }))
    expect(onPractise).toHaveBeenCalledOnce()
  })

  it('leaves no raw key or unformatted placeholder on screen', () => {
    const { container } = renderCountry()
    expect(container.textContent).not.toMatch(/\b[a-z]+:[a-z][a-zA-Z0-9.]+/)
    expect(container.textContent).not.toMatch(/\{[a-zA-Z_]+[,}]/)
  })
})
