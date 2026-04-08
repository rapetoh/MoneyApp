module.exports = {
  expo: {
    name: 'Voice Expense Tracker',
    slug: 'voice-expense-tracker',
    scheme: 'voiceexpense',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    splash: {
      image: './assets/splash-icon.png',
      resizeMode: 'contain',
      backgroundColor: '#F5F0EB',
    },
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.voiceexpense.app',
      usesAppleSignIn: true,
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#F5F0EB',
      },
      package: 'com.voiceexpense.app',
    },
    plugins: [
      'expo-router',
      'expo-secure-store',
      ['expo-splash-screen', { backgroundColor: '#F5F0EB' }],
      'expo-localization',
      'expo-apple-authentication',
      'expo-web-browser',
    ],
    experiments: {
      typedRoutes: true,
    },
    extra: {
      eas: {
        projectId: '79c8d5ab-eb60-4c21-a17d-c9607a5d9cc0',
      },
    },
  },
}
