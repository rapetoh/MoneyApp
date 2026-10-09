# Widgets (Oct 8 2026)

One tap from the home screen or lock screen to logging. iOS does not let a widget record audio, so every widget opens Murmur already listening.

| Widget | Shows | Tap |
|---|---|---|
| Home, small | Spent today, budget left | Voice |
| Home, medium | Same, plus Speak and Type buttons | Speak = voice, Type = Quick entry |
| Lock, circular | Mic | Voice |
| Lock, rectangular | Spent today, budget left | Voice |
| Lock, inline | "$12.50 spent today" | Voice |

## How the numbers get there

```
app (WidgetSync.tsx) ──JSON snapshot──► shared keychain item (group 47WU47J52M.com.voiceexpense.widgetdata) ──► widget (targets/widget)
```

- The app formats every string (money, labels, language); the widget never reads the database or network.
- The snapshot carries the day and the budget period end, so at midnight the widget shows a fresh day and at period end a full budget without waiting for the app.
- Signed out: snapshot cleared, widget shows "Open Murmur to start".
- Reloads only when the text changed (iOS budgets widget reloads).

| Piece | File |
|---|---|
| Widget UI + timeline | `apps/mobile/targets/widget/MurmurWidgets.swift` |
| Snapshot model | `apps/mobile/targets/widget/Snapshot.swift` |
| Bridge (writes the keychain item) | `apps/mobile/modules/murmur-widget/` (pod `MurmurWidgetBridge`; must not be named `MurmurWidget`, that is the extension) |
| Snapshot producer | `apps/mobile/src/components/WidgetSync.tsx` |
| Deep links | `voiceexpense://record`, `voiceexpense://record?tab=manual` |

Widget extension needs iOS 17.

## Why a keychain group, not an App Group

App Groups are an App ID capability: turning one on needs Apple's developer portal, and EAS cannot do it with the App Store Connect API key (`Failed to patch capabilities: APP_GROUPS`), so every build would need an Apple ID sign-in with 2FA. Sharing a keychain group inside one team needs no capability. The app lists its own identifier first in `keychain-access-groups`, so SecureStore's items (the signed-in session) stay in the default group they were always in. The item is readable after first unlock, so lock-screen widgets render while the phone is locked.

## Fixed Oct 9 2026 (owner report on TestFlight 86)

- **Speak did nothing** when the app had first been opened from a cold start: the record route kept a stale `openVoice` made while signed out. `openVoice` is now a stable request (counter) honoured by `VoiceSessionProvider` once the session and profile are loaded. Verified: cold, warm x3, from Settings and from a pushed screen, and the in-app mic.
- **Type opened Quick entry as a full page with a dead Cancel**: the bridge replaced the whole stack with it. It now goes to Today and pushes Quick entry as its sheet. Every Back / Cancel / Done that can be the first screen (Quick entry, transaction detail and edit, Ask, Privacy, Paywall, Recurring, Import) goes through `goBack()`, which falls back to Today.
