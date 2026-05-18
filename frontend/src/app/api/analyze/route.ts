import { NextRequest, NextResponse } from "next/server";

// Fallback to your hosted domain if the local environment variable isn't fully loaded
const BACKEND_URL = process.env.BACKEND_URL || "https://danceperfect.duckdns.org";

export async function POST(req: NextRequest) {
  try {
    // Read the incoming form metadata containing user_video and ref_video files
    const formData = await req.formData();

    // Securely forward the multipart payload data stream to your isolated Flask engine
    const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
      // ⚠️ IMPORTANT: Leave out 'Content-Type' headers entirely. 
      // The fetch engine automatically sets the dynamic boundary needed for video files.
    });

    // Handle computational failures or network drops downstream
    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json(
        { error: "Flask processing engine failed", details: errorText }, 
        { status: backendRes.status }
      );
    }

    // Unpack the real data object containing your dynamic dtw_similarity_score and labels
    const data = await backendRes.json();

    // Ship the unmarshalled payload directly back to your local client dashboard layout
    return NextResponse.json(data);

  } catch (err) {
    return NextResponse.json(
      { error: "Next.js API proxy pipeline failed", details: String(err) },
      { status: 500 }
    );
  }
}
