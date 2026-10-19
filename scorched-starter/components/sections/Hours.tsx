import Container from '@/components/ui/Container';
import { getLocationByKey, getPublicBusinessHours, getUpcomingSpecialDates, DAY_LABELS, formatClockTime } from '@/lib/locations';

// Reads live from the same `locations` / `business_hours` tables as
// /locations, so the homepage can't drift out of sync with an admin edit.
export default async function Hours() {
  const [orem, hours, special] = await Promise.all([
    getLocationByKey('orem'),
    getPublicBusinessHours('orem'),
    getUpcomingSpecialDates(),
  ]);
  const sorted = [...hours].sort((a, b) => a.weekday - b.weekday);

  return (
    <section className="py-14 bg-green text-white">
      <Container>
        <h2 className="text-4xl font-extrabold text-center mb-8">Hours</h2>

        {sorted.length > 0 && (
          <div className="grid grid-cols-2 max-w-lg mx-auto text-xl font-semibold gap-y-4">
            {sorted.map((d) => (
              <div key={d.weekday} className="contents">
                <div>{DAY_LABELS[d.weekday]}</div>
                <div className="text-right">
                  {d.is_open ? `${formatClockTime(d.open_time)} – ${formatClockTime(d.close_time)}` : 'Closed'}
                </div>
              </div>
            ))}
          </div>
        )}

        {special.length > 0 && (
          <div className="max-w-lg mx-auto mt-10">
            <h3 className="text-center text-2xl font-extrabold mb-4">Holiday Hours</h3>
            <div className="grid grid-cols-2 text-xl font-semibold gap-y-3">
              {special.map((s) => (
                <div key={s.date} className="contents">
                  <div>
                    {new Date(s.date + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    {s.reason && <span className="block text-sm font-normal opacity-80">{s.reason}</span>}
                  </div>
                  <div className="text-right">
                    {s.open_time && s.close_time
                      ? `${formatClockTime(s.open_time)} – ${formatClockTime(s.close_time)}`
                      : 'Closed'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-12 text-center">
          {orem?.address && (
            <>
              <div className="text-2xl font-extrabold">{orem.address}</div>
              <a
                href={`https://maps.apple.com/?q=${encodeURIComponent(orem.address)}`}
                target="_blank"
                className="inline-block mt-6 px-8 py-3 rounded-full bg-white text-black font-extrabold tracking-wide"
              >
                DIRECTIONS
              </a>
            </>
          )}
        </div>
      </Container>
    </section>
  );
}
