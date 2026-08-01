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
import { colors, layout, radius, space, text } from '@worldquest/design'

// ── section ─────────────────────────────────────────────────────────────────

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {title}
      </Text>
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
    <View
      // One element, not four. `accessibilityRole="switch"` plus the state is what
      // makes a reader say "Sound effects, on, switch" rather than reading a label,
      // then a paragraph, then an unlabelled control.
      accessible
      accessibilityRole="switch"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityHint={help}
      accessibilityState={{ checked: value }}
      style={styles.row}
    >
      <View style={styles.rowText}>
        <Text style={styles.rowLabel}>{label}</Text>
        {help !== undefined && <Text style={styles.rowHelp}>{help}</Text>}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        trackColor={{ false: colors.bg.canvas, true: colors.action.primary }}
        thumbColor={colors.text.primary}
        // The wrapper above is the accessible element; the raw control must not
        // announce itself a second time.
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      />
    </View>
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
      <Text style={styles.rowLabel} accessibilityRole="header">
        {label}
      </Text>
      {help !== undefined && <Text style={styles.rowHelp}>{help}</Text>}
      <View style={styles.choices} accessibilityRole="radiogroup">
        {choices.map((choice) => {
          const selected = choice.value === value
          return (
            <Pressable
              key={choice.value}
              accessibilityRole="radio"
              accessibilityLabel={choice.label}
              accessibilityState={{ selected }}
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
      {onPress !== undefined && <Text style={styles.chevron}>›</Text>}
    </>
  )

  // A row with nothing to open is text, not a control. Giving it a button role
  // would have a screen reader promise an action that does not exist.
  if (onPress === undefined) return <View style={styles.row}>{content}</View>

  return (
    <Pressable
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: false }}
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
    justifyContent: 'center',
  },
  choiceSelected: {
    backgroundColor: colors.action.secondary,
    borderColor: colors.action.secondary,
  },
  choiceLabel: { ...text('caption', { weight: '600' }), color: colors.text.secondary },
  choiceLabelSelected: { color: colors.text.onAccent },
})
