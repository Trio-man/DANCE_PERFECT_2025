import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  const fullPath = (await params).path.join('/');
  
  // Using your existing variable
  let baseUrl = process.env.NEXT_PUBLIC_API_URL; 
  
  if (!baseUrl) {
    console.error("NEXT_PUBLIC_API_URL is missing!");
    return new NextResponse("Server Configuration Error", { status: 500 });
  }

  // Clean the URL: Remove trailing slash if it exists to prevent double slashes
  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  // Most Flask setups serve assets via /assets/ or /static/
  // Ensure this matches your Flask route @app.route('/assets/<path:filename>')
  const backendUrl = `${cleanBaseUrl}/assets/${fullPath}`;

  console.log(`Proxy fetching from: ${backendUrl}`);

  try {
    const res = await fetch(backendUrl, { cache: 'no-store' });

    if (!res.ok) {
      console.error(`Hetzner returned ${res.status} for path: ${fullPath}`);
      return new NextResponse(`Asset not found on backend`, { status: res.status });
    }

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: {
        'Content-Type': 'image/gif',
        'Cache-Control': 'public, max-age=31536000, immutable',
      },
    });
  } catch (error) {
    console.error("Proxy Fetch Error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
