import { NextRequest, NextResponse } from 'next/server';

/**
 * Next.js 15 Asset Proxy
 * This route acts as a secure bridge between Vercel (HTTPS) 
 * and your Hetzner Backend (HTTP).
 */
export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ path: string[] }> } 
) {
  // 1. Await params (Required in Next.js 15)
  const { path } = await params;
  
  // 2. Get Backend URL from Vercel Environment Variables
  const backendUrl = process.env.BACKEND_URL; 
  
  if (!backendUrl) {
    console.error("PROXY ERROR: BACKEND_URL environment variable is missing.");
    return NextResponse.json({ error: 'Proxy Configuration Error' }, { status: 500 });
  }

  // 3. Clean the URL and join the path segments
  // This prevents double slashes if the environment variable ends with '/'
  const cleanBaseUrl = backendUrl.replace(/\/$/, '');
  const filePath = path.join('/');
  const targetUrl = `${cleanBaseUrl}/${filePath}`;
  
  try {
    // 4. Fetch the file from Hetzner
    const response = await fetch(targetUrl);
    
    // If Hetzner returns 404, the proxy returns 404
    if (!response.ok) {
      console.warn(`PROXY 404: File not found at ${targetUrl}`);
      return new NextResponse(null, { status: 404 });
    }

    // 5. Convert to Blob and send back to the browser
    const blob = await response.blob();
    const headers = new Headers();
    
    // Pass through the correct Content-Type (image/gif, image/png, etc.)
    const contentType = response.headers.get('Content-Type') || 'image/gif';
    headers.set('Content-Type', contentType);
    
    // Cache the image for performance
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new NextResponse(blob, { headers });

  } catch (err) {
    console.error("PROXY NETWORK ERROR:", err);
    return new NextResponse(null, { status: 500 });
  }
}
