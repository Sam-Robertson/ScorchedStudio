import Container from '@/components/ui/Container';
import { Fragment } from 'react';

const items = [
  ['Wood Disc', '$5'],
  ['Ring', '$6'],
  ['Jewelry Box', '$8'],
  ['Plate', '$8'],
  ['Bracelet', '$8'],  
  ['Cutting Board', '$10'],      
  ['Leather Book', '$12'],
  ['Cup', '$12'],
  ['Wallet', '$15'],
  ['Coaster Set', '$15'],
];

export default function Pricing() {
  return (
    <section className="py-12">
      <Container>
        <div className="mx-auto max-w-xl md:max-w-2xl">
          <div className="rounded-3xl border border-green p-6 md:p-10 shadow-sm bg-white">
            <h2 className="h2 text-center font-bold">Pricing</h2>
            <p className="mt-2 text-center font-display">
              $12 studio fee + your project price
            </p>

            <div className="mt-8 grid grid-cols-[1fr_auto] gap-y-3 text-lg">
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
