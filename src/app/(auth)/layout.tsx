import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Secure Uplink | Sovereign Core',
  description: 'Authentication gateway for the Sovereign AI System.',
};

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <section className="min-h-screen w-full bg-[#020202] selection:bg-[#F0EDE5]">
      {/* This layout ensures the auth pages (Login/Signup) 
          are isolated from the rest of the application's 
          navigation logic.
      */}
      <div className="flex flex-col min-h-screen">
        {/* Optional: Subtle top-right status indicator */}
        <div className="absolute top-8 right-8 z-50 pointer-events-none">
          <div className="flex items-center gap-2">
            <span className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-[10px] font-mono text-zinc-600 uppercase tracking-[0.2em]">
              Node_Primary_Active
            </span>
          </div>
        </div>

        <main className="flex-grow flex items-center justify-center relative">
          {children}
        </main>

        {/* Minimal Footer for Legal/Security */}
        <footer className="p-8 flex justify-between items-center relative z-10">
          <div className="text-[9px] font-mono text-zinc-800 uppercase tracking-widest">
            © 2026 Jwebly // Protocol MVP 1.0
          </div>
          <div className="flex gap-4">
             <div className="h-[1px] w-8 bg-zinc-900 self-center" />
             <span className="text-[9px] font-mono text-zinc-800 uppercase tracking-widest">
               Encrypted Session
             </span>
          </div>
        </footer>
      </div>
    </section>
  );
}