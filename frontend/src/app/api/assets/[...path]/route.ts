import { NextRequest, NextResponse } from 'next/server';

export async function GET(req: NextRequest, { params }: { params: { path: string[] } }) {
  const backendUrl = process.env.BACKEND_URL; 
  const filePath = params.path.join('/');
  
  try {
    const response = await fetch(`${backendUrl}/${filePath}`);
    
    if (!response.ok) return new NextResponse(null, { status: 404 });

    const blob = await response.blob();
    const headers = new Headers();
    headers.set('Content-Type', response.headers.get('Content-Type') || 'image/gif');
    headers.set('Cache-Control', 'public, max-age=31536000, immutable');

    return new NextResponse(blob, { headers });
  } catch (error) {
    return new NextResponse(null, { status: 500 });
  }
}
