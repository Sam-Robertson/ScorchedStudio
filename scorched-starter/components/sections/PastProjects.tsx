import Container from '@/components/ui/Container';
import Image from 'next/image';

const imgs = [
  '/images/customers/customers9.JPG',
  '/images/customers/customers1.JPG',
  '/images/customers/customers2.JPG',
  '/images/customers/customers3.JPG',
  '/images/customers/customers7.JPG',
  '/images/customers/customers4.JPG',
  '/images/customers/customers8.JPG',
  '/images/customers/customers6.JPG'
];

export default function PastProjects() {
  return (
    <section id="past-projects" className="py-14 md:py-16">
      <Container>
        <h2 className="h2 text-center font-bold mb-8">Amazing People</h2>

        {/* 2 rows on desktop: 4 columns -> 5 images = 3 on row 1, 2 on row 2 */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-5 md:gap-6">
          {imgs.map((src, i) => (
            <div
              key={i}
              className="relative aspect-square rounded-3xl overflow-hidden bg-neutral-200 ring-1 ring-black/10"
            >
              <Image
                src={src}
                alt=""
                fill
                className="object-cover"
                sizes="(min-width: 768px) 25vw, (min-width: 640px) 33vw, 50vw"
                priority={i < 2}
              />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
