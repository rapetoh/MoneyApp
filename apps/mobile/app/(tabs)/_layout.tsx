import { Tabs } from 'expo-router'
import { View, StyleSheet } from 'react-native'
import { useAuth } from '../../src/hooks/useAuth'
import { useProfile } from '../../src/hooks/useProfile'
import { Colors, Typography } from '../../src/theme'
import { t, type Locale } from '@voice-expense/shared'

function HomeIcon({ focused }: { focused: boolean }) {
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.houseBase, focused && styles.houseBaseFocused]}>
        <View style={[styles.houseRoof, focused && styles.houseRoofFocused]} />
      </View>
    </View>
  )
}

function ListIcon({ focused }: { focused: boolean }) {
  const color = focused ? Colors.primary : Colors.textMuted
  return (
    <View style={styles.iconWrap}>
      {[0, 1, 2].map((i) => (
        <View
          key={i}
          style={[
            styles.listLine,
            { backgroundColor: color, width: i === 0 ? 18 : i === 1 ? 14 : 10 },
          ]}
        />
      ))}
    </View>
  )
}

function ChartIcon({ focused }: { focused: boolean }) {
  const color = focused ? Colors.primary : Colors.textMuted
  return (
    <View style={styles.iconWrap}>
      <View style={styles.chartBars}>
        {[8, 14, 10, 16].map((h, i) => (
          <View key={i} style={[styles.chartBar, { height: h, backgroundColor: color }]} />
        ))}
      </View>
    </View>
  )
}

function GearIcon({ focused }: { focused: boolean }) {
  const color = focused ? Colors.primary : Colors.textMuted
  return (
    <View style={styles.iconWrap}>
      <View style={[styles.gearOuter, { borderColor: color }]}>
        <View style={[styles.gearInner, { backgroundColor: color }]} />
      </View>
    </View>
  )
}

function RecordIcon() {
  return (
    <View style={styles.recordButton}>
      <View style={styles.micBody}>
        <View style={styles.micBase} />
      </View>
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
        tabBarActiveTintColor: Colors.primary,
        tabBarInactiveTintColor: Colors.textSecondary,
        tabBarLabelStyle: styles.tabLabel,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: t('tabs.home', locale),
          tabBarIcon: ({ focused }) => <HomeIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: t('tabs.expenses', locale),
          tabBarIcon: ({ focused }) => <ListIcon focused={focused} />,
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
        name="insights"
        options={{
          title: t('tabs.insights', locale),
          tabBarIcon: ({ focused }) => <ChartIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: t('tabs.settings', locale),
          tabBarIcon: ({ focused }) => <GearIcon focused={focused} />,
        }}
      />
    </Tabs>
  )
}

const styles = StyleSheet.create({
  tabBar: {
    backgroundColor: Colors.tabBar,
    borderTopColor: Colors.tabBarBorder,
    borderTopWidth: 1,
    height: 84,
    paddingBottom: 24,
    paddingTop: 8,
  },
  tabLabel: {
    fontSize: 11,
    fontFamily: Typography.fontFamily.sans,
  },
  iconWrap: {
    width: 28,
    height: 22,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },

  // House icon
  houseBase: {
    width: 16,
    height: 10,
    backgroundColor: Colors.textMuted,
    borderRadius: 2,
    alignItems: 'center',
  },
  houseBaseFocused: { backgroundColor: Colors.primary },
  houseRoof: {
    position: 'absolute',
    top: -7,
    width: 0,
    height: 0,
    borderLeftWidth: 10,
    borderRightWidth: 10,
    borderBottomWidth: 8,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: Colors.textMuted,
  },
  houseRoofFocused: { borderBottomColor: Colors.primary },

  // List icon
  listLine: {
    height: 2,
    borderRadius: 1,
    marginBottom: 3,
  },

  // Chart icon
  chartBars: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 3,
    height: 18,
  },
  chartBar: {
    width: 4,
    borderRadius: 2,
  },

  // Gear icon
  gearOuter: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gearInner: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },

  // Record (mic) button
  recordButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: Colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: Colors.primary,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  micBody: {
    width: 10,
    height: 14,
    borderRadius: 5,
    borderWidth: 2.5,
    borderColor: Colors.white,
    alignItems: 'center',
    justifyContent: 'flex-end',
    marginBottom: 2,
  },
  micBase: {
    width: 16,
    height: 2,
    backgroundColor: Colors.white,
    borderRadius: 1,
    position: 'absolute',
    bottom: -6,
  },
})
