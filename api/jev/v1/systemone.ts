// Production stand-in for the Vite dev proxy: the browser posts to /api/jev/v1/systemone,
// this function adds the key server-side and forwards to the Jev API (which rejects browser origins).
// Set JEV_API_KEY (or VITE_JEV_API_KEY) in the Vercel project's environment variables.
export async function POST(request: Request): Promise<Response> {
  const key = (process.env.JEV_API_KEY ?? process.env.VITE_JEV_API_KEY ?? "").trim().replace(/^["']|["']$/g, "");
  if (!key) return Response.json({ error: "JEV_API_KEY is not set" }, { status: 500 });
  const upstream = await fetch("https://api.typesafe.ai/v1/systemone", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: await request.text(),
  });
  return new Response(await upstream.text(), {
    status: upstream.status,
    headers: { "Content-Type": upstream.headers.get("Content-Type") ?? "application/json" },
  });
}
