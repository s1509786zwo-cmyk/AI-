import { NextResponse } from "next/server";
import { resolveAiConfig, toPublicConfig } from "@/lib/ai/config";
import { getStore } from "@/lib/store";
import { RULESET_VERSION } from "@/lib/engine/rules";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  const config = await resolveAiConfig();
  return NextResponse.json({
    ai: toPublicConfig(config),
    storage: getStore().kind,
    rulesetVersion: RULESET_VERSION,
  });
}
