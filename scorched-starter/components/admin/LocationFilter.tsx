"use client";

// components/admin/LocationFilter.tsx
//
// The "All locations" filter on the admin list pages. A native select draws
// its arrow flush against the right border and ignores padding, so the arrow
// is hidden and a chevron drawn in its place. Each page passes the box styling
// (border, padding, text size) so the control matches the buttons beside it.
import { ChevronDown } from "lucide-react";

export type LocationFilterValue = "" | "orem" | "slc";

export default function LocationFilter({
  value,
  onChange,
  className = "",
}: {
  value: LocationFilterValue;
  onChange: (value: LocationFilterValue) => void;
  className?: string;
}) {
  return (
    <div className="relative">
      <select
        aria-label="Filter by location"
        className={`${className} w-full appearance-none pr-9 cursor-pointer outline-none focus:border-black/40`}
        value={value}
        onChange={(e) => onChange(e.target.value as LocationFilterValue)}
      >
        <option value="">All locations</option>
        <option value="orem">Orem</option>
        <option value="slc">Salt Lake City</option>
      </select>
      <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-neutral-400 pointer-events-none" />
    </div>
  );
}
