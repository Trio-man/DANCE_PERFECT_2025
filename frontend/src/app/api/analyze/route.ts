import { NextRequest, NextResponse } from "next/server";
import https from "https";

const BACKEND_URL = process.env.BACKEND_URL;

// Allow self-signed cert (dev only)
const agent = new https.Agent({ rejectUnauthorized: false });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
      // @ts-expect-error
      agent,
    });
    const data = await backendRes.json();
    return NextResponse.json(data);
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy failed", details: String(err) },
      { status: 500 }
    );
  }
}
