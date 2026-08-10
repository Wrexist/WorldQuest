/**
 * What each quest slot is called, and what it looks like.
 *
 * Lifted out of `QuestScreen` because Home needs the same two maps: its quest card was
 * showing `home:quest.empty` — "Start your first lesson" — to everybody, for ever,
 * because `questTitle` was a prop on `HomeProgress` that **nothing ever passed**. So the
 * default screen of the app told a user with a 40-day streak to start their first lesson.
 *
 * Exactly the defect the same card's comment records for the Daily Challenge one card
 * over: "the shell was built, ticked as done, and never checked for a producer". That one
 * was deleted because nothing could produce it. This one had a producer all along —
 * `useDailyQuest()`, already composed on the device and already driving the Quests tab.
 *
 * A module of its own rather than an export from either screen: a route importing a
 * constant out of a feature screen is the dependency running backwards, and the two
 * screens would then have to agree about which of them owns it.
 */

import type { Slot } from '@worldquest/engines'
import type { TranslationKey } from '../../lib/i18n.js'
import type { IconName } from '../../lib/icons.generated.js'

export const SLOT_TITLE: Record<Slot, TranslationKey> = {
  locate: 'quests:slot.locate',
  recognise: 'quests:slot.recognise',
  recall: 'quests:slot.recall',
  discover: 'quests:slot.discover',
  perform: 'quests:slot.perform',
}

/**
 * One glyph per slot, and every one of them literal.
 *
 * "Find it on the map" gets a map, "Know the flag" a flag, "Name the capital" a pin — a
 * capital IS a pin on a map — "Learn something new" a star, "Finish strong" a trophy. An
 * icon that needs explaining is worse than no icon.
 *
 * Not a colour per slot, deliberately. `palette.continent` exists because continents are
 * a fixed named set someone chose the colours for; quest slots have no such palette, and
 * inventing five would be five tokens nobody asked for. One accent, five shapes — which
 * is also what lets them survive a theme change.
 */
export const SLOT_ICON: Record<Slot, IconName> = {
  locate: 'map',
  recognise: 'flag',
  recall: 'pin',
  discover: 'star',
  perform: 'trophy',
}
