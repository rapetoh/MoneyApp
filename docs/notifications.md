# Notifications

The system that decides what Murmur says when nobody is looking at it.

Board (the visual summary of why this exists): `docs/murmur-notifications-360.html`.

---

## 1. The problem this replaced

Before Sep 19 2026 Murmur could send five messages, from three triggers,
and every one of them was a **local** notification: the app asked iOS to
display a fixed sentence at a fixed future time. That mechanism has a
ceiling nobody can raise. The phone writes the words days in advance, so
the words can never contain a figure. This is why the entire catalogue
read like this:

- "Anything to add from today?"
- "A few quiet days"
- "Your week in one minute"

Not a copy problem. The phone does not know, on Monday, what Wednesday's
balance will be.

Two consequences followed:

- **Nothing useful could be said.** Seven insight types, a budget engine,
  a forecaster and a full bill calendar all shipped, and all of them were
  reachable only by opening the app and finding the right tab.
- **The day-7 cliff.** `planReminders()` schedules a seven day horizon and
  refills only on app foreground or a new log. A user who stops opening
  the app hears nothing from day 8, permanently. Murmur went quiet exactly
  when someone was churning.

Three notification promises in the PRD (budget exceeded, twice; a
recurring bill due but never logged) were never built, because with local
notifications they were not buildable.

---

## 2. Shape of the system

```
packages/shared/src/domain/notifications.ts    the decision (pure, tested)
        │
        ├── planNotifications()   what is TRUE and worth saying
        └── govern()              which single one actually goes out
        │
        ▼
scripts/build-shared-deno.mjs  →  supabase/functions/_shared/generated/shared.ts
        │
        ▼
supabase/functions/notify-sweep/index.ts       transport only (read, send, record)
        │  hourly, pg_cron, migration 037
        ▼
Expo push  →  APNs  →  the phone
        │
        ▼
public.notification_log                        what was already said
```

**The decision logic is not in the Edge Function.** Every notification is
a claim about the user's money, and a claim computed one way on the server
and another way in the app is how a notification ends up contradicting the
screen it opens. So `planNotifications` runs the same `budgetStatus`,
`computeAskInsights` and `recurrence` the two apps render from. Anything
resembling a threshold inside `notify-sweep/index.ts` is a bug.

### Local notifications did not go away

`src/services/reminders.ts` still owns the evening check-in and the quiet
nudges, still locally scheduled. They must fire with no network and no
server round trip, which is exactly what local notifications are good at.
The sweep owns everything the phone cannot know by itself.

---

## 3. The six families

| Family | Muteable | Contains |
|---|---|---|
| `money` | **no** | billing issue, trial ending, Plus lapsed |
| `bill` | yes | bill lands tomorrow, bill never arrived, heavy week |
| `budget` | yes | over budget, 80% with days left, category over |
| `receipt` | yes | Apple Pay capture (local, already shipped) |
| `insight` | yes | weekly recap, month closed, category surge |
| `habit` | yes | evening check-in (local), day 14/30/60 win-back |

`money` has no switch on purpose. It is transactional: someone who muted
weekly recaps has not asked to be kept in the dark about a failed payment.

---

## 4. The governor

Not a tuning knob. Published benchmarks put the fatigue inflection around
five sends a week and roughly 3.4x uninstall risk above six. Murmur
defaults to **three a week, at most one a day**, and treats silence as a
correct outcome.

Rules, in `govern()`:

1. A claim already sent is never sent again (`dedupe_key`).
2. Quiet hours bind everything, including billing. A failed card at 03:00
   is not worth waking someone; the sweep offers it again at 08:00.
3. A muted family is dropped, unless the candidate is transactional.
4. One a day, and `max_per_week` a week, for non-transactional messages.
5. Highest priority wins. Nothing ever reaches for a lesser candidate to
   fill a slot.

The priority ladder lives in one `PRIORITY` object so the ordering is
arguable rather than scattered. The rule behind the numbers: money about
to move outranks money that already moved, which outranks an observation,
which outranks a request for the user's effort.

---

## 5. How "never twice" actually works

`notification_log` has a unique index on `(user_id, dedupe_key)`, and the
sweep **inserts before it sends**. Two overlapping sweeps cannot both send
the same claim: the loser's insert fails with `23505` and it moves on. If
the push then fails, the claim row is deleted, because a claim is a promise
that the user was told and an undelivered message makes that promise false.

A `dedupe_key` identifies the **claim**, never the message or the clock:

```
bill_tomorrow:<rule id>:<occurrence date>
budget_over:<budget id>:<period start>
billing_issue:<detection instant>
weekly_recap:<local date>
```

A card that stays broken for a week produces one notification, because the
key is the detection instant, not today.

---

## 6. Billing issue vs cancellation

RevenueCat reports `billing_issues_detected_at` per subscription, but
`resolveEntitlement` used to fold it into `plus_will_renew: false`
alongside a voluntary cancellation. Those two need opposite messages, and
telling someone who deliberately cancelled that their payment failed is
worse than saying nothing.

Migration 036 adds `profiles.plus_billing_issue_at` and
`plus_grace_until`, both written by the entitlement sync, both inside
`guard_plus_entitlement` so a client cannot clear its own billing issue.
The grace deadline is what lets the message say how long they have.

---

## 7. iOS specifics

- **Interruption level** comes from the candidate's `urgency`.
  `time-sensitive` breaks through Focus and is reserved for money moving
  within a day (`bill_tomorrow`, `billing_issue`). Recaps are `passive`
  and are happy to wait in the scheduled summary.
- **Permission is never asked by this system.** The prompt belongs to a
  screen that explained itself first (onboarding's habit step, or the
  prime sheet). `registerPushToken` registers only when permission is
  already granted and goes quiet otherwise.
- **Android channels**, one per family, created at registration so muting
  recaps in system settings cannot also mute a failed payment.

---

## 8. The shared-code bundle

Deno resolves only explicit, extensioned specifiers; `packages/shared` is
ordinary Node-style TypeScript with JSON locale imports. Edge Functions
therefore cannot import it directly.

The old answer was a hand-port under a "DO NOT HAND-EDIT THE LOGIC" header
(`_shared/recurrence.ts`), kept honest by a test that diffed the two
copies. That does not scale to the four engines the sweep needs.

The new answer is generated:

```
npm run build:shared-deno     # writes _shared/generated/shared.ts
npm run check:shared-deno     # fails if it is stale
```

`sharedDenoBundle.test.ts` runs the check, asserts the exports the Edge
Functions import, and asserts the bundle has no unresolved imports. Before
the swap, the old hand-port and the real engine were run over **207,360**
rule/timezone/anchor/now combinations and agreed on every one.

**When you change `packages/shared`, run `npm run build:shared-deno`.**
The test fails if you forget.

---

## 9. Deploy order

Strictly this order. Each step assumes the previous one.

1. `node scripts/apply-sql.mjs supabase/migrations/036_notifications.sql`
2. Regenerate DB types: `packages/shared/scripts/gen-db-types.sh`, then
   drop the hand-update note for 036/037 from the file header.
3. `supabase functions deploy notify-sweep`
4. Provision the cron credential, once:
   `select vault.create_secret('<service key>', 'notify_sweep_key');`
5. `node scripts/apply-sql.mjs supabase/migrations/037_notify_sweep_cron.sql`
6. New EAS build. The push entitlement is compiled into the binary, so no
   existing TestFlight build can receive anything.

Steps 1 to 5 are safe before the build ships: with no `push_tokens` rows,
every sweep finds nobody and returns `{considered: 0}`.

### Pausing everything, without a deploy

```sql
select cron.unschedule('notify-sweep-hourly');
```

Re-running migration 037 restores it.

### Verifying a run by hand

```bash
curl -X POST https://<project>.supabase.co/functions/v1/notify-sweep \
  -H "Authorization: Bearer $SERVICE_KEY"
# => {"considered":N,"sent":N,"failed":0,"reasons":{...},"capped":false}
```

`reasons` says why users were skipped (`quiet_hours`, `nothing_to_say`),
which is the fastest way to tell "the sweep is broken" from "there was
genuinely nothing to say".

---

## 10. What is not built yet

The board lists 37 notifications. This build ships the spine and 13 kinds.
Still open, in rough value order:

- `A3` a recurring bill was auto added (the server generates it silently
  at 06:00 and the user is never told)
- `A5` sync stuck, entries not backed up
- `B3` subscription amount changed
- `C5` safe to spend today (opt in, daily)
- `D4`/`D5`/`D6` large charge landed, subscription total, good news
- `E5` milestones
- `F6`/`F7` new device signed in, deletion confirmed
- In-app inbox reading `notification_log`, so a missed push is not lost
- Desktop native notifications, then web push behind a service worker
- Quiet-hours and weekly-ceiling controls in the settings UI (the columns
  and the governor already honour them; only the pickers are missing)

---

## 11. Files

| Path | What |
|---|---|
| `packages/shared/src/domain/notifications.ts` | the engine: `planNotifications`, `govern` |
| `packages/shared/src/domain/__tests__/notifications.test.ts` | 37 tests |
| `supabase/functions/notify-sweep/index.ts` | hourly sweep, transport only |
| `supabase/migrations/036_notifications.sql` | tables + billing-issue columns |
| `supabase/migrations/037_notify_sweep_cron.sql` | the schedule, Vault credential |
| `scripts/build-shared-deno.mjs` | generates the Deno bundle |
| `apps/mobile/src/services/pushTokens.ts` | registration, channels, tap routing |
| `apps/mobile/src/hooks/usePushRegistration.ts` | keeps the token current |
| `apps/mobile/src/hooks/useNotificationPrefs.ts` | per-family switches |
| `apps/mobile/src/services/reminders.ts` | local check-in, unchanged |
