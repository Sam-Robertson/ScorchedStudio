import Container from '@/components/ui/Container';
import Image from 'next/image';

const imgs = ['/images/projects/proj-1.jpg','/images/projects/proj-2.jpg','/images/projects/proj-3.jpg','/images/projects/proj-4.jpg','/images/projects/proj-5.jpg'];

export default function PastProjects() {
  return (
    <section id="past-projects" className="py-12">
      <Container>
        <h2 className="h2 text-center font-bold mb-6">Amazing People</h2>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {imgs.map((src, i) => (
            <div key={i} className="relative aspect-square rounded-2xl overflow-hidden bg-neutral-200">
              <Image src={src} alt="" fill className="object-cover" sizes="(min-width:768px) 20vw, 50vw" />
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}
