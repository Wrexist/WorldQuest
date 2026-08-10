import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { CountryScreen, type CountryFact } from './CountryScreen.js'

const capital: CountryFact = {
  id: 'geo.SE.capital',
  attribute: 'capital',
  value: 'Stockholm',
  mastery: 'unseen',
  due: false,
  // The REAL source string from `facts.capitals.v1.json`, and the answer is in it.
  //
  // The fixture used to say "UN Statistics Division, M49 standard" — a citation that
  // happens not to name the city — which is exactly why the provenance test that used
  // to live here could sit beside the no-spoiler tests above without either noticing
  // the contradiction. The shipped pack cites the Wikipedia ARTICLE, whose title is the
  // answer.
  source: {
    name: 'English Wikipedia, “Stockholm”',
    url: 'https://en.wikipedia.org/wiki/Stockholm',
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

describe('Country — provenance stays out of the quiz', () => {
  it('never renders a fact\u2019s source', () => {
    // This block used to assert the OPPOSITE — that a "Where this comes from" list was
    // on screen — and it sat directly below three tests asserting that Stockholm is
    // not. Both passed, because the fixture's citation was a UN methodology page that
    // does not name the city while the shipped pack cites the Wikipedia article, whose
    // title IS the city.
    //
    // On a device that meant three rows reading "Learn it first" above a list reading
    // "English Wikipedia, “Stockholm”" / "Swedish krona". The spoiler guard hid the
    // answers and the citations handed all of them over, on the same screen, to a user
    // who had learned none of them.
    //
    // The DATA still carries `source` and `verifiedAt` and `pnpm content:validate`
    // still fails a fact without them. This asserts only that the citation is not drawn
    // next to a hidden answer.
    const { container } = renderCountry()

    expect(container.textContent).not.toContain('Wikipedia')
    expect(container.textContent).not.toContain('Stockholm')
    expect(screen.queryByText(/Where this comes from/)).toBeNull()
    expect(screen.queryByText(/Checked/)).toBeNull()
  })

  it('keeps the source on the data, so nothing here is an excuse to drop it', () => {
    // The prop is still part of `CountryFact` and the route still passes it. Removing
    // it from the type would make "we know where this came from" unenforceable at the
    // seam where a future reference view would need it.
    renderCountry()
    expect(capital.source?.verifiedAt).toBe('2026-07-31')
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

describe('Country — the star', () => {
  const withStar = (favourite: boolean, onToggleFavourite = vi.fn()) => {
    render(
      <CountryScreen
        name="Sweden"
        region="EU"
        facts={[capital]}
        progress={null}
        onPractise={() => {}}
        favourite={favourite}
        onToggleFavourite={onToggleFavourite}
      />,
    )
    return onToggleFavourite
  }

  it('announces its state, not just its existence', () => {
    // A toggle rendered as a button says "Star this country, button" whether it is on
    // or off — which is a control a screen-reader user cannot read the state of.
    withStar(true)
    const star = screen.getByRole('switch', { name: 'Star this country' })
    expect(star.getAttribute('aria-checked')).toBe('true')
  })

  it('reports off when it is off', () => {
    withStar(false)
    expect(screen.getByRole('switch').getAttribute('aria-checked')).toBe('false')
  })

  it('toggles on press', () => {
    const onToggleFavourite = withStar(false)
    fireEvent.click(screen.getByRole('switch'))
    expect(onToggleFavourite).toHaveBeenCalledOnce()
  })

  it('is not drawn at all when there is nothing to toggle', () => {
    // The screenshot renderer and the "we do not have this one yet" state both mount
    // without a store. A star that does nothing when tapped is worse than no star.
    renderCountry()
    expect(screen.queryByRole('switch')).toBeNull()
  })
})
