/**
 * `/practise` — choose what the next lesson asks about.
 *
 * Thin, like every route: it holds the content index, hands it to the screen, and turns
 * the screen's answer into the query string `/lesson` reads. The choice itself is not
 * stored anywhere — see `focusToParams` for why a URL is the right place for it.
 */

import { router } from 'expo-router'
import { PractiseScreen } from '../src/features/practise/PractiseScreen.js'
import { ContentGate } from '../src/components/ContentGate.js'
import { useContent } from '../src/lib/content.js'
import { focusToParams } from '../src/features/practise/params.js'

export default function PractiseRoute() {
  const { index, status, reload, isOffline } = useContent()

  return (
    // `showLoading`, like the country and region routes: this screen has no skeleton of
    // its own, and the alternative to a generic one is a blank frame. The status is
    // always `ready` today because the core packs are a static import — but the loader's
    // own comment says extended packs download and cache from week 9, and a screen that
    // only works because a load happens to be synchronous is a screen that breaks the
    // week it stops being.
    <ContentGate status={status} onRetry={reload} isOffline={isOffline} showLoading>
      {index !== null && (
        <PractiseScreen
          index={index.index}
          onBack={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          onStart={({ focus, length }) => {
            // `replace`, not `push`. The picker's job is done the moment the lesson
            // starts, and leaving it on the stack means the back gesture out of a
            // finished lesson lands on a form rather than on the tab the user came from.
            router.replace(`/lesson?${focusToParams(focus, length)}`)
          }}
        />
      )}
    </ContentGate>
  )
}
