/**
 * "Create a profile" — the ask after a guest's first finished lessons.
 *
 * Duolingo's version is Duo, one line about saving your progress, a big button and a
 * quiet "Later". Those are the mechanic and all of them are here, with Atlas and our own
 * words. What is deliberately not here is the half of theirs that works on fear: no
 * "or you'll lose it", no countdown, nothing that makes "Not now" feel like a mistake.
 * The copy says what a profile is FOR — keeping your progress on a new phone — and
 * starts from the truth that nothing is at risk: progress is already saved on this one.
 *
 * Who sees it, and how often, is decided before this screen draws
 * (`profileAsk.ts`): an adult guest, online, after one of their first two lessons, at
 * most twice per device. The screen itself is presentational.
 *
 * ## States
 *
 * Content, and offline. Nothing is fetched here, so there is no loading, empty or error
 * state to have; the account flow it opens owns all three. Offline, the primary is inert
 * and says why in the words every other connection-bound control uses, and "Not now"
 * still leaves — the rest of the app works without a connection and so does this exit.
 *
 * ## Motion
 *
 * Atlas scales in on `expressive` (`useScaleIn`), which is simply there under Reduce
 * Motion. Nothing fades, and nothing waits: both buttons work from the first frame.
 */

import { Animated, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native'
import { Button, colors, space, Spacer, text, useScaleIn } from '@worldquest/design'
import { useT } from '../../lib/i18n.js'
import { Art } from '../../components/Art.js'

export type CreateProfileProps = {
  /** Opens the account flow on its link path. */
  readonly onCreate: () => void
  /** Continues whatever the after-lesson chain still holds, else Home. */
  readonly onLater: () => void
  /** Linking sends an email code; offline the primary cannot do its job. */
  readonly offline?: boolean
}

/**
 * Atlas on the globe, the pose that says "your world, wherever you are".
 *
 * Not `atlas/encouraging`: that is the account screen's own pose, one tap later, and
 * the same picture on two consecutive screens reads as the screen not having changed.
 *
 * Smaller on a short phone or at large text, so the words reach the screen before the
 * pinned buttons do — measured at 320 × 568 with doubled text, the full-size picture
 * left room for the headline and nothing else above the fold.
 */
const HERO = 160
const HERO_COMPACT = 112

/** Below this the hero shrinks: the same line `LessonScreen` draws for a short phone. */
const SHORT_SCREEN = 700
/** At or above this OS text scale, likewise. */
const LARGE_TEXT = 1.5

export function CreateProfile({ onCreate, onLater, offline = false }: CreateProfileProps) {
  const t = useT()
  const hero = useScaleIn(0.6)
  const { height, fontScale } = useWindowDimensions()
  const heroSize = height < SHORT_SCREEN || fontScale >= LARGE_TEXT ? HERO_COMPACT : HERO

  return (
    <View style={styles.screen} testID="create-profile">
      {/* Scrolls, and is centred by spacers rather than `justifyContent`: at 200 % text
          on a 320pt phone the words outgrow the screen, and a centred scroll view puts
          its overflow above scroll position zero where nothing reaches it (`Spacer`). */}
      <ScrollView contentContainerStyle={styles.body} showsVerticalScrollIndicator={false}>
        <Spacer />
        {/* Decorative — the heading says what this is. */}
        <Animated.View style={[styles.hero, hero]} pointerEvents="none">
          <Art name="atlas/welcome" size={heroSize} />
        </Animated.View>
        <Text style={styles.title} role="heading" aria-level={1}>
          {t('account:ask.title')}
        </Text>
        <Text style={styles.lede}>{t('account:ask.body')}</Text>
        <Text style={styles.note}>{t('account:ask.privacy')}</Text>
        <Spacer />
      </ScrollView>

      <View style={styles.actions}>
        {offline && (
          // Inserted when the connection drops, so it is announced rather than silent.
          <Text style={styles.offline} role="alert">
            {t('common:offline.action')}
          </Text>
        )}
        <Button
          label={t('account:ask.create')}
          onPress={onCreate}
          disabled={offline}
          testID="create-profile-create"
        />
        {/* `ghost`: the design system's variant for "the actions we must offer without
            inviting". Present, full-size as a target, and quieter than the offer. */}
        <Button
          label={t('account:ask.later')}
          variant="ghost"
          onPress={onLater}
          testID="create-profile-later"
        />
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  body: {
    flexGrow: 1,
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[5],
    paddingTop: space[5],
  },
  hero: { alignItems: 'center', justifyContent: 'center', marginBottom: space[2] },
  title: { ...text('display'), color: colors.text.primary, textAlign: 'center' },
  lede: { ...text('body'), color: colors.text.secondary, textAlign: 'center' },
  // The promise people hesitate over, kept small and exact.
  note: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
  actions: { padding: space[4], gap: space[2] },
  offline: { ...text('caption'), color: colors.text.secondary, textAlign: 'center' },
})
