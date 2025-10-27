'use client';

import Image from 'next/image';
import Container from '@/components/ui/Container';
import RotatingWord from '@/components/RotatingWord';
import * as React from 'react';

const WORDS = [
  'Date Nights',
  'Team Activities',
  'Birthdays',
  'Youth Groups',
  'Weddings',
  'Church Groups',
];

// Keep arrays aligned with WORDS by index
const desktopImages = [
  '/images/kianaGroupBurning.jpg',
  '/images/handsBurningProjects.jpg',
  '/images/groupWithSign.jpg',
];

const mobileImages = [
  '/images/kianaGroupBurning.jpg',
  '/images/handsBurningProjects.jpg',
  '/images/groupWithSign.jpg',
];

const INTERVAL_MS = 3500;

export default function Hero() {
  const [idx, setIdx] = React.useState(0);

  // Single timer drives EVERYTHING (desktop images + mobile images + words)
  React.useEffect(() => {
    const id = setInterval(() => setIdx((i) => (i + 1) % WORDS.length), INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  // Mobile swipe
  const touch = React.useRef<number | null>(null);
  const onTouchStart = (e: React.TouchEvent) => (touch.current = e.touches[0].clientX);
  const onTouchEnd = (e: React.TouchEvent) => {
    const end = e.changedTouches[0].clientX;
    const start = touch.current ?? end;
    if (end - start > 40) setIdx((i) => (i - 1 + WORDS.length) % WORDS.length);
    if (start - end > 40) setIdx((i) => (i + 1) % WORDS.length);
    touch.current = null;
  };

  return (
    <section className="py-8 md:py-14">
      <Container>
        {/* Desktop: image carousel left, text right */}
        <div className="hidden md:grid grid-cols-2 gap-10 items-center">
          <div className="relative w-full rounded-2xl overflow-hidden" style={{ aspectRatio: '5 / 6' }}>
              {desktopImages.map((src, i) => (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  fill
                  sizes="(min-width:768px) 50vw, 100vw"
                  quality={90}
                  priority={i === 0}
                  className={`object-cover transition-opacity duration-500 ${
                    i === (idx % desktopImages.length) ? 'opacity-100' : 'opacity-0'
                  }`}
                  style={{ objectPosition: '50% 45%' }}
                />
              ))}
          </div>

          {/* RIGHT COLUMN — two-line title (Mono then Sans) */}
          <div className="flex flex-col items-center text-center">
            <h1 className="leading-[1.04] tracking-tight">
              {/* TOP LINE: Vulf Mono */}
              <span className="block font-display font-normal text-[36px] lg:text-[48px]">
                A studio that’s perfect for
              </span>

              {/* BOTTOM LINE: Vulf Sans + underline + rotating words (controlled) */}
              <span className="mt-3 block font-sans font-extrabold text-[56px] lg:text-[72px]">
                <span className="inline-block whitespace-nowrap border-b-4 lg:border-b-6 border-green pb-1">
                  <RotatingWord words={WORDS} index={idx} />
                </span>
              </span>
            </h1>
          </div>
        </div>

        {/* Mobile: image carousel + two-line title (shares same idx) */}
        <div className="md:hidden">
          <div
            className="relative w-full h-[42vh] min-h-[340px] max-h-[520px] rounded-2xl overflow-hidden mb-6"
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {mobileImages.map((src, i) => (
              <Image
                key={src}
                src={src}
                alt=""
                fill
                sizes="100vw"
                quality={90}
                priority={i === 0}
                className={`object-cover transition-opacity duration-500 ${i === idx % mobileImages.length ? 'opacity-100' : 'opacity-0'}`}
              />
            ))}

            <div className="absolute bottom-2 inset-x-0 flex justify-center gap-2">
              {WORDS.map((_, i) => (
                <button
                  key={i}
                  aria-label={`Go to slide ${i + 1}`}
                  onClick={() => setIdx(i)}
                  className={`h-2 w-2 rounded-full ${i === idx ? 'bg-white' : 'bg-white/60'}`}
                />
              ))}
            </div>
          </div>

          <h1 className="leading-[1.08] tracking-tight text-center">
            <span className="block font-display font-normal text-[34px]">
              A studio that’s perfect for
            </span>
            <span className="mt-2 block font-sans font-extrabold text-[40px]">
              <span className="inline-block border-b-4 border-green pb-1">
                <RotatingWord words={WORDS} index={idx} />
              </span>
            </span>
          </h1>
        </div>
      </Container>
    </section>
  );
}
