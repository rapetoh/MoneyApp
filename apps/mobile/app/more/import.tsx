import { useMemo, useState } from 'react'
import { View, Text, StyleSheet, ScrollView, Pressable, Alert, Switch, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useRouter } from 'expo-router'
import * as DocumentPicker from 'expo-document-picker'
import { File } from 'expo-file-system'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useCategories } from '../../src/hooks/useCategories'
import { useTransactions } from '../../src/hooks/useTransactions'
import { performImport, type ImportPhase } from '../../src/services/csvImport'
import { haptic } from '../../src/services/haptics'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import {
  t,
  formatMoney,
  localDay,
  parseCsv,
  hasHeaderRow,
  detectColumns,
  detectDateOrder,
  detectDecimalMark,
  detectSignConvention,
  parseAmount,
  buildImportRows,
  findDuplicates,
  type Locale,
  type ColumnMapping,
  type DateOrder,
  type SignConvention,
} from '@voice-expense/shared'
import { goBack } from '../../src/services/goBack'

/** "1 transaction" vs "{count} transactions": a `_one` key when there is one. */
function plural(key: string, count: number, locale: Locale): string {
  return (count === 1 ? t(`${key}_one`, locale) : t(key, locale)).replace('{count}', String(count))
}

/** Biggest file read: a decade of daily card spending is well under this. */
const MAX_FILE_BYTES = 5 * 1024 * 1024

type Loaded = {
  name: string
  cells: string[][]
  header: boolean
  mapping: ColumnMapping
  dateOrder: DateOrder
  decimalMark: '.' | ','
  sign: SignConvention
}

/**
 * Import from a file (docs/csv-import.md, Oct 2026). A bank, card or
 * other-app CSV becomes Murmur transactions: the file's columns are read
 * and shown, anything can be corrected, money already in Murmur is held
 * back, and every merchant is named and filed the way a voice log is.
 */
export default function ImportScreen() {
  const router = useRouter()
  const { user } = useAuth()
  const userId = user?.id
  const { profile } = useProfile(userId)
  const { categories } = useCategories(userId)
  const { transactions } = useTransactions(userId)
  const locale = (profile?.locale ?? 'en') as Locale
  const currency = profile?.currency_code ?? 'USD'
  const tz = profile?.timezone || 'UTC'

  const [file, setFile] = useState<Loaded | null>(null)
  const [includeDuplicates, setIncludeDuplicates] = useState(false)
  const [progress, setProgress] = useState<{ phase: ImportPhase; done: number; total: number } | null>(null)
  const [result, setResult] = useState<{ count: number; held: number } | null>(null)

  async function pick() {
    const res = await DocumentPicker.getDocumentAsync({
      type: ['text/csv', 'text/comma-separated-values', 'text/plain', 'application/vnd.ms-excel', 'public.comma-separated-values-text'],
      copyToCacheDirectory: true,
    })
    if (res.canceled || !res.assets?.[0]) return
    const asset = res.assets[0]
    if ((asset.size ?? 0) > MAX_FILE_BYTES) {
      Alert.alert(t('import.too_big_title', locale), t('import.too_big_body', locale))
      return
    }
    try {
      const text = await new File(asset.uri).text()
      const cells = parseCsv(text)
      const header = hasHeaderRow(cells)
      const mapping = detectColumns(cells, header)
      const body = cells.slice(header ? 1 : 0)
      const dateOrder = detectDateOrder(mapping.date != null ? body.map((r) => r[mapping.date!] ?? '') : [], locale)
      const amountCells = body.flatMap((r) =>
        [mapping.amount, mapping.debit, mapping.credit].filter((i): i is number => i != null).map((i) => r[i] ?? ''),
      )
      const decimalMark = detectDecimalMark(amountCells)
      const signs = mapping.amount != null
        ? body.map((r) => parseAmount(r[mapping.amount!] ?? '', decimalMark)).filter((n): n is number => n != null)
        : []
      setFile({ name: asset.name, cells, header, mapping, dateOrder, decimalMark, sign: detectSignConvention(signs) })
      setResult(null)
    } catch {
      Alert.alert(t('import.read_failed_title', locale), t('import.read_failed_body', locale))
    }
  }

  const reading = useMemo(() => {
    if (!file) return null
    const built = buildImportRows(file.cells, file)
    const existing = transactions
      .filter((x) => !x.is_deleted)
      .map((x) => ({ day: localDay(x.transacted_at, tz), amount: x.amount, direction: x.direction }))
    const held = findDuplicates(built.rows, existing)
    const toImport = includeDuplicates ? built.rows : built.rows.filter((r) => !held.has(r.line))
    const days = built.rows.map((r) => r.day).sort()
    return { ...built, held, toImport, first: days[0], last: days[days.length - 1] }
  }, [file, transactions, tz, includeDuplicates])

  const columnNames = useMemo(() => {
    if (!file) return [] as string[]
    const width = Math.max(...file.cells.slice(0, 10).map((r) => r.length))
    return Array.from({ length: width }, (_, i) =>
      file.header && file.cells[0][i] ? file.cells[0][i] : `${t('import.column', locale)} ${i + 1}: ${file.cells[file.header ? 1 : 0]?.[i] ?? ''}`.slice(0, 40),
    )
  }, [file, locale])

  function chooseColumn(key: keyof ColumnMapping, optional: boolean) {
    if (!file) return
    const options = columnNames.map((name, i) => ({
      text: name,
      onPress: () => {
        const mapping = { ...file.mapping, [key]: i }
        // One signed amount column, or a money-out and money-in pair.
        if (key === 'amount') Object.assign(mapping, { debit: null, credit: null })
        if (key === 'debit' || key === 'credit') mapping.amount = null
        setFile({ ...file, mapping })
      },
    }))
    Alert.alert(t(`import.role_${key}`, locale), undefined, [
      ...options,
      ...(optional ? [{ text: t('import.none', locale), onPress: () => setFile({ ...file, mapping: { ...file.mapping, [key]: null } }) }] : []),
      { text: t('common.cancel', locale), style: 'cancel' as const },
    ])
  }

  async function run() {
    if (!userId || !reading || reading.toImport.length === 0) return
    setProgress({ phase: 'naming', done: 0, total: 0 })
    try {
      const out = await performImport({
        userId,
        rows: reading.toImport,
        categories,
        currency,
        tz,
        onProgress: (phase, done, total) => setProgress({ phase, done, total }),
      })
      haptic.success()
      setResult({ count: out.saved + out.queued, held: includeDuplicates ? 0 : reading.held.size })
      setFile(null)
    } catch {
      Alert.alert(t('common.error', locale), t('import.failed', locale))
    } finally {
      setProgress(null)
    }
  }

  const fmtSigned = (amount: number, direction: 'debit' | 'credit') =>
    `${direction === 'debit' ? '−' : '+'}${formatMoney(amount, currency, locale)}`

  // ── Done ──
  if (result) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <View style={[styles.content, styles.center]}>
          <View style={styles.heroIcon}>
            <Ionicons name="checkmark" size={22} color={Colors.accent} />
          </View>
          <Text style={styles.title}>{plural('import.done_title', result.count, locale)}</Text>
          {result.held > 0 && (
            <Text style={styles.body}>{plural('import.done_held', result.held, locale)}</Text>
          )}
          <Pressable style={styles.primary} onPress={() => goBack(router)}>
            <Text style={styles.primaryText}>{t('common.done', locale)}</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    )
  }

  // ── Working ──
  if (progress) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <View style={[styles.content, styles.center]}>
          <ActivityIndicator color={Colors.accent} />
          <Text style={styles.title}>
            {t(progress.phase === 'naming' ? 'import.naming' : 'import.saving', locale)}
          </Text>
          {progress.total > 0 && (
            <Text style={styles.body}>{`${progress.done} / ${progress.total}`}</Text>
          )}
        </View>
      </SafeAreaView>
    )
  }

  // ── Start ──
  if (!file || !reading) {
    return (
      <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.hero}>
            <View style={styles.heroIcon}>
              <Ionicons name="document-text-outline" size={20} color={Colors.accent} />
            </View>
            <Text style={styles.title}>{t('import.title', locale)}</Text>
            <Text style={styles.body}>{t('import.body', locale)}</Text>
          </View>
          <View style={styles.card}>
            {(['import.point_sources', 'import.point_names', 'import.point_duplicates'] as const).map((k, i) => (
              <View key={k} style={[styles.point, i === 2 && styles.pointLast]}>
                <Ionicons name="checkmark-circle" size={16} color={Colors.accent} />
                <Text style={styles.pointText}>{t(k, locale)}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.note}>{t('import.currency_note', locale).replace('{currency}', currency)}</Text>
          <Pressable style={styles.primary} onPress={pick} testID="import-pick">
            <Text style={styles.primaryText}>{t('import.choose', locale)}</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    )
  }

  // ── Review ──
  const m = file.mapping
  const pairMode = m.amount == null && m.debit != null && m.credit != null
  const roles: Array<{ key: keyof ColumnMapping; optional: boolean; hidden?: boolean }> = [
    { key: 'date', optional: false },
    { key: 'description', optional: true },
    { key: 'amount', optional: false, hidden: pairMode },
    { key: 'debit', optional: true, hidden: !pairMode },
    { key: 'credit', optional: true, hidden: !pairMode },
    { key: 'category', optional: true },
  ]
  const canImport = reading.toImport.length > 0 && m.date != null && (m.amount != null || pairMode)

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Text style={styles.fileName} numberOfLines={1}>{file.name}</Text>
          <Text style={styles.title}>
            {plural('import.found', reading.rows.length, locale)}
          </Text>
          {reading.first && (
            <Text style={styles.body}>{`${reading.first} → ${reading.last}`}</Text>
          )}
        </View>

        <View style={styles.card}>
          {roles.filter((r) => !r.hidden).map((r, i, arr) => (
            <Pressable
              key={r.key}
              onPress={() => chooseColumn(r.key, r.optional)}
              style={[styles.mapRow, i === arr.length - 1 && styles.pointLast]}
              accessibilityRole="button"
            >
              <Text style={styles.mapRole}>{t(`import.role_${r.key}`, locale)}</Text>
              <Text style={styles.mapValue} numberOfLines={1}>
                {m[r.key] != null ? columnNames[m[r.key]!] : t('import.none', locale)}
              </Text>
              <Ionicons name="chevron-forward" size={14} color={Colors.ink4} />
            </Pressable>
          ))}
        </View>

        {!pairMode && (
          <View>
            <Text style={styles.label}>{t('import.signs', locale)}</Text>
            <View style={styles.chips}>
              {(['negative_is_expense', 'all_expenses', 'all_income', 'positive_is_expense'] as const).map((s) => (
                <Pressable key={s} onPress={() => setFile({ ...file, sign: s })} style={[styles.chip, file.sign === s && styles.chipOn]}>
                  <Text style={[styles.chipText, file.sign === s && styles.chipTextOn]}>{t(`import.sign_${s}`, locale)}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}

        <View>
          <Text style={styles.label}>{t('import.date_order', locale)}</Text>
          <View style={styles.chips}>
            {(['mdy', 'dmy', 'ymd'] as const).map((o) => (
              <Pressable key={o} onPress={() => setFile({ ...file, dateOrder: o })} style={[styles.chip, file.dateOrder === o && styles.chipOn]}>
                <Text style={[styles.chipText, file.dateOrder === o && styles.chipTextOn]}>{t(`import.order_${o}`, locale)}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View>
          <Text style={styles.label}>{t('import.preview', locale)}</Text>
          <View style={styles.card}>
            {reading.rows.slice(0, 5).map((r, i) => (
              <View key={r.line} style={[styles.previewRow, i === Math.min(5, reading.rows.length) - 1 && styles.pointLast]}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.previewDesc} numberOfLines={1}>{r.description || '-'}</Text>
                  <Text style={styles.previewDay}>{r.day}{reading.held.has(r.line) ? ` · ${t('import.already', locale)}` : ''}</Text>
                </View>
                <Text style={[styles.previewAmount, r.direction === 'credit' && { color: Colors.accent }]}>
                  {fmtSigned(r.amount, r.direction)}
                </Text>
              </View>
            ))}
            {reading.rows.length === 0 && <Text style={styles.body}>{t('import.nothing', locale)}</Text>}
          </View>
        </View>

        {reading.held.size > 0 && (
          <View style={styles.switchRow}>
            <Pressable style={{ flex: 1 }} onPress={() => setIncludeDuplicates((v) => !v)} accessibilityElementsHidden importantForAccessibility="no">
              <Text style={styles.switchText}>
                {plural('import.held', reading.held.size, locale)}
              </Text>
            </Pressable>
            <Switch
              value={includeDuplicates}
              onValueChange={setIncludeDuplicates}
              trackColor={{ true: Colors.accent, false: Colors.surface2 }}
              accessibilityLabel={plural('import.held', reading.held.size, locale)}
            />
          </View>
        )}
        {reading.skipped.length > 0 && (
          <Text style={styles.note}>{plural('import.skipped', reading.skipped.length, locale)}</Text>
        )}

        <Pressable style={[styles.primary, !canImport && { opacity: 0.4 }]} disabled={!canImport} onPress={run} testID="import-run">
          <Text style={styles.primaryText}>
            {plural('import.run', reading.toImport.length, locale)}
          </Text>
        </Pressable>
        <Pressable onPress={pick} style={styles.secondary}>
          <Text style={styles.secondaryText}>{t('import.other_file', locale)}</Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  hero: { gap: 8, paddingTop: 4 },
  heroIcon: {
    width: 40, height: 40, borderRadius: 12, backgroundColor: Colors.accentSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 4,
  },
  title: { fontFamily: Typography.fontFamily.serif, fontSize: 26, fontWeight: '500', letterSpacing: -0.5, color: Colors.ink, textAlign: 'left' },
  body: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.textSecondary, lineHeight: 22 },
  fileName: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12.5, color: Colors.ink3 },
  card: { backgroundColor: Colors.surface ?? Colors.card, borderRadius: Radius.card, paddingHorizontal: Spacing.base, paddingVertical: 4 },
  point: { flexDirection: 'row', gap: 10, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(40,36,28,0.10)' },
  pointLast: { borderBottomWidth: 0 },
  pointText: { flex: 1, fontFamily: Typography.fontFamily.sans, fontSize: 14, lineHeight: 20, color: Colors.ink2 },
  note: { fontFamily: Typography.fontFamily.sans, fontSize: 12.5, lineHeight: 18, color: Colors.ink3 },
  primary: { backgroundColor: Colors.ink, borderRadius: 999, paddingVertical: 15, alignItems: 'center', alignSelf: 'stretch' },
  primaryText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 15.5, color: Colors.background },
  secondary: { alignItems: 'center', paddingVertical: 6 },
  secondaryText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14, color: Colors.ink3 },
  mapRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 13, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(40,36,28,0.10)' },
  mapRole: { width: 110, fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14, color: Colors.ink },
  mapValue: { flex: 1, fontFamily: Typography.fontFamily.sans, fontSize: 14, color: Colors.ink3, textAlign: 'right' },
  label: { marginBottom: 8, fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: Colors.ink4, fontFamily: Typography.fontFamily.sansBold },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: Colors.surface, borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(40,36,28,0.14)' },
  chipOn: { backgroundColor: Colors.accentSoft, borderColor: Colors.accent },
  chipText: { fontFamily: Typography.fontFamily.sans, fontSize: 13, color: Colors.ink2 },
  chipTextOn: { fontFamily: Typography.fontFamily.sansSemiBold, color: Colors.accent },
  previewRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 11, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(40,36,28,0.10)' },
  previewDesc: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14, color: Colors.ink },
  previewDay: { fontFamily: Typography.fontFamily.sans, fontSize: 12, color: Colors.ink3, marginTop: 2 },
  previewAmount: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14, color: Colors.ink, fontVariant: ['tabular-nums'] },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchText: { flex: 1, fontFamily: Typography.fontFamily.sans, fontSize: 13.5, lineHeight: 19, color: Colors.ink2 },
})
