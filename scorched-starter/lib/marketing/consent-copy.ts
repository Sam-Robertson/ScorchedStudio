// lib/marketing/consent-copy.ts
//
// The exact wording shown next to each opt-in checkbox. Every capture point
// renders these constants and passes the same string to recordConsent, so the
// consent log stores what the person actually read rather than an approximate
// description of it.
//
// Changing a string here changes what future signups agree to. It does not and
// must not rewrite what past signups agreed to, which is why consent_events
// stores the text per row and is append only.

export const EMAIL_CONSENT_TEXT =
  "Email me about new classes, events, and offers.";

// The footer signup has no checkbox: submitting the form is the consent, and
// the form's own label is the only wording shown. Recorded verbatim so the
// consent log reflects what was on screen rather than borrowing the checkbox
// wording from the waiver and booking forms, which footer signups never see.
export const FOOTER_EMAIL_CONSENT_TEXT =
  "Submitted the email signup form in the site footer, labelled: " +
  "\"Deals, new products, and studio news. No spam.\"";

// Required elements for SMS marketing consent under TCPA and the CTIA
// guidelines the carriers enforce: who is messaging, that frequency varies,
// that rates may apply, how to stop, how to get help, and that agreeing is not
// a condition of buying anything. Removing any clause puts the number at risk.
export const SMS_CONSENT_TEXT =
  "Text me about classes, events, and offers from Scorched Studio. " +
  "Message frequency varies. Msg and data rates may apply. " +
  "Reply STOP to opt out, HELP for help. " +
  "Consent is not a condition of purchase.";

// Shown on the unsubscribe confirmation page and written to the consent log
// when someone leaves via an email link rather than a checkbox.
export const EMAIL_UNSUBSCRIBE_CONSENT_TEXT =
  "Unsubscribed using the one-click unsubscribe link in a marketing email.";

export const SMS_STOP_CONSENT_TEXT =
  "Replied with an opt-out keyword (STOP, UNSUBSCRIBE, CANCEL, OPT OUT, REVOKE, END, or QUIT) to a text from Scorched Studio.";

export const SMS_START_CONSENT_TEXT =
  "Replied START to a text from Scorched Studio, re-subscribing after a previous opt out.";

export const ADMIN_UNSUBSCRIBE_CONSENT_TEXT =
  "Unsubscribed by Scorched Studio staff from the admin subscribers page.";

// Links shown beside the SMS checkbox. Kept here so all capture points agree.
export const PRIVACY_POLICY_PATH = "/privacy";
// The SMS terms carriers check live on their own page, deep linked to the SMS
// section. A 10DLC reviewer is given this URL and expects a terms page, not an
// anchor inside the privacy policy.
export const TERMS_PATH = "/terms#sms";

// CAN-SPAM requires a physical postal address in every marketing email.
export const BUSINESS_POSTAL_ADDRESS = "218 E University Pkwy, Orem, UT";
export const BUSINESS_NAME = "Scorched Studio";
