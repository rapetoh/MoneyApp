import { Text as RNText, type TextProps } from 'react-native'

// A global Dynamic Type cap so text can still grow with the system font
// scale, but bounded — RN's default is unbounded `allowFontScaling`, and
// nothing in the app sets a ceiling (`grep -rn "allowFontScaling"
// apps/mobile` returns zero hits; see
// docs/audit-2026-08-08/01-mobile-ui-and-layout.md F24). Above roughly
// 130-150% system scale, the fixed-height rows and buttons this app uses
// throughout clip or push their neighbours off-screen.
//
// The RN-idiomatic way to set this app-wide used to be
// `Text.defaultProps.maxFontSizeMultiplier = MAX_FONT_SCALE`, but that is a
// no-op in this app's stack: RN 0.81's `Text` (and `TextInput`) are React
// 19 function components declared with the `component` type syntax and
// accept `ref` as a plain prop — React 19 dropped `defaultProps` support
// for function components entirely (verified against
// node_modules/react-native/Libraries/Text/Text.js, which no longer wraps
// `Text` in `forwardRef`). Setting `RNText.defaultProps` compiles but is
// silently ignored at render time.
//
// `ScaledText` is the real fix: a thin wrapper that applies the cap as an
// actual default prop, overridable per-instance same as
// `maxFontSizeMultiplier` always was.
const MAX_FONT_SCALE = 1.4

export function ScaledText({ maxFontSizeMultiplier = MAX_FONT_SCALE, ...props }: TextProps) {
  return <RNText maxFontSizeMultiplier={maxFontSizeMultiplier} {...props} />
}
