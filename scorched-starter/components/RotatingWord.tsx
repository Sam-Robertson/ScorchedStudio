'use client';

import * as React from 'react';

export default function RotatingWord({
  words,
  /** If provided, RotatingWord becomes controlled (no internal timer). */
  index,
  /** Used only when `index` is undefined. */
  interval = 2500,
  className = '',
}: {
  words: string[];
  index?: number;
  interval?: number;
  className?: string;
}) {
  const [i, setI] = React.useState(0);
  const active = index ?? i;

  React.useEffect(() => {
    if (index !== undefined) return; // controlled mode – parent drives it
    const id = setInterval(() => setI((x) => (x + 1) % words.length), interval);
    return () => clearInterval(id);
  }, [index, interval, words.length]);

  return (
    <span className={`relative inline-block ${className}`}>
      <span
        key={active}
        className="block animate-[fadeSlide_500ms_ease] will-change-transform"
      >
        {words[active]}
      </span>
      <style jsx>{`
        @keyframes fadeSlide {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </span>
  );
}
