/**
 * Choosing a face.
 *
 * Twelve portraits ship (`asset-prompts.md` §9) and until now the app drew initials
 * for everyone, because nothing let a user pick. The set exists to cover a real range
 * of skin tones, ages, hair textures and head coverings — "Emma and Ingrid should both
 * find themselves here" — and a set nobody can choose from does none of that.
 *
 * ## No uploads, ever
 *
 * That is a child-safety rule, not a scope cut. A picker over a fixed set is the whole
 * feature; there is deliberately no camera, no file input and no URL field.
 *
 * ## Initials stay a choice
 *
 * The first option clears the portrait rather than being absent. Somebody who prefers
 * not to have a face should be able to say so, and "unset" has to be reachable once
 * "set" is — otherwise the first tap is irreversible.
 */

import { Pressable, ScrollView, StyleSheet } from 'react-native'
import { Avatar, colors, radius, space } from '@worldquest/design'
import { Art } from '../../components/Art.js'
import { ART_BY_NAME, type ArtName } from '../../lib/art.generated.js'
import { useT } from '../../lib/i18n.js'

/**
 * Every avatar the build shipped, in order, derived rather than listed.
 *
 * A hardcoded list of twelve would be a second copy of what `build:art` already wrote —
 * the same drift that made the illustration array and the screenshot frame list go
 * stale. Adding `avatar-13` to the masters puts it here with no code change.
 */
export const AVATARS: readonly ArtName[] = Object.keys(ART_BY_NAME)
  .filter((name): name is ArtName => name.startsWith('avatars/'))
  .sort()

/** `avatars/avatar-07` → `avatar-07`, the form stored in preferences. */
export const avatarId = (name: ArtName): string => name.slice('avatars/'.length)

/** The stored id back to an art name, or null if it names nothing we ship. */
export function avatarArt(id: string | null): ArtName | null {
  if (id === null) return null
  const name = `avatars/${id}` as ArtName
  return name in ART_BY_NAME ? name : null
}

const SWATCH = 64

export type AvatarPickerProps = {
  readonly value: string | null
  readonly onChange: (value: string | null) => void
}

export function AvatarPicker({ value, onChange }: AvatarPickerProps) {
  const t = useT()

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // One radiogroup, so a screen reader announces this as a single choice with
      // twelve options rather than twelve unrelated buttons.
      role="radiogroup"
      aria-label={t('settings:avatar.label')}
    >
      <Option
        selected={value === null}
        label={t('settings:avatar.none')}
        onPress={() => onChange(null)}
      >
        <Avatar initials="EX" size={SWATCH} accessibilityLabel="" ringed={false} />
      </Option>

      {AVATARS.map((name, i) => (
        <Option
          key={name}
          selected={value === avatarId(name)}
          // Numbered, not described. Naming what each portrait depicts would be this
          // file asserting somebody's appearance from a filename; the number is what a
          // user can actually verify against what they see.
          label={t('settings:avatar.option', { number: i + 1, total: AVATARS.length })}
          onPress={() => onChange(avatarId(name))}
        >
          <Avatar
            size={SWATCH}
            ringed={false}
            accessibilityLabel=""
            image={<Art name={name} size={SWATCH} />}
          />
        </Option>
      ))}
    </ScrollView>
  )
}

function Option({
  selected,
  label,
  onPress,
  children,
}: {
  selected: boolean
  label: string
  onPress: () => void
  children: React.ReactNode
}) {
  return (
    <Pressable
      role="radio"
      aria-checked={selected}
      aria-label={label}
      onPress={onPress}
      // The ring is the selection, and it is a RING rather than a tint: a colour
      // difference on a small circle is the signal accessibility.md §4 says must be
      // paired with a shape. `aria-checked` carries it for anyone who cannot see either.
      style={[styles.option, selected && styles.selected]}
    >
      {children}
    </Pressable>
  )
}

const styles = StyleSheet.create({
  row: { gap: space[3], paddingVertical: space[2], paddingHorizontal: space[1] },
  option: {
    borderRadius: radius.full,
    borderWidth: 3,
    borderColor: 'transparent',
    padding: 2,
  },
  selected: { borderColor: colors.action.primary },
})
