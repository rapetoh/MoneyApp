import { Stack } from 'expo-router'

// Onboarding flow — welcome → permissions → income → tabs.
// Each screen renders its own compact header (progress eyebrow +
// Skip), so the native Stack header is hidden at the layout level.
export default function OnboardingLayout() {
  return (
    <Stack
      screenOptions={{
        headerShown: false,
        gestureEnabled: false,
        animation: 'slide_from_right',
      }}
    />
  )
}
