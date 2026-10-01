/**
 * `/atlas-lab` — the renderer proof. DEVELOPMENT TOOLING, not a product screen.
 *
 * Reachable only in a development build or an export made with EXPO_PUBLIC_ATLAS_LAB=1,
 * which is how `scripts/atlas-evidence.cjs` drives it. It exists to answer, with real
 * pixels, the questions a unit test cannot: does the sphere draw, do the textures load,
 * does a highlight land on the right country, does a pin sit on its coordinate, does a
 * question change re-use the scene, and how long does a frame take here.
 *
 * Its labels are developer shorthand (ISO codes, mode names), deliberately untranslated.
 */

import { useMemo, useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native'
import { createThemeStyles, radius, space, text } from '@worldquest/design'
import { useContent } from '../../lib/content.js'
import { useT } from '../../lib/i18n.js'
import { WorldAtlasView, type AtlasStatus } from './WorldAtlasView.js'
import { buildLessonScene } from './scene/lessonScene.js'
import { buildExploreScene } from './scene/exploreScene.js'
import { useAtlasNames } from './useAtlasNames.js'

/** Varied on purpose: big, small, island, multi-part, antimeridian, enclave, far south. */
export const LAB_COUNTRIES = ['ES', 'SE', 'JP', 'FJ', 'SG', 'ID', 'RU', 'CL', 'NZ', 'VA', 'US', 'BR', 'ZA', 'KI'] as const

type LabMode = 'capital' | 'identify' | 'explore'

export function AtlasLab() {
  const { styles } = useThemeValues()
  const t = useT()
  const { index } = useContent()
  const names = useAtlasNames(index?.index)
  const [country, setCountry] = useState<string>('ES')
  const [mode, setMode] = useState<LabMode>('capital')
  const [revealed, setRevealed] = useState(false)
  const [status, setStatus] = useState<AtlasStatus>('loading')
  const [spin, setSpin] = useState(false)
  const [stats, setStats] = useState('')
  const [failure, setFailure] = useState('')
  const [mountKey, setMountKey] = useState(0)
  const mountedAt = useRef(performance.now())
  const readyMs = useRef<number | null>(null)
  const frames = useRef<{ cpu: number; at: number }[]>([])

  const spec = useMemo(() => {
    const explore = () => buildExploreScene({ selected: country, region: null, matches: [], ...names, t: t as never })
    if (mode === 'explore') {
      return buildExploreScene({ selected: country, region: null, matches: [], ...names, t: t as never })
    }
    // A country with no geometry has no lesson scene; the lab shows Explore instead.
    return buildLessonScene({
      sceneKey: `lab:${mode}:${country}`,
      policy: { mode: mode === 'capital' ? 'capital-name' : 'identify-country', beforeAnswer: true },
      entityId: country,
      factId: `geo.${country}.capital`,
      phase: revealed ? 'revealed' : 'question',
      chosenOptionId: null,
      ...names,
      t: t as never,
    }) ?? explore()
  }, [mode, country, revealed, names, t])

  const report = () => {
    const f = frames.current
    if (f.length < 3) return setStats(`frames ${f.length}`)
    const gaps = f.slice(1).map((x, i) => x.at - f[i]!.at).sort((a, b) => a - b)
    const cpu = f.map((x) => x.cpu).sort((a, b) => a - b)
    const pct = (xs: number[], p: number) => xs[Math.min(xs.length - 1, Math.floor(xs.length * p))]!.toFixed(1)
    setStats(
      `frames ${f.length} · interval p50 ${pct(gaps, 0.5)} p95 ${pct(gaps, 0.95)} ms · draw cpu p50 ${pct(cpu, 0.5)} p95 ${pct(cpu, 0.95)} ms · ready ${readyMs.current?.toFixed(0) ?? '—'} ms`,
    )
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} testID="atlas-lab">
      <Text style={styles.title}>Atlas lab</Text>
      <Text style={styles.meta} testID="atlas-lab-status">
        {status} · {mode} · {country} · {revealed ? 'revealed' : 'question'}
        {failure !== '' ? ` · ${failure}` : ''}
      </Text>
      <WorldAtlasView
        key={mountKey}
        spec={spec}
        controls
        style={styles.atlas}
        testID="atlas-lab-view"
        onStatusChange={(next, error) => {
          setStatus(next)
          setFailure(error?.message ?? '')
          if (next === 'ready' && readyMs.current === null) readyMs.current = performance.now() - mountedAt.current
        }}
        onDraw={(cpu, at) => {
          frames.current.push({ cpu, at })
          if (frames.current.length > 600) frames.current.shift()
        }}
        autoRotate={spin ? 30 : undefined}
      />
      <Text style={styles.meta} testID="atlas-lab-stats">
        {stats}
      </Text>
      <Text style={styles.meta} testID="atlas-lab-summary">
        {spec.summary}
      </Text>
      <View style={styles.row}>
        {(['capital', 'identify', 'explore'] as const).map((m) => (
          <Chip key={m} label={m} active={mode === m} onPress={() => setMode(m)} />
        ))}
        <Chip label={revealed ? 'hide' : 'reveal'} active={revealed} onPress={() => setRevealed((r) => !r)} />
        <Chip label={spin ? 'stop' : 'spin'} active={spin} onPress={() => setSpin((s) => !s)} />
        <Chip
          label="measure"
          active={false}
          onPress={() => {
            report()
            frames.current = []
          }}
        />
        <Chip
          label="remount"
          active={false}
          onPress={() => {
            mountedAt.current = performance.now()
            readyMs.current = null
            setMountKey((k) => k + 1)
          }}
        />
      </View>
      <View style={styles.row}>
        {LAB_COUNTRIES.map((c) => (
          <Chip key={c} label={c} active={country === c} onPress={() => setCountry(c)} />
        ))}
      </View>
    </ScrollView>
  )
}

function Chip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  const { styles } = useThemeValues()
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} style={[styles.chip, active && styles.chipActive]} testID={`lab-${label}`}>
      <Text style={styles.chipText}>{label}</Text>
    </Pressable>
  )
}

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    screen: { flex: 1, backgroundColor: colors.bg.canvas },
    content: { padding: space[4], gap: space[3] },
    title: { ...text('h2'), color: colors.text.primary },
    meta: { ...text('caption'), color: colors.text.secondary },
    atlas: { height: 420 },
    row: { flexDirection: 'row', flexWrap: 'wrap', gap: space[2] },
    chip: {
      minHeight: 44,
      minWidth: 44,
      paddingHorizontal: space[3],
      justifyContent: 'center',
      borderRadius: radius.full,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    chipActive: { borderColor: colors.map.atlasSelected, borderWidth: 2 },
    chipText: { ...text('caption', { weight: '700' }), color: colors.text.primary },
  })
  return { styles }
})
