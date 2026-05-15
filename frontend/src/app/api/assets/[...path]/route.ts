import { NextRequest, NextResponse } from 'next/server';

// In Next 15, params is a Promise
export async function GET(
  req: NextRequest, 
  { params }: { params: Promise<{ path: string[] }> } 
) {
  const backendUrl = process.env.BACKEND_URL; 
  // Await the params before using them
  const { path } = await params;
  const filePath = path.join('/');
  
  try {
    const response = await fetch(`${backendUrl}/${filePath}`);
    
    if (!response.ok) return new NextResponse(null, { status: 404 });

    const blob = await response.blob();
    const headers = new Headers();
    
    // Set the correct content type (gif or png/jpg)
    headers.set('Content-Type', response.headers.get('Content-Type') || 'image/gif');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new NextResponse(blob, { headers });
  } catch (err) {
    // Note: 'err' instead of 'error' to avoid the unused-vars warning
    console.error("Asset Proxy Error:", err);
    return new NextResponse(null, { status: 500 });
  }
}
