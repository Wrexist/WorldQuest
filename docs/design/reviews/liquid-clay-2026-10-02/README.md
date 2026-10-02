# WorldQuest liquid clay redesign — 2 October 2026

The owner's three Quests, Profile and Shop references are implemented as a shared
material system across the app. This builds on the compact Explore, Quests,
Profile and Shop work; the references change the visual language without
restoring the oversized panels removed in that work.

## Implemented design

- Powder-blue canvas, rounded ice cards, glossy navy headers and treasure/wallet
  panels, raised sky-blue selection, gold rewards and lime primary actions.
- A shared `ClaySurface` paints gradient, reflection and soft inset bevel behind
  content. It does not intercept touches or enter the accessibility tree. The
  same radius and short shadow system carries through cards, buttons, inputs,
  counters, progress bars, speech bubbles and the bottom navigation.
- Custom treatment for the Home learning path, Explore search/map controls and
  country selection, Quest checkpoints and task rows, Profile passport/week/gems,
  Shop wallet/titles, lesson answers/feedback and Settings controls.
- The existing Atlas mascot, explorer chest, coins and gems remain the app's
  character. Button press depth, mascot acting, chest opening, question
  transitions and country reveals continue to respect reduced motion.

The supplied phone frame and home indicator are presentation framing, so native
safe areas retain ownership of those edges. Actual account progress, prices,
geography and learning rules remain authoritative. For example, the real title
cost is 1,000 coins even though the decorative Shop reference shows 100.

## Review and fixes

Emma's clear next action, Priya's calm readable hierarchy and Alex's enlarged-text
and reduced-motion needs guided the review. The first preview revealed flat white
outlines and an Explore input hidden under decorative material. The final material
has a soft bevel; the input is explicitly positioned above its decoration.

The expanded review also found and fixed two narrow-screen details: Swedish tab
labels needed sentence-case tracking, and the Country title needed its own
full-width row beneath the flag and favorite control. A displaced country-name map pill in
capital questions was removed; the highlighted country, question and verified
capital reveal carry that information accurately.

## Evidence

- [Reference audit](reference-audit.md): visual rules and measured palette samples.
- [Full browser review](browser-final/README.md): 52 real-app cases, 82 screenshots,
  widths 320/390/768, light English and dark Swedish with enlarged glyphs and
  reduced motion. A real completed lesson and opened chest provide populated
  Profile evidence. No account state was seeded.
- [Focused final fixes](browser-final-fixes/): Country control containment and tab
  spacing against the final export. Its initial Country fix preserved the control
  but split the enlarged country name, prompting the final pass below.
- [Final Country proof](browser-country-final/README.md): all six cases preserve a
  whole-line Sweden/Sverige heading and the visible 44px favorite control.
- [Final handoff screenshots](handoff-final/): current 390px main screens.
- [Large-text component fixtures](native-layout/report.json): 12 cases using actual
  components with explicitly synthetic props, simulated native fontScale 2 and
  separately enlarged glyphs. These cover Quests, guest/populated Profile and Shop
  at all three widths in Swedish dark mode.

The initial browser report has no horizontal overflow, text beyond the viewport,
or measured button/tab targets below 44px. Its original generic metrics did not
include the Country favorite switch; the focused review adds explicit containment
for that control. Initial evidence is retained so the correction is traceable.

## Engineering validation

`pnpm verify` passed: all workspace typechecks/tests, content validation, translation
checks, clay endpoint contrast checks, accessibility lint, reachability, scrollable
screens, economy simulations and configuration checks. This includes 1,166 mobile
tests and 49 design tests. Chromium's accessibility-tree check passed on every
covered route: controls have spoken names and focus follows reading order.

The first full journey exposed a stale icon test that counted image nodes rather
than tabs. Clay icons use three decorative image layers per tab; the corrected
assertion requires all layers in each of exactly five tabs to decode. The final
journey passed **107/107 steps**, with one conditional flag-image check skipped
because that lesson contained no image question. It covers onboarding, real
lessons and rewards, chest opening, cross-screen progress, navigation, keyboard
answering, 200% text and uncaught errors. Source export:
`node_modules/.cache/wq-liquid-clay-web-complete`; log:
`node_modules/.cache/wq-liquid-clay-e2e-complete.log`.

Both native Hermes builds pass the unchanged 5.2 MiB gate: iOS 5,452,156 bytes,
Android 5,450,427 bytes. Each ships 765 assets totaling about 19.59 MiB separately
from the bytecode. Headroom is only 439 bytes on iOS and 2,168 bytes on Android;
this remains a tight budget, not evidence of measured startup or frame time.

Targeted regressions for lesson summary/calendar decorative accessibility and
country maps passed (43 tests). Byte-identical artwork sharing passed 73 registry
and consumer tests; geometry sharing passed deep-value parity and 37 consumer
tests. The final Country layout passed 14 tests and six real-app visual cases.

To offset the shared material code, obsolete imports now resolve directly to the
Atlas/chest artwork already used at runtime. Generated maps and artwork share
modules only when their files are byte-identical; their public names, geometry
and actual image bytes are preserved. Generators reproduce these decisions.
Identical immutable theme objects are also shared, with full token parity tests.
Unused private style wrappers and unreachable hit-slop calculation were removed.
The native bundle budget is unchanged. Full workspace checks preceded the final
Country presentation and private cleanup; targeted design/mobile checks cover
those last changes: design typecheck and 49 tests, mobile typecheck and 24 focused
theme/art/navigation/Country tests passed again. Whitespace checks passed.
Logs are under `node_modules/.cache/wq-liquid-clay-*`.

## Limits

Browser captures prove the real Expo web app. Component fixtures exercise layout
branches but are not native-device screenshots. Native bundling proves import and
Hermes compilation, not runtime performance. Physical iOS/Android rendering,
screen readers, haptics and frame timing remain device checks. The inset bevel uses
Fabric box shadows; older Android versions retain the gradient/reflection fallback.
No deployment, store submission or backend change was performed.
