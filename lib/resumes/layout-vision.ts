import { createHash } from "node:crypto";

import type { AiRunScope } from "@/lib/ai/ai-run";
import { postOpenAi } from "@/lib/ai/gateway";
import { getOpenAiApiKey } from "@/lib/ai/job-description-generator";
import { recordExtractionUsage } from "@/lib/resumes/extraction-meter";
import { withAIRun } from "@/lib/ai/run";

const VISION_PROMPT =
  "Read this resume page in visual order. If it has columns, read the left column top to bottom, then the right column. Return only the plain text. Do not add words that are not on the page.";

export const RESUME_VISION_FEATURE = "resume_vision" as const;
export const RESUME_VISION_PROMPT_VERSION = "resume-vision-1";

type ApplicationLookup = {
  application: {
    findUnique: (args: {
      where: { id: number };
      select: { aiEvaluationOptOut: true };
    }) => Promise<{ aiEvaluationOptOut: boolean } | null>;
  };
};

/** Company scope for a page-image read. Omit when the caller has no tenant. */
export type ResumeVisionAudit = AiRunScope & {
  applicationId?: number | null;
  pageCount: number;
  pageIndex: number;
  db: AiRunScope["db"] & Partial<ApplicationLookup>;
};

export function resumeVisionModel() {
  return process.env.OPENAI_RESUME_VISION_MODEL?.trim() || "gpt-4o-mini";
}

/** Stable id and page count only. Image bytes are not part of the hash. */
export function hashResumeVisionInput(input: {
  entityType: string;
  entityId: number;
  pageCount: number;
  pageIndex: number;
}) {
  return createHash("sha256")
    .update(
      JSON.stringify({
        feature: RESUME_VISION_FEATURE,
        model: resumeVisionModel(),
        promptVersion: RESUME_VISION_PROMPT_VERSION,
        entityType: input.entityType,
        entityId: input.entityId,
        pageCount: input.pageCount,
        pageIndex: input.pageIndex,
      }),
    )
    .digest("hex");
}

export async function applicationOptedOutOfAi(
  db: Partial<ApplicationLookup> | undefined,
  applicationId: number | null | undefined,
) {
  if (!applicationId || !db?.application) return false;
  const row = await db.application.findUnique({
    where: { id: applicationId },
    select: { aiEvaluationOptOut: true },
  });
  return row?.aiEvaluationOptOut === true;
}

/**
 * Ask the vision model to read a page image.
 * Returns null when no API key, the call fails, or the related application opted out.
 * Opt-out does not call the model and does not write an AIRun.
 */
export async function transcribeResumePage(
  image: Uint8Array,
  audit?: ResumeVisionAudit | null,
): Promise<string | null> {
  if (audit && (await applicationOptedOutOfAi(audit.db, audit.applicationId))) {
    return null;
  }

  const key = getOpenAiApiKey();
  if (!key || image.byteLength === 0) return null;
  const model = resumeVisionModel();
  try {
    return await withAIRun(
      RESUME_VISION_FEATURE,
      null,
      audit
        ? {
            companyId: audit.companyId,
            entityType: audit.entityType,
            entityId: audit.entityId,
            model,
            promptVersion: RESUME_VISION_PROMPT_VERSION,
            input: { pageCount: audit.pageCount, pageIndex: audit.pageIndex },
            db: audit.db as never,
          }
        : null,
      async () => {
        const response = await postOpenAi({
          path: "/v1/chat/completions",
          apiKey: key,
          body: {
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
          },
        });
        if (!response.ok) {
          throw new Error("http_error");
        }
        const body = (await response.json()) as {
          choices?: Array<{ message?: { content?: string } }>;
          usage?: { prompt_tokens?: number; completion_tokens?: number };
        };
        const text = body.choices?.[0]?.message?.content?.trim() || null;
        recordExtractionUsage({
          feature: "resume_vision",
          model,
          promptTokens: body.usage?.prompt_tokens ?? 0,
          completionTokens: body.usage?.completion_tokens ?? 0,
        });
        return {
          value: text,
          promptTokens: body.usage?.prompt_tokens ?? null,
          completionTokens: body.usage?.completion_tokens ?? null,
          output: {
            pageCount: audit?.pageCount ?? 0,
            pageIndex: audit?.pageIndex ?? 0,
            textLength: text?.length ?? 0,
            error: text ? null : "empty",
          },
        };
      },
    );
  } catch {
    return null;
  }
}
