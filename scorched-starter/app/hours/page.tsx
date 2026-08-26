// app/hours/page.tsx
// "Hours & Pricing" moved to /locations (per-location hours/pricing/phone,
// with a coming-soon state for unopened locations). Redirect old links.
import { redirect } from "next/navigation";

export default function HoursAndPricingPage() {
  redirect("/locations");
}
