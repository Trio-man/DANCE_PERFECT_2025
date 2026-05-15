import { NextResponse } from 'next/server';

export async function GET(request: Request, { params }: { params: { path: string[] } }) {
  const fullPath = (await params).path.join('/');
  const baseUrl = process.env.NEXT_PUBLIC_API_URL; 
  
  if (!baseUrl) return new NextResponse("Config Error", { status: 500 });

  const cleanBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;

  // This hits http://IP:5000/assets/deviation_gifs/filename.gif
  // Which matches the Flask route we just made above.
  const backendUrl = `${cleanBaseUrl}/assets/${fullPath}`;

  try {
    const res = await fetch(backendUrl, { cache: 'no-store' });
    if (!res.ok) return new NextResponse(`Not Found`, { status: res.status });

    const blob = await res.blob();
    return new NextResponse(blob, {
      headers: { 'Content-Type': 'image/gif' },
    });
  } catch (error) {
    return new NextResponse("Error", { status: 500 });
  }
}
