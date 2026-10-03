/**
 * The one atlas. Lessons and Explore both mount this; what differs is the spec.
 *
 * It draws exactly what `spec` lists — highlights, pins, labels, rings — and reports
 * what the learner touched as typed events tagged with the spec's `sceneKey`. It never
 * decides what a touch means, and it is never told an answer (scene/types.ts).
 *
 * ## What stays mounted
 *
 * The GL context, its textures and the sphere persist across spec changes: a new
 * question re-uploads a 4 KB highlight table and moves the camera, it does not rebuild
 * the Earth. A new SCREEN gets a new view — a context is cheap next to the cost of one
 * leaking between navigators — and unmounting disposes every GL object it made.
 *
 * ## When it draws
 *
 * Only when something changed: the camera moved, the spec changed, a texture arrived,
 * the app returned to the foreground. A still globe runs no loop at all.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Animated,
  AppState,
  PanResponder,
  PixelRatio,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  type StyleProp,
  type ViewStyle,
} from 'react-native'
import { GLView, type ExpoWebGLRenderingContext } from 'expo-gl'
import { ClaySurface, clayShadow, createThemeStyles, motion, radius, space, text, useReducedMotion, useTheme } from '@worldquest/design'
import { Icon } from '../../components/Icon.js'
import { ClayMap } from '../../components/ClayMap.js'
import { useT } from '../../lib/i18n.js'
import {
  cameraForFrame,
  cameraTravel,
  interpolateCamera,
  panCamera,
  project,
  unproject,
  WORLD_CAMERA,
  zoomCamera,
} from './geo/camera.js'
import { countryAt, outlineSegments, type AtlasGeometry } from './geo/geometry.js'
import type { Camera, Viewport } from './geo/types.js'
import { ATLAS_COUNTRIES, ATLAS_RASTER } from './data/atlas.generated.js'
import { GlobeRenderer, type GL, type GlobeQuality } from './render/GlobeRenderer.js'
import { atlasTheme } from './render/atlasTheme.js'
import { loadAtlasGeometry, loadCountryIdTexture, loadSurfaceTexture } from './render/atlasResources.js'
import type { AtlasEvent, AtlasSceneSpec, HighlightState } from './scene/types.js'
import { LABEL_MAX_SCALE, layoutLabels, markerBox } from './labels.js'

export type AtlasStatus = 'loading' | 'ready' | 'error'

export type WorldAtlasViewProps = {
  readonly spec: AtlasSceneSpec
  readonly onEvent?: ((event: AtlasEvent) => void) | undefined
  /** Suspend the containing page while fingers own the globe. */
  readonly onGestureActiveChange?: ((active: boolean) => void) | undefined
  /** The renderer failed. The parent swaps in the fallback; the lesson is untouched. */
  readonly onStatusChange?: ((status: AtlasStatus, error?: Error) => void) | undefined
  readonly quality?: GlobeQuality
  /** Points of the view covered by something else — framing keeps the subject clear. */
  readonly insets?: Viewport['insets']
  /** Show recenter/zoom buttons. Explore shows them; a lesson keeps the slot quiet. */
  readonly controls?: boolean
  readonly style?: StyleProp<ViewStyle>
  readonly testID?: string
  /** Development measurement only: called after every drawn frame with its CPU time. */
  readonly onDraw?: ((cpuMs: number, at: number) => void) | undefined
  /** Development measurement only: spin at this many degrees per second. */
  readonly autoRotate?: number | undefined
}

/** A press that moved less than this, in points, is a tap rather than a drag. */
const TAP_SLOP = 8
const TAP_MS = 350
/** Longest camera move, degrees of arc, that animates; farther ones cut, so no flights. */
const MAX_ANIMATED_TRAVEL = 70
const FRAME_DEADLINE_MS = 12000
type FrameFlight = {
  deadline: ReturnType<typeof setTimeout> | null
  fail: (error: Error) => void
  startedAt: number | null
}

/** Apply the current disclosure-safe scene before its first complete frame. */
function applyScene(renderer: GlobeRenderer, geometry: AtlasGeometry | null, spec: AtlasSceneSpec): void {
  const byRaster = new Map<number, HighlightState>()
  for (const highlight of spec.highlights) {
    const country = ATLAS_COUNTRIES[highlight.countryId]
    if (country !== undefined) byRaster.set(country.rasterId, highlight.state)
  }
  renderer.setHighlights(byRaster)
  const outlined = spec.highlights.find(highlight => highlight.state !== 'context')
  const country = geometry?.countries.get(outlined?.countryId ?? '')
  renderer.setOutline(country === undefined ? null : outlineSegments(country))
}

export function WorldAtlasView({
  spec,
  onEvent,
  onGestureActiveChange,
  onStatusChange,
  quality = 'high',
  insets,
  controls = false,
  style,
  testID,
  onDraw,
  autoRotate,
}: WorldAtlasViewProps) {
  const { colors, mode } = useTheme()
  const { styles } = useThemeValues()
  const t = useT()
  const reduceMotion = useReducedMotion()
  const [size, setSize] = useState<{ width: number; height: number } | null>(null)
  const [camera, setCamera] = useState<Camera>(WORLD_CAMERA)
  const [status, setStatus] = useState<AtlasStatus>('loading')
  const [rendering, setRendering] = useState(false)
  const statusRef = useRef<AtlasStatus>('loading')
  const [appActive, setAppActive] = useState(AppState.currentState !== 'background' && AppState.currentState !== 'inactive')
  const foreground = useRef(appActive)
  const mounted = useRef(true)
  // Bumped to throw away a lost context and mount a fresh GLView.
  const [generation, setGeneration] = useState(0)

  const renderer = useRef<GlobeRenderer | null>(null)
  const geometry = useRef<AtlasGeometry | null>(null)
  const cameraRef = useRef<Camera>(WORLD_CAMERA)
  const displayedCamera = useRef<Camera>(WORLD_CAMERA)
  const sizeRef = useRef<{ width: number; height: number } | null>(null)
  const frame = useRef<number | null>(null)
  const flight = useRef<FrameFlight | null>(null)
  const dirty = useRef(false)
  const nativeContext = useRef<ExpoWebGLRenderingContext | null>(null)
  const lastNativeFrameMs = useRef<number | null>(null)
  const animation = useRef<number | null>(null)
  const specRef = useRef(spec)
  specRef.current = spec
  const statusCallback = useRef(onStatusChange)
  statusCallback.current = onStatusChange
  const eventCallback = useRef(onEvent)
  eventCallback.current = onEvent
  const drawCallback = useRef(onDraw)
  drawCallback.current = onDraw

  const report = useCallback((next: AtlasStatus, error?: Error) => {
    statusRef.current = next
    if (next === 'error') setRendering(false)
    setStatus(next)
    statusCallback.current?.(next, error)
  }, [])

  // A context that never initializes must not leave a spinner covering Explore forever.
  useEffect(() => {
    if (status !== 'loading' || !appActive) return
    let active = true
    const timer = setTimeout(() => {
      // Native shader work can delay an already queued timer until after the first
      // frame or an AppState transition. Synchronous refs win before effect cleanup.
      if (active && foreground.current && statusRef.current === 'loading') report('error', new Error('atlas: loading timed out'))
    }, 12000)
    return () => { active = false; clearTimeout(timer) }
  }, [status, appActive, report])

  const settle = useRef(0)
  const requestDrawRef = useRef<() => void>(() => {})
  /** At most one GPU frame in flight; changes while it draws replace the pending camera. */
  const requestDraw = useCallback(() => {
    dirty.current = true
    if (!mounted.current || !foreground.current || statusRef.current === 'error' || frame.current !== null || flight.current !== null) return
    setRendering(true)
    frame.current = requestAnimationFrame(() => {
      frame.current = null
      if (!mounted.current || !foreground.current) return
      dirty.current = false
      const r = renderer.current
      const s = sizeRef.current
      if (r === null || s === null) return
      // A lost context (GPU reset, a browser reclaiming it) is remounted cleanly — a new
      // GLView, a new renderer — rather than drawn into.
      if (r.contextLost) {
        r.dispose()
        renderer.current = null
        report('loading')
        setGeneration((n) => n + 1)
        return
      }
      const renderedCamera = cameraRef.current
      const pending: FrameFlight = { deadline: null, fail: () => {}, startedAt: null }
      flight.current = pending
      const release = () => {
        if (flight.current !== pending) return
        if (pending.deadline !== null) clearTimeout(pending.deadline)
        flight.current = null
        if (dirty.current && mounted.current && foreground.current) requestDrawRef.current()
        else if (mounted.current) setRendering(false)
      }
      pending.fail = (error) => {
        if (flight.current !== pending) return
        const backgrounded = (error as Error & { code?: string }).code === 'E_GL_BACKGROUND'
        if (mounted.current && foreground.current && renderer.current === r && !backgrounded) report('error', error)
        release()
      }
      const complete = () => {
        if (flight.current !== pending) return
        if (mounted.current && foreground.current && renderer.current === r) {
          if (Platform.OS !== 'web' && nativeContext.current !== null && pending.startedAt !== null) {
            lastNativeFrameMs.current = performance.now() - pending.startedAt
          }
          // Labels and hit testing follow the image actually completed, not camera
          // positions which a slow GPU has not rendered yet.
          displayedCamera.current = renderedCamera
          setCamera(renderedCamera)
          if (statusRef.current === 'loading') report('ready')
          const expected = Math.round(s.width * PixelRatio.get())
          if (Math.abs(r.bufferWidth - expected) > 2 && settle.current < 30) {
            settle.current++
            dirty.current = true
          } else settle.current = 0
        }
        release()
      }
      try {
        const started = performance.now()
        pending.startedAt = started
        const submitted = r.render(renderedCamera, s)
        drawCallback.current?.(performance.now() - started, started)
        if (!submitted) return release()
        const gl = nativeContext.current
        if (Platform.OS === 'web' || gl === null) return complete()
        pending.deadline = setTimeout(() => pending.fail(new Error('atlas: frame timed out')), FRAME_DEADLINE_MS)
        // endFrameEXP only queues native work. Wait off the JS/UI threads before
        // submitting another frame, then draw the latest requested position.
        void GLView.waitForFrameAsync(gl).then(complete, (error: unknown) => {
          pending.fail(error instanceof Error ? error : new Error(String(error)))
        })
      } catch (error) {
        pending.fail(error instanceof Error ? error : new Error(String(error)))
      }
    })
  }, [report])

  requestDrawRef.current = requestDraw

  const moveCamera = useCallback(
    (next: Camera) => {
      cameraRef.current = next
      requestDraw()
    },
    [requestDraw],
  )

  const stopAnimation = useCallback(() => {
    if (animation.current !== null) cancelAnimationFrame(animation.current)
    animation.current = null
  }, [])

  /** Skip intermediate views when a native frame already costs the whole animation. */
  const flyTo = useCallback(
    (target: Camera) => {
      stopAnimation()
      const from = cameraRef.current
      const duration = motion.expressive.duration
      if (reduceMotion || cameraTravel(from, target) > MAX_ANIMATED_TRAVEL || (lastNativeFrameMs.current ?? 0) >= duration) return moveCamera(target)
      const start = Date.now()
      const step = () => {
        const progress = Math.min(1, (Date.now() - start) / duration)
        moveCamera(interpolateCamera(from, target, progress))
        animation.current = progress < 1 ? requestAnimationFrame(step) : null
      }
      animation.current = requestAnimationFrame(step)
    },
    [moveCamera, reduceMotion, stopAnimation],
  )

  const viewport = useMemo<Viewport | null>(
    () => (size === null ? null : { width: size.width, height: size.height, ...(insets ? { insets } : {}) }),
    [size, insets],
  )

  const homeCamera = useCallback((): Camera => {
    if (viewport === null) return WORLD_CAMERA
    const focus = specRef.current.focus
    return focus.kind === 'world' ? WORLD_CAMERA : cameraForFrame(focus.frame, viewport)
  }, [viewport])

  // A new focus (new question, new selection) recentres. Same focus: the learner's own
  // rotation is left alone.
  const focusKey = spec.focus.kind === 'world' ? 'world' : `${spec.focus.kind}:${spec.focus.kind === 'country' ? spec.focus.countryId : spec.focus.regionId}`
  const placed = useRef<string | null>(null)
  useEffect(() => {
    if (viewport === null) return
    const target = homeCamera()
    if (placed.current === null) {
      // First placement is a cut: arriving on a question is not a journey.
      placed.current = focusKey
      moveCamera(target)
      return
    }
    if (placed.current === focusKey) return
    placed.current = focusKey
    flyTo(target)
  }, [focusKey, viewport, homeCamera, flyTo, moveCamera])

  // Highlights and outline follow the spec. Raster IDs come from the registry, so a
  // country the registry lacks simply is not highlighted — never a neighbour instead.
  useEffect(() => {
    const r = renderer.current
    if (r === null) return
    applyScene(r, geometry.current, spec)
    requestDraw()
  }, [spec.highlights, requestDraw])

  useEffect(() => {
    renderer.current?.setTheme(atlasTheme(colors, mode))
    requestDraw()
  }, [colors, mode, requestDraw])

  useEffect(() => {
    if (autoRotate === undefined || status !== 'ready') return
    let last = performance.now()
    let id = 0
    const spin = () => {
      const now = performance.now()
      const c = cameraRef.current
      moveCamera({ ...c, lon: ((c.lon + ((now - last) / 1000) * autoRotate + 540) % 360) - 180 })
      last = now
      id = requestAnimationFrame(spin)
    }
    id = requestAnimationFrame(spin)
    return () => cancelAnimationFrame(id)
  }, [autoRotate, status, moveCamera])

  // Back from the background: the surface may have been recycled, so draw again.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      foreground.current = state === 'active'
      setAppActive(foreground.current)
      const pending = flight.current
      if (pending?.deadline !== null && pending?.deadline !== undefined) clearTimeout(pending.deadline)
      if (state === 'active') {
        if (pending !== null) pending.deadline = setTimeout(() => pending.fail(new Error('atlas: frame timed out')), FRAME_DEADLINE_MS)
        requestDraw()
      } else {
        if (pending !== null) {
          pending.deadline = null
          // Background time is not GPU speed, even if this frame resolves on return.
          pending.startedAt = null
        }
        stopAnimation()
        if (frame.current !== null) cancelAnimationFrame(frame.current)
        frame.current = null
      }
    })
    return () => sub.remove()
  }, [requestDraw, stopAnimation])

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      stopAnimation()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      if (flight.current?.deadline !== null && flight.current?.deadline !== undefined) clearTimeout(flight.current.deadline)
      flight.current = null
      renderer.current?.dispose()
      renderer.current = null
      nativeContext.current = null
    }
  }, [stopAnimation])

  // Read through refs so a theme or quality change reaches the live renderer without
  // recreating the context (which would re-decode both textures).
  const initial = useRef({ theme: atlasTheme(colors, mode), quality })
  initial.current = { theme: atlasTheme(colors, mode), quality }
  const onContextCreate = useCallback(
    async (gl: ExpoWebGLRenderingContext) => {
      if (!mounted.current) return
      let created: GlobeRenderer
      try {
        created = new GlobeRenderer(gl as unknown as GL, initial.current.theme, initial.current.quality, Platform.OS === 'web')
      } catch (error) {
        return report('error', error instanceof Error ? error : new Error(String(error)))
      }
      renderer.current?.dispose()
      renderer.current = created
      nativeContext.current = gl
      lastNativeFrameMs.current = null
      requestDraw()
      try {
        const [surface, ids, rings] = await Promise.all([loadSurfaceTexture(), loadCountryIdTexture(), loadAtlasGeometry()])
        // Unmounted or replaced while loading: these textures belong to nobody now.
        if (renderer.current !== created) return
        created.setSurface(surface)
        created.setCountryIds(ids, ATLAS_RASTER.width, ATLAS_RASTER.height)
        geometry.current = rings
        applyScene(created, rings, specRef.current)
        requestDraw()
      } catch (error) {
        if (renderer.current === created) report('error', error instanceof Error ? error : new Error(String(error)))
      }
    },
    [report, requestDraw],
  )

  // Gestures: one finger pans, two pinch, a short still press is a tap.
  const gesture = useRef({ x: 0, y: 0, at: 0, moved: false, pinch: 0, dx: 0, dy: 0, base: WORLD_CAMERA })
  const gestureCallback = useRef(onGestureActiveChange)
  gestureCallback.current = onGestureActiveChange
  const endGesture = useCallback(() => gestureCallback.current?.(false), [])
  useEffect(() => {
    if (!appActive || status !== 'ready') endGesture()
    return endGesture
  }, [appActive, endGesture, status])
  const handleTap = useCallback((x: number, y: number) => {
    const s = sizeRef.current
    const g = geometry.current
    const current = specRef.current
    if (s === null || statusRef.current !== 'ready') return
    const point = unproject(x, y, displayedCamera.current, s)
    if (point === null) return
    eventCallback.current?.({ type: 'coordinateSelected', sceneKey: current.sceneKey, lat: point.lat, lon: point.lon })
    if (g === null) return
    const selectable = current.interaction.selectable
    if (selectable !== 'all' && selectable.length === 0) return
    const eligible = selectable === 'all' ? undefined : new Set(selectable)
    const id = countryAt(g, point, eligible)
    if (id !== null) eventCallback.current?.({ type: 'countrySelected', sceneKey: current.sceneKey, countryId: id })
  }, [])

  const touches = (e: GestureResponderEvent) => e.nativeEvent.touches ?? []
  const pinchDistance = (e: GestureResponderEvent) => {
    const [a, b] = touches(e)
    return a && b ? Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) : 0
  }

  const responder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => statusRef.current === 'ready',
        onMoveShouldSetPanResponder: () => statusRef.current === 'ready',
        // A gesture starting on the globe belongs to the globe from touch-down.
        // Scrolling stays available outside it; yielding before the first move lets
        // UIScrollView steal pans and pinches before the map can respond.
        onPanResponderTerminationRequest: () => false,
        onShouldBlockNativeResponder: () => true,
        onPanResponderGrant: (e) => {
          gestureCallback.current?.(true)
          stopAnimation()
          gesture.current = {
            x: e.nativeEvent.locationX,
            y: e.nativeEvent.locationY,
            at: Date.now(),
            moved: false,
            pinch: pinchDistance(e),
            dx: 0,
            dy: 0,
            base: cameraRef.current,
          }
        },
        onPanResponderMove: (e, state) => {
          const s = sizeRef.current
          if (s === null) return
          if (touches(e).length >= 2 && specRef.current.interaction.zoom) {
            const d = pinchDistance(e)
            if (gesture.current.pinch === 0) {
              gesture.current.pinch = d
              gesture.current.base = cameraRef.current
            }
            if (d > 0) moveCamera(zoomCamera(gesture.current.base, d / gesture.current.pinch))
            gesture.current.moved = true
            return
          }
          // Lifting one finger must continue from the zoomed camera, not jump back
          // to the original pan/zoom baseline.
          if (gesture.current.pinch > 0) {
            gesture.current.pinch = 0
            gesture.current.base = cameraRef.current
            gesture.current.dx = state.dx
            gesture.current.dy = state.dy
          }
          const dx = state.dx - gesture.current.dx
          const dy = state.dy - gesture.current.dy
          if (Math.hypot(dx, dy) > TAP_SLOP) gesture.current.moved = true
          if (gesture.current.moved && specRef.current.interaction.rotate) moveCamera(panCamera(gesture.current.base, dx, dy, s))
        },
        onPanResponderRelease: () => {
          endGesture()
          const g = gesture.current
          if (!g.moved && Date.now() - g.at < TAP_MS) handleTap(g.x, g.y)
          const c = cameraRef.current
          eventCallback.current?.({ type: 'viewChanged', sceneKey: specRef.current.sceneKey, lat: c.lat, lon: c.lon, distance: c.distance })
        },
        onPanResponderTerminate: endGesture,
      }),
    [endGesture, handleTap, moveCamera, stopAnimation],
  )

  const onLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout
    if (width === 0 || height === 0) return
    if (sizeRef.current?.width === width && sizeRef.current.height === height) return
    sizeRef.current = { width, height }
    setSize({ width, height })
    requestDraw()
  }

  const labels = useMemo(() => {
    if (viewport === null || status !== 'ready') return []
    const pins = spec.markers.flatMap((m) => {
      const p = project(m, camera, viewport, 0.002)
      return p.visible ? [markerBox(p.x, p.y, m.label)] : []
    })
    return layoutLabels(spec.labels, camera, viewport, pins)
  }, [spec.labels, spec.markers, camera, viewport, status])

  return (
    <View
      style={[styles.frame, style]}
      onLayout={onLayout}
      testID={rendering ? 'atlas-rendering' : 'atlas-idle'}
    >
      {/* One accessible element for the whole picture. The summary obeys the same
          disclosure rules as the labels; the pins and labels inside are hidden from the
          tree so nothing is announced twice and nothing is announced early. The
          controls are SIBLINGS of it: an accessible view's children are not focusable
          on iOS, and a button inside role="img" is not a button on the web. */}
      <View
        style={StyleSheet.absoluteFill}
        testID={testID}
        accessible
        role="img"
        accessibilityLabel={spec.summary}
        aria-busy={rendering}
      >
      {/* The native surface stays transparent until its first complete frame. Keep a
          matching still underneath so shader warmup never exposes a blank map. The
          scene's focus is already disclosed; this image adds no names or answer pins. */}
      <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="atlas-preview">
        <ClayMap name={spec.focus.kind === 'country' ? spec.focus.countryId : spec.focus.kind === 'region' ? `region-${spec.focus.regionId}` : 'world'} style={StyleSheet.absoluteFill} />
      </View>
      <GLView key={generation} pointerEvents="none" style={StyleSheet.absoluteFill} onContextCreate={onContextCreate} />
      {/* Keep the native touch target in React Native. Expo's native GL subview is
          only a drawing surface; it must not own the touch history used for pans. */}
      <View testID="atlas-gesture-surface" collapsable={false} pointerEvents="box-only" style={StyleSheet.absoluteFill} {...responder.panHandlers} />

      {viewport !== null && status === 'ready' && (
        // `direction: ltr`: pins and labels sit at PHYSICAL screen positions projected
        // from the globe, which does not mirror in a right-to-left locale — so inside this
        // layer `start` means left in every language.
        <View style={[StyleSheet.absoluteFill, styles.overlay]} pointerEvents="box-none" aria-hidden importantForAccessibility="no-hide-descendants">
          {spec.rings.map((ring) => {
            const p = project(ring, camera, viewport)
            if (!p.visible) return null
            return (
              <View key={`ring:${ring.countryId}`} pointerEvents="none" style={[styles.ring, { start: p.x - RING / 2, top: p.y - RING / 2 }]}>
                <View style={styles.ringInner} />
              </View>
            )
          })}
          {labels.map((label) => {
            // The country the scene is about gets the strong pill; neighbours stay quiet.
            const strong = spec.highlights.some((h) => h.countryId === label.countryId && h.state !== 'context')
            return (
              <View
                key={`label:${label.countryId}`}
                pointerEvents="none"
                style={[styles.label, strong && styles.labelStrong, { start: label.x, top: label.y, opacity: label.opacity }]}
              >
                <Text style={[styles.labelText, strong && styles.labelTextStrong]} numberOfLines={1} {...LABEL_SCALE}>
                  {label.text}
                </Text>
              </View>
            )
          })}
          {spec.markers.map((marker) => {
            const p = project(marker, camera, viewport, 0.002)
            if (!p.visible) return null
            return (
              <Pressable
                key={marker.placeId}
                onPress={() => eventCallback.current?.({ type: 'placeSelected', sceneKey: spec.sceneKey, placeId: marker.placeId })}
                // The PIN'S TIP is the coordinate: the head sits above it.
                style={[styles.pinHit, { start: p.x - PIN_HIT / 2, top: p.y - PIN_HIT }]}
                hitSlop={space[1]}
              >
                <Pin />
              </Pressable>
            )
          })}
          {/* Names beside their pins, as siblings with the whole layer to lay out in. Inside
              the 48-point pin they were squeezed to its width and Android broke "Madrid"
              across two lines. */}
          {spec.markers.map((marker) => {
            const p = project(marker, camera, viewport, 0.002)
            if (!p.visible || marker.label === null) return null
            return (
              <View
                key={`name:${marker.placeId}`}
                pointerEvents="none"
                style={[styles.pinLabel, { start: p.x + PIN_HIT / 2 - space[1], top: p.y - PIN_HIT + space[1] }]}
              >
                <Text style={styles.pinLabelText} numberOfLines={1} {...LABEL_SCALE}>
                  {marker.label}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      {status === 'loading' && (
        <View style={styles.centre} pointerEvents="none">
          <Text style={styles.statusText}>{t('atlas:state.loading')}</Text>
        </View>
      )}

      </View>

      {controls && status === 'ready' && (
        <View style={styles.controls}>
          <ClaySurface radius={radius.xl} />
          <ControlButton kind="in" label={t('atlas:control.zoomIn')} onPress={() => flyTo(zoomCamera(cameraRef.current, 1.6))} />
          <ControlButton kind="out" label={t('atlas:control.zoomOut')} onPress={() => flyTo(zoomCamera(cameraRef.current, 1 / 1.6))} />
          <ControlButton kind="recenter" label={t('atlas:control.recenter')} onPress={() => flyTo(homeCamera())} />
        </View>
      )}
    </View>
  )
}

/**
 * The answer's pin: it drops onto its coordinate with a spring, then a ring pulses out
 * from the tip a few times — the moment the capital is revealed should feel like one.
 * Under Reduce Motion it is simply there. Decorative motion only: the pin's position is
 * set by its parent and never animated, so the tip is on the coordinate from frame one.
 */
function Pin() {
  const { styles } = useThemeValues()
  const reduceMotion = useReducedMotion()
  const drop = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current
  const pulse = useRef(new Animated.Value(0)).current
  useEffect(() => {
    if (reduceMotion) return
    Animated.spring(drop, { toValue: 1, useNativeDriver: true, friction: 5, tension: 120 }).start()
    const loop = Animated.loop(
      Animated.timing(pulse, { toValue: 1, duration: motion.celebrate.duration * 1.6, useNativeDriver: true }),
      { iterations: 3 },
    )
    loop.start()
    return () => loop.stop()
  }, [drop, pulse, reduceMotion])
  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pinPulse,
          {
            opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [reduceMotion ? 0 : 0.55, 0] }),
            transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.6] }) }],
          },
        ]}
      />
      <Animated.View
        style={{
          transform: [
            { translateY: drop.interpolate({ inputRange: [0, 1], outputRange: [-space[4], 0] }) },
            { scale: drop.interpolate({ inputRange: [0, 1], outputRange: [0.6, 1] }) },
          ],
        }}
      >
        <View style={styles.pinHead}>
          <View style={styles.pinDot} />
        </View>
      </Animated.View>
    </>
  )
}

/** 48-point targets: the gesture-free way to recentre and zoom (WCAG 2.5.1). */
function ControlButton({ kind, label, onPress }: { kind: 'recenter' | 'in' | 'out'; label: string; onPress: () => void }) {
  const { styles, colors } = useThemeValues()
  return (
    <Pressable role="button" aria-label={label} onPress={onPress} style={({ pressed }) => [styles.control, pressed && styles.controlPressed]}>
      <ClaySurface tone="sky" radius={radius.lg} />
      {kind === 'recenter' ? (
        <Icon name="globe" size={22} color={colors.text.primary} />
      ) : (
        // Plus and minus drawn, not typed: the icon set has neither, and a glyph is a
        // different typeface on every device.
        <View style={styles.sign} aria-hidden>
          <View style={styles.signBar} />
          {kind === 'in' && <View style={[styles.signBar, styles.signBarUp]} />}
        </View>
      )}
    </Pressable>
  )
}

/**
 * Map labels grow with the text size up to LABEL_MAX_SCALE (see labels.ts). `dataSet`
 * mirrors the cap into the DOM as `data-max-scale`, which the 200 % check in
 * e2e/flow.cjs honours — the pattern the tab labels use.
 */
const LABEL_SCALE = {
  maxFontSizeMultiplier: LABEL_MAX_SCALE,
  dataSet: { maxScale: String(LABEL_MAX_SCALE) },
} as const

const RING = 34
const PIN = 30
const PULSE = 44
const PIN_HIT = 48

const useThemeValues = createThemeStyles((colors) => {
  const styles = StyleSheet.create({
    frame: { overflow: 'hidden', backgroundColor: colors.bg.canvas, borderRadius: radius.xl },
    overlay: { direction: 'ltr' },
    centre: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    statusText: { ...text('caption'), color: colors.text.secondary },
    ring: {
      position: 'absolute',
      width: RING,
      height: RING,
      borderRadius: RING / 2,
      borderWidth: 3,
      borderColor: colors.map.atlasSubject,
      alignItems: 'center',
      justifyContent: 'center',
    },
    ringInner: { width: RING - 6, height: RING - 6, borderRadius: (RING - 6) / 2, borderWidth: 2, borderColor: colors.map.atlasLabelHalo },
    // Labels use the app's face/edge idiom — a solid edge under the face, never a blur.
    label: {
      position: 'absolute',
      paddingHorizontal: space[2],
      paddingVertical: 2,
      borderRadius: radius.md,
      backgroundColor: colors.map.atlasLabelHalo,
      borderBottomWidth: 2,
      borderBottomColor: colors.border.subtle,
    },
    labelStrong: { backgroundColor: colors.map.atlasLabelStrong, borderBottomColor: colors.map.atlasSubject },
    labelText: { ...text('caption', { weight: '700' }), color: colors.map.atlasLabelInk },
    labelTextStrong: { color: colors.map.atlasLabelStrongInk },
    pinHit: { position: 'absolute', width: PIN_HIT, height: PIN_HIT, alignItems: 'center', justifyContent: 'flex-end', overflow: 'visible' },
    pinPulse: {
      position: 'absolute',
      bottom: -PULSE / 2,
      width: PULSE,
      height: PULSE,
      borderRadius: PULSE / 2,
      borderWidth: 3,
      borderColor: colors.map.atlasPin,
    },
    // A teardrop: a square with three round corners, turned 45° so the sharp one points
    // down. Its tip is PIN/√2 below the square's centre, which is why the head is lifted.
    pinHead: {
      width: PIN,
      height: PIN,
      marginBottom: PIN / Math.SQRT2 - PIN / 2,
      borderTopLeftRadius: PIN / 2,
      borderTopRightRadius: PIN / 2,
      borderBottomLeftRadius: PIN / 2,
      borderBottomRightRadius: 0,
      backgroundColor: colors.map.atlasPin,
      borderWidth: 3,
      borderColor: colors.map.atlasLabelHalo,
      transform: [{ rotate: '45deg' }],
      alignItems: 'center',
      justifyContent: 'center',
    },
    pinDot: { width: PIN / 3, height: PIN / 3, borderRadius: PIN / 6, backgroundColor: colors.map.atlasLabelHalo },
    pinLabel: {
      position: 'absolute',
      maxWidth: 240,
      paddingHorizontal: space[3],
      paddingVertical: space[1],
      borderRadius: radius.lg,
      backgroundColor: colors.map.atlasLabelStrong,
      borderBottomWidth: 3,
      borderBottomColor: colors.map.atlasPin,
    },
    pinLabelText: { ...text('h3'), color: colors.map.atlasLabelStrongInk },
    controls: {
      ...clayShadow(colors),
      position: 'absolute', end: space[2], bottom: space[2],
      flexDirection: 'row', gap: space[2], padding: space[1],
      borderRadius: radius.xl,
      backgroundColor: colors.bg.surface,
      borderWidth: 1,
      borderColor: colors.border.subtle,
    },
    control: {
      width: 48,
      height: 48,
      borderRadius: radius.lg,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlPressed: { backgroundColor: colors.bg.surfacePressed },
    sign: { width: 16, height: 16, alignItems: 'center', justifyContent: 'center' },
    signBar: { position: 'absolute', width: 16, height: 2, borderRadius: 1, backgroundColor: colors.text.primary },
    signBarUp: { transform: [{ rotate: '90deg' }] },
  })
  return { styles, colors }
})
