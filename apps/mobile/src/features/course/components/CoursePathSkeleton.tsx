/**
 * The course path's loading shape, for Home's skeleton.
 *
 * The same blocks in the same places as the path it stands in for — a unit banner, the
 * current step's callout and circle, then two smaller circles on the same zig-zag — so
 * that when Home's data lands nothing moves. Never a spinner on primary content, and
 * this is Home's primary content.
 */

import { StyleSheet, View, useWindowDimensions } from 'react-native'
import { Skeleton, depth, radius, space } from '@worldquest/design'
import { CURRENT_NODE, NODE, estimatedColumn, physicalSwing, swingFor } from './pathGeometry.js'

/** Roughly the banner at 100 % text: a label, a title, one objective line and its bar. */
const BANNER = 120
/** Roughly the callout: Start, a one-line objective, the lesson count. */
const CALLOUT = 96

export function CoursePathSkeleton() {
  const { width } = useWindowDimensions()
  const column = estimatedColumn(width)

  return (
    <View style={styles.unit}>
      <Skeleton height={BANNER} borderRadius={radius.lg} />
      <Skeleton height={CALLOUT} borderRadius={radius.lg} />
      {[0, 1, 2].map((index) => {
        const size = index === 0 ? CURRENT_NODE : NODE
        return (
          <View key={index} style={[styles.row, { transform: [{ translateX: physicalSwing(swingFor(index, column)) }] }]}>
            <Skeleton width={size} height={size + depth.button} borderRadius={radius.full} />
          </View>
        )
      })}
    </View>
  )
}

const styles = StyleSheet.create({
  unit: { gap: space[3] },
  row: { alignItems: 'center' },
})
