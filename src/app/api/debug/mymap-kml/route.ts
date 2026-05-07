import { NextResponse } from "next/server";
import { fetchAndParseGoogleMyMapKml } from "@/lib/googleMyMapsKml";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mid = searchParams.get("mid")?.trim();

  if (!mid) {
    return NextResponse.json({ error: "missing mid" }, { status: 400 });
  }

  try {
    const result = await fetchAndParseGoogleMyMapKml(mid);
    const contentTypeLower = (result.contentType ?? "").toLowerCase();
    const isHtmlResponse =
      contentTypeLower.includes("text/html") ||
      /<!doctype html|<html[\s>]|accounts\.google\.com|service login|sign in/i.test(
        result.bodyPreview1000
      );

    const error =
      isHtmlResponse
        ? "KML response is HTML. My Maps อาจยังไม่ได้แชร์เป็น Anyone with the link can view"
        : null;

    return NextResponse.json({
      mid,
      kmlUrl: result.kmlUrl,
      httpStatus: result.httpStatus,
      contentType: result.contentType,
      bodyLength: result.bodyLength,
      polygonTagCount: result.polygonTagCount,
      coordinatesTagCount: result.coordinateTagCount,
      placemarkTagCount: result.placemarkCount,
      first1000Chars: result.bodyPreview1000,
      parsedPolygonCount: result.polygons.length,
      parsedFirstPolygonPointCount: result.polygons[0]?.length ?? 0,
      error
    });
  } catch (error) {
    return NextResponse.json(
      {
        mid,
        kmlUrl: `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`,
        httpStatus: null,
        contentType: null,
        bodyLength: 0,
        polygonTagCount: 0,
        coordinatesTagCount: 0,
        placemarkTagCount: 0,
        first1000Chars: "",
        parsedPolygonCount: 0,
        parsedFirstPolygonPointCount: 0,
        error: error instanceof Error ? error.message : "unknown error"
      },
      { status: 500 }
    );
  }
}
