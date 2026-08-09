// Ambient module declarations for the font assets `useFonts()` requires in
// app/_layout.tsx (see docs/audit-2026-08-08/01-mobile-ui-and-layout.md F5).
// Metro resolves `require('*.ttf')` to a numeric asset id at bundle time;
// TypeScript has no built-in knowledge of that, so without this the
// `require(...)` calls fail `tsc --noEmit` with "Cannot find module".
declare module '*.ttf' {
  const assetId: number
  export default assetId
}

declare module '*.otf' {
  const assetId: number
  export default assetId
}
