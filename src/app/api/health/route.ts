import { NextResponse } from "next/server";
import { getHealthStatus } from "@/lib/ai";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json(getHealthStatus());
}
