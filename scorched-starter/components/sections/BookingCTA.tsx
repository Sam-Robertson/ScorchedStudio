import Container from '@/components/ui/Container';
import Button from '@/components/ui/Button';
export default function BookingCTA() {
  return (
    <section className="py-12 bg-neutral-100">
      <Container className="text-center">
        <h2 className="text-2xl font-bold">Ready to make something?</h2>
        <div className="mt-4 flex justify-center">
          <Button>Book now</Button>
        </div>
      </Container>
    </section>
  );
}
