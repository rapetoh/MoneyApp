import { useState } from 'react'
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth, signOut } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useMonthlyBudget } from '../../src/hooks/useBudget'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import type { Locale } from '@voice-expense/shared'

const LOCALES: { value: Locale; label: string }[] = [
  { value: 'en', label: 'English' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
]

const CURRENCIES = ['USD', 'EUR', 'GBP', 'CAD', 'CHF', 'JPY', 'AUD']

function SettingsRow({
  label,
  value,
  onPress,
}: {
  label: string
  value?: string
  onPress?: () => void
}) {
  return (
    <Pressable onPress={onPress} style={styles.row} disabled={!onPress}>
      <Text style={styles.rowLabel}>{label}</Text>
      {value ? <Text style={styles.rowValue}>{value}</Text> : null}
      {onPress && <Text style={styles.rowChevron}>›</Text>}
    </Pressable>
  )
}

function SettingsSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionCard}>{children}</View>
    </View>
  )
}

export default function SettingsScreen() {
  const { user } = useAuth()
  const { profile, updateProfile } = useProfile(user?.id)
  const { budget, setMonthlyBudget } = useMonthlyBudget(user?.id)

  const [budgetModal, setBudgetModal] = useState(false)
  const [budgetInput, setBudgetInput] = useState('')
  const [localeModal, setLocaleModal] = useState(false)
  const [nameModal, setNameModal] = useState(false)
  const [nameInput, setNameInput] = useState('')

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign Out', style: 'destructive', onPress: () => signOut() },
    ])
  }

  async function handleSaveBudget() {
    const amount = parseFloat(budgetInput.replace(',', '.'))
    if (isNaN(amount) || amount <= 0) {
      Alert.alert('Invalid amount', 'Enter a valid budget amount.')
      return
    }
    const ok = await setMonthlyBudget(amount, profile?.currency_code ?? 'USD')
    if (!ok) Alert.alert('Error', 'Could not save budget.')
    setBudgetModal(false)
    setBudgetInput('')
  }

  async function handleSaveName() {
    if (!nameInput.trim()) return
    await updateProfile({ display_name: nameInput.trim() })
    setNameModal(false)
    setNameInput('')
  }

  const localeName = LOCALES.find((l) => l.value === (profile?.locale ?? 'en'))?.label ?? 'English'
  const budgetDisplay = budget ? `$${budget.amount.toFixed(0)}/month` : 'Not set'

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Settings</Text>

        {/* Account */}
        <SettingsSection title="Account">
          <SettingsRow label="Email" value={user?.email ?? '—'} />
          <View style={styles.divider} />
          <SettingsRow
            label="Display Name"
            value={profile?.display_name ?? 'Not set'}
            onPress={() => {
              setNameInput(profile?.display_name ?? '')
              setNameModal(true)
            }}
          />
        </SettingsSection>

        {/* Preferences */}
        <SettingsSection title="Preferences">
          <SettingsRow
            label="Monthly Budget"
            value={budgetDisplay}
            onPress={() => {
              setBudgetInput(budget ? String(budget.amount) : '')
              setBudgetModal(true)
            }}
          />
          <View style={styles.divider} />
          <SettingsRow
            label="Language"
            value={localeName}
            onPress={() => setLocaleModal(true)}
          />
          <View style={styles.divider} />
          <SettingsRow label="Currency" value={profile?.currency_code ?? 'USD'} />
        </SettingsSection>

        {/* About */}
        <SettingsSection title="About">
          <SettingsRow label="Version" value="1.0.0" />
        </SettingsSection>

        {/* Sign out */}
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </ScrollView>

      {/* Budget modal */}
      <Modal visible={budgetModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setBudgetModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Monthly Budget</Text>
            <Pressable onPress={handleSaveBudget}>
              <Text style={styles.modalDone}>Save</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <Text style={styles.modalHint}>
              Set your total monthly spending budget. Safe to Spend will track your remaining amount.
            </Text>
            <View style={styles.amountRow}>
              <Text style={styles.currencySymbol}>$</Text>
              <TextInput
                style={styles.amountInput}
                value={budgetInput}
                onChangeText={setBudgetInput}
                placeholder="0"
                placeholderTextColor={Colors.textMuted}
                keyboardType="decimal-pad"
                autoFocus
              />
            </View>
          </View>
        </View>
      </Modal>

      {/* Locale modal */}
      <Modal visible={localeModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setLocaleModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Language</Text>
            <View style={{ width: 60 }} />
          </View>
          {LOCALES.map((l, i) => (
            <View key={l.value}>
              {i > 0 && <View style={styles.divider} />}
              <Pressable
                style={styles.localeRow}
                onPress={async () => {
                  await updateProfile({ locale: l.value })
                  setLocaleModal(false)
                }}
              >
                <Text style={styles.localeLabel}>{l.label}</Text>
                {profile?.locale === l.value && (
                  <Text style={styles.localeCheck}>✓</Text>
                )}
              </Pressable>
            </View>
          ))}
        </View>
      </Modal>

      {/* Name modal */}
      <Modal visible={nameModal} animationType="slide" presentationStyle="pageSheet">
        <View style={styles.modal}>
          <View style={styles.modalHeader}>
            <Pressable onPress={() => setNameModal(false)}>
              <Text style={styles.modalCancel}>Cancel</Text>
            </Pressable>
            <Text style={styles.modalTitle}>Display Name</Text>
            <Pressable onPress={handleSaveName}>
              <Text style={styles.modalDone}>Save</Text>
            </Pressable>
          </View>
          <View style={styles.modalBody}>
            <TextInput
              style={styles.nameInput}
              value={nameInput}
              onChangeText={setNameInput}
              placeholder="Your name"
              placeholderTextColor={Colors.textMuted}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={handleSaveName}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.base, paddingBottom: Spacing['3xl'] },
  title: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size['2xl'], color: Colors.text },
  section: { gap: Spacing.xs },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: Spacing.xs,
  },
  sectionCard: { backgroundColor: Colors.card, borderRadius: Radius.lg, overflow: 'hidden', borderWidth: 1, borderColor: Colors.border },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: Spacing.md, paddingHorizontal: Spacing.base },
  rowLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.text, flex: 1 },
  rowValue: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.textSecondary },
  rowChevron: { fontSize: 18, color: Colors.textMuted, marginLeft: Spacing.sm },
  divider: { height: 1, backgroundColor: Colors.border, marginLeft: Spacing.base },
  signOutButton: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.destructive,
    marginTop: Spacing.sm,
  },
  signOutText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.destructive },
  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.base,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  modalTitle: { fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.md, color: Colors.text },
  modalCancel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.textSecondary, width: 60 },
  modalDone: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: Typography.size.base, color: Colors.primary, textAlign: 'right', width: 60 },
  modalBody: { padding: Spacing.base, gap: Spacing.base },
  modalHint: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.sm, color: Colors.textSecondary, lineHeight: 20 },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.sm, backgroundColor: Colors.card, borderRadius: Radius.lg, padding: Spacing.xl, borderWidth: 1, borderColor: Colors.border },
  currencySymbol: { fontFamily: Typography.fontFamily.monoBold, fontSize: Typography.size['2xl'], color: Colors.textSecondary },
  amountInput: { flex: 1, fontFamily: Typography.fontFamily.monoBold, fontSize: Typography.size['3xl'], color: Colors.text },
  nameInput: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingHorizontal: Spacing.base,
    paddingVertical: Spacing.md,
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  localeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: Spacing.base, paddingVertical: Spacing.md, backgroundColor: Colors.card },
  localeLabel: { fontFamily: Typography.fontFamily.sans, fontSize: Typography.size.base, color: Colors.text },
  localeCheck: { color: Colors.primary, fontFamily: Typography.fontFamily.sansBold, fontSize: Typography.size.base },
})
