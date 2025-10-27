import Container from '@/components/ui/Container';

export default function Hours() {
  return (
    <section className="py-14 bg-green text-white">
      <Container>
        <h2 className="text-4xl font-extrabold text-center mb-8">Hours</h2>

        <div className="grid grid-cols-2 max-w-lg mx-auto text-xl font-semibold gap-y-4">
          <div>Monday — Friday</div><div className="text-right">5pm – 10pm</div>
          <div>Saturday</div><div className="text-right">11am – 10pm</div>
        </div>

        <div className="mt-12 text-center">
          <div className="text-2xl font-extrabold">218 E University Pkwy</div>
          <div className="text-xl opacity-90">Orem UT</div>
          <a
            href="https://maps.apple.com/?q=218%20E%20University%20Pkwy%20Orem%20UT"
            target="_blank"
            className="inline-block mt-6 px-8 py-3 rounded-full bg-white text-black font-extrabold tracking-wide"
          >
            DIRECTIONS
          </a>
        </div>
      </Container>
    </section>
  );
}
