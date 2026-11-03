import { expect, test } from "@playwright/test";
import { readFile } from "node:fs/promises";

test("create, validate, save, reopen and remove outage periods in the original modal", async ({ page }, testInfo) => {
  let job: Record<string, unknown> = { id: "11111111-1111-4111-8111-111111111111", outage_date: "2026-11-12", equipment_code: "KBA01", nakhon_status: "NOT_REQUIRED", doc_status: "PENDING", doc_issue_date: "2026-11-03", doc_purpose: "ปรับปรุงระบบจำหน่าย", doc_area_title: "พื้นที่กระบี่", doc_area_detail: "ชุมชนกระบี่", map_link: "https://www.google.com/maps?q=8.0,98.9", customer_count: null, responsible_unit: "แผนกปฏิบัติการ", is_closed: false };
  let saves = 0;
  const docx = await readFile(".tmp/multi-period/outage-2.docx");
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/rest/v1/outage_jobs")) return route.fulfill({ json: [job] });
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname === "/api/docs/create") {
      const body = route.request().postDataJSON();
      saves++;
      job = { ...job, ...body.payload, doc_status: "GENERATED", doc_generated_at: "2026-11-03T00:00:00Z" };
      return route.fulfill({ contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers: { "Content-Disposition": 'attachment; filename="outage.docx"' }, body: docx });
    }
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: [], counts: {} } });
    return route.continue();
  });
  await page.goto("/jobs");
  await page.getByRole("button", { name: "สร้างเอกสารดับไฟ", exact: true }).first().click();
  const modal = page.getByRole("dialog");
  const input = (kind: string, n: number) => modal.getByLabel(`${kind} ช่วงที่ ${n}`, { exact: true });
  await expect(modal.getByText("ช่วงที่ 1", { exact: true })).toHaveCount(0);
  await expect(modal.getByText(/สรุปเวลาดับไฟ:/)).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "ลบช่วงที่ 1", exact: true })).toHaveCount(0);
  await input("เวลาเริ่มดับไฟ", 1).fill("16:00");
  await input("เวลาจ่ายไฟคืน", 1).fill("17:00");
  await modal.getByRole("button", { name: "+ เพิ่มช่วงที่ 2", exact: true }).click();
  await expect(modal.getByRole("button", { name: "+ เพิ่มช่วงที่ 2", exact: true })).toHaveCount(0);
  await expect(modal.getByText("ช่วงที่ 1", { exact: true })).toBeVisible();
  await expect(modal.getByText(/สรุปเวลาดับไฟ:/)).toHaveCount(0);
  await input("เวลาเริ่มดับไฟ", 2).fill("09:00");
  await input("เวลาจ่ายไฟคืน", 2).fill("10:00");
  await input("เวลาจ่ายไฟคืน", 2).blur();
  await expect(input("เวลาเริ่มดับไฟ", 1)).toHaveValue("09:00");
  // Overlap must prevent both download and persistence.
  await input("เวลาเริ่มดับไฟ", 2).fill("09:30");
  await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("ซ้อนทับ");
  await expect(modal.getByText(/สรุปเวลาดับไฟ:/)).toHaveCount(0);
  expect(saves).toBe(0);
  await input("เวลาเริ่มดับไฟ", 2).fill("23:00");
  await input("เวลาจ่ายไฟคืน", 2).fill("01:00");
  await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(modal.getByRole("alert")).toContainText("ข้ามเที่ยงคืน");
  expect(saves).toBe(0);
  await input("เวลาเริ่มดับไฟ", 2).fill("16:00");
  await input("เวลาจ่ายไฟคืน", 2).fill("17:00");
  await expect(modal.getByText("สรุปเวลาดับไฟ: 09.00–10.00 น. และ 16.00–17.00 น.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `.tmp/multi-period/modal-${testInfo.project.name}.png` });
  const bounds = await modal.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(page.viewportSize()!.width);
  const download = page.waitForEvent("download");
  await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
  await download;
  await expect(modal).toBeHidden();
  expect(job.outage_periods).toEqual([{ start_time: "09:00", end_time: "10:00" }, { start_time: "16:00", end_time: "17:00" }]);
  await expect(page.getByText("09.00–10.00 น. และ 16.00–17.00 น.", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "ดาวน์โหลดเอกสารอีกครั้ง", exact: true }).first().click();
  await expect(input("เวลาเริ่มดับไฟ", 2)).toHaveValue("16:00");
  await modal.getByRole("button", { name: "ลบช่วงที่ 2", exact: true }).click();
  await expect(modal.getByText("ช่วงที่ 1", { exact: true })).toHaveCount(0);
  await expect(modal.getByRole("button", { name: "+ เพิ่มช่วงที่ 2", exact: true })).toBeVisible();
  await expect(modal.getByText("สรุปเวลาดับไฟ: 09.00–10.00 น.", { exact: true })).toBeVisible();
  await page.screenshot({ path: `.tmp/multi-period/single-${testInfo.project.name}.png` });
  await expect(input("เวลาเริ่มดับไฟ", 1)).toHaveValue("09:00");
  await expect(modal.getByRole("button", { name: "ลบช่วงที่ 1", exact: true })).toHaveCount(0);
  await modal.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(modal).toBeHidden();
  expect(saves).toBe(2);
  expect(job.outage_periods).toEqual([{ start_time: "09:00", end_time: "10:00" }]);
  job = { ...job, doc_url: "https://docs.google.com/document/d/legacy" };
  await page.reload();
  await page.getByRole("button", { name: "แก้ไขข้อมูลเอกสาร", exact: true }).click();
  await expect(input("เวลาเริ่มดับไฟ", 1)).toHaveValue("09:00");
  await modal.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  const historical = [{ start_time: "09:00", end_time: "10:00" }, { start_time: "12:00", end_time: "13:00" }, { start_time: "16:00", end_time: "17:00" }];
  job = { ...job, outage_periods: historical };
  await page.reload();
  await page.getByRole("button", { name: "แก้ไขข้อมูลเอกสาร", exact: true }).click();
  await expect(modal.getByRole("status")).toContainText("เกินขีดจำกัด UI");
  for (let n = 1; n <= 3; n++) await expect(input("เวลาเริ่มดับไฟ", n)).toHaveAttribute("readonly", "");
  await expect(input("เวลาเริ่มดับไฟ", 3)).toHaveValue("16:00");
  await expect(modal.getByRole("button", { name: /ลบช่วง|เพิ่มช่วง/ })).toHaveCount(0);
  await modal.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  expect(job.outage_periods).toEqual(historical);
  expect(saves).toBe(2);
});

test("Calendar keeps one job and displays every outage period", async ({ page }, testInfo) => {
  await page.clock.setFixedTime(new Date("2026-11-03T07:00:00+07:00"));
  const periods = [{ start_time: "09:00", end_time: "10:00" }, { start_time: "12:00", end_time: "13:00" }, { start_time: "16:00", end_time: "17:00" }];
  const job = { id: "11111111-1111-4111-8111-111111111111", outage_date: "2026-11-12", equipment_code: "KBA01", outage_periods: periods, time_start: "09:00", time_end: "10:00", status: "Doc", responsible_unit: "แผนกปฏิบัติการ", display_area: "พื้นที่กระบี่" };
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname === "/api/jobs/calendar") return route.fulfill({ json: [{ date: job.outage_date, total: 1, switching_count: 0, shift_one_distribution_count: 0, entries: [{ responsible_unit: job.responsible_unit, status: "Doc", count: 1, switching_count: 0, shift_one_distribution_count: 0 }] }] });
    if (url.pathname === "/api/jobs") return route.fulfill({ json: [job] });
    return route.continue();
  });
  await page.goto("/calendar");
  if (testInfo.project.name === "mobile") await page.getByRole("button", { name: /^วันที่ 12 มี 1 งาน/ }).click();
  else await page.getByRole("button").filter({ has: page.locator("span", { hasText: /^12$/ }) }).filter({ visible: true }).first().click();
  await expect(page.getByText("09.00–10.00 น., 12.00–13.00 น. และ 16.00–17.00 น.", { exact: true }).filter({ visible: true })).toBeVisible();
  await expect(page.getByText("KBA01", { exact: true }).filter({ visible: true })).toHaveCount(1);
  await page.screenshot({ path: `.tmp/multi-period/calendar-${testInfo.project.name}.png` });
});


