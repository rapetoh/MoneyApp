import { Pressable, type PressableProps, type LayoutChangeEvent, type Insets } from 'react-native'

// Apple's minimum touch target — Apple HIG / WCAG 2.5.5. Every genuine
// sub-44pt target the audit found (fix-plan 4.1, audit 01-F26) was rescued
// with a raw `hitSlop` number on a bare `Pressable`, which works but has no
// way to catch the *next* one. `<Tappable>` is that bare `Pressable` plus a
// dev-only, post-layout check: it measures its own rendered box, adds
// whatever `hitSlop` was supplied, and warns if the effective target is
// still under 44pt. Nothing changes at runtime in production — this is a
// development-time regression guard, not a layout primitive.
export function Tappable({ hitSlop, onLayout, ...props }: PressableProps) {
  function handleLayout(event: LayoutChangeEvent) {
    if (__DEV__) {
      const { height } = event.nativeEvent.layout
      const slop = hitSlopVertical(hitSlop)
      const effective = height + slop
      console.assert(
        effective >= 44,
        `Tappable: effective touch target is ${effective}pt (height ${height} + hitSlop ${slop}), ` +
          `below the 44pt minimum. Add hitSlop or grow the control.`,
      )
    }
    onLayout?.(event)
  }

  return <Pressable hitSlop={hitSlop} onLayout={handleLayout} {...props} />
}

function hitSlopVertical(hitSlop: PressableProps['hitSlop']): number {
  if (hitSlop == null) return 0
  if (typeof hitSlop === 'number') return hitSlop * 2
  const insets = hitSlop as Insets
  return (insets.top ?? 0) + (insets.bottom ?? 0)
}
