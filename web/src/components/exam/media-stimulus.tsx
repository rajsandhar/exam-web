"use client";

import { useState } from "react";

/**
 * Image and video stimulus.
 *
 * Both are served from `/api/assets/[id]`, which needs a session — an uploaded
 * file is not public. The description that accompanies each in the paper is not
 * shown here: it exists for whoever wrote the question and whoever marks it,
 * and printing it beside the picture would answer the question.
 */

export function ImageStimulus({
  assetId,
  altText,
  caption,
}: {
  assetId: string;
  altText: string;
  caption?: string;
}) {
  const [enlarged, setEnlarged] = useState(false);

  return (
    <figure className="my-2">
      <button
        type="button"
        onClick={() => setEnlarged(true)}
        className="block w-full border border-[var(--exam-line)] bg-[var(--exam-input-bg)] p-2"
        aria-label={`Enlarge image: ${altText}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- the file is
            uploaded at an unknown size and served from our own API, so Next's
            image optimiser has nothing to add and would need a loader. */}
        <img
          src={`/api/assets/${assetId}`}
          alt={altText}
          className="mx-auto max-h-96 w-auto max-w-full"
        />
      </button>
      {caption && (
        <figcaption className="mt-1.5 text-[0.9em] text-[var(--exam-muted)]">
          {caption}
        </figcaption>
      )}

      {enlarged && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={altText}
          className="fixed inset-0 z-50 flex flex-col bg-[var(--exam-canvas-bg)] p-6"
        >
          <div className="mb-3 flex justify-end">
            <button
              type="button"
              autoFocus
              onClick={() => setEnlarged(false)}
              onKeyDown={(event) => {
                if (event.key === "Escape") setEnlarged(false);
              }}
              className="h-9 border border-[var(--exam-line)] px-3 text-[0.85em] font-semibold"
            >
              Close
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element -- as above. */}
          <img
            src={`/api/assets/${assetId}`}
            alt={altText}
            className="m-auto max-h-full max-w-full"
          />
        </div>
      )}
    </figure>
  );
}

export function VideoStimulus({
  assetId,
  hasCaptions,
  caption,
}: {
  assetId: string;
  hasCaptions: boolean;
  caption?: string;
}) {
  return (
    <figure className="my-2">
      {/* Replayable, as in the real examination, and with no download control:
          the file is examination material, not a handout. */}
      <video
        controls
        controlsList="nodownload"
        preload="metadata"
        className="w-full border border-[var(--exam-line)] bg-black"
      >
        <source src={`/api/assets/${assetId}`} />
        {hasCaptions && (
          <track
            kind="captions"
            src={`/api/assets/${assetId}?captions=1`}
            srcLang="en"
            label="English"
            default
          />
        )}
        Your browser cannot play this video.
      </video>
      <figcaption className="mt-1.5 text-[0.9em] text-[var(--exam-muted)]">
        {caption ? `${caption} · ` : ""}
        You may replay this as often as you need. Use headphones.
      </figcaption>
    </figure>
  );
}
