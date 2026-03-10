import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jwebly Health — Activate',
  description: 'Activate your Jwebly Health Operational Intelligence workspace.',
};

export default function ActivateLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ minHeight: '100vh', width: '100%', background: '#FAF8F5' }}>
      {children}
    </section>
  );
}
