import Container from '@/components/ui/Container';
import Image from 'next/image';

const imgs = [
  '/images/customers/customers9.jpg',
  '/images/customers/customers2.jpg',
  '/images/customers/customers6.jpg',
  '/images/customers/customers3.jpg',
  '/images/customers/customers7.jpg',
  '/images/customers/customers4.jpg',
  '/images/customers/customers8.jpg',
  '/images/customers/customers1.jpg'
];

export default function PastProjects() {
  return (
    <section id="past-projects" className="py-14 md:py-16">
      <Container>
        <h2 className="h2 text-center font-bold mb-8">Scorched IRL</h2>

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
