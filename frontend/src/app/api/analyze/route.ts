import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    // Forward to Flask backend
    const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
    });

    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json({ error: "Backend error", details: errorText }, { status: backendRes.status });
    }

    // PARSE the JSON from Flask
    const data = await backendRes.json();

    // Return the ACTUAL data to the frontend
    // We ensure 'score' is at the top level for the UI to see
    return NextResponse.json({
      ...data,
      score: data.score ?? data.comparison?.dtw_similarity_score ?? 0,
    });

  } catch (err) {
    return NextResponse.json(
      { error: "Proxy failed", details: String(err) },
      { status: 500 }
    );
  }
}
