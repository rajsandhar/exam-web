import { NextResponse } from "next/server";

import { getApiUser } from "@/lib/auth/current-user";
import { getExamFor } from "@/lib/db/queries/exams";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { examId } = await params;
  const exam = await getExamFor(examId, user.id);
  if (!exam) {
    return NextResponse.json({ error: "Unknown paper." }, { status: 404 });
  }
  return NextResponse.json({
    status: exam.status,
    progress: exam.progressJson,
    error: exam.error,
  });
}
