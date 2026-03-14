import Container from '@/components/ui/Container';
import { Fragment } from 'react';

const items = [
  ['Ring', '$5'],
  ['Wood Disc', '$6'],
  ['Bracelet', '$7'],
  ['Jewelry Box', '$8-$12'],
  ['Plate', '$10'],
  ['Cutting Board', '$14'],
  ['Leather Book', '$14'],
  ['Cup', '$14'],
  ['Wallet', '$16'],
  ['Coaster Set', '$16'],
];

export default function Pricing() {
  return (
    <section className="py-12">
      <Container>
        <div className="mx-auto max-w-xl md:max-w-2xl">
          <div className="rounded-3xl border border-green bg-white p-6 shadow-sm md:p-10">
            <h2 className="h2 text-center font-bold">Pricing</h2>

            <p className="mt-2 text-center font-display">
              Entry <span className="font-bold">$15</span> + your project price
            </p>

            <p className="mx-auto mt-2 max-w-lg text-center text-sm font-display leading-snug opacity-70">
              Includes: Drink • Polaroid • Wood Wax Finish
            </p>


            {/* change 1: tighter spacing above table */}
            {/* change 2: tabular numerals for cleaner price alignment */}
            <div className="mt-6 grid grid-cols-[1fr_auto] gap-y-3 text-lg tabular-nums">
              <div className="font-sans font-bold">Product</div>
              <div className="font-sans text-right font-bold">Price</div>

              {items.map(([name, price], i) => (
                <Fragment key={i}>
                  <div className="font-display">{name}</div>
                  <div className="font-display text-right">{price}</div>
                </Fragment>
              ))}
            </div>
          </div>
        </div>
      </Container>
    </section>
  );
}
