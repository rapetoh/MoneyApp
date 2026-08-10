import { useEffect, useMemo, useState } from 'react'
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { Ionicons } from '@expo/vector-icons'
import { Colors, Typography, Hairline } from '../theme'
import { ScaledText as Text } from './ScaledText'
import { Tappable } from './Tappable'
import { t, formatMoney, type Locale } from '@voice-expense/shared'
import type { Transaction, RecurringRule } from '@voice-expense/shared'
import {
  detectRecurringPatterns,
  type RecurringPatternCandidate,
} from '../services/recurringPatternDetector'

/**
 * "New pattern detected" banner on Today.
 *
 * Surfaces a single candidate from `detectRecurringPatterns` at a time —
 * highest-priority first (largest amount × occurrences). Two actions:
 *  - Set up → creates a recurring rule via the supplied `onAccept`
 *    callback (parent owns the actual mutation since rule creation
 *    requires the userId-scoped hook).
 *  - Not now → records the candidate's key in SecureStore so the same
 *    pattern doesn't surface again. The list of dismissed keys is capped
 *    at 100 entries (FIFO-evicted) so it can't grow unbounded.
 *
 * The banner is hidden entirely when there are no candidates, when the
 * single highest-priority candidate is dismissed, and during the brief
 * SecureStore read on mount (we render conservatively rather than flash
 * the wrong state).
 */

const STORAGE_KEY = 'recurring_pattern_dismissed_v1'
const MAX_DISMISSED = 100

interface Props {
  transactions: Transaction[]
  existingRules: RecurringRule[]
  locale: Locale
  /** Called when the user accepts a candidate. Parent should run
   *  `useRecurringRules.createRule` and resolve true on success. The banner
   *  hides on success regardless of whether the user re-records the
   *  dismissal — the new rule itself excludes the pattern from future
   *  detector runs. */
  onAccept: (candidate: RecurringPatternCandidate) => Promise<boolean>
}

export function RecurringPatternBanner({
  transactions,
  existingRules,
  locale,
  onAccept,
}: Props) {
  const [dismissedKeys, setDismissedKeys] = useState<Set<string> | null>(null)
  const [accepting, setAccepting] = useState(false)

  useEffect(() => {
    void (async () => {
      const raw = await SecureStore.getItemAsync(STORAGE_KEY)
      if (!raw) {
        setDismissedKeys(new Set())
        return
      }
      try {
        const keys = JSON.parse(raw) as string[]
        setDismissedKeys(new Set(Array.isArray(keys) ? keys : []))
      } catch {
        setDismissedKeys(new Set())
      }
    })()
  }, [])

  const candidate = useMemo(() => {
    if (dismissedKeys === null) return null
    const all = detectRecurringPatterns({
      transactions,
      existingRules,
      dismissedKeys,
    })
    return all[0] ?? null
  }, [transactions, existingRules, dismissedKeys])

  if (!candidate) return null

  async function persistDismissed(key: string) {
    const next = new Set(dismissedKeys ?? [])
    next.add(key)
    // Cap the persisted list — convert back to array, drop oldest entries.
    let arr = Array.from(next)
    if (arr.length > MAX_DISMISSED) arr = arr.slice(arr.length - MAX_DISMISSED)
    setDismissedKeys(new Set(arr))
    await SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(arr))
  }

  async function handleDismiss() {
    if (!candidate) return
    await persistDismissed(candidate.key)
  }

  async function handleAccept() {
    if (!candidate || accepting) return
    setAccepting(true)
    try {
      const ok = await onAccept(candidate)
      if (ok) {
        // Pin the dismissal even on success so a flicker between candidate
        // detection and the new rule's existing-keys filter doesn't re-show
        // it.
        await persistDismissed(candidate.key)
      }
    } finally {
      setAccepting(false)
    }
  }

  const frequencyLabel = t(`recurring.${candidate.frequency}`, locale).toLowerCase()
  // The shared formatter (fix-plan 2.6) — replaces the hand-rolled
  // `"USD 42.00"` concatenation, which printed the raw ISO code instead
  // of a currency glyph and ignored the user's own grouping/decimal
  // convention.
  const amountDisplay = formatMoney(candidate.amount, candidate.currency_code, locale)

  return (
    <View style={styles.wrap}>
      <View style={styles.card}>
        <View style={styles.headerRow}>
          <View style={styles.iconTile}>
            <Ionicons name="repeat" size={14} color={Colors.accent} />
          </View>
          <Text style={styles.eyebrow}>
            {t('home.pattern_eyebrow', locale)}
          </Text>
          <Pressable
            onPress={handleDismiss}
            hitSlop={12}
            style={({ pressed }) => [styles.dismiss, pressed && styles.pressedSoft]}
            accessibilityLabel={t('common.dismiss', locale)}
          >
            <Ionicons name="close" size={14} color={Colors.ink3} />
          </Pressable>
        </View>

        <Text style={styles.title}>
          {t('home.pattern_title', locale)
            .replace('{merchant}', candidate.merchant)
            .replace('{amount}', amountDisplay)
            .replace('{frequency}', frequencyLabel)}
        </Text>
        <Text style={styles.body}>
          {t('home.pattern_body', locale).replace(
            '{count}',
            String(candidate.occurrences),
          )}
        </Text>

        <View style={styles.actions}>
          {/* Both buttons are 36pt (`minHeight: 36`, styles below) — below
              the 44pt minimum (audit 01-F26). hitSlop via `<Tappable>`
              closes the gap without changing the drawn pill size. */}
          <Tappable
            onPress={handleAccept}
            disabled={accepting}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('home.pattern_accept', locale)}
            style={({ pressed }) => [
              styles.acceptBtn,
              accepting && styles.btnDisabled,
              pressed && styles.pressed,
            ]}
          >
            {accepting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <>
                <Ionicons name="add" size={14} color="#FFFFFF" />
                <Text style={styles.acceptText}>
                  {t('home.pattern_accept', locale)}
                </Text>
              </>
            )}
          </Tappable>
          <Tappable
            onPress={handleDismiss}
            disabled={accepting}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('home.pattern_dismiss', locale)}
            style={({ pressed }) => [styles.notNowBtn, pressed && styles.pressedSoft]}
          >
            <Text style={styles.notNowText}>
              {t('home.pattern_dismiss', locale)}
            </Text>
          </Tappable>
        </View>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  wrap: { paddingHorizontal: 20, paddingTop: 14 },
  card: {
    backgroundColor: Colors.accentSoft ?? Colors.primaryLight,
    borderRadius: 22,
    paddingHorizontal: 18,
    paddingTop: 14,
    paddingBottom: 16,
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  iconTile: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    color: Colors.accent ?? Colors.primary,
    fontFamily: Typography.fontFamily.sansBold,
  },
  dismiss: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
  pressedSoft: { opacity: 0.55 },
  btnDisabled: { opacity: 0.5 },

  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 18,
    lineHeight: 24,
    letterSpacing: -0.3,
    color: Colors.ink ?? Colors.text,
    fontWeight: '500',
    marginTop: 12,
  },
  body: {
    fontSize: 13.5,
    lineHeight: 20,
    color: Colors.ink2 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
    marginTop: 4,
  },
  actions: { flexDirection: 'row', gap: 8, marginTop: 14 },
  acceptBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: Colors.ink ?? '#1B1915',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
  },
  acceptText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
    fontFamily: Typography.fontFamily.sansBold,
  },
  notNowBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    minHeight: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notNowText: {
    color: Colors.ink2,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: Typography.fontFamily.sansBold,
  },
})
