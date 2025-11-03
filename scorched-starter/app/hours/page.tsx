// app/hours/page.tsx
import Pricing from "@/components/sections/Pricing";
import Hours from "@/components/sections/Hours";

export default function HoursAndPricingPage() {
  return (
    <main className="pb-16">
      <div className="my-8 md:my-10">
        <Pricing />
      </div>
      <Hours />
    </main>
  );
}
