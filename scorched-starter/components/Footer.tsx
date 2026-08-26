// Server component: fetches location contact info so the footer can never
// diverge from what admins edit on /admin/locations. Pathname-based
// admin-route hiding needs a client hook, so the actual markup lives in
// FooterShell.
import { getLocations } from '@/lib/locations';
import FooterShell from './FooterShell';

export default async function Footer() {
  const locations = await getLocations();
  return <FooterShell locations={locations} />;
}
