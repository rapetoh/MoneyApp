import { View, Text, Pressable, StyleSheet, Alert, Switch } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { useAuth, signOut } from '../../src/hooks/useAuth'
import { Colors, Typography, Spacing, Radius } from '../../src/theme'

function SettingsRow({
  label,
  value,
  onPress,
  rightElement,
}: {
  label: string
  value?: string
  onPress?: () => void
  rightElement?: React.ReactNode
}) {
  return (
    <Pressable onPress={onPress} style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      {rightElement ?? (value ? <Text style={styles.rowValue}>{value}</Text> : null)}
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

  async function handleSignOut() {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ])
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.content}>
        <Text style={styles.title}>Settings</Text>

        {/* Account */}
        <SettingsSection title="Account">
          <SettingsRow label="Email" value={user?.email ?? '—'} />
          <View style={styles.divider} />
          <SettingsRow label="Display Name" value="Not set" onPress={() => {}} />
        </SettingsSection>

        {/* Preferences */}
        <SettingsSection title="Preferences">
          <SettingsRow label="Currency" value="USD" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingsRow label="Language" value="English" onPress={() => {}} />
          <View style={styles.divider} />
          <SettingsRow label="Monthly Budget" value="Not set" onPress={() => {}} />
        </SettingsSection>

        {/* About */}
        <SettingsSection title="About">
          <SettingsRow label="Version" value="1.0.0" />
          <View style={styles.divider} />
          <SettingsRow label="Privacy Policy" onPress={() => {}} />
        </SettingsSection>

        {/* Sign out */}
        <Pressable style={styles.signOutButton} onPress={handleSignOut}>
          <Text style={styles.signOutText}>Sign Out</Text>
        </Pressable>
      </View>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  content: {
    flex: 1,
    padding: Spacing.base,
    gap: Spacing.base,
  },
  title: {
    fontFamily: Typography.fontFamily.sansBold,
    fontSize: Typography.size['2xl'],
    color: Colors.text,
  },
  section: {
    gap: Spacing.xs,
  },
  sectionTitle: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.xs,
    color: Colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    paddingLeft: Spacing.xs,
  },
  sectionCard: {
    backgroundColor: Colors.card,
    borderRadius: Radius.lg,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: Colors.border,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: Spacing.md,
    paddingHorizontal: Spacing.base,
  },
  rowLabel: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.text,
  },
  rowValue: {
    fontFamily: Typography.fontFamily.sans,
    fontSize: Typography.size.base,
    color: Colors.textSecondary,
  },
  divider: {
    height: 1,
    backgroundColor: Colors.border,
    marginLeft: Spacing.base,
  },
  signOutButton: {
    backgroundColor: Colors.card,
    borderRadius: Radius.md,
    paddingVertical: Spacing.base,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: Colors.destructive,
    marginTop: Spacing.sm,
  },
  signOutText: {
    fontFamily: Typography.fontFamily.sansSemiBold,
    fontSize: Typography.size.base,
    color: Colors.destructive,
  },
})
