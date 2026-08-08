/**
 * Splash — mockup screen 1, and the only screen every single user sees.
 *
 * ## What it is for
 *
 * It covers boot work: font decoding now, the auth check and the content index later.
 * That is the whole job. It is not a brand moment, it is not an ad, and it is not
 * somewhere a user should ever be for longer than the work takes.
 *
 * ## The rules that shape it
 *
 * **No minimum duration.** A splash held open so the logo can be admired is an app
 * made slower on purpose. If boot finishes in 80 ms this screen is on for 80 ms.
 *
 * **A budget, and something to say past it.** 1.2 s is the line (screen-catalog.md §1).
 * Under it, silence — a status line that flashes for 300 ms is noise. Over it, the
 * user gets told the app is working, because the difference between "slow" and
 * "frozen" is entirely whether anything on screen admits time is passing.
 *
 * **A way out of failure.** Past the ceiling this stops claiming to be loading and
 * offers a retry. A splash that never resolves is the worst state an app has: it looks
 * identical to a crash and there is nothing to press.
 *
 * ## Motion
 *
 * The mark scales in once and stops. Nothing loops — a looping animation on a splash
 * is a spinner with extra steps, and it keeps drawing (and keeps the GPU awake) during
 * exactly the window where the device should be spending its cycles on boot. Reduced
 * motion gets the same screen with no scale.
 */

import { useEffect, useRef, useState } from 'react'
import { Animated, StyleSheet, Text, View } from 'react-native'
import { Button, colors, space, text, useAnimatedTo } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Icon } from '../../components/Icon.js'

/** Past this, say something. Under it, say nothing — see the header. */
export const SLOW_AFTER_MS = 1200

/**
 * Past this, stop claiming to be loading.
 *
 * Ten seconds rather than five: a cold start on a cheap Android over a bad connection
 * genuinely takes that long, and offering "try again" to a user whose app was about to
 * work is how a working boot becomes a restarted one.
 */
export const FAILED_AFTER_MS = 10_000

export type SplashScreenProps = {
  /**
   * Injected rather than read from a timer inside, so the screen has no clock of its
   * own and every state is reachable from a test and from the screenshot renderer.
   */
  readonly phase?: 'booting' | 'slow' | 'failed'
  readonly onRetry?: (() => void) | undefined
}

export function SplashScreen({ phase = 'booting', onRetry }: SplashScreenProps) {
  const t = useT()

  // `useAnimatedTo` collapses to a zero-duration timing under reduced motion, so the
  // mark still lands at 1 — the state change happens, it just happens instantly. That
  // is the behaviour the design system already chose; re-implementing it here with a
  // hand-rolled spring would be a second answer to a settled question.
  const [mounted, setMounted] = useState(false)
  useEffect(() => setMounted(true), [])
  const scale = useAnimatedTo(mounted ? 1 : 0.86, 'expressive')

  return (
    <View
      style={styles.root}
      // One live region for the whole screen. Announcing the wordmark and then the
      // status line separately would interrupt a screen-reader user twice on boot.
      accessible
      aria-live="polite"
      aria-label={
        phase === 'failed' ? t('splash:failed.title') : t('common:loading')
      }
    >
      <Animated.View style={[styles.mark, { transform: [{ scale }] }]}>
        <Icon name="globe" size={64} color={colors.action.primary} />
      </Animated.View>

      <Text style={styles.wordmark}>{t('splash:wordmark')}</Text>

      {/* Reserved whether or not it is filled, so the wordmark does not jump upward
          the moment the boot crosses the budget. */}
      <View style={styles.statusSlot}>
        {phase === 'slow' && <Text style={styles.status}>{t('splash:slow')}</Text>}
        {phase === 'failed' && (
          <>
            <Text style={styles.failedTitle}>{t('splash:failed.title')}</Text>
            <Text style={styles.status}>{t('splash:failed.body')}</Text>
            {onRetry !== undefined && (
              <Button label={t('common:retry')} onPress={onRetry} />
            )}
          </>
        )}
      </View>
    </View>
  )
}

/**
 * `booting` → `slow` → `failed`, on wall-clock time since mount.
 *
 * Split out so `SplashScreen` stays a pure function of its props: a component that
 * both owns timers and renders them is one you can only test by waiting.
 */
export function useSplashPhase(ready: boolean): 'booting' | 'slow' | 'failed' {
  const [phase, setPhase] = useState<'booting' | 'slow' | 'failed'>('booting')
  const startedAt = useRef(Date.now())

  useEffect(() => {
    if (ready) return
    const slow = setTimeout(
      () => setPhase('slow'),
      Math.max(0, startedAt.current + SLOW_AFTER_MS - Date.now()),
    )
    const failed = setTimeout(
      () => setPhase('failed'),
      Math.max(0, startedAt.current + FAILED_AFTER_MS - Date.now()),
    )
    return () => {
      clearTimeout(slow)
      clearTimeout(failed)
    }
  }, [ready])

  return phase
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space[4],
    padding: space[5],
  },
  mark: { alignItems: 'center', justifyContent: 'center' },
  glyph: { ...text('display'), fontSize: 72, lineHeight: 84 },
  wordmark: { ...text('display'), color: colors.text.primary, textAlign: 'center' },

  // Fixed height so nothing above it moves when the status appears. `minHeight`
  // rather than `height` because the failed state is taller than the slow one.
  statusSlot: { minHeight: 72, alignItems: 'center', justifyContent: 'flex-start', gap: space[3] },
  status: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  failedTitle: { ...text('h3'), color: colors.text.primary, textAlign: 'center' },
})
