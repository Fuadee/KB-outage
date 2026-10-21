import { expect, test, type Page } from "@playwright/test";
import type { PersonReference } from "../../src/lib/people";
import { getResponsibleUnitShortLabel } from "../../src/lib/jobMetadata";

const personId = "22222222-2222-4222-8222-222222222222";
const baseJob = {
  id: "11111111-1111-4111-8111-111111111111", equipment_code: "TEST-NOTICE",
  outage_date: "2026-10-25", responsible_unit: "กฟส.อ่าวนาง",
  doc_status: "GENERATED", doc_generated_at: "2026-10-20T00:00:00Z",
  document_received_at: "2026-10-20T01:00:00Z", document_delivered_at: "2026-10-20T02:00:00Z",
  notice_status: "NONE", notice_date: null as string | null,
  notice_completed_at: null as string | null, notice_by: null as string | null,
  notice_by_person_id: null as string | null, notice_by_person: null as PersonReference | null,
  social_status: "DRAFT", nakhon_status: "NOT_REQUIRED", is_closed: false
};

async function setup(page: Page, initial = baseJob, options: { saveGate?: Promise<void>; refreshGate?: Promise<void> } = {}) {
  await page.clock.install({ time: new Date("2026-10-21T12:00:00+07:00") });
  let job = { ...initial };
  const person: PersonReference = {
    id: personId, full_name: "ผู้แจก ทดสอบ", is_active: true,
    department: initial.responsible_unit === "แผนกปฏิบัติการ" ? "แผนกก่อสร้าง" : "แผนกปฏิบัติการ"
  };
  const writes: Array<{ path: string; body: Record<string, unknown> }> = [];
  const clipboard: string[] = [];
  let jobsReads = 0;
  let saveFailure: "none" | "http" | "declined" | "missing-job" = "none";
  let refreshFailure = false;
  let navigationCount = 0;
  page.on("request", request => {
    if (request.isNavigationRequest() && request.frame() === page.mainFrame()) navigationCount++;
  });
  await page.exposeFunction("recordNoticeCopy", (value: string) => { clipboard.push(value); });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: (value: string) => (window as unknown as { recordNoticeCopy: (value: string) => Promise<void> }).recordNoticeCopy(value) }
    });
  });
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes("/rest/v1/outage_jobs")) {
      jobsReads++;
      if (jobsReads > 1 && options.refreshGate) await options.refreshGate;
      if (jobsReads > 1 && refreshFailure) return route.fulfill({ status: 400, json: { code: "XX000", message: "Simulated refresh failure" } });
      return route.fulfill({ json: request.headers().accept?.includes("object") ? job : [job] });
    }
    if (url.pathname === "/api/people") {
      expect(url.searchParams.has("department")).toBe(false);
      expect(url.searchParams.get("active")).toBe("true");
      return route.fulfill({ json: { ok: true, data: initial.notice_by_person?.is_active === false ? [] : [person] } });
    }
    if (url.pathname.endsWith("/notice-completion")) {
      const body = request.postDataJSON();
      expect(body.completed_by_person_id).toBe(personId);
      writes.push({ path: url.pathname, body });
      if (options.saveGate) await options.saveGate;
      if (saveFailure === "http") return route.fulfill({ status: 500, json: { ok: false, error: "บันทึกไม่สำเร็จ กรุณาลองใหม่" } });
      if (saveFailure === "declined") return route.fulfill({ json: { ok: false, error: "ไม่สามารถยืนยันการบันทึกได้" } });
      if (saveFailure === "missing-job") return route.fulfill({ json: { ok: true, job: {} } });
      const preserving = job.notice_status === "COMPLETED" && job.notice_by_person_id === body.completed_by_person_id;
      job = { ...job, notice_status: "COMPLETED", notice_completed_at: body.completed_at, notice_by: preserving ? job.notice_by : person.full_name, notice_by_person_id: person.id, notice_by_person: preserving ? job.notice_by_person : person };
      return route.fulfill({ json: { ok: true, job } });
    }
    if (url.pathname === "/api/jobs/notice-schedule") {
      const body = request.postDataJSON();
      writes.push({ path: url.pathname, body });
      job = { ...job, notice_status: "SCHEDULED", notice_date: body.notice_date };
      return route.fulfill({ json: { ok: true, job } });
    }
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: { targets: [] }, counts: {} } });
    return route.continue();
  });
  await page.goto("/jobs");
  return {
    writes, clipboard, person, get job() { return job; },
    get jobsReads() { return jobsReads; }, get navigationCount() { return navigationCount; },
    setSaveFailure(value: typeof saveFailure) { saveFailure = value; },
    failRefresh() { refreshFailure = true; }
  };
}

test("Ao Nang saves a cross-department distributor and keeps its assignment and workflow", async ({ page }) => {
  const h = await setup(page);
  await page.getByRole("button", { name: "แจ้งอ่าวนางแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "บันทึกผลการแจกหนังสือ", exact: true })).toBeVisible();
  await expect(dialog).toContainText("หน่วยงานรับผิดชอบตามมอบหมายงาน: กฟส.อ่าวนาง");
  await expect(dialog).not.toContainText(/LINE|คัดลอก|ข้อมูลยังไม่ครบ|ผู้ใช้ไฟรายใหญ่/);
  await expect(dialog.locator("pre")).toHaveCount(0);
  await expect(dialog).toContainText("สถานะ: รอแจก");
  await page.screenshot({ path: test.info().outputPath("notice-completion.png") });
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  await expect(dialog).toContainText("กรุณาระบุวันเวลาและผู้แจกจริง");
  expect(h.writes).toHaveLength(0);
  await dialog.getByRole("combobox").fill("พิมพ์ชื่อเองโดยไม่เลือก");
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  expect(h.writes).toHaveLength(0);
  await dialog.getByLabel("วันและเวลาที่แจกจริง", { exact: true }).fill("2026-10-21T10:30");
  await dialog.getByRole("combobox").fill("ผู้แจก");
  await expect(page.getByRole("option", { name: /ผู้แจก ทดสอบ/ })).toContainText(getResponsibleUnitShortLabel(h.person.department));
  await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
  await expect(dialog).toContainText("สังกัด: แผนกปฏิบัติการ");
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => h.jobsReads).toBe(2);
  expect(h.writes).toHaveLength(1);
  expect(h.job.notice_status).toBe("COMPLETED");
  expect(h.job.responsible_unit).toBe("กฟส.อ่าวนาง");
  expect(h.clipboard).toHaveLength(0);
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await expect(page.locator("article")).toContainText("แจกหนังสือแล้ว · ผู้แจก ทดสอบ");
  await expect(page.locator("article")).toContainText("ผู้แจก ทดสอบ · แผนกปฏิบัติการ");
  await page.reload();
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await expect(page.locator("article")).toContainText("ผู้แจก ทดสอบ · แผนกปฏิบัติการ");
});

test("Ao Nang historical schedules still show only completion fields", async ({ page }) => {
  await setup(page, { ...baseJob, notice_status: "SCHEDULED", notice_date: "2026-10-20" });
  await page.getByRole("button", { name: "แจ้งอ่าวนางแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).not.toContainText(/LINE|คัดลอก|ผู้ใช้ไฟรายใหญ่|วันที่จะไปดำเนินการแจ้ง/);
  await expect(dialog.getByRole("combobox")).toBeVisible();
  await expect(dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true })).toBeVisible();
});

test("construction saves a cross-department distributor without a LINE preview", async ({ page }) => {
  const h = await setup(page, { ...baseJob, responsible_unit: "แผนกก่อสร้าง" });
  await page.getByRole("button", { name: "แจ้งก่อสร้างแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "บันทึกผลการแจกหนังสือ", exact: true })).toBeVisible();
  await expect(dialog).not.toContainText(/LINE|คัดลอก/);
  await dialog.getByRole("combobox").fill("ผู้แจก");
  await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(h.clipboard).toHaveLength(0);
  expect(h.writes).toHaveLength(1);
  expect(h.job.responsible_unit).toBe("แผนกก่อสร้าง");
  expect(h.job.notice_by_person_id).toBe(personId);
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await expect(page.locator("article")).toContainText("ผู้แจก ทดสอบ · แผนกปฏิบัติการ");
});

test("operations retains schedule-and-copy without prematurely completing distribution", async ({ page }) => {
  const h = await setup(page, { ...baseJob, responsible_unit: "แผนกปฏิบัติการ" });
  await page.getByRole("button", { name: "แจ้งหนังสือดับไฟ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("ข้อความสำหรับส่ง LINE");
  await dialog.getByLabel("วันที่จะไปดำเนินการแจ้ง", { exact: true }).fill("2026-10-21");
  await dialog.getByRole("button", { name: "บันทึกและคัดลอกข้อความ", exact: true }).click();
  await expect(dialog).toContainText("บันทึกกำหนดการและคัดลอกข้อความสำหรับ LINE แล้ว");
  expect(h.clipboard).toHaveLength(1);
  expect(h.writes).toHaveLength(1);
  expect(h.job.notice_status).toBe("SCHEDULED");
  expect(h.job.notice_completed_at).toBeNull();
  await expect(dialog.getByRole("heading", { name: "บันทึกผลการแจกหนังสือ", exact: true })).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "ข้อความสำหรับส่ง LINE", exact: true })).toHaveCount(0);
  await expect(dialog).toContainText("แผนกปฏิบัติการ · กะ 1");
  await dialog.getByRole("combobox").fill("ผู้แจก");
  await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
  await expect(dialog).toContainText("สังกัด: แผนกก่อสร้าง");
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(h.job.notice_status).toBe("COMPLETED");
  expect(h.job.responsible_unit).toBe("แผนกปฏิบัติการ");
});

test("legacy text stays visible but typing a different name requires an explicit person selection", async ({ page }) => {
  const h = await setup(page, { ...baseJob, notice_status: "COMPLETED", notice_completed_at: "2026-10-20T03:00:00Z", notice_by: "ผู้แจกข้อความเดิม" });
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await page.getByRole("button", { name: "ดู / แก้ไขผลการแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toHaveValue("ผู้แจกข้อความเดิม");
  await dialog.getByRole("combobox").fill("ชื่อใหม่ที่ไม่ได้เลือก");
  await dialog.getByRole("button", { name: "แก้ไขผลการแจกจริง", exact: true }).click();
  await expect(dialog).toContainText("กรุณาระบุวันเวลาและผู้แจกจริง");
  expect(h.writes).toHaveLength(0);
  expect(h.job.notice_by).toBe("ผู้แจกข้อความเดิม");
});

test("an inactive historical cross-department distributor can be preserved without appearing as a new option", async ({ page }) => {
  const historical: PersonReference = { id: personId, full_name: "ผู้แจกเดิม", department: "แผนกปฏิบัติการ", is_active: false };
  const h = await setup(page, { ...baseJob, notice_status: "COMPLETED", notice_completed_at: "2026-10-20T03:00:00Z", notice_by: historical.full_name, notice_by_person_id: personId, notice_by_person: historical });
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await page.getByRole("button", { name: "ดู / แก้ไขผลการแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toHaveValue(historical.full_name);
  await dialog.getByRole("combobox").click();
  await expect(dialog).toContainText("บุคลากรนี้ปิดใช้งานแล้ว");
  await expect(dialog.getByRole("option")).toHaveCount(0);
  await dialog.getByRole("button", { name: "แก้ไขผลการแจกจริง", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(h.job.notice_by).toBe(historical.full_name);
  expect(h.job.responsible_unit).toBe("กฟส.อ่าวนาง");
});

test("editing an existing completion closes the popup and refreshes the saved time without navigation", async ({ page }) => {
  const person: PersonReference = { id: personId, full_name: "ผู้แจก ทดสอบ", department: "แผนกปฏิบัติการ", is_active: true };
  const oldTime = "2026-10-20T03:00:00Z";
  const h = await setup(page, { ...baseJob, notice_status: "COMPLETED", notice_completed_at: oldTime, notice_by: person.full_name, notice_by_person_id: personId, notice_by_person: person });
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await page.getByRole("button", { name: "ดู / แก้ไขผลการแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("วันและเวลาที่แจกจริง", { exact: true }).fill("2026-10-21T11:45");
  await dialog.getByRole("button", { name: "แก้ไขผลการแจกจริง", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect.poll(() => h.jobsReads).toBe(2);
  expect(h.writes).toHaveLength(1);
  expect(h.job.notice_completed_at).not.toBe(oldTime);
  expect(h.navigationCount).toBe(1);
  await page.getByRole("button", { name: "ดู / แก้ไขผลการแจกหนังสือ", exact: true }).click();
  await expect(dialog.getByLabel("วันและเวลาที่แจกจริง", { exact: true })).toHaveValue("2026-10-21T11:45");
});

test("a slow save blocks double clicks and closes before the background refresh finishes", async ({ page }) => {
  let releaseSave!: () => void;
  let releaseRefresh!: () => void;
  const saveGate = new Promise<void>(resolve => { releaseSave = resolve; });
  const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve; });
  const h = await setup(page, baseJob, { saveGate, refreshGate });
  await page.getByRole("button", { name: "แจ้งอ่าวนางแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("ผู้แจก");
  await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).evaluate(button => { (button as HTMLButtonElement).click(); (button as HTMLButtonElement).click(); });
  await expect.poll(() => h.writes.length).toBe(1);
  await expect(dialog.getByRole("button", { name: "กำลังบันทึก...", exact: true })).toBeDisabled();
  await expect(dialog.getByRole("button", { name: "ยกเลิก", exact: true })).toBeDisabled();
  await dialog.getByRole("button", { name: "ปิด", exact: true }).click();
  await expect(dialog).toBeVisible();
  expect(h.job.notice_status).toBe("NONE");
  releaseSave();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("บันทึกผลการแจกหนังสือแล้ว", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await expect(page.locator("article")).toContainText("แจกหนังสือแล้ว · ผู้แจก ทดสอบ");
  expect(h.navigationCount).toBe(1);
  const refreshed = page.waitForResponse(response => response.url().includes("/rest/v1/outage_jobs"));
  releaseRefresh();
  await refreshed;
  await expect(dialog).toHaveCount(0);
});

for (const failure of ["http", "declined", "missing-job"] as const) {
  test(`${failure} error preserves modal values and allows a successful retry`, async ({ page }) => {
    const h = await setup(page);
    h.setSaveFailure(failure);
    await page.getByRole("button", { name: "แจ้งอ่าวนางแจกหนังสือ", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const time = dialog.getByLabel("วันและเวลาที่แจกจริง", { exact: true });
    await time.fill("2026-10-21T10:15");
    await dialog.getByRole("combobox").fill("ผู้แจก");
    await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
    await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
    await expect(dialog).toContainText(failure === "declined" ? "ไม่สามารถยืนยันการบันทึกได้" : failure === "http" ? "บันทึกไม่สำเร็จ กรุณาลองใหม่" : "บันทึกผลการแจกหนังสือไม่สำเร็จ");
    await expect(time).toHaveValue("2026-10-21T10:15");
    await expect(dialog.getByRole("combobox")).toHaveValue("ผู้แจก ทดสอบ");
    await expect(dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true })).toBeEnabled();
    expect(h.job.notice_status).toBe("NONE");
    expect(h.jobsReads).toBe(1);
    h.setSaveFailure("none");
    await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    expect(h.writes).toHaveLength(2);
  });
}

test("validation errors retain a selected distributor and never close or submit the modal", async ({ page }) => {
  const h = await setup(page);
  await page.getByRole("button", { name: "แจ้งอ่าวนางแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("ผู้แจก");
  await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
  await dialog.getByLabel("วันและเวลาที่แจกจริง", { exact: true }).fill("");
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  await expect(dialog).toContainText("กรุณาระบุวันเวลาและผู้แจกจริง");
  await expect(dialog.getByRole("combobox")).toHaveValue("ผู้แจก ทดสอบ");
  expect(h.writes).toHaveLength(0);
  expect(h.jobsReads).toBe(1);
});

test("a failed background refresh does not reopen the modal or erase the confirmed result", async ({ page }) => {
  const h = await setup(page);
  h.failRefresh();
  await page.getByRole("button", { name: "แจ้งอ่าวนางแจกหนังสือ", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("ผู้แจก");
  await page.getByRole("option", { name: /ผู้แจก ทดสอบ/ }).click();
  await dialog.getByRole("button", { name: "ยืนยันว่าแจกหนังสือแล้ว", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByText("บันทึกผลแล้ว แต่โหลดรายการล่าสุดไม่สำเร็จ กรุณาลองใหม่ภายหลัง", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await expect(page.locator("article")).toContainText("แจกหนังสือแล้ว · ผู้แจก ทดสอบ");
  expect(h.navigationCount).toBe(1);
});
