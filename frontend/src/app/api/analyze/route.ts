import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  try {
    // Get uploaded form data from frontend
    const formData = await req.formData();

    // Forward to Flask backend
    const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
    });

    // Read raw response (IMPORTANT for debugging)
    const text = await backendRes.text();

    // DEBUG RESPONSE (temporary)
    return NextResponse.json({
      debug: true,
      status: backendRes.status,
      contentType: backendRes.headers.get("content-type"),
      raw: text,
    });
  } catch (err) {
    return NextResponse.json(
      {
        error: "Proxy failed",
        details: String(err),
      },
      { status: 500 }
    );
  }
}
