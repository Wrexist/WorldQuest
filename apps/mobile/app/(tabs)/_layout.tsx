/**
 * Five tabs, forever (PROJECT.md §7).
 *
 * The bar itself is `TabBar` from packages/design — the same component the mockup
 * comparison screenshots render — rather than the navigator's default. That is what
 * keeps the chrome on-brand instead of platform-default, and it means a design change
 * lands in one primitive rather than in a navigator config.
 *
 * Adding a sixth tab is not a code change, it is a product decision that needs a new
 * ADR. The five are the information architecture, and the IA is the product.
 */

import { Tabs } from 'expo-router'
import { TabBar, colors, layout } from '@worldquest/design'
import { Icon } from '../../src/components/Icon.js'
import type { IconName } from '../../src/lib/icons.generated.js'
import { useT, type TranslationKey } from '../../src/lib/i18n.js'

/**
 * Route name → tab identity.
 *
 * Real icons, from Lucide (ISC), rasterised by `pnpm build:icons`. These were
 * `⌂ ◎ ◈ ☺ ⋯` — literal text characters, so the bar rendered in a different
 * typeface on every device and `☺` announced itself to some screen readers as
 * "white smiling face" in the middle of a tab label.
 */
const TABS: readonly { name: string; icon: IconName; labelKey: TranslationKey }[] = [
  { name: 'index', icon: 'home', labelKey: 'nav:home' },
  { name: 'explore', icon: 'explore', labelKey: 'nav:explore' },
  { name: 'quests', icon: 'quests', labelKey: 'nav:quests' },
  { name: 'profile', icon: 'profile', labelKey: 'nav:profile' },
  /**
   * Shop, where More used to be.
   *
   * Still five, and still a product decision rather than a code one — this is the ADR
   * the header above asks for, in the place the decision lives. The fifth tab held
   * Settings, a screen a user opens twice in a lifetime, while the Shop was one row deep
   * on Profile. It is the only sink for a currency every single lesson pays out, and the
   * economy simulation has a regular player earning 26,310 coins in ninety days with
   * nowhere to look for what to do with them.
   *
   * Settings did not lose its place, it moved to the one every phone already uses: the
   * gear on your own profile. `app/settings.tsx`.
   */
  { name: 'shop', icon: 'shop', labelKey: 'nav:shop' },
]

/** The icon is decorative — the tab is already labelled and announces its own name. */
const TAB_ICON_SIZE = 22

export default function TabsLayout() {
  const t = useT()

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Capped and centred above the `lg` breakpoint — see `layout.maxContentWidth`.
        // The TAB BAR is deliberately outside this: it is chrome and belongs to the
        // device edge, while the content is a column and belongs to a readable width.
        sceneStyle: {
          backgroundColor: 'transparent',
          width: '100%',
          maxWidth: layout.maxContentWidth,
          alignSelf: 'center',
        },
      }}
      tabBar={({ state, navigation }) => (
        <TabBar
          items={TABS.map((tab) => ({
            key: tab.name,
            // Tinted per state rather than dimmed with opacity: the inactive colour
            // is a token that passes contrast on the bar's own background, and an
            // opacity would quietly take it below the floor.
            icon: (active: boolean) => (
              <Icon
                name={tab.icon}
                size={TAB_ICON_SIZE}
                color={active ? colors.text.onAccent : colors.text.tertiary}
              />
            ),
            label: t(tab.labelKey),
          }))}
          activeKey={state.routes[state.index]?.name ?? 'index'}
          onSelect={(name) => {
            const route = state.routes.find((r) => r.name === name)
            if (!route) return
            // Emit before navigating so a screen can claim the press — that is how
            // "tap the active tab to scroll to top" works, and how a lesson in
            // progress will later be able to ask before it is abandoned.
            const event = navigation.emit({
              type: 'tabPress',
              target: route.key,
              canPreventDefault: true,
            })
            if (!event.defaultPrevented) navigation.navigate(name)
          }}
        />
      )}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} options={{ title: t(tab.labelKey) }} />
      ))}
    </Tabs>
  )
}
