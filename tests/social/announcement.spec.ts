import { expect, test } from "@playwright/test";
import { renderSocialImage } from "../../src/lib/socialImageRenderer";
import { readFile } from "node:fs/promises";
import { DEFAULT_SOCIAL_MAP_VIEW, socialImageSnapshot, type SocialImageAsset, type SocialMapView } from "../../src/lib/socialImage";

test("existing Social modal: upload, review, stale edits, regeneration, mobile bounds", async ({ page }, testInfo) => {
  let job = { id: "11111111-1111-4111-8111-111111111111", outage_date: "2026-09-20", equipment_code: "KBA01", doc_time_start: "09:00", doc_time_end: "15:00", doc_area_title: "หาดอ่าวนาง", doc_area_detail: "หาดอ่าวนาง", doc_purpose: "ปรับปรุงระบบจำหน่ายแรงสูง", map_link: "https://maps.google.com/", doc_status: "GENERATED", document_received_at: "2026-09-10T00:00:00Z", document_delivered_at: "2026-09-11T00:00:00Z", notice_status: "COMPLETED", social_status: "DRAFT", responsible_unit: "OPERATIONS", is_closed: false };
  let asset: SocialImageAsset | null = null;
  let generations = 0;
  let savedView: SocialMapView = DEFAULT_SOCIAL_MAP_VIEW;
  const png = await readFile(".tmp/social-image/20-sep.png");
  let generatedPng: Buffer = png;
  // All backend requests are fixtures; this suite never writes to a live project.
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/rest/v1/outage_jobs")) return route.fulfill({ json: [job] });
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname === "/generated-image.png") return route.fulfill({ contentType: "image/png", body: generatedPng });
    if (url.pathname === "/test-image.png") return route.fulfill({ contentType: "image/png", body: png });
    if (url.pathname.endsWith("/social-image")) {
      if (route.request().method() === "POST") {
        const encoded = (route.request().postData() ?? "").match(/\{"mode":"(?:fit|fill)","zoom":[^}]+\}/);
        expect(encoded).not.toBeNull();
        const requestedView = JSON.parse(encoded![0]);
        if (url.searchParams.has("preview")) return route.fulfill({ contentType: "image/png", body: await renderSocialImage(png, job, requestedView) });
        savedView = requestedView;
        generatedPng = await renderSocialImage(png, job, savedView);
        asset = { id: String(++generations), source_path: "source", generated_path: "generated", generated_at: "2026-09-15T00:00:00Z", snapshot: { ...socialImageSnapshot(job), map_view: savedView }, source_url: "/test-image.png", generated_url: "/generated-image.png" };
        return route.fulfill({ json: { ok: true } });
      }
      return route.fulfill({ json: { job, asset } });
    }
    if (url.pathname === "/api/jobs/social-post") {
      expect(route.request().postDataJSON()).toMatchObject({ confirmed: true, imageId: asset?.id });
      return route.fulfill({ json: { ok: true, job: { ...job, social_status: "POSTED" } } });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: [], counts: {} } });
    return route.continue();
  });
  await page.goto("/jobs");
  await page.getByRole("button", { name: "Post ลงสื่อ Social", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  await expect(modal.getByText("20 กันยายน 2569", { exact: true }).first()).toBeVisible();
  const final = modal.getByRole("button", { name: "บันทึกว่า Post ลงสื่อ Social แล้ว" });
  await expect(final).toBeDisabled();
  await expect(modal.getByRole("button", { name: "สร้างภาพประชาสัมพันธ์", exact: true })).toBeDisabled();
  await modal.locator('input[type="file"]').setInputFiles({ name: "bad.txt", mimeType: "text/plain", buffer: Buffer.from("bad") });
  await expect(modal.getByRole("alert")).toContainText("ไม่เกิน 3 MB");
  await modal.locator('input[type="file"]').setInputFiles({ name: "map.png", mimeType: "image/png", buffer: png });
  await expect(modal.getByRole("img", { name: "ตัวอย่างภาพประชาสัมพันธ์ 4 ต่อ 5" })).toBeVisible();
  await modal.getByRole("button", { name: "เต็มกรอบ" }).click();
  await modal.getByRole("slider", { name: "ซูมภาพแผนที่" }).fill("1.5");
  const preview = modal.getByRole("img", { name: "ตัวอย่างภาพประชาสัมพันธ์ 4 ต่อ 5" });
  await preview.screenshot({ path: `.tmp/social-browser/${testInfo.project.name}-preview.png` });
  const previewBounds = await preview.boundingBox();
  await page.mouse.move(previewBounds!.x + previewBounds!.width / 2, previewBounds!.y + previewBounds!.height / 2);
  await page.mouse.down(); await page.mouse.move(previewBounds!.x + previewBounds!.width / 2 + 30, previewBounds!.y + previewBounds!.height / 2 + 20); await page.mouse.up();
  await modal.getByRole("button", { name: "สร้างภาพประชาสัมพันธ์", exact: true }).click();
  expect(savedView.mode).toBe("fill"); expect(savedView.zoom).toBe(1.5);
  await expect(preview).toBeVisible();
  const previewBytes = await preview.evaluate(async element => {
    const response = await fetch((element as HTMLImageElement).src);
    return Array.from(new Uint8Array(await response.arrayBuffer()));
  });
  expect(Buffer.from(previewBytes)).toEqual(generatedPng);
  expect(savedView.x).not.toBe(0.5);
  const confirmation = modal.getByRole("checkbox");
  await expect(confirmation).toBeEnabled();
  await modal.getByRole("button", { name: "พอดีทั้งภาพ" }).click();
  await expect(confirmation).toBeDisabled();
  await modal.getByRole("button", { name: "เต็มกรอบ" }).click();
  await modal.getByRole("button", { name: "สร้างภาพใหม่", exact: true }).click();
  await expect(confirmation).toBeEnabled();
  await expect(final).toBeDisabled();
  await confirmation.check();
  await expect(final).toBeEnabled();
  for (const patch of [{ outage_date: "2026-09-21" }, { doc_time_start: "10:00" }, { doc_area_title: "หาดอ่าวนางและชุมชนใกล้เคียง" }]) {
    job = { ...job, ...patch };
    await expect(modal.getByRole("alert")).toContainText("ข้อมูลดับไฟมีการแก้ไข", { timeout: 10000 });
    await expect(final).toBeDisabled();
    await expect(confirmation).not.toBeChecked();
    await expect(modal.getByRole("button", { name: "ดาวน์โหลดภาพ" })).toBeDisabled();
    await modal.getByRole("button", { name: "สร้างภาพใหม่จากข้อมูลล่าสุด" }).click();
    await expect(confirmation).toBeEnabled();
    await confirmation.check();
    await expect(final).toBeEnabled();
  }
  await expect(modal.getByText("21 กันยายน 2569", { exact: true }).first()).toBeAttached();
  const bounds = await modal.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(page.viewportSize()!.height);
  await expect(final).toBeInViewport();
  await page.screenshot({ path: `.tmp/social-browser/${testInfo.project.name}.png` });
  await final.click();
  await expect(modal).toBeHidden();
});
