import type { EditableTarget } from "./types";

export type CustomerPoint = {
  tempId: string;
  companyName: string;
  status: EditableTarget["status"];
  deliveredAt: string | null;
  proofImageUrl: string | null;
  latitude: number;
  longitude: number;
};

const GOOGLE_MAPS_COORD_PATTERNS = [
  /[?&]q=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
  /[?&]query=(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
  /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i,
  /!3d(-?\d+(?:\.\d+)?)[^!]*!4d(-?\d+(?:\.\d+)?)/i,
  /\/place\/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/i
];

const isValidCoordinate = (lat?: number | null, lng?: number | null) => {
  if (typeof lat !== "number" || typeof lng !== "number") return false;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return false;
  return true;
};

export const parseLatLngFromGoogleMapsLink = (mapLink?: string | null) => {
  if (!mapLink) return null;

  for (const pattern of GOOGLE_MAPS_COORD_PATTERNS) {
    const match = mapLink.match(pattern);
    if (!match) continue;
    const lat = Number(match[1]);
    const lng = Number(match[2]);
    if (isValidCoordinate(lat, lng)) {
      return { latitude: lat, longitude: lng };
    }
  }

  return null;
};

export const resolveTargetCoordinates = (item: EditableTarget) => {
  if (isValidCoordinate(item.latitude, item.longitude)) {
    return { latitude: item.latitude as number, longitude: item.longitude as number };
  }

  return parseLatLngFromGoogleMapsLink(item.map_link);
};

export const buildCustomerPoints = (items: EditableTarget[]) => {
  let missingCoordinateCount = 0;

  const points: CustomerPoint[] = items.flatMap((item, index) => {
    const coordinates = resolveTargetCoordinates(item);
    if (!coordinates) {
      missingCoordinateCount += 1;
      return [];
    }

    return [
      {
        tempId: item.tempId,
        companyName: item.company_name || `รายการ ${index + 1}`,
        status: item.status,
        deliveredAt: item.delivered_at ?? null,
        proofImageUrl: item.proof_image_url ?? null,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude
      }
    ];
  });

  return { points, missingCoordinateCount };
};

export const getGoogleMapsDirectionLink = (latitude: number, longitude: number) =>
  `https://www.google.com/maps?q=${latitude},${longitude}`;

