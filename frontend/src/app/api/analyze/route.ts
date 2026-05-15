import { NextRequest, NextResponse } from "next/server";

const BACKEND_URL = process.env.BACKEND_URL;

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const backendRes = await fetch(`${BACKEND_URL}/analyze`, {
      method: "POST",
      body: formData,
    });

    const text = await backendRes.text();

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      return NextResponse.json(
        { error: "Backend returned non-JSON response", raw: text },
        { status: 500 }
      );
    }

    return NextResponse.json(data, {
      status: backendRes.status,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Proxy failed", details: String(err) },
      { status: 500 }
    );
  }
}
