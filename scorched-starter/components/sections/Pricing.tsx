import Container from '@/components/ui/Container';
import { Fragment } from 'react';

const items = [
  ['Wood disc', '$15'],
  ['Key holder', '$15'],
  ['Ring', '$15'],
  ['Jewelry box', '$15'],
  ['Plate', '$15'],
  ['Cutting board', '$15'],
  ['Bracelet', '$15'],
];

export default function Pricing() {
  return (
    <section className="py-12">
      <Container>
        <div className="rounded-3xl border border-green p-6 md:p-10 shadow-sm bg-white">
          <h2 className="h2 text-center">Pricing</h2>
          <p className="mt-2 text-center font-display">$12 studio fee + your project price</p>

          <div className="mt-8 grid grid-cols-2 gap-y-3 text-lg">
            <div className="font-display">Product</div>
            <div className="font-display text-right">Price</div>
            {items.map(([name, price], i) => (
              <Fragment key={i}>
                <div className="font-sans">{name}</div>
                <div className="font-sans text-right">{price}</div>
              </Fragment>
            ))}
          </div>
        </div>
      </Container>
    </section>
  );
}
