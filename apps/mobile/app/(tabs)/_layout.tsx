import { Tabs } from 'expo-router'
import { View, Pressable, StyleSheet } from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { useTransactions } from '../../src/hooks/useTransactions'
import { useInsightsUnlock } from '../../src/hooks/useInsightsUnlock'
import { useDayTwoDunning } from '../../src/hooks/useDayTwoDunning'
import { useVoiceSession } from '../../src/hooks/useVoiceSession'
import { Colors, Typography, TAB_BAR_HEIGHT, TAB_BAR_BOTTOM_OFFSET, reportTabBarHeight } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({
  focused,
  name,
  badge,
}: {
  focused: boolean
  name: IoniconName
  badge?: boolean
}) {
  return (
    <View style={styles.tabIconWrap}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? Colors.ink : Colors.ink4}
      />
      {badge && <View style={styles.tabBadge} />}
    </View>
  )
}

/** The center mic FAB. Since the voice redesign (docs/voice redesign,
 *  artboard 14a) it no longer navigates to a Record screen — it opens the
 *  in-place capture overlay over whatever tab is showing. The `record`
 *  route stays registered as a bridge for old deep links only. */
function RecordFab({ label }: { label: string }) {
  const { openVoice } = useVoiceSession()
  return (
    <Pressable
      style={({ pressed }) => [styles.recordButton, pressed && styles.recordButtonPressed]}
      onPress={openVoice}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      <Ionicons name="mic" size={26} color={Colors.white} />
    </Pressable>
  )
}

export default function TabsLayout() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const { transactions } = useTransactions(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale
  const insets = useSafeAreaInsets()

  // Day-3 Insights unlock badge — sage dot on the Insights tab icon once the
  // user has 3+ transactions logged AND hasn't yet opened Insights to clear
  // the milestone. Cleared by the Insights screen via `markSeen()`.
  const txnCount = transactions.filter((t) => !t.is_deleted).length
  const { badge: insightsBadge } = useInsightsUnlock(txnCount)

  // Day-2 dunning local notification. Watches the transaction list at the
  // tabs layer so every save / delete / wipe routes through one lifecycle
  // without each save call site having to remember to schedule.
  useDayTwoDunning(locale, transactions)

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        // Every tab mounts at launch, under the launch veil, instead of on
        // its first tap. With lazy mounting the first visit to Budgets /
        // Insights / More paid a whole-screen mount + layout on the tap —
        // a visible ~100 ms flash before the content settled (owner review,
        // Aug 16). Data is already preloaded at the root (query cache), so
        // the eager mount is cheap and the first tap is instant.
        lazy: false,
        // Bar's bottom edge floats `TAB_BAR_BOTTOM_OFFSET` above the safe
        // area, not a fixed 14pt off the physical screen edge — on a
        // Home-button device (insets.bottom === 0) that's 8pt; on a Face ID
        // device (insets.bottom === 34) that's 42pt, clearing the home
        // indicator band instead of crowding it. See F12.
        tabBarStyle: [styles.tabBar, { bottom: insets.bottom + TAB_BAR_BOTTOM_OFFSET }],
        // Real iOS-style frosted glass via expo-blur. The bar's own
        // backgroundColor is set to transparent in styles.tabBar so the
        // blur + subtle tint show through. Falls back to a translucent
        // white on platforms that don't support backdrop blur.
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint="light"
            style={styles.tabBarBlur}
            // The background fills the pill, so its height IS the bar's real
            // height — reported to `useTabBarClearance()` (theme/chrome.ts).
            onLayout={(e) => reportTabBarHeight(e.nativeEvent.layout.height)}
          />
        ),
        // Ink-on-quiet active state per the voice-redesign tab bar
        // (docs/voice redesign, artboard 14) — no filled pill behind the
        // active icon anymore; active reads as ink, inactive as ink4.
        tabBarActiveTintColor: Colors.ink,
        tabBarInactiveTintColor: Colors.ink4,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'home' : 'home-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('tabs.insights', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name={focused ? 'stats-chart' : 'stats-chart-outline'}
              badge={insightsBadge}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '',
          // Custom button: opens the in-place voice overlay instead of
          // navigating. The route itself survives only as a redirect bridge
          // for pre-redesign deep links (see app/(tabs)/record.tsx).
          tabBarButton: () => <RecordFab label={t('voice.tap_to_record', locale)} />,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('tabs.budgets', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'wallet' : 'wallet-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="more"
        options={{
          title: t('tabs.more', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon
              focused={focused}
              name={focused ? 'ellipsis-horizontal' : 'ellipsis-horizontal-outline'}
            />
          ),
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  // Floating pill tab bar. Geometry unchanged since the Claude-Design rework.
  // Real backdrop blur is provided by the BlurView in tabBarBackground above.
  tabBar: {
    position: 'absolute',
    left: 16,
    right: 16,
    // `bottom` is set dynamically per-insets in screenOptions.tabBarStyle
    // above (F12) — not duplicated here.
    // `minHeight`, not `height` — at large Dynamic Type scales the 10pt tab
    // label (`tabLabel` below) needs more than 68pt to avoid clipping; a
    // fixed `height` clips it instead of letting the pill grow (F24).
    minHeight: TAB_BAR_HEIGHT,
    borderRadius: 34,
    // Transparent so the BlurView behind shows through. NOTE: no
    // overflow:hidden here — it would clip the record FAB (which
    // extends above the bar) and kill the drop shadow.
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    paddingBottom: 10,
    paddingHorizontal: 9,
    marginHorizontal: 21,
    paddingTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 12,
  },
  // BlurView lives behind the tab content and is clipped to the pill
  // shape itself (borderRadius + overflow:hidden on this layer only,
  // so it doesn't affect the FAB or the shadow). The white tint +
  // subtle hairline give the pill a visible edge even when backdrop
  // blur is faint (e.g. on a flat green background).
  tabBarBlur: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 34,
    overflow: 'hidden',
    // Whiter tint per the voice-redesign bar (mockup: rgba(255,255,255,0.84)
    // over backdrop blur) — the old 0.55 read muddy over busy content.
    backgroundColor: 'rgba(255,255,255,0.84)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(40,36,28,0.08)',
  },
  tabLabel: {
    fontSize: 10,
    fontFamily: Typography.fontFamily.sansSemiBold,
    marginTop: 2,
  },
  tabIconWrap: {
    width: 44,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Day-3 Insights unlock dot — small sage circle in the upper-right of the
  // Insights tab icon. Vanishes the first time the user opens Insights.
  tabBadge: {
    position: 'absolute',
    top: 2,
    right: 4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: Colors.accent ?? Colors.primary,
    borderWidth: 1.5,
    borderColor: Colors.white,
  },
  // Ink FAB per the voice-redesign bar (artboard 14) — 58pt, raised above
  // the pill, near-black instead of sage.
  recordButton: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: Colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    marginTop: -10,
    marginHorizontal: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.28,
    shadowRadius: 20,
    elevation: 10,
  },
  recordButtonPressed: { opacity: 0.85 },
})
