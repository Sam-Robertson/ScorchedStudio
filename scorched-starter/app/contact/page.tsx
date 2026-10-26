// app/contact/page.tsx — server component so the studio picker can list the
// locations admins manage; the form itself lives in ContactPageForm.
import { vulfMono } from "@/app/fonts";
import ContactPageForm from "@/components/forms/ContactPageForm";
import { getLocationOptions } from "@/lib/locations";

export const metadata = {
  title: "Contact | Scorched Studio",
  description: "Questions about either Scorched Studio location? Send us a message or give us a call.",
};

export const dynamic = "force-dynamic";

export default async function ContactPage() {
  const locations = await getLocationOptions();

  return (
    <section className="container-px py-20 max-w-3xl mx-auto text-center">
      <h1 className="h1 mb-2 font-bold">Contact Us</h1>

      {/* Single-line subtitle (scrollable on very small screens) */}
      <p
          className={`${vulfMono.className} mx-auto text-center text-base md:text-lg tracking-[0.12em] md:tracking-[0.18em] text-neutral-800 md:whitespace-nowrap`}>
          OR GIVE US A CALL/TEXT{" "}
          <a href="tel:+18013619066" className="underline-offset-4 hover:underline whitespace-nowrap" aria-label="Call or text (801) 361-9066">
            (801)361–9066
          </a>
        </p>

      <ContactPageForm locations={locations} />
    </section>
  );
}
