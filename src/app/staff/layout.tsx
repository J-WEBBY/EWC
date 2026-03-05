export const dynamic = 'force-dynamic';
// Allow server actions (e.g. triggerFullSync) to run up to 300s on Vercel Pro.
// Required for full Cliniko sync of large patient bases (9k+ records).
export const maxDuration = 300;

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
