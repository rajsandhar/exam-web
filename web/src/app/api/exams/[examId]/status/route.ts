import { NextResponse } from "next/server";

import { getExam } from "@/lib/db/queries/exams";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ examId: string }> },
) {
  const { examId } = await params;
  const exam = getExam(examId);
  if (!exam) {
    return NextResponse.json({ error: "Unknown paper." }, { status: 404 });
  }
  return NextResponse.json({
    status: exam.status,
    progress: exam.progressJson,
    error: exam.error,
  });
}
