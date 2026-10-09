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
app (WidgetSync.tsx) ──JSON snapshot──► App Group group.com.voiceexpense.app ──► widget (targets/widget)
```

- The app formats every string (money, labels, language); the widget never reads the database or network.
- The snapshot carries the day and the budget period end, so at midnight the widget shows a fresh day and at period end a full budget without waiting for the app.
- Signed out: snapshot cleared, widget shows "Open Murmur to start".
- Reloads only when the text changed (iOS budgets widget reloads).

| Piece | File |
|---|---|
| Widget UI + timeline | `apps/mobile/targets/widget/MurmurWidgets.swift` |
| Snapshot model | `apps/mobile/targets/widget/Snapshot.swift` |
| Bridge (writes App Group) | `apps/mobile/modules/murmur-widget/` (pod `MurmurWidgetBridge`; must not be named `MurmurWidget`, that is the extension) |
| Snapshot producer | `apps/mobile/src/components/WidgetSync.tsx` |
| Deep links | `voiceexpense://record`, `voiceexpense://record?tab=manual` |

Widget extension needs iOS 17. The App Group entitlement is on the app and the widget only (not the watch).
