import { NextRequest, NextResponse } from 'next/server';

/**
 * Jwebly Health — Tenant Subdomain Middleware
 *
 * How it works:
 *  - Root domain (jwebly.app)       → onboarding + activation flow
 *  - Tenant subdomain ({slug}.jwebly.app) → clinic staff portal
 *
 * Set NEXT_PUBLIC_ROOT_DOMAIN=jwebly.app in Vercel to activate.
 * In dev/staging (env var not set): no subdomain routing, all routes accessible.
 *
 * Isolation guarantees:
 *  - x-tenant-slug header injected → server components know which tenant
 *  - Tenant portals are noindex/nofollow (not searchable)
 *  - Onboarding routes blocked on subdomains
 *  - /staff routes blocked on root domain in production
 *  - Unknown subdomains: server component returns 404 (no data leaks)
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '';

function extractSubdomain(host: string): string | null {
  if (!ROOT_DOMAIN) return null; // env not set → dev mode, no subdomain routing

  const bare = host.split(':')[0]; // strip port

  // Exact root domain — no subdomain
  if (bare === ROOT_DOMAIN) return null;

  // {slug}.jwebly.app
  if (bare.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = bare.slice(0, -(ROOT_DOMAIN.length + 1));
    if (!sub || sub === 'www') return null;
    return sub;
  }

  return null;
}

// Routes that are only accessible on the root domain (onboarding flow)
const ROOT_ONLY_PATHS = ['/onboard', '/activate', '/onboard/welcome'];

// Routes that require a tenant subdomain in production
const SUBDOMAIN_REQUIRED_PATHS = ['/staff', '/login'];

export function middleware(request: NextRequest) {
  const host  = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;
  const subdomain = extractSubdomain(host);

  // Clone request headers so we can inject context for server components
  const requestHeaders = new Headers(request.headers);

  if (subdomain) {
    // ── TENANT SUBDOMAIN ({slug}.jwebly.app) ────────────────────────────────

    // Inject tenant context — read in server components via headers()
    requestHeaders.set('x-tenant-slug', subdomain);
    requestHeaders.set('x-tenant-host', host);

    // Onboarding + activation are root-domain only
    if (ROOT_ONLY_PATHS.some(p => pathname.startsWith(p))) {
      return NextResponse.redirect(new URL(`https://${ROOT_DOMAIN}`));
    }

    const res = NextResponse.next({ request: { headers: requestHeaders } });

    // Security: no search engine indexing of tenant portals
    res.headers.set('X-Robots-Tag',          'noindex, nofollow');
    res.headers.set('X-Content-Type-Options', 'nosniff');
    res.headers.set('X-Frame-Options',        'DENY');
    res.headers.set('Referrer-Policy',        'strict-origin-when-cross-origin');
    res.headers.set('X-DNS-Prefetch-Control', 'off');

    return res;
  }

  // ── ROOT DOMAIN (jwebly.app or localhost) ───────────────────────────────────

  // In production: staff portal must be accessed via subdomain
  if (ROOT_DOMAIN && process.env.NODE_ENV === 'production') {
    if (SUBDOMAIN_REQUIRED_PATHS.some(p => pathname.startsWith(p))) {
      // User is on root domain trying to access staff portal — redirect to hint page
      return NextResponse.redirect(new URL('/use-clinic-url', request.url));
    }
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options',        'DENY');
  res.headers.set('Referrer-Policy',        'strict-origin-when-cross-origin');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
