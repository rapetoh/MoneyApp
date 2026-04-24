import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { BlurView } from 'expo-blur'
import { Ionicons } from '@expo/vector-icons'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

type IoniconName = React.ComponentProps<typeof Ionicons>['name']

function TabIcon({ focused, name }: { focused: boolean; name: IoniconName }) {
  return (
    <View style={[styles.tabIconWrap, focused && styles.tabIconWrapActive]}>
      <Ionicons
        name={name}
        size={22}
        color={focused ? Colors.white : Colors.textSecondary}
      />
    </View>
  )
}

function RecordIcon() {
  return (
    <View style={styles.recordButton}>
      <Ionicons name="mic" size={26} color={Colors.white} />
    </View>
  )
}

export default function TabsLayout() {
  const { user } = useAuth()
  const { profile } = useProfile(user?.id)
  const locale = (profile?.locale ?? 'en') as Locale

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: styles.tabBar,
        // Real iOS-style frosted glass via expo-blur. The bar's own
        // backgroundColor is set to transparent in styles.tabBar so the
        // blur + subtle tint show through. Falls back to a translucent
        // white on platforms that don't support backdrop blur.
        tabBarBackground: () => (
          <BlurView
            intensity={80}
            tint="light"
            style={styles.tabBarBlur}
          />
        ),
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.today', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'menu' : 'menu-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: t('tabs.insights', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'stats-chart' : 'stats-chart-outline'} />
          ),
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: '',
          tabBarIcon: () => <RecordIcon />,
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="budgets"
        options={{
          title: t('tabs.budgets', locale),
          tabBarIcon: ({ focused }) => (
            <TabIcon focused={focused} name={focused ? 'time' : 'time-outline'} />
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
    bottom: 14,
    height: 68,
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
    backgroundColor: 'rgba(255,255,255,0.55)',
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
  tabIconWrapActive: {
    backgroundColor: Colors.primary,
  },
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -10,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 10,
  },
})
