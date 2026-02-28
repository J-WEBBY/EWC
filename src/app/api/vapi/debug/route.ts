// =============================================================================
// /api/vapi/debug — Check Vapi connectivity and env var presence
// GET: returns connection status without exposing keys
// =============================================================================

import { NextResponse } from 'next/server';

export async function GET() {
  const privateKey = process.env.VAPI_PRIVATE_KEY;
  const publicKey  = process.env.NEXT_PUBLIC_VAPI_PUBLIC_KEY;

  if (!privateKey) {
    return NextResponse.json({
      ok: false,
      error: 'VAPI_PRIVATE_KEY is not set in environment variables',
      privateKeyPresent: false,
      publicKeyPresent:  !!publicKey,
    }, { status: 500 });
  }

  try {
    const res = await fetch('https://api.vapi.ai/assistant?limit=5', {
      headers: { Authorization: `Bearer ${privateKey}` },
    });

    const body = await res.text();

    return NextResponse.json({
      ok: res.ok,
      status: res.status,
      privateKeyPresent: true,
      publicKeyPresent: !!publicKey,
      keyPrefix: `${privateKey.slice(0, 8)}...`,
      vapiResponse: res.ok ? 'success' : body.slice(0, 300),
    });
  } catch (err) {
    return NextResponse.json({
      ok: false,
      privateKeyPresent: true,
      publicKeyPresent: !!publicKey,
      error: String(err),
    }, { status: 500 });
  }
}
