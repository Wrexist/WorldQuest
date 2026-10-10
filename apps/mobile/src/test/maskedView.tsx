/**
 * `@react-native-masked-view/masked-view`, for component tests.
 *
 * The package's native entry is JSX in `.js`, which Vite refuses to parse, and its web
 * build renders the mask IN PLACE OF the children, so a test could never see what is
 * masked. A View that renders the children and keeps the mask out of the tree. Never
 * bundled: Metro resolves the real module for every app and web build.
 */

import type { ReactElement, ReactNode } from 'react'
import { View, type ViewProps } from 'react-native'

export default function MaskedView({ maskElement: _mask, children, ...props }: ViewProps & { maskElement: ReactElement; children?: ReactNode }) {
  return <View {...props}>{children}</View>
}
