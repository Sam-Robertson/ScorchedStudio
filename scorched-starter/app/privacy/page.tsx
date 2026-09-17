// app/privacy/page.tsx
export const metadata = {
  title: "Privacy Policy | Scorched Studio",
  robots: "noindex",
};

export default function PrivacyPage() {
  return (
    <section className="container-px py-20 max-w-2xl mx-auto">
      <p className="eyebrow text-brand mb-2">Legal</p>
      <h1 className="h2 font-bold mb-2">Privacy Policy</h1>
      <p className="text-sm text-neutral-400 mb-12">Last updated: April 3, 2025</p>

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
              <strong>Sign up for our VIP list or text marketing</strong> — email address or phone
              number.
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
            <li>To send promotional emails or texts if you have opted in (you may opt out at any time)</li>
            <li>To improve our website and services</li>
          </ul>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">4. How We Share Your Information</h2>
          <p className="mb-4">
            We do not sell your personal information. We may share it only with trusted service
            providers who help us operate our business:
          </p>
          <ul className="list-disc list-outside ml-5 space-y-2">
            <li><strong>Stripe</strong> — payment processing</li>
            <li><strong>Resend</strong> — transactional email delivery</li>
            <li><strong>Supabase</strong> — secure database hosting</li>
            <li><strong>Sendblue</strong> — text message delivery</li>
          </ul>
          <p className="mt-4">
            We may also disclose your information if required by law or to protect the rights and
            safety of Scorched Studio, our customers, or the public.
          </p>
        </section>

        <section id="sms-terms">
          <h2 className="h3 font-semibold mb-3">5. Email and Text Message Marketing</h2>
          <p className="mb-4">
            We send marketing email and text messages only to people who have asked for them. The
            opt-in boxes on our waiver, booking, and signup forms are never pre-ticked, and agreeing
            is never a condition of booking or buying anything.
          </p>

          <h3 className="font-semibold mt-6 mb-2">What we collect</h3>
          <p className="mb-4">
            For marketing we store your email address, your mobile number if you asked for texts,
            your name, and a record of each time you opted in or out. That record includes the exact
            wording you agreed to, the date, and the IP address and browser the request came from,
            which is how we can show that a message was requested.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Your mobile information is not sold or shared</h3>
          <p className="mb-4">
            <strong>
              No mobile information will be shared with third parties or affiliates for marketing or
              promotional purposes.
            </strong>{' '}
            We share your number only with the messaging provider that delivers our texts, and only
            so that it can deliver them. Text message opt-in data is never sold, rented, or passed on
            to anyone else.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Message frequency and cost</h3>
          <p className="mb-4">
            Message frequency varies. Message and data rates may apply. We do not charge for the
            messages themselves; your mobile carrier may.
          </p>

          <h3 className="font-semibold mt-6 mb-2">How to stop</h3>
          <p className="mb-4">
            Reply <strong>STOP</strong> to any text from us to be removed straight away. You will get
            one confirmation message and then nothing further. Reply <strong>START</strong> if you
            ever want to come back, or <strong>HELP</strong> to reach us. For email, use the
            unsubscribe link at the bottom of any marketing message, which takes one click and needs
            no login. You can also email{' '}
            <a href="mailto:contact@scorchedstudio.com" className="underline">contact@scorchedstudio.com</a>{' '}
            and we will take you off either list by hand.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Marketing is separate from booking mail</h3>
          <p>
            Opting out of marketing does not stop the messages you need, such as booking
            confirmations, waiver copies, and receipts. Those are sent because you made a booking,
            not because you joined a list.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">6. Data Retention</h2>
          <p>
            Booking and waiver records are retained for as long as necessary to fulfill legal,
            accounting, and operational requirements. If you would like your information deleted,
            please contact us and we will do so unless we are required to retain it by law.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">7. Cookies</h2>
          <p>
            Our website uses only functional cookies necessary for the site to operate. We do not
            use advertising or tracking cookies.
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
            If you have questions about this privacy policy, please reach out:
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
