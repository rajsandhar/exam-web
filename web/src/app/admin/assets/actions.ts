"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { attachCaptions, createAsset, deleteAsset } from "@/lib/assets/queries";
import { requireAdmin } from "@/lib/auth/current-user";

/**
 * Uploading and removing media.
 *
 * Administrators only, re-checked in every action: a server action is a public
 * endpoint, and this one writes files to disk.
 */

function back(params: Record<string, string>): never {
  const query = new URLSearchParams(params).toString();
  redirect(`/admin/assets${query ? `?${query}` : ""}`);
}

async function bytesOf(file: File | null): Promise<Uint8Array | null> {
  if (!file || file.size === 0) return null;
  return new Uint8Array(await file.arrayBuffer());
}

export async function uploadAssetAction(formData: FormData): Promise<void> {
  const admin = await requireAdmin("/admin/assets");

  const file = formData.get("file");
  const bytes = await bytesOf(file instanceof File ? file : null);
  if (!bytes) back({ problem: "Choose a file to upload." });

  const created = await createAsset({
    title: String(formData.get("title") ?? ""),
    description: String(formData.get("description") ?? ""),
    altText: String(formData.get("altText") ?? ""),
    licence: String(formData.get("licence") ?? ""),
    syllabusItemIds: String(formData.get("syllabusItemIds") ?? "")
      .split(/[\s,]+/)
      .map((id) => id.trim())
      .filter(Boolean),
    bytes,
    originalFilename: file instanceof File ? file.name : "upload",
    uploadedByUserId: admin.id,
  });

  if (!created.ok) back({ problem: created.problem });

  revalidatePath("/admin/assets");
  back({ uploaded: "1" });
}

export async function attachCaptionsAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/assets");

  const file = formData.get("file");
  const bytes = await bytesOf(file instanceof File ? file : null);
  if (!bytes) back({ problem: "Choose a WebVTT file." });

  const result = await attachCaptions(String(formData.get("assetId") ?? ""), bytes);
  if (!result.ok) back({ problem: result.problem });

  revalidatePath("/admin/assets");
  back({ captions: "1" });
}

export async function deleteAssetAction(formData: FormData): Promise<void> {
  await requireAdmin("/admin/assets");

  await deleteAsset(String(formData.get("assetId") ?? ""));

  revalidatePath("/admin/assets");
  back({ deleted: "1" });
}
