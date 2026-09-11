# Brief 2 for Claude in Chrome: finish the Murmur resubmission

This replaces the earlier brief, which was written before we knew the
account state. Paste from "START OF BRIEF" to the end.

---

## START OF BRIEF

You are finishing an App Store submission for me, in the browser. Do the
work yourself. You have my authorization to submit at the end.

App: **Expense Tracker - Murmur**, Apple ID `6799316747`, version
**1.0.0**, build **47**.
https://appstoreconnect.apple.com/apps/6799316747/distribution

### What is already done, do not redo it

- Build 47 is attached and is the right build.
- All fourteen screenshots are uploaded and correct. **Do not delete,
  reorder, or re-upload any screenshot.** They have been verified clean
  of price and paid-tier wording.
- A screen recording is attached in App Review Information.

### What is wrong and needs fixing

The current submission (`74be8fb5-8017-41da-b589-3425f4660810`, Waiting
for Review) contains **only one item**: iOS App 1.0.0 (47). The
subscription group "Murmur Plus" and the products "Murmur Plus Monthly"
and "Murmur Plus Yearly" are not attached. A subscription that has never
been approved must be reviewed alongside an app version, so as things
stand the app could be approved with nothing purchasable in it. That has
to be corrected, which means pulling this submission and sending a new
one with all four items.

### Step 1. Check the status first

Look at the submission status before doing anything.

- If it says **Waiting for Review**, continue to Step 2.
- If it says **In Review**, stop and tell me. Pulling a submission
  mid-review costs more than it is worth, and I want to decide.

### Step 2. Remove it from review

Cancel or remove the current submission from review so version 1.0.0
becomes editable again. Confirm the version is editable before going on.

### Step 3. Replace the App Review Information notes

The Notes field currently holds the old note, a separator line reading
`-------ADDITIONAL NOTES RELATED TO MY PREVIOUS SUBMISSION REJECTION:`,
and then newer text. The old half contradicts the new half. Select all
of it, delete it, and paste exactly this and nothing else:

```
DEMO ACCOUNT: on the sign-in screen tap 'More options' to reveal the email form, then sign in with the credentials above. The account is pre-loaded with sample transactions and a budget, so Today, Insights and Budgets all show data. CORE FLOW: tap the mic on the Today tab and say e.g. 'fifteen dollars at Starbucks'; the expense files itself. Speech is transcribed by the device (on-device recognition is requested); Murmur never records or transmits audio. ACCOUNT DELETION (guideline 5.1.1(v)): Settings > Account > Delete account, and also Settings > Privacy Center > Your data. One confirmation, then the account and every record attached to it are permanently deleted server-side and the app signs out. A screen recording of this flow is attached; it uses a newly created account rather than the demo account so the demo credentials below stay valid for review. DATA EXPORT: Settings > Privacy Center > Export all my data. THIRD-PARTY AI (answering the questions from the previous review): Yes, the app uses third-party AI. The provider is OpenAI, called from our own server; the app never contacts OpenAI directly. gpt-4o-mini interprets spoken entries and scanned receipts, gpt-4o answers Ask Murmur. Sent to OpenAI: the transcribed sentence and the user's language, currency, category names and today's date; or the single image the user chose to scan; and for Ask Murmur the user's own transactions, recurring rules, monthly income figure, currency, time zone and typed question. Never sent: name, email address, account identifier, device identifiers, location, contacts, or any photo the user did not choose to scan. Audio is never recorded or transmitted. Requests use HTTPS, content is not used to train models, and none of it is used for advertising or tracking. Disclosed at https://itsmurmur.com/privacy. SUBSCRIPTION: Murmur Plus (auto-renewable, 7-day free trial) under Settings > Subscription; it unlocks Ask Murmur (More > Ask Murmur), recurring detection, exports and the desktop apps. Everything else is included without a subscription. WALLET CAPTURE is an optional Shortcuts automation the user creates themselves from Settings; it is not needed to review the app. The app is iPhone-only and runs in compatibility mode on iPad.
```

Leave the demo account fields alone. They read `review@itsmurmur.com`
and `Murmur-Review-8d9202f5`, Sign-in required ticked, and that account
is live with sample data in it.

### Step 4. Fix App Privacy

App Privacy currently declares three collected data types: Email
Address, Name, Other Financial Info. The app's own privacy manifest, in
the binary, declares six. Apple compares those two and a mismatch is
itself a privacy finding.

Add these three, to match the binary:

- **User ID** - linked to the user, purpose App Functionality, not used
  for tracking.
- **Purchase History** - linked to the user, purpose App Functionality,
  not used for tracking.
- **Other User Content** - linked to the user, purpose App
  Functionality, not used for tracking.

Leave the existing three as they are. Nothing is used for tracking, and
no data is used for advertising. Publish the changes.

### Step 5. Resubmit with all four items

Create the new submission and attach **all four**:

1. iOS App 1.0.0 (build 47)
2. Murmur Plus (subscription group)
3. Murmur Plus Monthly (subscription)
4. Murmur Plus Yearly (subscription)

If any of the three subscription items will not attach, stop and tell me
exactly what the page says rather than submitting a partial set.

Then submit for review.

### Step 6. Report

Tell me: the status before you started, that the notes were replaced,
which privacy types you added, the four items attached, the new
submission ID, and its status. Flag anything that did not go as
described here instead of working around it.

### Rules

- Do not touch the screenshots.
- Do not change the app name. It stays **Expense Tracker - Murmur**.
- Do not add pricing, "free", or "trial" wording to the subtitle,
  promotional text, keywords, or any screenshot. The description is the
  only place that belongs, and it is already there.
- Do not touch the demo account credentials.
- Do not create a new app version. Everything belongs on 1.0.0.
- Do not look for a reply box on the old rejection thread. It is gone
  with the cancelled submission, and everything Apple asked for is
  covered by the Notes field and the attached recording.

## END OF BRIEF
