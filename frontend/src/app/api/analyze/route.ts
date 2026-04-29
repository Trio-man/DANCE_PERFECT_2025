import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
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
