import { useState } from 'react'
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  Alert,
  ActivityIndicator,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useBusinesses } from '../../src/hooks/useBusinesses'
import { haptic } from '../../src/services/haptics'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import { t, type Locale, type Business } from '@voice-expense/shared'

/**
 * Businesses (migration 044, Oct 2026, docs/businesses.md): side businesses
 * kept apart from personal spending. Every transaction can carry one; saying
 * "for the farm" when logging tags it. Deleting a business moves its
 * transactions back to Personal.
 */
export default function BusinessesScreen() {
  const { user } = useAuth()
  const userId = user?.id
  const { profile } = useProfile(userId)
  const locale = (profile?.locale ?? 'en') as Locale
  const { businesses, create, rename, remove } = useBusinesses(userId)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const errorText = (e: string) => (e === 'duplicate' ? t('business.duplicate', locale) : e)

  async function add() {
    const name = newName.trim()
    if (!name || busy) return
    setBusy(true)
    const e = await create(name)
    setBusy(false)
    if (e) {
      Alert.alert(t('common.error', locale), errorText(e))
      return
    }
    haptic.success()
    setNewName('')
  }

  async function saveRename() {
    if (!editing || !editing.name.trim() || busy) return
    setBusy(true)
    const e = await rename(editing.id, editing.name)
    setBusy(false)
    if (e) {
      Alert.alert(t('common.error', locale), errorText(e))
      return
    }
    setEditing(null)
  }

  function confirmDelete(b: Business) {
    Alert.alert(
      t('business.delete_title', locale).replace('{name}', b.name),
      t('business.delete_body', locale),
      [
        { text: t('common.cancel', locale), style: 'cancel' },
        {
          text: t('business.delete', locale),
          style: 'destructive',
          onPress: async () => {
            const e = await remove(b.id)
            if (e) Alert.alert(t('common.error', locale), e)
            else haptic.tap()
          },
        },
      ],
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <View style={styles.heroIcon}>
            <Ionicons name="briefcase-outline" size={20} color={Colors.accent} />
          </View>
          <Text style={styles.title}>{t('business.title', locale)}</Text>
          <Text style={styles.body}>{t('business.subtitle', locale)}</Text>
        </View>

        {businesses.length > 0 && (
          <View style={styles.card}>
            {businesses.map((b, i) => (
              <View key={b.id} style={[styles.row, i === businesses.length - 1 && styles.rowLast]}>
                {editing?.id === b.id ? (
                  <>
                    <TextInput
                      autoFocus
                      value={editing.name}
                      onChangeText={(name) => setEditing({ id: b.id, name })}
                      onSubmitEditing={saveRename}
                      returnKeyType="done"
                      maxLength={60}
                      style={[styles.input, { flex: 1 }]}
                      accessibilityLabel={t('business.label', locale)}
                    />
                    <Pressable onPress={saveRename} hitSlop={8} style={styles.pill}>
                      <Text style={styles.pillTextAccent}>{t('common.save', locale)}</Text>
                    </Pressable>
                    <Pressable onPress={() => setEditing(null)} hitSlop={8} style={styles.pill}>
                      <Text style={styles.pillText}>{t('common.cancel', locale)}</Text>
                    </Pressable>
                  </>
                ) : (
                  <>
                    <View style={styles.dot} />
                    <Text style={styles.name} numberOfLines={1}>
                      {b.name}
                    </Text>
                    <Pressable
                      onPress={() => setEditing({ id: b.id, name: b.name })}
                      hitSlop={8}
                      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('business.rename', locale)} ${b.name}`}
                    >
                      <Text style={styles.pillText}>{t('business.rename', locale)}</Text>
                    </Pressable>
                    <Pressable
                      onPress={() => confirmDelete(b)}
                      hitSlop={8}
                      style={({ pressed }) => [styles.pill, pressed && { opacity: 0.6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('business.delete', locale)} ${b.name}`}
                    >
                      <Ionicons name="trash-outline" size={14} color={Colors.ink3} />
                    </Pressable>
                  </>
                )}
              </View>
            ))}
          </View>
        )}

        <View style={styles.addRow}>
          <TextInput
            value={newName}
            onChangeText={setNewName}
            onSubmitEditing={add}
            returnKeyType="done"
            maxLength={60}
            placeholder={t('business.add_placeholder', locale)}
            placeholderTextColor={Colors.ink4}
            style={[styles.input, { flex: 1 }]}
            accessibilityLabel={t('business.add_placeholder', locale)}
            testID="business-new-name"
          />
          <Pressable
            onPress={add}
            disabled={!newName.trim() || busy}
            style={({ pressed }) => [
              styles.addBtn,
              (!newName.trim() || busy) && { opacity: 0.4 },
              pressed && { opacity: 0.7 },
            ]}
            accessibilityRole="button"
            testID="business-add"
          >
            {busy ? (
              <ActivityIndicator color={Colors.white} size="small" />
            ) : (
              <Text style={styles.addBtnText}>{t('business.add', locale)}</Text>
            )}
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.base, gap: Spacing.lg, paddingBottom: 32 },
  hero: { gap: 8, paddingTop: 4 },
  heroIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: Colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: {
    fontFamily: Typography.fontFamily.serif,
    fontSize: 26,
    fontWeight: '500',
    letterSpacing: -0.5,
    color: Colors.ink ?? Colors.text,
  },
  body: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
    lineHeight: 22,
  },
  card: {
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.card,
    paddingHorizontal: Spacing.base,
    paddingVertical: 4,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(40,36,28,0.10)',
  },
  rowLast: { borderBottomWidth: 0 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: Colors.accent },
  name: {
    flex: 1,
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 15,
    color: Colors.ink,
  },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: Colors.surface2,
    minHeight: 28,
    justifyContent: 'center',
  },
  pillText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 12.5, color: Colors.ink2 },
  pillTextAccent: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: 12.5,
    color: Colors.accent,
  },
  input: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: 15,
    color: Colors.ink,
    backgroundColor: Colors.surface ?? Colors.card,
    borderRadius: Radius.md ?? 10,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  addRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  addBtn: {
    backgroundColor: Colors.accent,
    borderRadius: 999,
    paddingHorizontal: 18,
    paddingVertical: 11,
    minWidth: 72,
    alignItems: 'center',
  },
  addBtnText: { fontFamily: Typography.fontFamily.sansSemiBold, fontSize: 14, color: Colors.white },
})
