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
import { TabBar } from '@worldquest/design'
import { t } from '../../src/lib/i18n.js'

/**
 * Route name → tab identity. The glyphs are placeholders for the commissioned icon
 * set (docs/design/asset-prompts.md); everything else about the bar is final.
 */
const TABS = [
  { name: 'index', glyph: '⌂', labelKey: 'nav:home' },
  { name: 'explore', glyph: '◎', labelKey: 'nav:explore' },
  { name: 'quests', glyph: '◈', labelKey: 'nav:quests' },
  { name: 'profile', glyph: '☺', labelKey: 'nav:profile' },
  { name: 'more', glyph: '⋯', labelKey: 'nav:more' },
] as const

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: 'transparent' } }}
      tabBar={({ state, navigation }) => (
        <TabBar
          items={TABS.map((tab) => ({
            key: tab.name,
            glyph: tab.glyph,
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
