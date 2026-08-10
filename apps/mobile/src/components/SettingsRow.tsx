/**
 * The rows Settings is built from.
 *
 * App-wide composites rather than design primitives: a settings row is a layout the
 * app happens to repeat, not a reusable piece of the design system. If a second
 * screen needs them, they move to `packages/design` — not before.
 *
 * The accessibility shape matters more here than anywhere else in the app. A settings
 * list is the screen a user reaches when something is already wrong for them, and it
 * is disproportionately used with a screen reader. So every switch announces its
 * label, its state and its help text as ONE element — a reader that has to sweep four
 * separate nodes to work out what a toggle does is a toggle nobody flips.
 */

import { Pressable, StyleSheet, Switch, Text, View } from 'react-native'
import {
  colors,
  layout,
  radius,
  space,
  squircle,
  text,
} from '@worldquest/design'
import { Icon } from './Icon.js'

// ── section ─────────────────────────────────────────────────────────────────

/**
 * An inset group, with an optional header above it.
 *
 * `title` is optional because a group of rows that already label themselves does not need
 * one, and iOS draws plenty of headerless groups. The practice picker is the case: one
 * `ChoiceRow` per topic, each with its own heading, so a section title above each would
 * print the same word twice six pixels apart — the defect Home's quest card, Explore's
 * world card and Profile's level card each had in turn.
 *
 * Settings keeps its titles and should: there the header names a CATEGORY holding several
 * differently-labelled rows, which is what a section header is for.
 */
export function Section({
  title,
  children,
}: {
  title?: string | undefined
  children: React.ReactNode
}) {
  return (
    <View style={styles.section}>
      {title !== undefined && (
        <Text style={styles.sectionTitle} role="heading">
          {title}
        </Text>
      )}
      <View style={styles.card}>{children}</View>
    </View>
  )
}

// ── switch row ──────────────────────────────────────────────────────────────

export type SwitchRowProps = {
  readonly label: string
  readonly help?: string | undefined
  readonly value: boolean
  readonly onChange: (value: boolean) => void
  /** Spoken instead of the visible label where the label alone is ambiguous. */
  readonly accessibilityLabel?: string | undefined
}

export function SwitchRow({
  label,
  help,
  value,
  onChange,
  accessibilityLabel,
}: SwitchRowProps) {
  return (
    <Pressable
      // One element, not four. `role="switch"` plus the state is what makes a reader
      // say "Sound effects, on, switch" rather than reading a label, then a
      // paragraph, then an unlabelled control.
      //
      // `Pressable`, not `View` — and that is a fix, not a preference. This wrapper
      // announced itself as a switch while being completely inert: the element a
      // reader focuses and activates did nothing, and the element that worked had no
      // name. On native it was worse than on web, because `accessible` genuinely does
      // collapse children there, so the working control was hidden outright and the
      // toggles were announced but impossible to operate. Found by `pnpm a11y:tree`
      // reading the tree Chromium actually computes.
      accessible
      role="switch"
      aria-label={accessibilityLabel ?? label}
      accessibilityHint={help}
      aria-checked={value}
      onPress={() => onChange(!value)}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {help !== undefined && <Text style={styles.rowHelp}>{help}</Text>}
      </View>
      <Switch
        value={value}
        trackColor={{ false: colors.bg.canvas, true: colors.action.primary }}
        thumbColor={colors.text.primary}
        // Presentational. The row owns the gesture and the semantics; this draws the
        // state and nothing else. It deliberately has no `onValueChange`: with the
        // row also handling press, two handlers would fire on one tap and cancel out
        // — a toggle that flips and flips back reads as broken.
        pointerEvents="none"
        // Hidden from the tree on all three platforms, which took three props.
        // `accessibilityElementsHidden` is iOS-only and `importantForAccessibility`
        // is Android-only; react-native-web honours NEITHER, which is why this
        // shipped as a second, unlabelled switch on every settings row. Same family
        // as the `accessibilityState` bug this repo already hit — RN's platform props
        // silently no-op on web, and only the ARIA ones cross over.
        aria-hidden
        focusable={false}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </Pressable>
  )
}

// ── choice row ──────────────────────────────────────────────────────────────

export type Choice<T extends string> = {
  readonly value: T
  readonly label: string
}

export type ChoiceRowProps<T extends string> = {
  readonly label: string
  readonly help?: string | undefined
  readonly choices: readonly Choice<T>[]
  readonly value: T
  readonly onChange: (value: T) => void
}

/**
 * A small set of options, all visible.
 *
 * Not a picker or a modal: with three or four choices, hiding them behind a sheet
 * costs a tap and hides the fact that a choice exists at all. `radio` roles rather
 * than buttons, so a screen reader announces "2 of 3, selected".
 */
export function ChoiceRow<T extends string>({
  label,
  help,
  choices,
  value,
  onChange,
}: ChoiceRowProps<T>) {
  return (
    <View style={styles.rowStacked}>
      <Text style={styles.rowLabel} role="heading">
        {label}
      </Text>
      {help !== undefined && <Text style={styles.rowHelp}>{help}</Text>}
      <View style={styles.choices} role="radiogroup">
        {choices.map((choice) => {
          const selected = choice.value === value
          return (
            <Pressable
              key={choice.value}
              role="radio"
              aria-label={choice.label}
              // `aria-checked`, not `aria-selected`: selected is for options and tabs,
              // and a radio carrying it announces nothing useful.
              aria-checked={selected}
              onPress={() => onChange(choice.value)}
              style={[styles.choice, selected && styles.choiceSelected]}
            >
              <Text style={[styles.choiceLabel, selected && styles.choiceLabelSelected]}>
                {choice.label}
              </Text>
            </Pressable>
          )
        })}
      </View>
    </View>
  )
}

// ── link row ────────────────────────────────────────────────────────────────

export function LinkRow({
  label,
  value,
  onPress,
}: {
  label: string
  /** Right-aligned trailing text — a version number, a current setting. */
  value?: string | undefined
  // Explicitly `| undefined`: with exactOptionalPropertyTypes, "a handler I may not
  // have yet" and "a prop I did not pass" are different types, and this is the first.
  onPress?: (() => void) | undefined
}) {
  const content = (
    <>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.spacer} />
      {value !== undefined && <Text style={styles.rowValue}>{value}</Text>}
      {onPress !== undefined && <Icon name="chevron" size={18} color={colors.text.tertiary} />}
    </>
  )

  // A row with nothing to open is text, not a control. Giving it a button role
  // would have a screen reader promise an action that does not exist.
  if (onPress === undefined) return <View style={styles.row}>{content}</View>

  return (
    <Pressable
      accessible
      role="button"
      aria-label={label}
      aria-disabled={false}
      onPress={onPress}
      style={styles.row}
    >
      {content}
    </Pressable>
  )
}

// ── note ────────────────────────────────────────────────────────────────────

/** A paragraph inside a card — used where a section needs to explain itself. */
export function Note({ title, body }: { title?: string | undefined; body: string }) {
  return (
    <View style={styles.rowStacked}>
      {title !== undefined && <Text style={styles.rowLabel}>{title}</Text>}
      <Text style={styles.rowHelp}>{body}</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  section: { gap: space[2] },
  sectionTitle: { ...text('overline'), color: colors.text.tertiary, paddingHorizontal: space[1] },
  card: {
    backgroundColor: colors.bg.surface,
    borderRadius: radius.lg,
    ...squircle,
    overflow: 'hidden',
  },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: layout.minTouchTarget,
  },
  rowStacked: {
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rowText: { flex: 1, gap: space[1] },
  rowLabel: { ...text('bodyStrong'), color: colors.text.primary },
  rowHelp: { ...text('caption'), color: colors.text.secondary },
  rowValue: { ...text('caption'), color: colors.text.secondary },
  chevron: { ...text('h3'), color: colors.text.tertiary },
  spacer: { flex: 1 },

  choices: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
  choice: {
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    borderRadius: radius.full,
    backgroundColor: colors.bg.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border.subtle,
    minHeight: layout.minTouchTarget,
    // And the same floor on the OTHER axis. The height was pinned and the width was left
    // to the padding, which is fine for a word and fails for a character: the practice
    // picker's lesson-length options are "5", "10", "20", and "5" measured 42×44 at every
    // viewport — under the floor on the one screen whose controls are all chips.
    //
    // A floor rather than a fixed size, so a long option in a longer language still grows.
    minWidth: layout.minTouchTarget,
    alignItems: 'center',
    justifyContent: 'center',
  },
  choiceSelected: {
    backgroundColor: colors.action.secondary,
    borderColor: colors.action.secondary,
  },
  choiceLabel: { ...text('caption', { weight: '600' }), color: colors.text.secondary },
  choiceLabelSelected: { color: colors.text.onAccent },
})
