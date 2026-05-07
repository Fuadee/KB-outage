export type LatLng = { lat: number; lng: number };

export type GoogleMyMapsKmlDebug = {
  kmlUrl: string;
  httpStatus: number;
  contentType: string | null;
  bodyLength: number;
  bodyPreview1000: string;
  coordinateTagCount: number;
  hasCoordinatesTag: boolean;
  isLikelyXml: boolean;
  redirectDetected: boolean;
  loginDetected: boolean;
  captchaDetected: boolean;
  placemarkCount: number;
  polygonTagCount: number;
  rawFirstPlacemarkXml: string | null;
  rawFirstPolygonXml: string | null;
  firstPolygonCoordinatesRaw: string | null;
  polygons: LatLng[][];
};

export function parseKmlPolygons(kmlText: string): LatLng[][] {
  const polygons: LatLng[][] = [];
  const polygonBlocks = kmlText.match(/<Polygon[\s\S]*?<\/Polygon>/gi) ?? [];

  for (const polygonBlock of polygonBlocks) {
    const outerBoundaryBlocks =
      polygonBlock.match(/<outerBoundaryIs[\s\S]*?<\/outerBoundaryIs>/gi) ?? [polygonBlock];

    for (const boundaryBlock of outerBoundaryBlocks) {
      const linearRingBlocks =
        boundaryBlock.match(/<LinearRing[\s\S]*?<\/LinearRing>/gi) ?? [boundaryBlock];

      for (const ringBlock of linearRingBlocks) {
        const coordinatesBlocks =
          ringBlock.match(/<coordinates>([\s\S]*?)<\/coordinates>/gi) ?? [];

        for (const block of coordinatesBlocks) {
          const raw = block.replace(/<\/?coordinates>/gi, "").trim();
          if (!raw) continue;

          const points = raw
            .split(/\s+/)
            .map((coord) => coord.trim())
            .filter(Boolean)
            .map((coord) => {
              const [lngRaw, latRaw] = coord.split(",");
              const lat = Number.parseFloat(latRaw);
              const lng = Number.parseFloat(lngRaw);
              if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
              return { lat, lng };
            })
            .filter((point): point is LatLng => Boolean(point));

          if (points.length >= 3) polygons.push(points);
        }
      }
    }
  }

  return polygons;
}

export async function fetchAndParseGoogleMyMapKml(mid: string): Promise<GoogleMyMapsKmlDebug> {
  const kmlUrl = `https://www.google.com/maps/d/kml?mid=${encodeURIComponent(mid)}&forcekml=1`;
  const response = await fetch(kmlUrl, { cache: "no-store", redirect: "follow" });
  const body = await response.text();
  const contentType = response.headers.get("content-type");
  const bodyLower = body.toLowerCase();

  const placemarks = body.match(/<Placemark[\s\S]*?<\/Placemark>/gi) ?? [];
  const polygons = parseKmlPolygons(body);
  const firstPolygonMatch = body.match(/<Polygon[\s\S]*?<\/Polygon>/i);
  const firstPolygonCoordinatesRaw =
    firstPolygonMatch?.[0].match(/<coordinates>([\s\S]*?)<\/coordinates>/i)?.[1]?.trim() ??
    null;

  const isLikelyXml =
    Boolean(contentType?.toLowerCase().includes("xml")) ||
    /^\s*<\?xml/i.test(body) ||
    /^\s*<kml[\s>]/i.test(body);

  return {
    kmlUrl,
    httpStatus: response.status,
    contentType,
    bodyLength: body.length,
    bodyPreview1000: body.slice(0, 1000),
    coordinateTagCount: (body.match(/<coordinates[\s>]/gi) ?? []).length,
    hasCoordinatesTag: /<coordinates[\s>]/i.test(body),
    isLikelyXml,
    redirectDetected:
      response.redirected || /<title>redirect/i.test(bodyLower) || /http-equiv=["']refresh/i.test(bodyLower),
    loginDetected:
      /signin|log in|accounts\.google\.com|service login|consent/i.test(bodyLower),
    captchaDetected:
      /captcha|recaptcha|unusual traffic|verify you are human/i.test(bodyLower),
    placemarkCount: placemarks.length,
    polygonTagCount: (body.match(/<Polygon[\s\S]*?<\/Polygon>/gi) ?? []).length,
    rawFirstPlacemarkXml: placemarks[0] ?? null,
    rawFirstPolygonXml: firstPolygonMatch?.[0] ?? null,
    firstPolygonCoordinatesRaw,
    polygons
  };
}
