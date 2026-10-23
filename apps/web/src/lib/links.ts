// Links shared by the landing page, the Plus screen and /plus.

// Live on the App Store since Sep 11, 2026. The short id form is the
// canonical link: Apple resolves it to the localised store page, so it
// cannot rot if the listing title ever changes.
export const APP_STORE_URL = 'https://apps.apple.com/app/id6799316747'
export const APP_STORE_ID = '6799316747'

// Opens the iPhone app straight on its Plus screen (expo-router path
// /more/paywall; `origin` feeds the paywall_viewed analytics event). The
// app's own routing sends a signed-out person to sign-in first.
export function plusDeepLink(origin: 'web_qr' | 'web_gate'): string {
  return `voiceexpense://more/paywall?origin=${origin}`
}
