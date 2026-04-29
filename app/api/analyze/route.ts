import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();

    const backendRes = await fetch("http://49.13.74.29/analyze", {
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
