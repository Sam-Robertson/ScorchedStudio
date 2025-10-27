import Container from '@/components/ui/Container';
import Link from 'next/link';

export default function GroupEvents(){
  return (
    <section className="py-14">
      <Container className="text-center max-w-2xl">
        <h2 className="text-4xl font-extrabold">Group events</h2>
        <p className="mt-2 text-neutral-700">Let us make your event a success! Let us know how we can help.</p>

        <ul className="text-left list-disc pl-6 mt-6 space-y-2">
          <li><Link href="/events/corporate" className="underline font-semibold">Corporate Events</Link></li>
          <li><Link href="/events/church" className="underline font-semibold">Church Activities</Link></li>
          <li><Link href="/events/birthdays" className="underline font-semibold">Birthday Parties</Link></li>
          <li><Link href="/events/girls-boys-night" className="underline font-semibold">Girls/Boys Night Out</Link></li>
          <li><Link href="/events/weddings" className="underline font-semibold">Weddings</Link></li>
        </ul>

        <Link
          href="/contact"
          className="inline-block mt-8 px-8 py-3 rounded-full bg-green text-white font-extrabold tracking-wider"
        >
          START THIS PARTY
        </Link>
      </Container>
    </section>
  );
}
