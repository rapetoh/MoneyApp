import { Tabs } from 'expo-router'
import { View, Pressable, StyleSheet } from 'react-native'
import { Colors } from '../../src/theme'

// Simple SVG-free icon placeholders — will be replaced with real icons
function HomeIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.iconDot, focused && { backgroundColor: Colors.primary }]} />
  )
}

function ExpenseIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.iconDot, focused && { backgroundColor: Colors.primary }]} />
  )
}

function InsightsIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.iconDot, focused && { backgroundColor: Colors.primary }]} />
  )
}

function SettingsIcon({ focused }: { focused: boolean }) {
  return (
    <View style={[styles.iconDot, focused && { backgroundColor: Colors.primary }]} />
  )
}

export default function TabsLayout() {
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
          title: 'Home',
          tabBarIcon: ({ focused }) => <HomeIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="expenses"
        options={{
          title: 'Expenses',
          tabBarIcon: ({ focused }) => <ExpenseIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="record"
        options={{
          title: 'Record',
          tabBarIcon: () => (
            <View style={styles.recordButton}>
              <View style={styles.recordDot} />
            </View>
          ),
          tabBarLabel: () => null,
        }}
      />
      <Tabs.Screen
        name="insights"
        options={{
          title: 'Insights',
          tabBarIcon: ({ focused }) => <InsightsIcon focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: 'Settings',
          tabBarIcon: ({ focused }) => <SettingsIcon focused={focused} />,
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
    fontWeight: '500',
  },
  iconDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.textMuted,
    marginBottom: 2,
  },
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
  recordDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: Colors.white,
  },
})
