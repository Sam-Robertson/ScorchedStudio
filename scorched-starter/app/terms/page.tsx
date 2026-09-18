// app/terms/page.tsx
//
// Server component on purpose: A2P 10DLC reviewers fetch this URL and read the
// initial HTML. Anything rendered only after hydration may not be seen, and a
// missing SMS disclosure is a campaign rejection.
//
// The SMS Terms section is the part carriers actually check. Every clause in it
// is required by CTIA guidance: program description, how people opt in, message
// frequency, that rates may apply, STOP and HELP handling, that consent is not
// a condition of purchase, and the carrier liability disclaimer.
export const metadata = {
  title: "Terms of Service | Scorched Studio",
  description:
    "Terms of service for Scorched Studio, including SMS messaging terms for our text message program.",
};

export default function TermsPage() {
  return (
    <section className="container-px py-20 max-w-2xl mx-auto">
      <p className="eyebrow text-brand mb-2">Legal</p>
      <h1 className="h2 font-bold mb-2">Terms of Service</h1>
      <p className="text-sm text-neutral-400 mb-12">Last updated: September 17, 2026</p>

      <div className="space-y-10 text-neutral-700 leading-relaxed">

        <section>
          <h2 className="h3 font-semibold mb-3">1. About These Terms</h2>
          <p>
            These terms cover your use of scorchedstudio.com and the Scorched Studio woodburning
            studio at 218 E University Pkwy, Orem, UT 84058. By booking a session, signing our
            waiver, or joining one of our lists, you agree to them. If you do not agree, please do
            not use the site.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">2. Bookings and Payments</h2>
          <p className="mb-4">
            When you book a session you give us your name, email address, phone number, and party
            size. Card payments are processed by Stripe. We never see or store your full card
            number.
          </p>
          <p className="mb-4">
            You can manage a booking yourself using the link in your confirmation email, up until
            your session start time. Once a session has started or passed, it can no longer be
            changed online.
          </p>
          <p>
            If you cancel a card booking before it starts, the full amount is refunded automatically
            to your original payment method. Refunds typically appear within 5 to 10 business days.
            Bookings reserved with a gift card or a Get Out Pass are not charged online, so there is
            nothing to refund; those are settled in studio.
          </p>
          {/*
            TODO(sam): the paragraph above describes exactly what the code does today
            (app/api/bookings/manage/[id]/route.ts issues a full Stripe refund on any
            pre-session cancellation). Confirm that is the policy you actually want
            stated publicly. There is deliberately no late-cancellation, no-show, or
            partial-refund rule here because none exists anywhere in the codebase or
            site copy, and inventing one would be worse than leaving it out.
          */}
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">3. Waivers and Studio Safety</h2>
          <p className="mb-4">
            Woodburning involves heated tools. Everyone who burns must sign our liability waiver
            before taking part, and we keep that signed record on file. A parent or guardian signs
            on behalf of anyone under 18.
          </p>
          <p>
            Guests under 12 need a guardian present in the studio. Our team may stop anyone from
            using the equipment if they are being unsafe.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">4. Email Marketing</h2>
          <p>
            If you tick the email box on our waiver, booking checkout, or footer signup form, we
            will email you about new classes, events, and offers. Every marketing email has a
            one-click unsubscribe link at the bottom and our postal address, and unsubscribing takes
            effect immediately. Booking confirmations, waiver copies, and receipts are not marketing
            and keep arriving either way.
          </p>
        </section>

        {/*
          The section carriers read. Keep every clause. Removing any one of them
          can get the 10DLC campaign rejected or the number filtered.
        */}
        <section id="sms">
          <h2 className="h3 font-semibold mb-3">5. SMS Terms</h2>

          <h3 className="font-semibold mt-6 mb-2">The program</h3>
          <p className="mb-4">
            Scorched Studio runs a text message program that sends marketing messages about our
            classes, courses, studio events, and offers. It is run by Scorched Studio, a woodburning
            art studio at 218 E University Pkwy, Orem, UT 84058.
          </p>

          <h3 className="font-semibold mt-6 mb-2">How you join</h3>
          <p className="mb-4">
            You join by ticking the text message box in one of three places on our website: the
            digital waiver, the booking checkout, or the signup form in our site footer. That box is
            separate from the email box, is never ticked for you, and sits next to links to this
            page and our privacy policy. The wording you agree to is:
          </p>
          <blockquote className="mb-4 border-l-2 border-neutral-300 pl-4 italic">
            Text me about classes, events, and offers from Scorched Studio. Message frequency
            varies. Msg and data rates may apply. Reply STOP to opt out, HELP for help. Consent is
            not a condition of purchase.
          </blockquote>
          <p className="mb-4">
            We only message people who have ticked that box themselves. We do not buy phone numbers
            and we do not add people to the list on their behalf.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Frequency and cost</h3>
          <p className="mb-4">
            <strong>Message frequency varies.</strong>{" "}
            <strong>Message and data rates may apply.</strong> We do not charge you for these
            messages, but your mobile carrier may charge you for receiving them, depending on your
            plan.
          </p>

          <h3 className="font-semibold mt-6 mb-2">How to stop</h3>
          <p className="mb-4">
            <strong>Reply STOP</strong> to any text from us to cancel at any time. You will get
            one message confirming you have been unsubscribed, and after that we will not text you
            again. <strong>Reply START</strong> if you later want to rejoin, and you will start
            receiving messages again.
          </p>

          <h3 className="font-semibold mt-6 mb-2">How to get help</h3>
          <p className="mb-4">
            <strong>Reply HELP</strong> to any text for help, or email us at{" "}
            <a href="mailto:contact@scorchedstudio.com" className="underline hover:text-black">
              contact@scorchedstudio.com
            </a>{" "}
            and a person will get back to you.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Consent is not a condition of purchase</h3>
          <p className="mb-4">
            Agreeing to receive texts is never required to book a session, sign a waiver, buy
            anything, or take part in anything we run. You can leave the box unticked and use every
            part of our business normally.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Carriers are not liable</h3>
          <p className="mb-4">
            Mobile carriers are not liable for delayed or undelivered messages. Delivery depends on
            your carrier and your device, and we cannot guarantee that every message arrives.
          </p>

          <h3 className="font-semibold mt-6 mb-2">Your privacy</h3>
          <p>
            No mobile information will be shared with third parties or affiliates for marketing or
            promotional purposes. Our{" "}
            <a href="/privacy#sms" className="underline hover:text-black">
              privacy policy
            </a>{" "}
            explains exactly what we collect for text messaging, who processes it, and how long we
            keep it.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">6. Our Content</h2>
          <p>
            The photos, text, and designs on this site belong to Scorched Studio. Please do not
            reuse them commercially without asking us first. Artwork you make in the studio is
            yours.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">7. Disclaimers and Liability</h2>
          <p className="mb-4">
            We work hard to keep the information on this site accurate, but we provide it as is,
            without warranties of any kind. Studio availability, pricing, and class schedules can
            change.
          </p>
          <p>
            Taking part in studio activities is at your own risk, as described in the liability
            waiver you sign before burning. Nothing in these terms limits any right you have that
            cannot be limited under Utah or United States law.
          </p>
          {/*
            TODO(sam): this section is deliberately short and plain. A lawyer should
            review it, along with the liability waiver text, and decide whether you
            want a governing law and venue clause, a limitation of liability cap, and
            a dispute resolution clause. None of those are invented here.
          */}
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">8. Changes to These Terms</h2>
          <p>
            We may update these terms from time to time. The date at the top of this page shows the
            most recent revision. Continuing to use the site after a change means you accept the
            updated terms.
          </p>
        </section>

        <section>
          <h2 className="h3 font-semibold mb-3">9. Contact Us</h2>
          <p>Questions about these terms, or about our text message program:</p>
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
