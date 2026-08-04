/**
 * The react-native-web props React Native's own types do not know about.
 *
 * `dataSet` is real and supported — react-native-web renders it as `data-*`
 * attributes on the underlying DOM node — but it exists only in that renderer, so
 * `@types/react-native` has no reason to declare it and does not.
 *
 * Declared here as a module augmentation rather than worked around at the call site.
 * The alternatives were a cast to `any` and a `@ts-expect-error`, and this repo bans
 * both: they would switch off checking for the whole element, including the props
 * that ARE typed. This turns one genuinely-untyped prop into a typed one and leaves
 * everything else exactly as strict as before.
 *
 * Only one component uses it — the tab bar mirrors its `maxFontSizeMultiplier` into
 * the DOM so the 200 %-text check in `e2e/flow.cjs` can honour the same ceiling the
 * native runtime does. If a second caller appears, ask first whether it is really
 * reaching for a web-only escape hatch.
 */

declare module 'react-native' {
  interface TextProps {
    readonly dataSet?: Readonly<Record<string, string>>
  }
  interface ViewProps {
    readonly dataSet?: Readonly<Record<string, string>>
  }
}

export {}
