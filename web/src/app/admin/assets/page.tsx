import { PlatformShell } from "@/components/platform/shell";
import {
  listAssets,
  MIN_DESCRIPTION_LENGTH,
  type AssetSummary,
} from "@/lib/assets/queries";
import { IMAGE_MAX_BYTES, VIDEO_MAX_BYTES } from "@/lib/assets/media-types";
import { requireAdmin } from "@/lib/auth/current-user";

import {
  attachCaptionsAction,
  deleteAssetAction,
  uploadAssetAction,
} from "./actions";

export const dynamic = "force-dynamic";

/**
 * Media a paper can use.
 *
 * Some questions need a stimulus no model can produce — a photograph, a
 * recording. Those are supplied here, described in words, and tagged to the
 * syllabus content they suit so a generated paper only reaches for one that
 * fits what the student selected.
 */
export default async function AssetsPage({
  searchParams,
}: {
  searchParams: Promise<{
    problem?: string;
    uploaded?: string;
    captions?: string;
    deleted?: string;
  }>;
}) {
  await requireAdmin("/admin/assets");
  const { problem, uploaded, captions, deleted } = await searchParams;
  const assets = listAssets();

  return (
    <PlatformShell active="assets">
      <main className="mx-auto w-full max-w-4xl px-6 py-10">
        <h1 className="text-2xl font-semibold tracking-tight text-navy-800">Media</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-ink-muted">
          Images and video for questions that need a stimulus the application
          cannot generate. <strong>The description matters more than the file.</strong>{" "}
          Neither the question writer nor the marker can see what you upload —
          both work from what you write here — so a thin description makes a
          question that cannot be answered or marked fairly.
        </p>

        {problem && (
          <p
            role="alert"
            className="mt-6 rounded border border-danger/40 bg-danger/5 p-3 text-sm text-danger"
          >
            {problem}
          </p>
        )}
        {(uploaded || captions || deleted) && (
          <p role="status" className="mt-6 rounded border border-ok/40 bg-ok/5 p-3 text-sm">
            {uploaded && "Uploaded."}
            {captions && "Captions added."}
            {deleted && "Removed. Papers already generated keep their description."}
          </p>
        )}

        <section className="mt-8 rounded-lg border border-line bg-white p-6">
          <h2 className="text-base font-semibold text-navy-800">Upload</h2>
          <form action={uploadAssetAction} className="mt-4 space-y-4">
            <div>
              <label htmlFor="field-file" className="block text-sm font-medium">
                File
              </label>
              <input
                id="field-file"
                name="file"
                type="file"
                required
                accept="image/png,image/jpeg,image/webp,video/mp4,video/webm"
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-ink-muted">
                PNG, JPEG or WebP up to {Math.round(IMAGE_MAX_BYTES / 1024 / 1024)} MB;
                MP4 or WebM up to {Math.round(VIDEO_MAX_BYTES / 1024 / 1024)} MB. The
                type is read from the file itself, not its name.
              </p>
            </div>

            <Field label="Title" name="title" required />

            <div>
              <label htmlFor="field-description" className="block text-sm font-medium">
                Description, or transcript for video
              </label>
              <textarea
                id="field-description"
                name="description"
                required
                rows={5}
                className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
              />
              <p className="mt-1 text-xs text-ink-muted">
                At least {MIN_DESCRIPTION_LENGTH} characters. Everything a question
                could reasonably ask about must appear here, because this is all
                the question writer and the marker will ever see.
              </p>
            </div>

            <Field
              label="Alternative text"
              name="altText"
              required
              hint="Read aloud to a student using a screen reader."
            />
            <Field
              label="Source and licence"
              name="licence"
              required
              hint="Where it came from, and why you may use it. Do not upload material you do not hold the rights to."
            />
            <Field
              label="Syllabus dot points"
              name="syllabusItemIds"
              hint="Space or comma separated, e.g. auto.1.6 auto.3.3. An untagged asset is never offered to a generated paper."
            />

            <button
              type="submit"
              className="rounded-md bg-navy-800 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-navy-700"
            >
              Upload
            </button>
          </form>
        </section>

        <h2 className="mt-10 text-base font-semibold text-navy-800">
          {assets.length} item{assets.length === 1 ? "" : "s"}
        </h2>

        {assets.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-line bg-white p-10 text-center text-sm text-ink-muted">
            Nothing uploaded yet. Papers work without media; this is only for
            questions that genuinely need it.
          </p>
        ) : (
          <div className="mt-4 space-y-4">
            {assets.map((asset) => (
              <AssetCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </main>
    </PlatformShell>
  );
}

function AssetCard({ asset }: { asset: AssetSummary }) {
  return (
    <article className="rounded-lg border border-line bg-white p-5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="font-semibold text-navy-800">{asset.title}</h3>
        <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">
          {asset.kind}
        </span>
        <span className="text-xs text-ink-muted">
          {asset.originalFilename} · {Math.max(1, Math.round(asset.byteSize / 1024))} KB
        </span>
      </div>

      <p className="mt-2 text-sm leading-relaxed">{asset.description}</p>
      <p className="mt-2 text-xs text-ink-muted">
        Alt: {asset.altText} · Licence: {asset.licence}
      </p>
      <p className="mt-1 text-xs text-ink-muted">
        {asset.syllabusItemIds.length > 0 ? (
          <>Tagged: {asset.syllabusItemIds.join(", ")}</>
        ) : (
          <span className="text-danger">
            Not tagged to any syllabus dot point, so no generated paper will use it.
          </span>
        )}
      </p>

      <div className="mt-4 flex flex-wrap items-end gap-4 border-t border-line pt-4">
        {asset.kind === "video" && (
          <form action={attachCaptionsAction} className="flex items-end gap-2">
            <input type="hidden" name="assetId" value={asset.id} />
            <div>
              <label
                htmlFor={`captions-${asset.id}`}
                className="block text-xs font-medium text-ink-muted"
              >
                {asset.hasCaptions ? "Replace captions (WebVTT)" : "Add captions (WebVTT)"}
              </label>
              <input
                id={`captions-${asset.id}`}
                name="file"
                type="file"
                accept=".vtt,text/vtt"
                required
                className="mt-1 text-sm"
              />
            </div>
            <button
              type="submit"
              className="rounded-md border border-line bg-white px-3 py-1.5 text-sm font-medium"
            >
              Save
            </button>
          </form>
        )}

        <form action={deleteAssetAction}>
          <input type="hidden" name="assetId" value={asset.id} />
          <button
            type="submit"
            className="rounded-md border border-danger/50 bg-white px-3 py-1.5 text-sm font-medium text-danger"
          >
            Remove
          </button>
        </form>
      </div>
    </article>
  );
}

function Field({
  label,
  name,
  hint,
  required,
}: {
  label: string;
  name: string;
  hint?: string;
  required?: boolean;
}) {
  const id = `field-${name}`;
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        required={required}
        autoComplete="off"
        className="mt-1 w-full rounded-md border border-line bg-white px-3 py-2 text-sm"
      />
      {hint && <p className="mt-1 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
