import { NextRequest, NextResponse } from 'next/server';

/**
 * EWC Operational Intelligence — Single-Tenant Middleware
 *
 * Single clinic deployment: ewc.jweblyhealth.app
 * - Root / → /login
 * - Security headers on all routes
 * - x-tenant-slug header injected for server components
 */

const ROOT_DOMAIN = process.env.NEXT_PUBLIC_ROOT_DOMAIN ?? '';

function extractSubdomain(host: string): string | null {
  const bare = host.split(':')[0];

  if (bare.endsWith('.localhost')) {
    const sub = bare.slice(0, -'.localhost'.length);
    if (!sub || sub === 'www') return null;
    return sub;
  }

  if (!ROOT_DOMAIN) return null;
  if (bare === ROOT_DOMAIN) return null;

  if (bare.endsWith(`.${ROOT_DOMAIN}`)) {
    const sub = bare.slice(0, -(ROOT_DOMAIN.length + 1));
    if (!sub || sub === 'www') return null;
    return sub;
  }

  return null;
}

export function middleware(request: NextRequest) {
  const host  = request.headers.get('host') ?? '';
  const { pathname } = request.nextUrl;
  const subdomain = extractSubdomain(host);

  const requestHeaders = new Headers(request.headers);

  if (subdomain) {
    requestHeaders.set('x-tenant-slug', subdomain);
    requestHeaders.set('x-tenant-host', host);
  }

  // Root → login
  if (pathname === '/') {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const res = NextResponse.next({ request: { headers: requestHeaders } });
  res.headers.set('X-Robots-Tag',          'noindex, nofollow');
  res.headers.set('X-Content-Type-Options', 'nosniff');
  res.headers.set('X-Frame-Options',        'DENY');
  res.headers.set('Referrer-Policy',        'strict-origin-when-cross-origin');
  res.headers.set('X-DNS-Prefetch-Control', 'off');

  return res;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)'],
};
