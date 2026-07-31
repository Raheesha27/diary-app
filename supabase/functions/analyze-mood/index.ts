import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

serve(async (req) => {
  try {
    const { caption } = await req.json();

    if (!caption || caption.trim().length === 0) {
      return new Response(JSON.stringify({ mood: null }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    const prompt = `Read this diary entry and respond with exactly ONE word describing the overall mood: happy, sad, anxious, calm, excited, angry, grateful, reflective, or neutral. Diary entry: "${caption}". Respond with only the single mood word, nothing else.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
        }),
      }
    );

    const data = await response.json();
    const mood = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim().toLowerCase() ?? "neutral";

    return new Response(JSON.stringify({ mood }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});