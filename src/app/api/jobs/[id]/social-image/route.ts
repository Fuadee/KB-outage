import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { latestSocialImage, socialServerClient, SOCIAL_BUCKET } from "@/lib/socialImageServer";
import { isSocialImageStale, socialImageSnapshot, MAX_SOCIAL_IMAGE_BYTES } from "@/lib/socialImage";
import { normalizeSocialMap, renderSocialImage } from "@/lib/socialImageRenderer";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: { id: string } };
async function readUpload(request: Request) {
  // Bound chunked requests as well as requests with a Content-Length header.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("กรุณาอัปโหลดภาพพื้นที่ดับไฟ");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_SOCIAL_IMAGE_BYTES + 65536) { await reader.cancel(); throw new Error("ขนาดไฟล์สูงสุด 3 MB"); }
    chunks.push(value);
  }
  return new Response(Buffer.concat(chunks), { headers: { "Content-Type": request.headers.get("content-type") ?? "" } }).formData();
}
async function load(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("รหัสงานไม่ถูกต้อง");
  const client = socialServerClient();
  const { data: job, error } = await client.from("outage_jobs").select("*").eq("id", id).single();
  if (error || !job) throw new Error("ไม่พบข้อมูลงาน");
  const asset = await latestSocialImage(client, id);
  return { client, job, asset };
}
export async function GET(request: Request, { params }: Context) {
  try {
    const { client, job, asset } = await load(params.id);
    const stale = !!asset && isSocialImageStale(job, asset);
    if (new URL(request.url).searchParams.has("download")) {
      if (!asset || stale) return NextResponse.json({ error: "กรุณาสร้างภาพประชาสัมพันธ์ใหม่" }, { status: 409 });
      const { data, error } = await client.storage.from(SOCIAL_BUCKET).download(asset.generated_path);
      if (error || !data) throw new Error("ดาวน์โหลดภาพไม่สำเร็จ");
      return new Response(await data.arrayBuffer(), { headers: { "Content-Type": "image/png", "Content-Disposition": `attachment; filename="outage-${job.outage_date}.png"`, "Cache-Control": "no-store" } });
    }
    if (asset) {
      const bucket = client.storage.from(SOCIAL_BUCKET);
      const urls = await Promise.all([bucket.createSignedUrl(asset.source_path, 3600), bucket.createSignedUrl(asset.generated_path, 3600)]);
      if (urls.some(result => result.error)) throw new Error("เปิดภาพไม่สำเร็จ");
      asset.source_url = urls[0].data?.signedUrl;
      asset.generated_url = urls[1].data?.signedUrl;
    }
    return NextResponse.json({ job, asset, stale }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) { console.error("Social image read", error); return NextResponse.json({ error: "โหลดข้อมูลประชาสัมพันธ์ไม่สำเร็จ" }, { status: 500 }); }
}
export async function POST(request: Request, { params }: Context) {
  try {
    if (Number(request.headers.get("content-length")) > MAX_SOCIAL_IMAGE_BYTES + 65536) return NextResponse.json({ error: "ขนาดไฟล์สูงสุด 3 MB" }, { status: 413 });
    const { client, job, asset } = await load(params.id);
    const form = await readUpload(request);
    const file = form.get("map");
    const bucket = client.storage.from(SOCIAL_BUCKET);
    let map: Buffer;
    let sourcePath = asset?.source_path;
    if (file instanceof File) {
      map = await normalizeSocialMap(Buffer.from(await file.arrayBuffer()), file.type);
      sourcePath = `${params.id}/source/${randomUUID()}.png`;
    } else {
      if (!sourcePath) return NextResponse.json({ error: "กรุณาอัปโหลดภาพพื้นที่ดับไฟก่อนสร้างภาพ" }, { status: 400 });
      const { data, error } = await bucket.download(sourcePath);
      if (error || !data) throw new Error("โหลดภาพพื้นที่ไม่สำเร็จ");
      map = Buffer.from(await data.arrayBuffer());
    }
    const output = await renderSocialImage(map, job);
    const generatedPath = `${params.id}/generated/${randomUUID()}.png`;
    const uploaded: string[] = [];
    try {
      if (file instanceof File) {
        const { error } = await bucket.upload(sourcePath!, map, { contentType: "image/png", upsert: false });
        if (error) throw error;
        uploaded.push(sourcePath!);
      }
      const { error } = await bucket.upload(generatedPath, output, { contentType: "image/png", upsert: false });
      if (error) throw error;
      uploaded.push(generatedPath);
      const { error: saveError } = await client.from("social_announcement_images").insert({ job_id: params.id, source_path: sourcePath, generated_path: generatedPath, snapshot: socialImageSnapshot(job) });
      if (saveError) throw saveError;
    } catch (error) { if (uploaded.length) await bucket.remove(uploaded); throw error; }
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("Social image generation", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "สร้างภาพไม่สำเร็จ กรุณาลองใหม่" }, { status: 400 });
  }
}
