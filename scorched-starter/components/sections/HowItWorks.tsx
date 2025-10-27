// components/sections/HowItWorks.tsx
import Container from '@/components/ui/Container';
import Image from 'next/image';

const steps = [
  {
    n: 1,
    title: 'Book an appointment',
    text: 'Walk-ins welcome if there’s space, but booking guarantees a burner.',
    svg: '/illustrations/StepOne.svg',
    alt: 'Calendar with checkmark',
  },
  {
    n: 2,
    title: 'Pick a project',
    text: 'Boards, boxes, bracelets—stencils and help provided so you’ll love the result.',
    svg: '/illustrations/StepTwo.svg',
    alt: 'Hand choosing a project',
  },
  {
    n: 3,
    title: 'Burn away, baby',
    text: 'We’ll guide you step-by-step. You bring the vibes.',
    svg: '/illustrations/StepThree.svg',
    alt: 'Woodburning pen making a design',
  },
];

export default function HowItWorks() {
  return (
    <section className="py-12 bg-cream">
      <Container>
        {/* Mobile: your current stacked rows (text + small illustration per row) */}
        <div className="md:hidden space-y-10">
          {steps.map((s, i) => (
            <div
              key={s.n}
              className={`grid grid-cols-1 gap-6 items-center ${i !== steps.length - 1 ? 'pb-2' : ''}`}
            >
               {/* Illustration (smaller box like you set) */}
               <div className="rounded-2xl p-3">
                <div className="relative mx-auto w-full max-w-[220px] h-32">
                  <Image
                    src={s.svg}
                    alt={s.alt}
                    fill
                    className="object-contain"
                    sizes="220px"
                  />
                </div>
              </div>
              {/* Text */}
              <div>
                <h3 className="h3 font-bold">
                  {s.n}. {s.title}
                </h3>
                <p className="text-sm font-sans text-neutral-700 mt-2">{s.text}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop: one horizontal row with three columns */}
        <div className="hidden md:grid grid-cols-3 gap-16">
          {steps.map((s) => (
            <div key={s.n} className="flex flex-col items-center text-center">
              {/* Icon */}
              <div className="relative w-24 h-24 md:w-28 md:h-28 mb-4">
                <Image
                  src={s.svg}
                  alt={s.alt}
                  fill
                  className="object-contain"
                  sizes="112px"
                />
              </div>

              {/* Text */}
              <h3 className="h3 font-bold">
                {s.n}. {s.title}
              </h3>
              <p className="mt-2 text-[12.5px] font-display text-neutral-700 max-w-xs">
                {s.text}
              </p>
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
