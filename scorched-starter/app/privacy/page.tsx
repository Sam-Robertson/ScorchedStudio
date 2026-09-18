// app/privacy/page.tsx
// Server component on purpose: A2P 10DLC reviewers fetch this URL and read the
// initial HTML, so the SMS disclosures must be present before any hydration.
//
// robots: "noindex" was removed. A privacy policy that carriers and customers
// are told to go and read should be findable, and a reviewer hitting a noindex
// page is at best a needless question mark on the registration.
export const metadata = {
  title: "Privacy Policy | Scorched Studio",
  description:
    "How Scorched Studio collects, uses, and protects your information, including our SMS text messaging program.",
};

export default function PrivacyPage() {
  return (
    <section className="container-px py-20 max-w-2xl mx-auto">
      <p className="eyebrow text-brand mb-2">Legal</p>
      <h1 className="h2 font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-neutral-400 mb-12">Last updated: September 17, 2026</p>

      <div className="space-y-10 text-neutral-700 leading-relaxed">

        <section>
          <h2 className="h3 font-semibold mb-3">1. Who We Are</h2>
          <p>
            Scorched Studio (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the website{" "}
            <span className="font-medium">scorchedstudio.com</span> and the woodburning studio
            located at 218 E University Pkwy, Orem, UT 84058. This policy explains what information
            we collect, how we use it, and your rights regarding that information.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">2. Information We Collect</h2>
          <p className="mb-4">We collect information you provide directly when you:</p>
          <ul className="list-disc list-outside ml-5 space-y-2">
            <li>
              <strong>Make a booking</strong> — name, email address, phone number, party size, and
              payment information. Payment processing is handled by Stripe and we do not store your
              full card details.
            </li>
            <li>
              <strong>Sign a waiver</strong> — name, email, date of birth, phone number, and
              digital signature.
            </li>
            <li>
              <strong>Contact us</strong> — name, email, and the contents of your message.
            </li>
            <li>
              <strong>Join our email or text list</strong> — your email address, and your mobile
              number if you asked for texts, plus a record of the consent you gave. Email signup is
              on the waiver, at booking checkout, in our footer form, and in your account
              preferences. Text message signup is on the waiver, at booking checkout, and in your
              account preferences.
            </li>
          </ul>
          <p className="mt-4">
            We also automatically collect basic technical data when you visit our site (such as your
            browser type and IP address) through standard web server logs.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc list-outside ml-5 space-y-2">
            <li>To confirm and manage your studio booking</li>
            <li>To process payments and issue refunds</li>
            <li>To maintain required liability waiver records</li>
            <li>To send booking confirmations and reminders</li>
            <li>To respond to inquiries and customer service requests</li>
            <li>To send marketing emails or text messages, but only if you ticked the box asking for them, and you can opt out at any time</li>
            <li>To keep a record of marketing consent, so we can show what you agreed to and when</li>
            <li>To measure our advertising, as described in the cookies section below</li>
          </ul>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">4. How We Share Your Information</h2>
          <p className="mb-4">
            We do not sell your personal information. We may share it only with trusted service
            providers who help us operate our business:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2">
            <li><strong>Stripe</strong> for payment processing</li>
            <li><strong>Supabase</strong> for our database, where bookings, waivers, and list membership are stored</li>
            <li><strong>Resend</strong> for sending email, both confirmations and marketing</li>
            <li><strong>Telnyx</strong> for delivering text messages</li>
            <li><strong>Vercel</strong> for website hosting</li>
            <li><strong>Meta</strong> for advertising measurement, as described in the cookies section below</li>
            <li><strong>Google Analytics</strong> for understanding how the site is used, also described below</li>
          </ul>
          <p className="mt-4">
            Each of these processes your information only to provide that service to us. None of
            them are permitted to use it for their own marketing.
          </p>
          <p className="mt-4">
            We may also disclose your information if required by law or to protect the rights and
            safety of Scorched Studio, our customers, or the public.
          </p>
        </section>

        {/*
          id="sms" is linked from the opt-in checkboxes, the terms page, and the
          10DLC registration. The no-sharing sentences below are the ones carrier
          reviewers search for verbatim; keep both of them word for word.
        */}
        <section id="sms">
          <h2 className="h3 font-semibold mb-3">5. SMS / Text Messaging</h2>
          <p className="mb-4">
            We send marketing text messages about classes, courses, events, and offers, and only to
            people who have asked for them. The text message box on our waiver, our booking
            checkout, and the preferences page of a customer account is separate from the email
            box, is never ticked for you, and agreeing is never a condition of booking or buying
            anything. The signup form in our site footer collects email addresses only and never
            asks for a mobile number.
          </p>

          <h3 className="font-semibold mt-6 mb-2">What we collect for text messaging</h3>
          <ul className="list-disc list-outside ml-5 space-y-2">
            <li>Your mobile number</li>
            <li>The date and time you opted in</li>
            <li>Which form you opted in on: the waiver, the booking checkout, or your account preferences</li>
            <li>The IP address and browser the request came from</li>
            <li>The exact wording of the consent you were shown and agreed to</li>
          </ul>
          <p className="mt-4">
            We keep that record so we can show, if anyone asks, that you asked to hear from us and
            what you agreed to at the time.
          </p>

          <h3 className="font-semibold mt-6 mb-2">What we use it for</h3>
          <p className="mb-4">
            Your mobile number is used to send you the marketing texts you signed up for, and to
            honour STOP, START, and HELP replies. We also use it to recognise you if you reply to
            one of our messages with a question, so a person can answer you.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Your mobile information is not shared</h3>
          <p className="mb-4">
            <strong>
              No mobile information will be shared with third parties or affiliates for marketing or
              promotional purposes. Text messaging originator opt-in data and consent will not be
              shared with any third parties.
            </strong>
          </p>
          <p className="mb-4">
            The only company that receives your mobile number is the provider that delivers our
            messages for us, currently Telnyx. They process it solely to send the messages we ask
            them to send on our behalf, and they are not permitted to use it for anything else. Your
            number is never sold, rented, or passed to advertisers, data brokers, or affiliates.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Message frequency and cost</h3>
          <p className="mb-4">
            Message frequency varies. Message and data rates may apply. We do not charge for the
            messages themselves; your mobile carrier may.
          </p>

          <h3 className="font-semibold mt-6 mb-2">How to stop</h3>
          <p className="mb-4">
            <strong>Reply STOP</strong> to any text from us to opt out at any time. You will get
            one confirmation message and then nothing further. <strong>Reply START</strong> if you
            ever want to rejoin, or <strong>Reply HELP</strong> for help. If you have an account
            with us, you can turn emails and texts on and off yourself at any time from your
            account page. You can also email{" "}
            <a href="mailto:contact@scorchedstudio.com" className="underline hover:text-black">
              contact@scorchedstudio.com
            </a>{" "}
            and we will take you off the list by hand.
          </p>
          <p className="mb-4">
            For email, use the unsubscribe link at the bottom of any marketing message. It takes one
            click and needs no login.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Marketing is separate from booking mail</h3>
          <p className="mb-4">
            Opting out of marketing does not stop the messages you need, such as booking
            confirmations, waiver copies, and receipts. Those are sent because you made a booking,
            not because you joined a list.
          </p>

          <p>
            Our full{" "}
            <a href="/terms#sms" className="underline hover:text-black">
              SMS terms
            </a>{" "}
            set out the program, how to join, and the carrier liability disclaimer.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">6. Data Retention</h2>
          <p className="mb-4">
            Booking and waiver records are kept for as long as we need them for legal, accounting,
            and operational reasons. Marketing list membership is kept until you opt out.
          </p>
          <p className="mb-4">
            Records of marketing consent, including opt-outs, are kept even after you leave the
            list. That record is how we can show you asked to be messaged, and how we make sure an
            opt-out is not undone by a later import.
          </p>
          <p>
            To ask for a copy of your information, a correction, or deletion, email{" "}
            <a href="mailto:contact@scorchedstudio.com" className="underline hover:text-black">
              contact@scorchedstudio.com
            </a>
            . We will do it unless the law requires us to keep something, and we will tell you if
            that is the case.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">7. Cookies and Analytics</h2>
          <p className="mb-4">
            Our website uses functional cookies that are necessary for it to operate, such as
            keeping you signed in to your account.
          </p>
          <p className="mb-4">
            We also use the Meta (Facebook) Pixel so we can measure our advertising. It sets cookies
            and tells Meta which pages of our site were viewed, and when someone buys a membership it
            also reports the amount and the plan name. The pixel never receives your name, email
            address, or phone number from us. You can limit this through your browser settings, an ad
            blocker, or your Meta ad preferences.
          </p>
          <p className="mb-4">
            We use Google Analytics to understand how people find and move around the site, for
            example which pages are popular and which links are followed. It sets cookies and records
            page views, the approximate location your visit came from, and basic device and browser
            details. We do not send it your name, email address, or phone number.
          </p>
          <p>
            Neither of these tools is used with the information you gave us for text messaging. Your
            mobile number is never sent to Meta, to Google, or to any other advertising or analytics
            platform.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">8. Your Rights</h2>
          <p className="mb-4">You have the right to:</p>
          <ul className="list-disc list-outside ml-5 space-y-2">
            <li>Request a copy of the personal information we hold about you</li>
            <li>Request that we correct inaccurate information</li>
            <li>Request that we delete your information, subject to legal requirements</li>
            <li>Opt out of marketing communications at any time</li>
          </ul>
          <p className="mt-4">
            To exercise any of these rights, email us at{" "}
            <a href="mailto:contact@scorchedstudio.com" className="underline hover:text-black">
              contact@scorchedstudio.com
            </a>
            .
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">9. Children&apos;s Privacy</h2>
          <p>
            Our website is not directed at children under 13. We do not knowingly collect personal
            information from children. If you believe a child has provided us with their information,
            please contact us and we will delete it promptly.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. The date at the top of this page reflects
            the most recent revision. Continued use of our website after changes are posted
            constitutes acceptance of the updated policy.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">11. Contact Us</h2>
          <p>
            If you have questions about this privacy policy, or about our{" "}
            <a href="/terms" className="underline hover:text-black">
              terms of service
            </a>
            , please reach out:
          </p>
          <div className="mt-3 space-y-1">
            <p className="font-medium">Scorched Studio</p>
            <p>218 E University Pkwy, Orem, UT 84058</p>
            <p>
              <a href="mailto:contact@scorchedstudio.com" className="underline hover:text-black">
                contact@scorchedstudio.com
              </a>
            </p>
          </div>
        </section>

      </div>
    </section>
  );
}
