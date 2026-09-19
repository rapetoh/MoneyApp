const launch = require('./assets/brand/launch')

module.exports = {
  expo: {
    name: 'Murmur',
    slug: 'voice-expense-tracker',
    scheme: 'voiceexpense',
    version: '1.0.1',
    orientation: 'portrait',
    icon: './assets/icon.png',
    userInterfaceStyle: 'light',
    newArchEnabled: true,
    // NOTE: there is intentionally NO top-level `splash` object. Since
    // SDK 52 the native launch screen is configured through the
    // `expo-splash-screen` plugin below, and the moment that plugin
    // receives any props the legacy `expo.splash` object is ignored on
    // both platforms (see @expo/prebuild-config getIosSplashConfig /
    // getAndroidSplashConfig). Builds up to Aug 16 2026 had a top-level
    // `splash.image` AND a plugin entry carrying only `backgroundColor` —
    // so the storyboard was generated with no image and the template's
    // white background: the "blank white screen for a second, then Home"
    // every cold start showed.
    ios: {
      supportsTablet: false,
      bundleIdentifier: 'com.voiceexpense.app',
      usesAppleSignIn: true,
      infoPlist: {
        // Murmur implements no encryption of its own (OS TLS + data
        // protection only) — declaring exemption here means App Store
        // Connect never shows the "Missing Compliance" dialog again.
        ITSAppUsesNonExemptEncryption: false,
      },
      // App privacy manifest (App Store 5.1.1). Expo writes the accessed-
      // API reasons for its own modules; this declares what the app itself
      // collects, matching the privacy policy at itsmurmur.com/privacy and
      // the App Privacy answers in App Store Connect: account email and
      // display name, the account id, the user's own transactions and
      // budgets (financial info), the Plus subscription state, and the
      // text of voice entries / receipts / Ask conversations. Everything
      // is linked to the account, nothing is used for tracking.
      privacyManifests: {
        NSPrivacyTracking: false,
        NSPrivacyCollectedDataTypes: [
          'NSPrivacyCollectedDataTypeEmailAddress',
          'NSPrivacyCollectedDataTypeName',
          'NSPrivacyCollectedDataTypeUserID',
          'NSPrivacyCollectedDataTypeOtherFinancialInfo',
          'NSPrivacyCollectedDataTypePurchaseHistory',
          'NSPrivacyCollectedDataTypeOtherUserContent',
        ]
          .map((type) => ({
            NSPrivacyCollectedDataType: type,
            NSPrivacyCollectedDataTypeLinked: true,
            NSPrivacyCollectedDataTypeTracking: false,
            NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAppFunctionality'],
          }))
          .concat(
            // Opt-in only (first-run audit H1, Sep 19 2026): anonymous
            // product events and JS crash reports, keyed by a random
            // install id, never linked to the account (migration 033).
            ['NSPrivacyCollectedDataTypeProductInteraction', 'NSPrivacyCollectedDataTypeCrashData'].map((type) => ({
              NSPrivacyCollectedDataType: type,
              NSPrivacyCollectedDataTypeLinked: false,
              NSPrivacyCollectedDataTypeTracking: false,
              NSPrivacyCollectedDataTypePurposes: ['NSPrivacyCollectedDataTypePurposeAnalytics'],
            })),
          ),
      },
    },
    android: {
      adaptiveIcon: {
        foregroundImage: './assets/adaptive-icon.png',
        backgroundColor: '#FBFAF7',
      },
      package: 'com.voiceexpense.app',
    },
    plugins: [
      // First in the list so its entitlements mod runs LAST (plugins
      // wrap like middleware — last-registered runs first): it must
      // delete the remote-push entitlement AFTER expo-notifications
      // adds it. Murmur is local-notifications-only; the ad-hoc
      // provisioning profile has no Push Notifications capability and
      // builds fail if the entitlement survives.
      './plugins/withoutRemotePush.js',
      // "Log Expense in Murmur" App Intent — Apple Pay capture runs in the
      // background via a Wallet automation (native/ios/WalletCapture.swift).
      './plugins/withWalletCapture.js',
      // Xcode 27 deployment-target clamp for old pods (ITMS-90111 fix).
      './plugins/withPodTargetFloor.js',
      'expo-router',
      // Purpose strings (App Store 5.1.1, Sep 8 2026 rejection): every
      // NS*UsageDescription says what Murmur does with the resource and
      // what it never does. The library defaults ("Allow Murmur to access
      // your photos") are exactly what App Review rejects as insufficient.
      [
        'expo-secure-store',
        {
          faceIDPermission:
            'Murmur uses Face ID only to protect the sign-in details it keeps on this device.',
        },
      ],
      // Native launch screen: the Coin & Wave mark, `SPLASH_IMAGE_WIDTH`
      // pt wide, centered on the cream canvas — iOS storyboard and the
      // Android 12+ system splash alike. `src/components/LaunchScreen.tsx`
      // paints the identical frame in JS the moment the bundle is up and
      // only then hides this native layer, so the mark can breathe while
      // data loads and dissolve into the first screen. Values live in
      // assets/brand/launch.js so the two sides can't drift.
      [
        'expo-splash-screen',
        {
          image: launch.SPLASH_IMAGE,
          imageWidth: launch.SPLASH_IMAGE_WIDTH,
          resizeMode: 'contain',
          backgroundColor: launch.SPLASH_BACKGROUND,
        },
      ],
      'expo-localization',
      'expo-apple-authentication',
      'expo-web-browser',
      'expo-sqlite',
      // Day-2 dunning local notification (Phase H). Local-only — no remote
      // push infrastructure needed. Notifications fire even when the app is
      // fully closed. Color is the Murmur sage accent.
      [
        'expo-notifications',
        {
          icon: './assets/adaptive-icon.png',
          color: '#3F5A3E',
        },
      ],
      [
        'expo-speech-recognition',
        {
          // First-run audit H5: the mic is tap-to-talk; nobody holds it.
          microphonePermission:
            'Murmur listens only while you are recording, to hear the expense you say out loud. Audio is never stored.',
          speechRecognitionPermission:
            'Murmur turns what you say into text so it can file the amount, place and category for you. Audio is never stored.',
        },
      ],
      [
        'expo-image-picker',
        {
          cameraPermission:
            'Murmur uses the camera only to scan a receipt or paycheck you point it at, so the amount and place can be filled in for you.',
          photosPermission:
            'Murmur opens your photo library only when you choose a receipt or paycheck image, so the amount and place can be filled in for you.',
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
