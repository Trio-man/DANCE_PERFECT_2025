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

    // 1. Check if the backend actually responded successfully
    if (!backendRes.ok) {
      const errorText = await backendRes.text();
      return NextResponse.json({ error: "Backend failed", details: errorText }, { status: backendRes.status });
    }

    // 2. PARSE the JSON (This is the fix!)
    // This turns the response into a real JavaScript object
    const data = await backendRes.json();

    // 3. Return the clean object to your Frontend
    return NextResponse.json(data);

  } catch (err) {
    return NextResponse.json(
      { error: "Proxy failed", details: String(err) },
      { status: 500 }
    );
  }
}
