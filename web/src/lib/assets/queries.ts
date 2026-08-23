import { randomUUID } from "node:crypto";

import { desc, eq, inArray } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { assets, assetSyllabusItems, type AssetRow } from "@/lib/db/schema";

import { deleteAssetFiles, storeUpload } from "./store";

export type AssetSummary = {
  id: string;
  kind: "image" | "video";
  mimeType: string;
  originalFilename: string;
  byteSize: number;
  title: string;
  description: string;
  altText: string;
  licence: string;
  hasCaptions: boolean;
  syllabusItemIds: string[];
  createdAt: number;
};

export type NewAsset = {
  title: string;
  description: string;
  altText: string;
  licence: string;
  syllabusItemIds: string[];
  bytes: Uint8Array;
  originalFilename: string;
  uploadedByUserId: string;
};

/** Long enough that a question written from it can actually be answered. */
export const MIN_DESCRIPTION_LENGTH = 40;

export async function describeAssetProblem(input: {
  title: string;
  description: string;
  altText: string;
  licence: string;
}): Promise<string | null> {
  if (input.title.trim().length < 3) return "Give the asset a title.";
  if (input.description.trim().length < MIN_DESCRIPTION_LENGTH) {
    return (
      `Describe what the file shows in at least ${MIN_DESCRIPTION_LENGTH} characters. ` +
      "Neither the question writer nor the marker can see it — they both work from this text."
    );
  }
  if (input.altText.trim().length < 3) {
    return "Give alternative text, for students using a screen reader.";
  }
  if (input.licence.trim().length < 3) {
    return "Record where this came from and that you may use it.";
  }
  return null;
}

export async function createAsset(
  input: NewAsset,
): Promise<{ ok: true; id: string } | { ok: false; problem: string }> {
  const problem = await describeAssetProblem(input);
  if (problem) return { ok: false, problem };

  const id = randomUUID();
  const stored = await storeUpload(id, input.bytes);
  if ("problem" in stored) return { ok: false, problem: stored.problem };

  // Narrowed into a const: the insert below runs inside a closure, where a
  // narrowing on a property access no longer holds.
  const kind = stored.mediaType.kind;
  if (kind === "captions") {
    return { ok: false, problem: "Upload the video first, then add captions to it." };
  }

  await db.transaction(async (tx) => {
    await tx.insert(assets)
      .values({
        id,
        kind,
        mimeType: stored.mediaType.mimeType,
        originalFilename: input.originalFilename.slice(0, 200),
        byteSize: stored.byteSize,
        title: input.title.trim(),
        description: input.description.trim(),
        altText: input.altText.trim(),
        licence: input.licence.trim(),
        captionsExtension: null,
        uploadedByUserId: input.uploadedByUserId,
        createdAt: new Date(),
      });

    for (const syllabusItemId of new Set(input.syllabusItemIds)) {
      await tx.insert(assetSyllabusItems).values({ assetId: id, syllabusItemId });
    }
  });

  return { ok: true, id };
}

/** Attaches WebVTT captions to a video that already exists. */
export async function attachCaptions(
  assetId: string,
  bytes: Uint8Array,
): Promise<{ ok: true } | { ok: false; problem: string }> {
  const asset = await getAsset(assetId);
  if (!asset) return { ok: false, problem: "That asset no longer exists." };
  if (asset.kind !== "video") {
    return { ok: false, problem: "Captions can only be added to a video." };
  }

  const stored = await storeUpload(assetId, bytes, { kind: "captions" });
  if ("problem" in stored) return { ok: false, problem: stored.problem };

  await db.update(assets)
    .set({ captionsExtension: stored.mediaType.extension })
    .where(eq(assets.id, assetId));
  return { ok: true };
}

export async function getAsset(id: string): Promise<AssetRow | undefined> {
  const [asset] = await db.select().from(assets).where(eq(assets.id, id)).limit(1);
  return asset;
}

export async function listAssets(): Promise<AssetSummary[]> {
  const rows = await db.select().from(assets).orderBy(desc(assets.createdAt));
  if (rows.length === 0) return [];

  const tags = await db
    .select()
    .from(assetSyllabusItems)
    .where(
      inArray(
        assetSyllabusItems.assetId,
        rows.map((row) => row.id),
      ),
    );

  return rows.map((row) => ({
    id: row.id,
    kind: row.kind,
    mimeType: row.mimeType,
    originalFilename: row.originalFilename,
    byteSize: row.byteSize,
    title: row.title,
    description: row.description,
    altText: row.altText,
    licence: row.licence,
    hasCaptions: row.captionsExtension !== null,
    syllabusItemIds: tags
      .filter((tag) => tag.assetId === row.id)
      .map((tag) => tag.syllabusItemId),
    createdAt: row.createdAt.getTime(),
  }));
}

/**
 * Assets a paper may use, given what the student selected.
 *
 * An untagged asset is offered to nothing: a photograph of handwritten letters
 * is stimulus for one dot point, not for any question that happens to need a
 * picture.
 */
export async function assetsForSyllabusItems(syllabusItemIds: string[]): Promise<AssetSummary[]> {
  if (syllabusItemIds.length === 0) return [];
  const selected = new Set(syllabusItemIds);
  const all = await listAssets();
  return all.filter((asset) =>
    asset.syllabusItemIds.some((id) => selected.has(id)),
  );
}

/** Ids a generated paper is allowed to reference. */
export async function validAssetIds(): Promise<Set<string>> {
  const rows = await db.select({ id: assets.id }).from(assets);
  return new Set(rows.map((row) => row.id));
}

export async function deleteAsset(id: string): Promise<void> {
  const asset = await getAsset(id);
  if (!asset) return;

  // Papers keep their own copy of the description, so an existing paper stays
  // markable; only the picture goes.
  await deleteAssetFiles(id, asset.mimeType, asset.captionsExtension);
  await db.delete(assets).where(eq(assets.id, id));
}
