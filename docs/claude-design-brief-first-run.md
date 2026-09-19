# Claude Design brief: Murmur first run (iOS)

Paste everything below into Claude Design, in the same project as the existing
Murmur mockups (docs/money-app/project/: mobile-screens-*.jsx, tokens.jsx,
Murmur Brand Sheet). Ask for the result as JSX artboards like the existing
bundle, so the build can follow it exactly.

---

Design the first run of **Murmur**, a voice-first expense tracker for iPhone
("Speak your spending"). No bank connection: the user says "twelve fifty at
Chipotle" and it becomes a categorized expense. The app is live on the App
Store; these screens replace its onboarding. Goal: flagship quality, the
level of Things, Arc, Copilot Money, Airbnb. The user should speak their first
expense within a minute of opening the app.

**Use the existing Murmur system exactly:** cream canvas #FBFAF7, white
cards, warm ink #1B1915 (ink 2-4 greys), deep sage accent #3F5A3E with
#E8EDE3 soft tint, New York serif for headlines and money, Plus Jakarta Sans
for UI, hairline dividers, 28px side margins, pill buttons (ink fill, 56pt).
Coin & Wave logo. No em dashes in any copy. Light mode only.

Screens (iPhone 15, 393 x 852), each with every state listed:

1. **Welcome + sign-in.** Logo, serif headline "Speak it. Spend clearly.", a
   live capture demo card (listening waveform, spoken words appearing, then a
   filed expense card: merchant logo, name, category, amount), one trust line
   "No bank logins. Audio is never stored.", Continue with Apple (hero),
   Continue with Google, "More options" (email). Show 3 frames of the demo
   animation. Everything important must fit without scrolling.
2. **Your setup** (step 1 of 3). "Here's how Murmur is set up." Three rows read
   from the phone: Language, Currency (symbol + code), "Listens in" (voice
   language + region, not tappable). A "Help improve Murmur" opt-in switch,
   OFF by default (anonymous usage and crash data, never transactions). CTA
   "Looks right". Include the language picker and currency picker sheets.
3. **Try it now** (step 2 of 3). "Try it now." + one line, an example sentence
   card ("Twelve fifty at Chipotle"), a large mic button with a soft halo,
   "Tap to speak", a privacy line ("Murmur will ask to use the microphone.
   Audio is never stored."), footer links "Type instead" and "I'll do it
   later". States: idle; the iOS microphone alert over it; listening (existing
   overlay); **"Filed."** celebration (check, the saved expense card, "That's
   the whole habit: say it when you pay.", Continue).
4. **Microphone off** state of the capture overlay: explanation, "Open
   Settings" (primary), "Type instead".
5. **Never miss one** (step 3 of 3). Card 1: "Evening check-in", switch ON,
   hour chips 6 PM to 10 PM, one line ("One gentle reminder a day, skipped on
   days you've already logged."). Card 2 (iPhone): "Apple Pay, logged for you"
   with "Set it up next". Footer note "Continue, and Murmur will ask to send
   notifications." then Continue.
6. **Plus offer after onboarding**: the existing dark paywall, plus a "Not
   now" as visible as the trial button.
7. **Today, first days**: a "Getting started" card (progress bar, 4 rows with
   check circles: Log your first expense, Set a monthly budget, Add your
   income, Log Apple Pay automatically; Hide link). Also the Day-1 state:
   coach text + a "Tap to speak" callout pointing at the center mic button,
   which has a breathing sage glow ring.
8. **Reminder sheet** (for existing users): bottom sheet "Want a nudge if you
   forget?", one line, Continue / Not now.

Progress is shown as three dots (current one stretched), no "Step X of Y".
