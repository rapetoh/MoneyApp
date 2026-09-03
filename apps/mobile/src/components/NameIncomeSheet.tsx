// "Who pays you?": one-time prompt to name an income source (Sep 2,
// 2026, owner request: if onboarding didn't capture the employer name,
// ask for it in-app; the name drives the logo and the record).
//
// Mounted on Today. Shows at most once per rule (SecureStore flag) and
// only for an active recurring income whose name is missing or still the
// localized "Salary" placeholder onboarding writes when the field was
// skipped. Saving renames the rule; migration 032's trigger then updates
// profiles.monthly_income_source, so Settings reflects it on next read.
import { useEffect, useMemo, useState } from 'react'
import { Text, TextInput, Pressable, StyleSheet } from 'react-native'
import * as SecureStore from 'expo-secure-store'
import { BottomSheet } from './BottomSheet'
import { Colors, Typography, Hairline } from '../theme'
import { t, type Locale } from '@voice-expense/shared'
import type { RecurringRule } from '@voice-expense/shared'

// The onboarding default in every shipped locale; a rule still carrying
// one of these was never actually named by the user.
const DEFAULT_NAMES = new Set(['salary', 'salaire', 'salario', 'salário'])

const storageKey = (ruleId: string) => `income_name_prompted_${ruleId}`

export function isUnnamedIncomeRule(r: Pick<RecurringRule, 'direction' | 'is_active' | 'name'>): boolean {
  if (r.direction !== 'credit' || !r.is_active) return false
  const name = (r.name ?? '').trim().toLowerCase()
  return name === '' || DEFAULT_NAMES.has(name)
}

export function NameIncomeSheet({
  rules,
  locale,
  onRename,
}: {
  rules: RecurringRule[]
  locale: Locale
  /** Persist the new name on the rule; resolve true on success. */
  onRename: (ruleId: string, name: string) => Promise<boolean>
}) {
  const candidate = useMemo(() => rules.find(isUnnamedIncomeRule) ?? null, [rules])
  const [visible, setVisible] = useState(false)
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    if (!candidate) {
      setVisible(false)
      return
    }
    SecureStore.getItemAsync(storageKey(candidate.id)).then((v) => {
      if (!cancelled && v !== '1') setVisible(true)
    })
    return () => {
      cancelled = true
    }
  }, [candidate?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!candidate) return null

  const dismiss = async () => {
    setVisible(false)
    await SecureStore.setItemAsync(storageKey(candidate.id), '1')
  }

  const save = async () => {
    const trimmed = name.trim()
    if (!trimmed || saving) return
    setSaving(true)
    const ok = await onRename(candidate.id, trimmed)
    setSaving(false)
    if (ok) await dismiss()
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={dismiss}
      title={t('income.name_prompt_title', locale)}
      cancelLabel={t('income.name_prompt_later', locale)}
      headerRight={
        <Pressable onPress={save} hitSlop={10} disabled={saving || !name.trim()}>
          <Text style={[styles.saveText, (saving || !name.trim()) && { opacity: 0.4 }]}>
            {t('common.save', locale)}
          </Text>
        </Pressable>
      }
      contentContainerStyle={styles.body}
      testID="name-income-sheet"
    >
      <Text style={styles.lead}>{t('income.name_prompt_body', locale)}</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder={t('onboarding.income.source_placeholder', locale)}
        placeholderTextColor={Colors.ink4 ?? Colors.textMuted}
        style={styles.input}
        autoCapitalize="words"
        autoFocus
      />
    </BottomSheet>
  )
}

const styles = StyleSheet.create({
  body: { paddingHorizontal: 20, paddingBottom: 24 },
  lead: {
    fontSize: 14,
    lineHeight: 20,
    color: Colors.ink3 ?? Colors.textSecondary,
    fontFamily: Typography.fontFamily.sans,
    marginBottom: 14,
  },
  input: {
    borderWidth: Hairline.width,
    borderColor: Hairline.color,
    borderRadius: 14,
    backgroundColor: Colors.surface ?? '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: Colors.ink ?? Colors.text,
    fontFamily: Typography.fontFamily.sans,
  },
  saveText: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.accent ?? Colors.primary,
    fontFamily: Typography.fontFamily.sansBold,
  },
})
