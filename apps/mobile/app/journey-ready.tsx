import { router } from 'expo-router'
import { JourneyReady } from '../src/features/course/components/JourneyReady.js'
import { useCoursePath } from '../src/features/course/useCoursePath.js'
import { toPathView } from '../src/features/course/pathView.js'
import { nodeLessonHref, reviewLessonHref } from '../src/features/course/courseLesson.js'

export default function JourneyReadyRoute() {
  const path = toPathView(useCoursePath())
  return <JourneyReady path={path}
    onStart={id => router.replace(nodeLessonHref(id))}
    onReview={id => router.replace(reviewLessonHref(id))}
    onHome={() => router.replace('/')} />
}
