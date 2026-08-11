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
 * One component uses it — the tab bar mirrors its `maxFontSizeMultiplier` into
 * the DOM so the 200 %-text check in `e2e/flow.cjs` can honour the same ceiling the
 * native runtime does. If a third caller appears, ask first whether it is really
 * reaching for a web-only escape hatch.
 *
 * `onKeyDown` is the same shape of gap for the same reason. React Native has no
 * keyboard events on a `View`, because most platforms it targets have no keyboard;
 * react-native-web forwards the DOM handler straight through. `Slider` needs it so the
 * control answers to arrow keys on the one platform where `pnpm e2e` asserts the
 * primary task is completable without a pointer. On native the prop is simply absent
 * from the rendered view and `accessibilityActions` carries the same two moves.
 *
 * Typed against the two fields actually used rather than the full DOM
 * `KeyboardEvent`: this augmentation should describe what we depend on, not import a
 * renderer's entire event model into a package that must also compile for native.
 */

declare module 'react-native' {
  interface TextProps {
    readonly dataSet?: Readonly<Record<string, string>>
  }
  interface ViewProps {
    readonly dataSet?: Readonly<Record<string, string>>
    readonly onKeyDown?: (event: { readonly key: string; preventDefault: () => void }) => void
  }
}

export {}
