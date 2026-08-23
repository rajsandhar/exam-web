"use client";

export function TimerBar({
  phase,
  remainingMs,
}: {
  phase: "reading" | "working" | "submitted" | "marked";
  remainingMs: number | null;
}) {
  if (remainingMs === null || (phase !== "reading" && phase !== "working")) {
    return null;
  }

  const totalSeconds = Math.max(0, Math.round(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const low = totalSeconds <= 300;

  return (
    <span className="flex items-center gap-2">
      <span className="opacity-80">
        {phase === "reading" ? "Reading time" : "Time remaining"}
      </span>
      <span
        // Announcing every second would be unusable, so the countdown is silent
        // to assistive technology; only the five-minute threshold changes its
        // emphasis visually.
        aria-live="off"
        className={`font-semibold tabular-nums ${low ? "text-[#ffd25e]" : ""}`}
      >
        {hours > 0
          ? `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`
          : `${minutes}:${String(seconds).padStart(2, "0")}`}
      </span>
    </span>
  );
}
