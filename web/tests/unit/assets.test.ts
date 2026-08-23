import fs from "node:fs";

import { beforeEach, describe, expect, it } from "vitest";

import { assetPath, storeUpload } from "@/lib/assets/store";
import { sniffMediaType } from "@/lib/assets/media-types";
import {
  assetsForSyllabusItems,
  createAsset,
  deleteAsset,
  listAssets,
  validAssetIds,
} from "@/lib/assets/queries";
import { rawSqlite } from "@/lib/db/client";
import { stimulusToText } from "@/lib/marking/stimulus-text";
import { validatePaper } from "@/lib/schemas/paper-validation";
import { generatedPaperSchema } from "@/lib/schemas/question";
import { IMPLEMENTED_RENDERERS } from "@/lib/schemas/renderers";
import fixture from "@/lib/ai/fixtures/fixture-paper.json";

/**
 * Uploaded media.
 *
 * Two things carry the weight here: an upload is untrusted input, so the type
 * comes from the bytes and nothing else; and neither the question writer nor
 * the marker can see the file, so the description is the examinable content.
 */

const PNG = new Uint8Array([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d,
]);
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const WEBM = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0x01, 0x00]);
const MP4 = new Uint8Array([0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70]);
const VTT = new TextEncoder().encode("WEBVTT\n\n00:00.000 --> 00:02.000\nHello\n");
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>');
const HTML = new TextEncoder().encode("<!doctype html><script>alert(1)</script>");

const ADMIN = "assets-test-admin";

beforeEach(() => {
  rawSqlite().exec("DELETE FROM asset_syllabus_items; DELETE FROM assets; DELETE FROM users;");
  rawSqlite()
    .prepare(
      "INSERT INTO users (id, username, username_lower, password_hash, role, disabled, must_change_password, created_at) " +
        "VALUES (?, ?, ?, 'x', 'admin', 0, 0, ?)",
    )
    .run(ADMIN, ADMIN, ADMIN, Date.now());
});

const validMetadata = {
  title: "Handwritten letters",
  description:
    "Four photographs of the letter B written by hand, each in a different style and slant.",
  altText: "Four handwritten capital Bs",
  licence: "Photographed by the school, own work",
  syllabusItemIds: ["auto.1.6"],
  originalFilename: "letters.png",
  uploadedByUserId: ADMIN,
};

describe("deciding what a file is", () => {
  it("recognises the formats it accepts", () => {
    expect(sniffMediaType(PNG)?.mimeType).toEqual("image/png");
    expect(sniffMediaType(JPEG)?.mimeType).toEqual("image/jpeg");
    expect(sniffMediaType(WEBM)?.mimeType).toEqual("video/webm");
    expect(sniffMediaType(MP4)?.mimeType).toEqual("video/mp4");
    expect(sniffMediaType(VTT)?.mimeType).toEqual("text/vtt");
  });

  it("refuses SVG, which can carry script and would be served from our origin", () => {
    expect(sniffMediaType(SVG)).toBeUndefined();
  });

  it("refuses anything else, whatever it is named", () => {
    expect(sniffMediaType(HTML)).toBeUndefined();
    const stored = storeUpload("id-for-html", HTML);
    expect(stored).toHaveProperty("problem");
  });

  it("ignores a filename claiming to be an image", () => {
    // The extension and the browser's content type are both attacker-supplied.
    const stored = storeUpload("id-for-fake", HTML);
    expect("problem" in stored && stored.problem).toMatch(/not accepted/);
  });

  it("refuses an empty file", () => {
    expect(storeUpload("id-for-empty", new Uint8Array())).toHaveProperty("problem");
  });

  it("refuses a file over its size limit", () => {
    const huge = new Uint8Array(4 * 1024 * 1024);
    huge.set(PNG);
    expect("problem" in storeUpload("id-for-huge", huge)).toBe(true);
  });
});

describe("where files are written", () => {
  it("never lets an id escape the assets directory", () => {
    expect(() => assetPath("../../etc/passwd", "png")).toThrow();
    expect(() => assetPath("ok", "../../evil")).toThrow();
  });

  it("names the file by id and extension, not by what was uploaded", () => {
    const created = createAsset({ ...validMetadata, bytes: PNG });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const onDisk = assetPath(created.id, "png");
    expect(fs.existsSync(onDisk)).toBe(true);
    expect(onDisk).not.toContain("letters");
  });
});

describe("what an asset must carry", () => {
  it("insists on a description long enough to write a question from", () => {
    const created = createAsset({ ...validMetadata, description: "A picture.", bytes: PNG });
    expect(created.ok).toBe(false);
    if (created.ok) return;
    expect(created.problem).toMatch(/marker/);
  });

  it("insists on alternative text", () => {
    const created = createAsset({ ...validMetadata, altText: "", bytes: PNG });
    expect(created.ok).toBe(false);
  });

  it("insists on a licence, because a school will upload what it should not", () => {
    const created = createAsset({ ...validMetadata, licence: "", bytes: PNG });
    expect(created.ok).toBe(false);
  });
});

describe("offering media to a paper", () => {
  it("offers an asset only for the content it was tagged to", () => {
    createAsset({ ...validMetadata, bytes: PNG });

    expect(assetsForSyllabusItems(["auto.1.6"])).toHaveLength(1);
    expect(assetsForSyllabusItems(["ssa.2.1"])).toHaveLength(0);
    expect(assetsForSyllabusItems([])).toHaveLength(0);
  });

  it("offers an untagged asset to nothing at all", () => {
    createAsset({ ...validMetadata, syllabusItemIds: [], bytes: PNG });

    expect(listAssets()).toHaveLength(1);
    expect(assetsForSyllabusItems(["auto.1.6"])).toHaveLength(0);
  });
});

describe("a paper referring to media", () => {
  const paper = generatedPaperSchema.parse(fixture);

  function paperWithStimulus(assetId: string) {
    return {
      ...paper,
      groups: paper.groups.map((group, index) =>
        index === 0
          ? {
              ...group,
              stimulus: {
                kind: "image" as const,
                assetId,
                altText: "Four handwritten capital Bs",
                description: validMetadata.description,
              },
            }
          : group,
      ),
    };
  }

  it("is rejected when the asset does not exist", () => {
    const result = validatePaper(paperWithStimulus("no-such-asset"), {
      availableRenderers: IMPLEMENTED_RENDERERS,
      availableAssetIds: validAssetIds(),
    });

    expect(result.ok).toBe(false);
    expect(result.issues.map((issue) => issue.message).join(" ")).toContain(
      "does not exist",
    );
  });

  it("is accepted when it does", () => {
    const created = createAsset({ ...validMetadata, bytes: PNG });
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const result = validatePaper(paperWithStimulus(created.id), {
      availableRenderers: IMPLEMENTED_RENDERERS,
      availableAssetIds: validAssetIds(),
    });
    expect(result.issues).toEqual([]);
  });

  it("gives the marker the description, since it cannot see the file", () => {
    const text = stimulusToText({
      kind: "image",
      assetId: "anything",
      altText: "alt",
      description: "Four handwritten capital Bs, each slanted differently.",
      caption: "Training images",
    });

    expect(text).toContain("Training images");
    expect(text).toContain("slanted differently");
  });

  it("gives the marker the transcript of a video", () => {
    const text = stimulusToText({
      kind: "video",
      assetId: "anything",
      description: "The presenter explains that the training data came from one company.",
    });

    expect(text).toContain("one company");
    expect(text).toContain("transcript");
  });
});

describe("removing an asset", () => {
  it("deletes the file and the row, and forgets its tags", () => {
    const created = createAsset({ ...validMetadata, bytes: PNG });
    if (!created.ok) throw new Error(created.problem);

    const onDisk = assetPath(created.id, "png");
    expect(fs.existsSync(onDisk)).toBe(true);

    deleteAsset(created.id);

    expect(fs.existsSync(onDisk)).toBe(false);
    expect(listAssets()).toHaveLength(0);
    expect(validAssetIds().size).toEqual(0);
  });
});
