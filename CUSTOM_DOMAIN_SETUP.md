# Custom Domain Setup Guide

## Overview

The branding configuration **stores** the custom domain in the database, but does NOT automatically route traffic to it. To actually use a custom domain, you need infrastructure-level configuration.

---

## Current Behavior

### What Branding Does ✅

- Stores `customDomain` value (e.g., "portal.uoo.co.uk") in database
- Applies visual white-labeling (colors, logo, favicon, system name)
- Allows the system to "know" what domain it should be on

### What Branding Does NOT Do ❌

- Does NOT redirect users to the custom domain
- Does NOT configure DNS records
- Does NOT set up SSL certificates
- Does NOT create server routing rules

---

## To Actually Enable Custom Domains

You need a **multi-tenant domain routing system**. Here are the options:

### Option 1: Subdomain Per Tenant (Easiest)

**Pattern:** `[tenant-slug].yourapp.com`

Examples:
- `oldbury.jwebly.com`
- `acme.jwebly.com`
- `globex.jwebly.com`

**Setup:**
1. Create wildcard DNS record: `*.jwebly.com → Your Server IP`
2. Get wildcard SSL: `*.jwebly.com`
3. Update Next.js middleware to route based on subdomain

**Implementation:**

```typescript
// middleware.ts
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const hostname = request.headers.get('host') || '';

  // Extract subdomain
  const subdomain = hostname.split('.')[0];

  // Skip for main domain
  if (subdomain === 'jwebly' || subdomain === 'www') {
    return NextResponse.next();
  }

  // Look up tenant by subdomain
  // Add tenant context to request
  // ... routing logic
}
```

---

### Option 2: Custom Domain Per Tenant (Advanced)

**Pattern:** Each tenant uses their own domain

Examples:
- `portal.uoo.co.uk` (University of Oldbury)
- `recruit.acme.com` (Acme Recruitment)
- `workspace.globex.io` (Globex Corp)

**Requirements:**
1. **DNS Configuration** - Each tenant must point their domain to your server
2. **SSL Certificates** - Automatic SSL via Let's Encrypt or Cloudflare
3. **Domain Verification** - Prove tenant owns the domain
4. **Server Routing** - Map incoming domain to tenant

**Services That Handle This:**
- **Vercel** - Built-in custom domain support with automatic SSL
- **Cloudflare Workers** - Multi-tenant routing with SSL
- **AWS CloudFront** - Custom domain routing
- **Custom Server** - Nginx/Traefik with automatic SSL (Let's Encrypt)

**Implementation (Vercel Example):**

```typescript
// vercel.json
{
  "version": 2,
  "routes": [
    {
      "src": "/(.*)",
      "headers": {
        "X-Forwarded-Host": "$host"
      },
      "dest": "/"
    }
  ]
}

// middleware.ts
export function middleware(request: NextRequest) {
  const hostname = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';

  // Look up tenant by custom domain
  const tenant = await getTenantByDomain(hostname);

  if (tenant) {
    // Inject tenant context
    request.headers.set('x-tenant-id', tenant.id);
  }

  return NextResponse.next();
}
```

---

### Option 3: Hybrid Approach (Recommended for SaaS)

- **Default:** All tenants get `[slug].yourapp.com`
- **Premium:** Tenants can add custom domain (e.g., `portal.uoo.co.uk`)

**Flow:**
1. Tenant enters custom domain in settings
2. System generates DNS instructions (CNAME record)
3. Tenant adds CNAME: `portal.uoo.co.uk → oldbury.jwebly.com`
4. System verifies DNS propagation
5. System provisions SSL certificate
6. Custom domain goes live

---

## Recommended Implementation Path

### Phase 1: Subdomain System (Quick Win)
**Timeline:** 1-2 days

1. Set up wildcard DNS
2. Get wildcard SSL
3. Add middleware to detect subdomain
4. Route to tenant based on subdomain
5. Each tenant gets: `[slug].jwebly.com`

### Phase 2: Custom Domain Support (Premium Feature)
**Timeline:** 1-2 weeks

1. Add domain verification flow
2. Integrate SSL provisioning (Let's Encrypt or Cloudflare)
3. Build DNS validation system
4. Create domain management UI
5. Allow tenants to add custom domains

---

## What Happens Now (Without Custom Domains)

Currently, the system works fine **without** custom domains:

- All tenants access via: `yourapp.com/login` or `localhost:3003`
- After login, tenant context is determined by:
  - `tenantId` in session
  - User's `tenant_id` from database
  - URL parameters during onboarding

**The `customDomain` field** in branding is:
- **Stored for future use**
- **Displayed in settings** (shows what domain tenant wants)
- **Ready for when** you implement domain routing

---

## Quick Test (Current System)

Right now, to test branding without custom domains:

1. Complete branding with `customDomain: "portal.uoo.co.uk"`
2. System saves this to database
3. Continue using `localhost:3003`
4. White-label branding (colors, logo, name) is applied
5. Domain field is stored but not actively used

---

## Decision Point

**Do you want to implement custom domains now?**

- **Yes** → I can build the subdomain routing system (Phase 1)
- **No** → Continue with current setup, add later as premium feature
- **Maybe** → Keep using `customDomain` as display-only field for now

The branding system is fully functional without custom domains. Domain routing is a separate infrastructure concern.

---

## Summary

**Current State:**
- ✅ Branding configuration complete
- ✅ Custom domain stored in database
- ❌ Custom domain routing not implemented
- ✅ System works perfectly without it

**To Enable Custom Domains:**
- Implement subdomain routing (1-2 days)
- OR use Vercel/Cloudflare domain features
- OR keep as future enhancement

**Recommendation:**
Test Deep Probe and other features first. Custom domains can be added later as a deployment enhancement.
