/**
 * Free space, and only free space.
 *
 * This exists for one job: centring the contents of a ScrollView vertically **without**
 * `justifyContent: 'center'`.
 *
 * ## Why that matters
 *
 * A scroll view's content container centred with `justifyContent` behaves correctly right
 * up until the content is taller than the view. At that point the overflow is distributed
 * to BOTH ends, and on React Native the leading half is placed above scroll position zero
 * — where no gesture reaches it. The user cannot scroll up to it, because as far as the
 * scroll view is concerned there is nothing up there. The content is simply gone.
 *
 * That is not a hypothetical. It was live on the lesson screen, whose body is centred so a
 * two-option question does not cling to the top of a tall phone: at 320×568 — iPhone SE,
 * and small Android — the question plus its map plus four options overflow, so the prompt
 * was the part being pushed out of reach, on the one screen the whole product is for.
 *
 * ## Why a component and not a style
 *
 * Because the fix is structural: two elements that consume free space, one before the
 * content and one after. `flexBasis: 0` is the part that makes it safe — the spacer takes
 * space that is going spare and never asks for any, so when there is no free space both
 * collapse to nothing and the layout is exactly the top-aligned one, with every pixel
 * reachable. A style cannot express "put something here".
 *
 * ## How to use it
 *
 *     <ScrollView contentContainerStyle={styles.body}>   // needs flexGrow: 1
 *       <Spacer />
 *       …content…
 *       <Spacer />
 *     </ScrollView>
 *
 * The content container still needs `flexGrow: 1`, or the container is exactly as tall as
 * its content, there is no free space, and the spacers have nothing to divide.
 *
 * `pnpm scrollable` enforces this: a content container that centres with `justifyContent`
 * is a failure, and the message points here.
 *
 * Not for gaps between things — that is what `gap` and the spacing scale are for. A
 * `Spacer` with a fixed size would be a hardcoded margin wearing a component's clothes.
 */

import { View } from 'react-native'

/**
 * `aria-hidden` because it is layout with no content. A screen reader that announces an
 * empty group between the heading and the body is reading out the stylesheet.
 */
export function Spacer() {
  return <View aria-hidden style={{ flexGrow: 1, flexShrink: 1, flexBasis: 0 }} />
}
