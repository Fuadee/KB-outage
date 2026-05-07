import type { SupabaseClient } from "@supabase/supabase-js";
import { extractGoogleMyMapsMid } from "@/lib/googleMyMaps";
import { fetchAndParseGoogleMyMapKml, type LatLng } from "@/lib/googleMyMapsKml";

function isPointInPolygon(point: LatLng, polygon: LatLng[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng;
    const yi = polygon[i].lat;
    const xj = polygon[j].lng;
    const yj = polygon[j].lat;

    const intersects =
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

export async function runVulnerablePatientsCheck(
  supabase: SupabaseClient,
  jobId: string | number,
  mapLink: string
) {
  const mid = extractGoogleMyMapsMid(mapLink);
  const checkedAt = new Date().toISOString();

  if (!mid) {
    await supabase
      .from("outage_jobs")
      .update({
        vulnerable_check_status: "NO_POLYGON_FOUND",
        vulnerable_check_count: 0,
        vulnerable_patient_ids: [],
        special_watchlist_check_status: "NO_POLYGON_FOUND",
        special_watchlist_check_count: 0,
        special_watchlist_customer_ids: [],
        special_watchlist_check_error: "ไม่พบ Polygon ใน Google My Maps",
        special_watchlist_check_checked_at: checkedAt,
        vulnerable_check_error: "ไม่พบ Polygon ใน Google My Maps",
        vulnerable_check_checked_at: checkedAt
      })
      .eq("id", jobId);
    return;
  }

  try {
    const kmlDebug = await fetchAndParseGoogleMyMapKml(mid);
    const contentTypeLower = (kmlDebug.contentType ?? "").toLowerCase();
    const isHtmlResponse =
      contentTypeLower.includes("text/html") ||
      /<!doctype html|<html[\s>]|accounts\.google\.com|service login|sign in/i.test(
        kmlDebug.bodyPreview1000
      );

    if (kmlDebug.httpStatus < 200 || kmlDebug.httpStatus >= 300 || isHtmlResponse) {
      throw new Error(
        "ไม่สามารถโหลด KML ได้ อาจต้องตั้งค่า My Maps เป็น Anyone with the link can view"
      );
    }

    if (kmlDebug.polygons.length === 0) {
      await supabase
        .from("outage_jobs")
        .update({
          vulnerable_check_status: "NO_POLYGON_FOUND",
          vulnerable_check_count: 0,
          vulnerable_patient_ids: [],
          special_watchlist_check_status: "NO_POLYGON_FOUND",
          special_watchlist_check_count: 0,
          special_watchlist_customer_ids: [],
          special_watchlist_check_error: "ไม่พบ Polygon ใน Google My Maps",
          special_watchlist_check_checked_at: checkedAt,
          vulnerable_check_error: "ไม่พบ Polygon ใน Google My Maps",
          vulnerable_check_checked_at: checkedAt
        })
        .eq("id", jobId);
      return;
    }

    const { data: patients, error: patientError } = await supabase
      .from("bedridden_patients")
      .select("id, latitude, longitude")
      .eq("status", "ACTIVE")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (patientError) {
      throw new Error(patientError.message);
    }

    const patientIds = (patients ?? [])
      .filter((patient) =>
        kmlDebug.polygons.some((polygon) =>
          isPointInPolygon(
            { lat: Number(patient.latitude), lng: Number(patient.longitude) },
            polygon
          )
        )
      )
      .map((patient) => patient.id);

    const { data: watchlistCustomers, error: watchlistError } = await supabase
      .from("special_watchlist_customers")
      .select("id, latitude, longitude")
      .eq("status", "ACTIVE")
      .not("latitude", "is", null)
      .not("longitude", "is", null);

    if (watchlistError) {
      throw new Error(watchlistError.message);
    }

    const watchlistIds = (watchlistCustomers ?? [])
      .filter((customer) =>
        kmlDebug.polygons.some((polygon) =>
          isPointInPolygon(
            { lat: Number(customer.latitude), lng: Number(customer.longitude) },
            polygon
          )
        )
      )
      .map((customer) => customer.id);

    await supabase
      .from("outage_jobs")
      .update({
        vulnerable_check_status:
          patientIds.length > 0 ? "FOUND_IN_POLYGON" : "NOT_FOUND_IN_POLYGON",
        vulnerable_check_count: patientIds.length,
        vulnerable_patient_ids: patientIds,
        vulnerable_check_checked_at: checkedAt,
        vulnerable_check_error: null,
        special_watchlist_check_status:
          watchlistIds.length > 0 ? "FOUND_IN_POLYGON" : "NOT_FOUND_IN_POLYGON",
        special_watchlist_check_count: watchlistIds.length,
        special_watchlist_customer_ids: watchlistIds,
        special_watchlist_check_checked_at: checkedAt,
        special_watchlist_check_error: null
      })
      .eq("id", jobId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await supabase
      .from("outage_jobs")
      .update({
        vulnerable_check_status: "KML_FETCH_FAILED",
        vulnerable_check_count: 0,
        vulnerable_patient_ids: [],
        vulnerable_check_error: message,
        vulnerable_check_checked_at: checkedAt,
        special_watchlist_check_status: "KML_FETCH_FAILED",
        special_watchlist_check_count: 0,
        special_watchlist_customer_ids: [],
        special_watchlist_check_error: message,
        special_watchlist_check_checked_at: checkedAt
      })
      .eq("id", jobId);
  }
}
