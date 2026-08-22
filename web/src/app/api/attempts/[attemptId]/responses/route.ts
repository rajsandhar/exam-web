import { NextResponse } from "next/server";
import { z } from "zod";

import { getAttempt, saveResponse } from "@/lib/db/queries/attempts";
import { sanitiseResponseHtml } from "@/lib/sanitise";
import { responsePayloadSchema } from "@/lib/schemas/renderers";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  responses: z
    .array(
      z.object({
        questionPartId: z.string().min(1),
        response: responsePayloadSchema,
      }),
    )
    .min(1)
    .max(60),
});

/** Autosave. Rejected once the attempt is submitted. */
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ attemptId: string }> },
) {
  const { attemptId } = await params;
  const attempt = getAttempt(attemptId);
  if (!attempt) {
    return NextResponse.json({ error: "Unknown attempt." }, { status: 404 });
  }
  if (attempt.status !== "working") {
    return NextResponse.json(
      { error: "This attempt is not accepting answers." },
      { status: 409 },
    );
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Malformed response payload." }, { status: 400 });
  }

  for (const entry of parsed.data.responses) {
    const payload =
      entry.response.rendererType === "rich_text_response"
        ? {
            ...entry.response,
            // Sanitise on the way in as well as on the way out (CLAUDE.md §23).
            html: sanitiseResponseHtml(entry.response.html),
          }
        : entry.response;
    saveResponse(attemptId, entry.questionPartId, payload);
  }

  return NextResponse.json({ saved: parsed.data.responses.length });
}
