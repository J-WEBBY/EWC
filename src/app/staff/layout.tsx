export const dynamic = 'force-dynamic';

export default function StaffLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="theme-dark" style={{ backgroundColor: '#0A0A0A', minHeight: '100vh' }}>
      {children}
    </div>
  );
}
