import { GoogleGenerativeAI } from "@google/generative-ai";
import type { ParsedIntent, ParkingSpot } from "@/types";

const API_KEY = process.env.GEMINI_API_KEY;

if (!API_KEY) {
  console.warn("GEMINI_API_KEY not set — Gemini calls will fail");
}

const genAI = new GoogleGenerativeAI(API_KEY ?? "");
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

// ─── Prompt A: Intent Parser ──────────────────────────────────────────────────
// Budget: ~300 tokens in, ~150 tokens out per call

const INTENT_SYSTEM_PROMPT = `You are a parking search assistant. Extract structured data from user queries about accessible parking.
Return ONLY valid JSON. No explanation, no markdown, no code fences.
Schema: { "location": string, "radius_m": number, "filters": string[], "ambiguous": boolean }
Rules:
- radius_m default is 500. Use 1000 if user says "nearby", 200 if "right next to", 2000 if "area".
- filters only from: ["covered","free","lit","near_elevator"]
- If location is unclear or missing, set ambiguous:true and location to best guess or empty string.
- location should be a real-world address or landmark, not vague terms.`;

export async function parseIntent(query: string): Promise<ParsedIntent> {
  const sanitized = query.slice(0, 200).replace(/[<>]/g, "");

  const prompt = `${INTENT_SYSTEM_PROMPT}\n\nUser query: "${sanitized}"`;

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
      maxOutputTokens: 200,
      temperature: 0.1,
    },
  });

  const raw = result.response.text().trim();

  let parsed: ParsedIntent;
  try {
    parsed = JSON.parse(raw);
  } catch {
    // Malformed JSON from Gemini — extract location as best effort
    parsed = {
      location: query.slice(0, 100),
      radius_m: 500,
      filters: [],
      ambiguous: true,
    };
  }

  // Validate shape — never trust LLM output blindly
  return {
    location: typeof parsed.location === "string" ? parsed.location : query,
    radius_m:
      typeof parsed.radius_m === "number" &&
      parsed.radius_m > 0 &&
      parsed.radius_m <= 5000
        ? parsed.radius_m
        : 500,
    filters: Array.isArray(parsed.filters)
      ? parsed.filters.filter((f) =>
          ["covered", "free", "lit", "near_elevator"].includes(f)
        )
      : [],
    ambiguous: Boolean(parsed.ambiguous),
  };
}

// ─── Prompt B: Result Narrator ────────────────────────────────────────────────
// Budget: ~400 tokens in, ~200 tokens out per call

const NARRATOR_SYSTEM_PROMPT = `You are a helpful accessibility assistant. Summarize parking search results in 2 sentences.
Be warm, practical, and specific. Mention the best option by name and note any important caveats (fees, limited accessibility, flags).
If no confirmed accessible spots were found, say so clearly and suggest what the user can do.`;

export async function narrateResults(
  spots: ParkingSpot[],
  location: string
): Promise<string> {
  if (spots.length === 0) {
    return `No confirmed wheelchair-accessible parking was found near ${location}. Try widening your search or check nearby garages directly.`;
  }

  const top3 = spots.slice(0, 3).map((s) => ({
    name: s.name,
    wheelchair: s.wheelchair,
    distance_m: s.distance_m ?? "unknown",
    fee: s.fee,
    covered: s.covered,
    report_flags: s.report_flags,
  }));

  const prompt = `${NARRATOR_SYSTEM_PROMPT}\n\nLocation searched: ${location}\nTop results (JSON):\n${JSON.stringify(top3, null, 2)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 250,
        temperature: 0.3,
      },
    });
    return result.response.text().trim();
  } catch {
    // Narration failure must never block the user from seeing results
    const best = spots[0];
    return `Found ${spots.length} parking option${spots.length > 1 ? "s" : ""} near ${location}. ${best.name} is the closest${best.wheelchair === "yes" ? " and is confirmed wheelchair accessible" : ""}.`;
  }
}
