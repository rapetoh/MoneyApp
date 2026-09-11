# Reply to App Review, submission a9062528-cfbe-4187-806c-88c6f34499c3

Copy the block below into the App Review message thread in App Store
Connect (Distribution > App Review > the rejection message > Reply).
Send it after the new build is attached, together with the screen
recording Apple asked for under 5.1.1(v).

The three sections answer the three things Apple raised, in their order.
Everything stated here was checked against the shipped code on Sep 8,
2026; see `docs/fixes-2026-09-08-app-review-rejection.md` for the change
list behind it.

---

## Paste this

Hello, and thank you for the detailed review. We have addressed all
three items. Here are the answers and the changes.

**Guideline 2.1 - Information Needed: third-party AI**

1. Yes, Murmur uses a third-party AI service.

2. The provider is OpenAI. We call the OpenAI API from our own server
(api.itsmurmur.com, hosted on Vercel); the app never contacts OpenAI
directly. We use gpt-4o-mini to turn a spoken sentence or a scanned
receipt into a structured expense, and gpt-4o for "Ask Murmur", the
in-app question feature.

3. Data sent to OpenAI, by feature, and nothing else:

- Voice entry: the text of the sentence the user just spoke, plus their
  language, currency, their own category names, and today's date. Speech
  is converted to text by the device's own speech recognition, and the
  app requests on-device recognition. Audio is never recorded, stored or
  transmitted by Murmur.
- Receipt or paycheck scan: the single image the user chose to scan,
  plus their currency.
- Ask Murmur: the user's own financial records already in their account
  (transaction amounts, merchant names, categories and dates, recurring
  rules, their monthly income figure), their currency, time zone and
  language, and the question they typed.

We do not send the user's name, email address, account identifier,
device identifiers, location, contacts, or any photo the user did not
choose to scan. Murmur never connects to a bank and holds no banking
credentials. Requests travel over HTTPS, the content is not used to
train models, and we do not use it for advertising or tracking. This is
disclosed in our privacy policy at https://itsmurmur.com/privacy, in the
"Who we share it with" table, and inside the app under Settings >
Privacy Center.

**Guideline 5.1.1(v) - Account deletion**

Account deletion is now in the app, in the place a user looks for it:

Settings > Account > Delete account

The same action is also available under Settings > Privacy Center > Your
data. Tapping it shows a confirmation naming exactly what will be
removed; confirming permanently deletes the account and every record
attached to it (transactions, budgets, recurring rules, categories and
Ask conversations) along with the sign-in record itself, then signs the
user out. It is immediate and server-side, not a deactivation, and it
requires no website visit, phone call or email. The confirmation also
tells the user that an active Murmur Plus subscription is managed by
Apple and is not cancelled by deleting the account.

A screen recording captured on a physical iPhone is attached. It shows a
new account being created in the app, the navigation to Settings >
Account > Delete account, and the deletion through to confirmation and
the signed-out state. We recorded it with a newly created account rather
than the demo account so that the demo credentials in App Review
Information stay valid for you.

**Guideline 2.3.7 - Accurate Metadata: pricing in screenshots**

Thank you for pointing this out. We removed the screenshot that carried
pricing language ("Start free. Stay free.", "free forever", "No credit
card") from the listing entirely, and removed the two remaining mentions
of our paid tier from the subtitles of the Ask Murmur and Recurring
screenshots. No screenshot now refers to price, to anything being free,
or to a paid tier. Information about what is free and what Murmur Plus
costs appears only in the app description, as your guidance directs.

While preparing these we also found and fixed a rendering defect in the
Budgets screenshots and replaced them.

Thank you again for the clear next steps. We are happy to provide
anything else that helps the review.

---

## Checklist before sending

1. New build attached to version 1.0.0 (the deletion row ships in the
   binary; the old build does not have it).
2. Screen recording made on a physical iPhone, in one take: create a new
   account with any throwaway email (sign-up needs no email
   confirmation, so it signs straight in), go to Settings > Account,
   tap Delete account, confirm, and let it return to the sign-in
   screen. Use a throwaway account, never `review@itsmurmur.com`:
   deleting the demo account would leave App Review unable to sign in.
3. Screenshots re-uploaded (9 iPhone, 5 iPad) or pushed with
   `eas metadata:push`.
4. App Privacy answers in App Store Connect match the app's privacy
   manifest: Email Address, Name, User ID, Other Financial Info,
   Purchase History, Other User Content, all linked to the user, none
   used for tracking.
