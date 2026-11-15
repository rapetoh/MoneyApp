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
import * as ImagePicker from 'expo-image-picker'
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useBusinesses } from '../../src/hooks/useBusinesses'
import { haptic } from '../../src/services/haptics'
import { BusinessMark } from '../../src/components/BusinessMark'
import { BottomSheet } from '../../src/components/BottomSheet'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'
import {
  t,
  BUSINESS_ICONS,
  businessIcon,
  isBusinessLogo,
  type Locale,
  type Business,
  type BusinessIconKey,
} from '@voice-expense/shared'

/** Logos are stored inline (migration 045), so they are made small here:
 *  a 256 px square JPEG is about 20 to 40 KB as base64. */
const LOGO_SIZE = 256

/** The picked photo as a `data:image/jpeg;base64,...` logo: center-cropped
 *  to a square (the picker's crop is square on iOS; this covers any other
 *  shape), scaled to LOGO_SIZE, JPEG at 0.85. Null when it cannot be made. */
async function logoFromAsset(asset: ImagePicker.ImagePickerAsset): Promise<string | null> {
  const context = ImageManipulator.manipulate(asset.uri)
  try {
    const side = Math.min(asset.width, asset.height)
    if (side > 0 && asset.width !== asset.height) {
      context.crop({
        originX: Math.floor((asset.width - side) / 2),
        originY: Math.floor((asset.height - side) / 2),
        width: side,
        height: side,
      })
    }
    context.resize({ width: LOGO_SIZE, height: LOGO_SIZE })
    const image = await context.renderAsync()
    try {
      const saved = await image.saveAsync({
        format: SaveFormat.JPEG,
        compress: 0.85,
        base64: true,
      })
      const logo = saved.base64 ? `data:image/jpeg;base64,${saved.base64}` : null
      return isBusinessLogo(logo) ? logo : null
    } finally {
      image.release()
    }
  } finally {
    context.release()
  }
}

/**
 * Businesses (migration 044, Oct 2026, docs/businesses.md): side businesses
 * kept apart from personal spending. Every transaction can carry one; saying
 * "for the farm" when logging tags it. Deleting a business moves its
 * transactions back to Personal.
 *
 * Each business has a face (migration 045): tap its tile to choose a photo
 * of its logo, pick one of twelve icons, or remove the logo.
 */
export default function BusinessesScreen() {
  const { user } = useAuth()
  const userId = user?.id
  const { profile } = useProfile(userId)
  const locale = (profile?.locale ?? 'en') as Locale
  const { businesses, create, rename, remove, setLogo, setIcon } = useBusinesses(userId)
  const [newName, setNewName] = useState('')
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null)
  const [busy, setBusy] = useState(false)
  // The business whose icon grid is open, and the one whose logo is saving.
  const [iconFor, setIconFor] = useState<Business | null>(null)
  const [savingLogoId, setSavingLogoId] = useState<string | null>(null)

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

  // The tile's menu: the app's Alert-with-options pattern (iOS stacks the
  // choices). "Remove logo" only when there is one to remove.
  function openLogoMenu(b: Business) {
    haptic.tap()
    Alert.alert(b.name, undefined, [
      { text: t('business.choose_photo', locale), onPress: () => void pickPhoto(b) },
      { text: t('business.choose_icon', locale), onPress: () => setIconFor(b) },
      ...(isBusinessLogo(b.logo)
        ? [
            {
              text: t('business.remove_logo', locale),
              style: 'destructive' as const,
              onPress: () => void saveLogo(b.id, null),
            },
          ]
        : []),
      { text: t('common.cancel', locale), style: 'cancel' as const },
    ])
  }

  // The system photo picker (PHPicker on iOS 14+) runs out of process and
  // hands back only the photo the person picks, so no library permission
  // prompt comes first. The usage string iOS requires anyway is set in
  // app.config.js (expo-image-picker plugin, photosPermission).
  async function pickPhoto(b: Business) {
    let logo: string | null = null
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 1,
      })
      const asset = result.canceled ? null : result.assets[0]
      if (!asset) return
      setSavingLogoId(b.id)
      logo = await logoFromAsset(asset)
    } catch {
      logo = null
    }
    if (!logo) {
      setSavingLogoId(null)
      Alert.alert(t('common.error', locale), t('business.logo_failed', locale))
      return
    }
    await saveLogo(b.id, logo)
  }

  async function saveLogo(id: string, logo: string | null) {
    setSavingLogoId(id)
    const e = await setLogo(id, logo)
    setSavingLogoId(null)
    if (e) Alert.alert(t('common.error', locale), e)
    else haptic.success()
  }

  async function chooseIcon(b: Business, icon: BusinessIconKey) {
    setIconFor(null)
    setSavingLogoId(b.id)
    const e = await setIcon(b.id, icon)
    setSavingLogoId(null)
    if (e) Alert.alert(t('common.error', locale), e)
    else haptic.tap()
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
                    <Pressable
                      onPress={() => openLogoMenu(b)}
                      disabled={savingLogoId === b.id}
                      hitSlop={6}
                      style={({ pressed }) => [styles.markButton, pressed && { opacity: 0.6 }]}
                      accessibilityRole="button"
                      accessibilityLabel={t('business.logo_a11y', locale).replace('{name}', b.name)}
                      testID={`business-mark-${b.name}`}
                    >
                      <BusinessMark business={b} size={MARK_SIZE} />
                      {savingLogoId === b.id ? (
                        <View style={styles.markBusy}>
                          <ActivityIndicator size="small" color={Colors.primary} />
                        </View>
                      ) : (
                        <View style={styles.markBadge}>
                          <Ionicons name="camera" size={9} color={Colors.ink3} />
                        </View>
                      )}
                    </Pressable>
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

      {/* The twelve icons. Picking one saves it and closes the sheet. */}
      <BottomSheet
        visible={iconFor !== null}
        onClose={() => setIconFor(null)}
        title={t('business.choose_icon', locale)}
        cancelLabel={t('common.cancel', locale)}
      >
        <View style={styles.iconGrid}>
          {BUSINESS_ICONS.map((icon) => {
            const current =
              iconFor !== null && !isBusinessLogo(iconFor.logo) && businessIcon(iconFor) === icon
            return (
              <Pressable
                key={icon}
                onPress={() => iconFor && void chooseIcon(iconFor, icon)}
                style={({ pressed }) => [
                  styles.iconCell,
                  current && styles.iconCellCurrent,
                  pressed && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityState={{ selected: current }}
                accessibilityLabel={t(`business.icon.${icon}`, locale)}
                testID={`business-icon-${icon}`}
              >
                <BusinessMark business={{ name: '', icon, logo: null }} size={52} />
              </Pressable>
            )
          })}
        </View>
      </BottomSheet>
    </SafeAreaView>
  )
}

const MARK_SIZE = 36

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
  markButton: { width: MARK_SIZE, height: MARK_SIZE },
  // A small camera badge says the tile can be changed.
  markBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.surface ?? Colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(40,36,28,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  markBusy: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: Math.round(MARK_SIZE * 0.28),
    backgroundColor: 'rgba(255,255,255,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
    paddingHorizontal: 8,
    paddingTop: 4,
    paddingBottom: 16,
  },
  iconCell: {
    width: '23%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconCellCurrent: { borderColor: Colors.primary },
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
