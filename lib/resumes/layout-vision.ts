import { getOpenAiApiKey } from "@/lib/ai/job-description-generator";

const VISION_PROMPT =
  "Read this resume page in visual order. If it has columns, read the left column top to bottom, then the right column. Return only the plain text. Do not add words that are not on the page.";

/** Ask gpt-4o-mini to read a page image. Returns null when no API key or the call fails. */
export async function transcribeResumePage(image: Uint8Array): Promise<string | null> {
  const key = getOpenAiApiKey();
  if (!key || image.byteLength === 0) return null;
  const model = process.env.OPENAI_RESUME_VISION_MODEL?.trim() || "gpt-4o-mini";
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: VISION_PROMPT },
              {
                type: "image_url",
                image_url: { url: `data:image/png;base64,${Buffer.from(image).toString("base64")}` },
              },
            ],
          },
        ],
      }),
    });
    if (!response.ok) return null;
    const body = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const text = body.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
