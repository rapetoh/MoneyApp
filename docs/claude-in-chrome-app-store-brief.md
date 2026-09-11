# Brief for Claude in Chrome: finish the Murmur App Store resubmission

Paste everything from "START OF BRIEF" to the end into Claude in Chrome,
with App Store Connect open and signed in.

---

## START OF BRIEF

You are working inside App Store Connect for me. Do the work yourself,
in the browser. Do not hand tasks back to me unless a step is genuinely
impossible for you, and when that happens say exactly which step and
why, then continue with everything else.

### The situation

App: **Expense Tracker - Murmur**, Apple ID `6799316747`, version
**1.0.0**. Direct link:
https://appstoreconnect.apple.com/apps/6799316747/distribution

Apple rejected this version on Sep 8, 2026 (submission
`a9062528-cfbe-4187-806c-88c6f34499c3`) for three things:

1. **2.3.7 Accurate Metadata.** Screenshots referenced price. Apple
   counts the word "free" as a price reference.
2. **2.1 Information Needed.** They asked three questions about
   third-party AI and are waiting on answers.
3. **5.1.1(v) Data Collection and Storage.** No way to initiate account
   deletion, and they want a screen recording of the flow.

All three are fixed on my side. Build **47** contains the account
deletion feature and is already uploaded and attached. New screenshots
with no price language are on disk. I am recording the video separately.

I then cancelled that submission and re-added the app to review, so
there may be more than one submission object in the account. Be careful
to check which one is live.

### What I need you to do

**Step 1. Establish the current state.** Go to the Distribution tab and
tell me, before changing anything:

- Which version is in review or ready to submit, and its status.
- Which build number is attached to version 1.0.0. It must be **47**.
- Whether the four items (app version, Murmur Plus subscription group,
  Murmur Plus Monthly, Murmur Plus Yearly) are attached to the live
  submission or still showing as Removed.

If the attached build is not 47, change it to 47. Build 47 finished
processing and is available.

**Step 2. Replace the screenshots.** Go to the version page, iOS App
1.0.0, screenshots section.

Delete every existing screenshot for both device sizes first. One of the
current ones says "Start free. Stay free." with a "No credit card" badge;
that is the exact thing Apple rejected, so it must be gone.

Then upload these, in this order. The order matters, it is the order
they appear on the store page.

iPhone 6.5-inch, nine files:

```
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/01-hero.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/02-voice.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/03-confirm.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/04-apple-pay.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/08-ask-murmur.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/09-privacy.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/07-recurring.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/06-budgets.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPHONE_65/05-insights.png
```

iPad 13-inch, five files:

```
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129/01-hero.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129/02-voice-flow.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129/04-patterns.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129/03-understand.png
/Users/roch/Desktop/money-app/apps/mobile/store/apple/screenshot/en-US/APP_IPAD_PRO_3GEN_129/05-private.png
```

If the browser blocks you from driving the native file picker, say so
plainly, tell me to drag the files in, and move on to the next step.

After uploading, read every screenshot back and confirm none of them
contains the words "free", "credit card", or "Murmur Plus". If any does,
stop and tell me which one.

**Step 3. Replace the App Review Information notes.** On the version
page, App Review Information, Notes field. Delete what is there and
paste this exactly:

```
DEMO ACCOUNT: on the sign-in screen tap 'More options' to reveal the email form, then sign in with the credentials above. The account is pre-loaded with sample transactions and a budget, so Today, Insights and Budgets all show data. CORE FLOW: tap the mic on the Today tab and say e.g. 'fifteen dollars at Starbucks'; the expense files itself. Speech is transcribed by the device (on-device recognition is requested); Murmur never records or transmits audio. ACCOUNT DELETION (guideline 5.1.1(v)): Settings > Account > Delete account, and also Settings > Privacy Center > Your data. One confirmation, then the account and every record attached to it are permanently deleted server-side and the app signs out. DATA EXPORT: Settings > Privacy Center > Export all my data. THIRD-PARTY AI: Murmur sends text to OpenAI through our own server to interpret spoken entries and scanned receipts (gpt-4o-mini) and to answer Ask Murmur (gpt-4o). Sent: the transcribed sentence or the scanned image, and for Ask Murmur the user's own transactions, recurring rules, income figure, currency, time zone and question. Never sent: name, email, account id, device ids, location. Murmur never connects to a bank. Disclosed at https://itsmurmur.com/privacy. SUBSCRIPTION: Murmur Plus (auto-renewable, 7-day free trial) under Settings > Subscription; it unlocks Ask Murmur (More > Ask Murmur), recurring detection, exports and the desktop apps. Everything else is included without a subscription. WALLET CAPTURE is an optional Shortcuts automation the user creates themselves from Settings; it is not needed to review the app. The app is iPhone-only and runs in compatibility mode on iPad.
```

Confirm the demo account fields still read `review@itsmurmur.com` and
`Murmur-Review-8d9202f5`, and that "Sign-in required" is ticked. That
account is live and loaded with sample data. Do not change it.

**Step 4. Reply to Apple.** Open
https://appstoreconnect.apple.com/apps/6799316747/distribution/appreview
or click the "App Review" link above the submission heading. Find the
**Messages** section, expand the message from Apple, and post this as a
reply:

```
Hello, and thank you for the detailed review. We have addressed all three items. Here are the answers and the changes.

Guideline 2.1 - Information Needed: third-party AI

1. Yes, Murmur uses a third-party AI service.

2. The provider is OpenAI. We call the OpenAI API from our own server (hosted on Vercel); the app never contacts OpenAI directly. We use gpt-4o-mini to turn a spoken sentence or a scanned receipt into a structured expense, and gpt-4o for "Ask Murmur", the in-app question feature.

3. Data sent to OpenAI, by feature, and nothing else:

- Voice entry: the text of the sentence the user just spoke, plus their language, currency, their own category names, and today's date. Speech is converted to text by the device's own speech recognition, and the app requests on-device recognition. Audio is never recorded, stored or transmitted by Murmur.
- Receipt or paycheck scan: the single image the user chose to scan, plus their currency.
- Ask Murmur: the user's own financial records already in their account (transaction amounts, merchant names, categories and dates, recurring rules, their monthly income figure), their currency, time zone and language, and the question they typed.

We do not send the user's name, email address, account identifier, device identifiers, location, contacts, or any photo the user did not choose to scan. Murmur never connects to a bank and holds no banking credentials. Requests travel over HTTPS, the content is not used to train models, and we do not use it for advertising or tracking. This is disclosed in our privacy policy at https://itsmurmur.com/privacy and inside the app under Settings > Privacy Center.

Guideline 5.1.1(v) - Account deletion

Account deletion is now in the app, in the place a user looks for it:

Settings > Account > Delete account

The same action is also available under Settings > Privacy Center > Your data. Tapping it shows a confirmation naming exactly what will be removed; confirming permanently deletes the account and every record attached to it (transactions, budgets, recurring rules, categories and Ask conversations) along with the sign-in record itself, then signs the user out. It is immediate and server-side, not a deactivation, and it requires no website visit, phone call or email. The confirmation also tells the user that an active Murmur Plus subscription is managed by Apple and is not cancelled by deleting the account.

A screen recording captured on a physical iPhone is attached. It shows a new account being created in the app, the navigation to Settings > Account > Delete account, and the deletion through to confirmation and the signed-out state. We recorded it with a newly created account rather than the demo account so that the demo credentials in App Review Information stay valid for you.

Guideline 2.3.7 - Accurate Metadata: pricing in screenshots

Thank you for pointing this out. We removed the screenshot that carried pricing language ("Start free. Stay free.", "free forever", "No credit card") from the listing entirely, and removed the two remaining mentions of our paid tier from the subtitles of the Ask Murmur and Recurring screenshots. No screenshot now refers to price, to anything being free, or to a paid tier. Information about what is free and what Murmur Plus costs appears only in the app description, as your guidance directs.

While preparing these we also found and fixed a rendering defect in the Budgets screenshots and replaced them.

Thank you again for the clear next steps. We are happy to provide anything else that helps the review.
```

The reply mentions an attached screen recording. I am attaching that
myself. Post the text, then tell me the reply is up so I can attach the
video before anything gets submitted.

**Step 5. Check the App Privacy answers.** Under App Privacy, the
collected data types should be exactly: Email Address, Name, User ID,
Other Financial Info, Purchase History, Other User Content. All six
linked to the user. None used for tracking. Report what is actually
there; only change it if it disagrees.

**Step 6. Report, then stop.** Give me a short list: build attached,
screenshots replaced and how many, notes updated, reply posted, privacy
answers state, and anything you could not do. **Do not press Submit for
Review.** I will do that once the video is attached.

### Rules

- Do not change the app name. It stays **Expense Tracker - Murmur**.
- Do not add any pricing, "free", or "trial" wording to any screenshot,
  the subtitle, the promotional text, or the keywords. It belongs only
  in the description, where it already is.
- Do not touch the demo account credentials or delete that account.
- Do not create a new app version. Everything belongs on 1.0.0.
- If a page shows something that contradicts this brief, stop and tell
  me what you see rather than guessing.

## END OF BRIEF
