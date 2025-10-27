import Container from '@/components/ui/Container';

const faqs = [
  {
    q: 'Are Entry Fees refundable if I cancel my appointment?',
    a: "Yes! Just cancel at least 8 hours in advance. We reserve table space for you and want to give others a chance to grab the spot if you can't make it."
  },
  { q: 'Do you take walk-ins?', a: "Yes! As long as we have table space, we'd love to have you." },
  { q: 'If I want to stay longer than my 75 min appointment, can I?', a: 'As long as there are not any customers waiting for a burner, stay forever!' },
  { q: 'Are there age limits?', a: 'All ages are welcome when a parent or guardian is present to supervise.' },
  { q: 'How do I book if I have the Get Out Pass?', a: "Just walk in! If you're worried about there being space, send us a text with the details and we’ll set aside a spot." },
];

export default function FAQ(){
  return (
    <section className="py-14">
      <Container className="max-w-2xl">
        <h2 className="text-4xl font-extrabold text-center">FAQ’s</h2>
        <p className="text-center text-neutral-600 mt-1">Lets clear the smoke</p>

        <div className="mt-8 space-y-4">
          {faqs.map(({ q, a }) => (
            <details key={q} className="rounded-2xl bg-[#F8E6E3] open:bg-[#F8E6E3] p-4 md:p-5 border">
              <summary className="cursor-pointer list-none font-extrabold text-lg">
                {q}
              </summary>
              <p className="mt-3 text-neutral-800 leading-relaxed">{a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}
