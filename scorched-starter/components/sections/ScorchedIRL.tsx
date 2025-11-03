import Container from '@/components/ui/Container';
import Image from 'next/image';

type IRLPhoto = {
  src: string;
  alt?: string;
  /** CSS object-position: "<x> <y>" (e.g., "center 30%", "70% center") */
  focus?: string;
};

const photos: IRLPhoto[] = [
  { src: '/images/irl/irl1.jpg',          alt: 'Guests with boards',      focus: 'center 0%' },
  { src: '/images/irl/irl2.jpg',          alt: 'Studio portrait',         focus: 'center 30%' },
  { src: '/images/irl/logan.jpg',         alt: 'Logan holding sign',      focus: 'center 20%' }, // subject higher
  { src: '/images/irl/andreabookside.jpg',alt: 'Andrea with pouch',       focus: 'center 30%' }, // subject right
];

export default function ScorchedIRL() {
  return (
    <section id="scorched-irl" className="py-12">
      <Container>
        <h2 className="h2 text-center font-bold mb-6">Scorched IRL</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {photos.map(({ src, alt = '', focus = 'center center' }, i) => (
            <div key={i} className="relative aspect-[4/5] md:aspect-[4/5] rounded-2xl overflow-hidden bg-neutral-200">
              <Image
                src={src}
                alt={alt}
                fill
                className="object-cover"
                style={{ objectPosition: focus }}
                sizes="(min-width: 768px) 25vw, 50vw"
                priority={i === 0}
              />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
