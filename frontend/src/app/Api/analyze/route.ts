import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5000';

/**
 * Proxy for /analyze - avoids CORS and handles Render cold starts.
 * Browser → Next.js (same origin) → Backend
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const auth = request.headers.get('authorization');

    const proxyFormData = new FormData();
    for (const [key, value] of formData.entries()) {
      if (value instanceof File) {
        proxyFormData.append(key, value, value.name || 'file');
      } else if (typeof value === 'string') {
        proxyFormData.append(key, value);
      }
    }

    const headers: Record<string, string> = {};
    if (auth) headers['Authorization'] = auth;

    // Longer timeout for Render free tier cold start (~60s)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 120_000);

    const res = await fetch(`${BACKEND_URL}/analyze`, {
      method: 'POST',
      headers,
      body: proxyFormData,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    const data = await res.json().catch(() => ({ error: 'Invalid response from backend' }));

    if (!res.ok) {
      return NextResponse.json(
        { error: data?.error || `Backend error (${res.status})` },
        { status: res.status }
      );
    }

    return NextResponse.json(data);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    const isTimeout = message.includes('abort') || message.includes('timeout');
    const is502 = message.includes('502') || message.includes('Bad Gateway');

    if (isTimeout || is502) {
      return NextResponse.json(
        {
          error:
            'Backend is waking up (Render free tier). Please wait 30–60 seconds and try again.',
        },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { error: `Proxy error: ${message}` },
      { status: 502 }
    );
  }
}
