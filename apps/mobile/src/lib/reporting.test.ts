/**
 * The privacy guarantee, asserted.
 *
 * `docs/plan/device-pass.md`: "Confirm the payload carries no message text ... That
 * property already holds; do not let the Sentry integration undo it."
 *
 * Most of it is enforced by the type system and therefore cannot be tested at runtime
 * — that is the point of putting it there. What CAN regress is `scrub`, which handles
 * the events the SDK captures on its own, and the rule that nothing initialises
 * without a DSN. Those are what these cover.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  __resetCrashSinkForTests,
  initCrashReporting,
  reportCrash,
  scrub,
  setCrashSink,
} from './reporting.js'

const source = readFileSync(join(import.meta.dirname, 'reporting.ts'), 'utf8')
/** Source with commentary stripped — the header discusses every banned option by name. */
const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

afterEach(() => {
  __resetCrashSinkForTests()
  vi.restoreAllMocks()
})

describe('reportCrash', () => {
  it('hands the report to the sink', () => {
    const sink = vi.fn()
    setCrashSink(sink)
    reportCrash({ domain: 'render', name: 'TypeError', isFatal: true })
    expect(sink).toHaveBeenCalledWith({ domain: 'render', name: 'TypeError', isFatal: true })
  })

  it('never throws, even when the sink does', () => {
    // Reporting a crash must not cause one. This is the whole reason for the try.
    setCrashSink(() => {
      throw new Error('transport is down')
    })
    expect(() => reportCrash({ domain: 'sync', name: 'NetworkError', isFatal: false })).not.toThrow()
  })

  it('falls back to a console line rather than silence', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    reportCrash({ domain: 'lesson', name: 'RangeError', isFatal: false })
    expect(warn).toHaveBeenCalledOnce()
    expect(String(warn.mock.calls[0]?.[0])).toContain('lesson/RangeError')
  })
})

describe('initCrashReporting', () => {
  it('does nothing without a DSN, rather than half-configuring', () => {
    // There must be no state where the app believes it is reporting and is not.
    expect(initCrashReporting(undefined)).toBe(false)
    expect(initCrashReporting('')).toBe(false)
  })

  it('leaves the console sink in place when there is no DSN', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    initCrashReporting(undefined)
    reportCrash({ domain: 'startup', name: 'Error', isFatal: true })
    expect(warn).toHaveBeenCalledOnce()
  })
})

describe('scrub — the half the type system cannot reach', () => {
  it('drops the message', () => {
    expect(scrub({ message: 'Invalid country: Aisha' })['message']).toBeUndefined()
  })

  it('drops breadcrumbs, which record what was typed', () => {
    const out = scrub({ breadcrumbs: [{ message: 'search: Aisha' }] })
    expect(out['breadcrumbs']).toBeUndefined()
  })

  it('drops user, request, contexts and extra', () => {
    const input: Record<string, unknown> = {
      user: { id: 'u1', email: 'kid@example.com' },
      request: { url: 'https://x/y?q=Aisha' },
      contexts: { state: { search: 'Aisha' } },
      extra: { typed: 'Aisha' },
    }
    const out = scrub(input)
    for (const key of ['user', 'request', 'contexts', 'extra']) {
      expect(out[key], key).toBeUndefined()
    }
  })

  it('keeps the exception TYPE and redacts its value', () => {
    // The class name is what makes a crash fixable and carries no runtime data.
    // The value is the message and carries anything.
    const out = scrub({
      exception: { values: [{ type: 'TypeError', value: "Cannot read 'x' of Aisha" }] },
    })
    const values = (out['exception'] as { values: Array<Record<string, unknown>> }).values
    expect(values[0]?.['type']).toBe('TypeError')
    expect(values[0]?.['value']).toBe('redacted')
  })

  it('leaves an event with nothing sensitive alone', () => {
    const out = scrub({ level: 'fatal', tags: { domain: 'render' } })
    expect(out).toEqual({ level: 'fatal', tags: { domain: 'render' } })
  })

  it('does not choke on an event with no exception', () => {
    expect(() => scrub({ level: 'error' })).not.toThrow()
  })
})

describe('the Sentry options that are privacy decisions', () => {
  // Asserted against the SOURCE, because turning any of these on would not fail a
  // runtime test — it would just quietly start collecting. Comments are stripped
  // first: this repo has three times shipped a check that matched its own prose.
  it('never sends default PII', () => {
    expect(code).toMatch(/sendDefaultPii:\s*false/)
  })

  it('collects no breadcrumbs', () => {
    expect(code).toMatch(/maxBreadcrumbs:\s*0/)
  })

  it('captures no screen content', () => {
    expect(code).toMatch(/attachScreenshot:\s*false/)
    expect(code).toMatch(/attachViewHierarchy:\s*false/)
  })

  it('enables no session replay', () => {
    expect(code).not.toMatch(/replaysSessionSampleRate|replaysOnErrorSampleRate|mobileReplay/)
  })

  it('routes every event through the scrubber', () => {
    expect(code).toMatch(/beforeSend:\s*\(event\)\s*=>\s*scrub\(event\)/)
  })

  it('sends no message field on the events it constructs itself', () => {
    // `captureEvent` is ours; if a `message:` ever appears in it, the type guarantee
    // has been routed around.
    const captured = code.slice(code.indexOf('captureEvent'), code.indexOf('return true'))
    expect(captured).not.toMatch(/message:/)
  })
})
