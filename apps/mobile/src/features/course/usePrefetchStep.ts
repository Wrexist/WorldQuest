/**
 * On a D1 build, keep the course path's current step ready to start offline.
 *
 * Home's one primary action is the current step, and a step is an explicit focus: the
 * Worker issues its lessons and the device may not substitute a different saved lesson
 * for it (`courseLesson.ts`). So without a ticket saved for exactly that step, pressing
 * Start on a plane would say "you're offline" — the primary action failing at the thing
 * `PROJECT.md §5.5` says a lesson start must do with zero network. This asks for one
 * whenever the step or its count of finished lessons changes and the device is online:
 * a step of two lessons spends its saved ticket on the first and needs another for the
 * second.
 *
 * A legacy build composes its lessons on the device and needs nothing here.
 */

import { useEffect } from 'react'
import { lessonLength, type NodeStanding } from '@worldquest/engines'
import { isD1 } from '../../lib/backendConfig.js'
import { useOnline } from '../../lib/connectivity.js'
import { prefetchFocused } from '../../lib/d1-lessons.js'
import { currentLocale } from '../../lib/i18n.js'
import { useScreenReaderStatus } from '../../lib/screenReader.js'
import { useItemPace } from '../lesson/usePace.js'

export function usePrefetchStep(current: NodeStanding | undefined): void {
  const online = useOnline()
  // Asked for only once the platform has answered: a ticket issued without a screen
  // reader may be a picture a VoiceOver user cannot answer, and the lesson would then
  // refuse it anyway.
  const screenReader = useScreenReaderStatus()
  const itemMs = useItemPace()
  // The node object comes from the parsed course and keeps its identity across renders,
  // so these two are what actually change when there is something new to prepare.
  const step = current?.node
  const finished = current?.finished

  useEffect(() => {
    if (!isD1() || !online || step === undefined || screenReader === null) return
    void prefetchFocused({
      // The same count the lesson screen asks for, so the saved ticket is the lesson
      // this learner would have been issued online.
      count: lessonLength(itemMs),
      locale: currentLocale() === 'sv' ? 'sv' : 'en',
      screenReader,
      focus: { entities: step.focus.entities, attributes: step.focus.attributes },
    })
  }, [step, finished, online, screenReader, itemMs])
}
