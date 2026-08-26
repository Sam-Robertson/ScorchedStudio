// app/account/page.tsx
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";
import { formatDenverDate } from "@/lib/timezone";
import { CUSTOMER_SESSION_COOKIE, verifyCustomerSessionToken } from "@/lib/customer-session";
import { getBookingsByEmail } from "@/lib/customer-account";
import { getMembershipsByEmail, getPlanByKey } from "@/lib/memberships";
import { getCohortWithCourse, getEnrollmentsByEmail } from "@/lib/courses";
import CancelMembershipButton from "@/components/account/CancelMembershipButton";
import LogoutButton from "@/components/account/LogoutButton";

export const metadata = { title: "My Account | Scorched Studio" };
export const dynamic = "force-dynamic";

function fmtDate(dateStr: string): string {
  return new Date(dateStr + "T12:00:00").toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default async function AccountPage() {
  const token = (await cookies()).get(CUSTOMER_SESSION_COOKIE)?.value;
  const session = token ? verifyCustomerSessionToken(token) : null;
  if (!session) redirect("/account/login");

  const [bookings, memberships, enrollments] = await Promise.all([
    getBookingsByEmail(session.email),
    getMembershipsByEmail(session.email),
    getEnrollmentsByEmail(session.email),
  ]);

  const [plans, enrollmentDetails] = await Promise.all([
    Promise.all(memberships.map((m) => getPlanByKey(m.plan_key))),
    Promise.all(enrollments.map((e) => getCohortWithCourse(e.cohort_id))),
  ]);

  return (
    <main className="pb-20">
      <section className="pt-12 md:pt-16">
        <Container className="max-w-2xl">
          <div className="flex items-start justify-between gap-4 mb-8">
            <div className="min-w-0">
              <p className="eyebrow text-brand">Account</p>
              <h1 className="h2 font-bold">My Account</h1>
              <p className={`${vulfMono.className} text-xs text-neutral-400 mt-1 break-words`}>{session.email}</p>
            </div>
            <LogoutButton />
          </div>

          {/* Memberships */}
          <div className="mb-10">
            <h2 className="h3 font-bold mb-3">Memberships</h2>
            {memberships.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No memberships on file.</p>
            ) : (
              <div className="space-y-3">
                {memberships.map((m, i) => (
                  <div key={m.id} className="rounded-2xl border border-black/10 bg-white p-5">
                    <div className="flex items-center justify-between mb-2">
                      <p className="font-semibold text-neutral-900">{plans[i]?.name ?? m.plan_key}</p>
                      <span className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        m.status === "active" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                      }`}>
                        {m.status}
                      </span>
                    </div>
                    <p className={`${vulfMono.className} text-xs text-neutral-500 mb-1`}>
                      {m.entrances_remaining} entrance{m.entrances_remaining === 1 ? "" : "s"} remaining
                      {m.wood_credit_remaining_cents > 0 && ` · ${fmtCents(m.wood_credit_remaining_cents)} wood credit`}
                    </p>
                    {m.current_period_end && (
                      <p className={`${vulfMono.className} text-xs text-neutral-400 mb-3`}>
                        Renews {formatDenverDate(m.current_period_end)}
                      </p>
                    )}
                    {m.status === "active" && <CancelMembershipButton membershipId={m.id} />}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Course enrollments */}
          <div className="mb-10">
            <h2 className="h3 font-bold mb-3">Courses</h2>
            {enrollments.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No course enrollments on file.</p>
            ) : (
              <div className="space-y-3">
                {enrollments.map((e, i) => {
                  const found = enrollmentDetails[i];
                  return (
                    <div key={e.id} className="rounded-2xl border border-black/10 bg-white p-5">
                      <div className="flex items-center justify-between mb-1">
                        <p className="font-semibold text-neutral-900">
                          {found ? `${found.course.name} — ${found.cohort.label}` : "Course"}
                        </p>
                        <span className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                          e.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                        }`}>
                          {e.status}
                        </span>
                      </div>
                      <p className={`${vulfMono.className} text-xs text-neutral-400`}>{fmtCents(e.amount_paid_cents)} paid</p>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bookings */}
          <div>
            <h2 className="h3 font-bold mb-3">Bookings</h2>
            {bookings.length === 0 ? (
              <p className="text-sm text-neutral-400 italic">No bookings on file.</p>
            ) : (
              <div className="space-y-3">
                {bookings.map((b) => (
                  <div key={b.id} className="rounded-2xl border border-black/10 bg-white p-5">
                    <div className="flex items-center justify-between mb-1">
                      <p className="font-semibold text-neutral-900">
                        {fmtDate(b.date)} at {b.time_slot}
                      </p>
                      <span className={`${vulfMono.className} text-[10px] px-2 py-0.5 rounded-full font-semibold ${
                        b.status === "confirmed" ? "bg-green-100 text-green-700" : "bg-neutral-100 text-neutral-500"
                      }`}>
                        {b.status}
                      </span>
                    </div>
                    <p className={`${vulfMono.className} text-xs text-neutral-400`}>
                      {b.party_size} {b.party_size === 1 ? "person" : "people"} · {b.location === "orem" ? "Orem" : "Salt Lake City"}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </Container>
      </section>
    </main>
  );
}
