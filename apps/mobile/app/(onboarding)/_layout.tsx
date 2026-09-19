import { Stack } from 'expo-router'

// Onboarding (first-run audit, Sep 19 2026): setup → first-log → habit →
// tabs. Value comes before questions: the first spoken expense happens in
// step 2, the microphone is asked for when the user taps to speak, and
// income moved to the Today "Getting started" checklist. Each screen draws
// its own progress dots, so the native header is hidden here.
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
