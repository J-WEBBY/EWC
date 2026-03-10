import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Jwebly Health — Setup',
  description: 'Set up your Jwebly Health workspace.',
};

// Each child page controls its own background
export default function OnboardLayout({ children }: { children: React.ReactNode }) {
  return <section style={{ minHeight: '100vh' }}>{children}</section>;
}
