import { NextResponse } from "next/server";

import { getAsset } from "@/lib/assets/queries";
import { assetSize, readAsset, readAssetRange } from "@/lib/assets/store";
import { getApiUser } from "@/lib/auth/current-user";

export const dynamic = "force-dynamic";

/**
 * Serves an uploaded image or video.
 *
 * Behind a session, because an uploaded file should not be readable by whoever
 * can reach the port. The content type comes from what the bytes were found to
 * be at upload time, never from the filename, and `nosniff` stops the browser
 * from deciding otherwise.
 *
 * Video is served with range support: without it a player cannot seek, and some
 * browsers will not play at all.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ assetId: string }> },
) {
  const user = await getApiUser();
  if (!user) return NextResponse.json({ error: "Not signed in." }, { status: 401 });

  const { assetId } = await params;
  const wantsCaptions = new URL(request.url).searchParams.get("captions") === "1";

  const asset = getAsset(assetId);
  if (!asset) return NextResponse.json({ error: "Unknown asset." }, { status: 404 });

  if (wantsCaptions) {
    if (!asset.captionsExtension) {
      return NextResponse.json({ error: "No captions." }, { status: 404 });
    }
    const captions = readAsset(assetId, "text/vtt");
    if (!captions) return NextResponse.json({ error: "Unknown asset." }, { status: 404 });
    return new NextResponse(new Uint8Array(captions), {
      headers: {
        ...baseHeaders("text/vtt"),
        "content-length": String(captions.byteLength),
      },
    });
  }

  const total = assetSize(assetId, asset.mimeType);
  if (total === null) {
    return NextResponse.json({ error: "Unknown asset." }, { status: 404 });
  }

  const range = parseRange(request.headers.get("range"), total);
  if (range === "unsatisfiable") {
    return new NextResponse(null, {
      status: 416,
      headers: { "content-range": `bytes */${total}` },
    });
  }

  if (range) {
    const chunk = readAssetRange(assetId, asset.mimeType, range.start, range.end);
    if (!chunk) return NextResponse.json({ error: "Unknown asset." }, { status: 404 });
    return new NextResponse(new Uint8Array(chunk), {
      status: 206,
      headers: {
        ...baseHeaders(asset.mimeType),
        "content-range": `bytes ${range.start}-${range.end}/${total}`,
        "content-length": String(chunk.byteLength),
      },
    });
  }

  const body = readAsset(assetId, asset.mimeType);
  if (!body) return NextResponse.json({ error: "Unknown asset." }, { status: 404 });

  return new NextResponse(new Uint8Array(body), {
    headers: {
      ...baseHeaders(asset.mimeType),
      "content-length": String(body.byteLength),
    },
  });
}

function baseHeaders(contentType: string): Record<string, string> {
  return {
    "content-type": contentType,
    // The bytes decided the type at upload; do not let the browser re-decide.
    "x-content-type-options": "nosniff",
    "content-disposition": "inline",
    "accept-ranges": "bytes",
    // Private: the response is only for the signed-in student who asked.
    "cache-control": "private, max-age=3600",
  };
}

/** `bytes=start-end`. Only a single range is supported, which is all a player sends. */
function parseRange(
  header: string | null,
  total: number,
): { start: number; end: number } | "unsatisfiable" | null {
  if (!header) return null;

  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;

  const [, rawStart, rawEnd] = match;
  if (rawStart === "" && rawEnd === "") return null;

  // A suffix range — "the last N bytes".
  if (rawStart === "") {
    const suffix = Number(rawEnd);
    if (suffix <= 0) return "unsatisfiable";
    return { start: Math.max(0, total - suffix), end: total - 1 };
  }

  const start = Number(rawStart);
  const end = rawEnd === "" ? total - 1 : Math.min(Number(rawEnd), total - 1);
  if (start >= total || start > end) return "unsatisfiable";

  return { start, end };
}
