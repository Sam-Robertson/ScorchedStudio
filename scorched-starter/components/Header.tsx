// components/Header.tsx — server component: fetches locations for the
// Studio Locations dropdown so the nav can't list a location that doesn't
// exist (or miss one that was added) independently of the interactive
// markup, which lives in HeaderShell.
import { getLocations } from "@/lib/locations";
import HeaderShell from "./HeaderShell";

export default async function Header() {
  const locations = await getLocations();
  return <HeaderShell locations={locations} />;
}
