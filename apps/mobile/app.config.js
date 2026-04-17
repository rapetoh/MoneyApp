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
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
        },
      },
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
      'expo-sqlite',
      [
        'expo-speech-recognition',
        {
          microphonePermission: 'Allow Voice Expense Tracker to use the microphone to record expenses.',
          speechRecognitionPermission: 'Allow Voice Expense Tracker to recognize your speech to log expenses.',
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission: 'Allow Voice Expense Tracker to use the camera to scan receipts and paychecks.',
        },
      ],
      // Android-only: adds MoneyNotificationListenerService to AndroidManifest.xml
      ['./modules/notification-listener/plugin', {}],
      [
        '@react-native-google-signin/google-signin',
        {
          // Reversed iOS client ID — required for Google Sign-In URL scheme on iOS
          iosUrlScheme: 'com.googleusercontent.apps.1092158800862-pe2oj85tpofl4ccr2pdgd2luobt2gojq',
        },
      ],
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
