import Container from '@/components/ui/Container';
import Image from 'next/image';

const imgs = ['/images/irl/irl-1.jpg','/images/irl/irl-2.jpg','/images/irl/irl-3.jpg','/images/irl/irl-4.jpg'];

export default function ScorchedIRL() {
  return (
    <section id="scorched-irl" className="py-12">
      <Container>
        <h2 className="h2 text-center mb-6">Scorched IRL</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {imgs.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden bg-neutral-200">
              <Image src={src} alt="" fill className="object-cover" sizes="(min-width:768px) 25vw, 50vw" />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
