// app/group-events/GroupPricingSection.tsx
"use client";

import React, { useState } from "react";
import Container from "@/components/ui/Container";
import { vulfMono } from "@/app/fonts";

type PriceTier = { range: string; price: string };

const STANDARD_TIERS: PriceTier[] = [
  { range: "<10 people", price: "$12 / person" },
  { range: "11–14 people",    price: "$11 / person" },
  { range: "15–25 people",    price: "$10 / person" },
  { range: "26–35 people",    price: "$9 / person"  },
  { range: "36–45 people",    price: "$8 / person"  },
  { range: "46+ people",      price: "$7 / person"  },
];

const CHURCH_TIERS: PriceTier[] = [
  { range: "11–14 people",  price: "$7 / person" },
  { range: "15–24 people", price: "$6 / person" },
  { range: "24+ people",    price: "$5 / person" },
];

export default function GroupPricingSection() {
  const [activeTab, setActiveTab] = useState<"church" | "standard">("standard");
  const isChurch = activeTab === "church";

  const tiers = isChurch ? CHURCH_TIERS : STANDARD_TIERS;
  const title = isChurch ? "Church Group Pricing" : "Group Pricing";

  return (
    <section className="mt-20 md:mt-20 py-8 md:py-12">
        <Container>
            <h2 className="h2 text-center font-bold">Group Pricing</h2>

            <p className="mt-4 md:mt-5 text-center font-display text-[17px] leading-relaxed">
            Pricing scales with group size.
            <br />
            Project selection happens in-studio.
            </p>

            {/* Extra spacing above tabs */}
            <div className="mx-auto mt-14 w-full max-w-3xl">
            <div className="rounded-3xl border border-green bg-white shadow-sm overflow-hidden">

                {/* Tabs */}
                <div className="flex border-b border-green/40 bg-neutral-50 px-4 pt-3">
                <TabButton
                    label="All groups"
                    active={!isChurch}
                    onClick={() => setActiveTab("standard")}
                />
                <TabButton
                    label="Church groups"
                    active={isChurch}
                    onClick={() => setActiveTab("church")}
                />
                </div>

                {/* Card body with more padding */}
                <div className="p-8 md:p-10">
                <PricingTable title={title} tiers={tiers} />
                </div>
            </div>
            </div>

            {/* Notes */}
            <ul className="mt-10 space-y-3 text-[15px] text-neutral-700 max-w-2xl mx-auto list-disc list-inside">
            <li>Drinks are available as an add-on for all groups.</li>
            <li>
                After-hours events or private studio reservations (closed to the public) include an
                additional charge.
            </li>
            </ul>
        </Container>
        </section>

  );
}

/* ---------- little browser-style tab button ---------- */

function TabButton({
    label,
    active,
    onClick,
  }: {
    label: string;
    active: boolean;
    onClick: () => void;
  }) {
    return (
      <button
        type="button"
        role="tab"
        aria-selected={active}
        className={[
          "relative mb-[-1px] rounded-t-2xl border border-transparent px-3 md:px-4",
          "py-1.5 text-xs md:text-sm font-semibold transition",
          active
            ? "bg-white border-green border-b-white text-green-800"
            : "text-neutral-600 hover:bg-neutral-100",
        ].join(" ")}
        onClick={onClick}
      >
        {label}
      </button>
    );
  }
  

/* ---------- table inside the card ---------- */

function PricingTable({ title, tiers }: { title: string; tiers: PriceTier[] }) {
    return (
      <>
        <h3 className="h3 text-center font-bold capitalize">{title}</h3>
  
        <div className="mt-10 grid grid-cols-[1fr_auto] gap-y-3 md:gap-y-6 text-sm md:text-xl">
          <div className="font-sans font-bold">Group Size</div>
          <div className="font-sans text-right font-bold">Rate</div>
  
          {tiers.map((t) => (
            <Row key={`${title}-${t.range}`} left={t.range} right={t.price} />
          ))}
        </div>
      </>
    );
  }
  

function Row({ left, right }: { left: string; right: string }) {
  return (
    <>
      <div className={vulfMono.className}>{left}</div>
      <div className={`${vulfMono.className} text-right`}>{right}</div>
    </>
  );
}
