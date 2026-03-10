import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jwebly Health — Setup',
  description: 'Set up your Jwebly Health workspace.',
};

export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <section style={{ minHeight: '100vh', background: '#FAF8F5' }}>
      {children}
    </section>
  );
}
