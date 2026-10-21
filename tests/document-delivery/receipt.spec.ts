import { expect, test, type Page } from "@playwright/test";

const serverTime = "2026-10-21T02:30:00.000Z";
const baseJob = {
  id: "11111111-1111-4111-8111-111111111111", equipment_code: "TEST-RECEIPT",
  outage_date: "2026-10-25", responsible_unit: "แผนกปฏิบัติการ", customer_count: 1,
  doc_status: "GENERATED", doc_generated_at: "2026-10-20T00:00:00Z",
  document_received_at: null as string | null, document_received_by: null as string | null,
  document_delivered_at: null, document_delivered_by: null,
  notice_status: "NONE", social_status: "DRAFT", nakhon_status: "NOT_REQUIRED", is_closed: false
};

async function setup(page: Page, initial = baseJob, gate?: Promise<void>) {
  let job = { ...initial };
  const writes: Record<string, unknown>[] = [];
  const history: Record<string, unknown>[] = [];
  let fail = false;
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes("/rest/v1/outage_jobs")) {
      return route.fulfill({ json: request.headers().accept?.includes("object") ? job : [job] });
    }
    if (url.pathname === "/api/people") return route.fulfill({ json: { ok: true, data: [] } });
    if (url.pathname.endsWith("/document-workflow") && request.method() === "PATCH") {
      const body = request.postDataJSON();
      writes.push(body);
      expect(body).toEqual({ action: "receive" });
      if (gate) await gate;
      if (fail) return route.fulfill({ status: 500, json: { ok: false, error: "ทดสอบบันทึกไม่สำเร็จ" } });
      if (!job.document_received_at) job = { ...job, document_received_at: serverTime, document_received_by: null };
      return route.fulfill({ json: { ok: true, job } });
    }
    if (url.pathname.endsWith("/workflow-rollback")) {
      if (request.method() === "POST") {
        const body = request.postDataJSON();
        expect(body.target_step).toBe("DOCUMENT_CREATED");
        const audit = { id: "audit", from_step: "DOCUMENT_RECEIVED", to_step: "DOCUMENT_CREATED", reason: body.reason, created_at: serverTime, before_state: { ...job } };
        history.push(audit);
        job = { ...job, document_received_at: null, document_received_by: null };
        return route.fulfill({ json: { ok: true, job, audit } });
      }
      return route.fulfill({ json: { ok: true, history } });
    }
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: {}, counts: {}, history: [] } });
    return route.continue();
  });
  await page.goto("/jobs");
  return { writes, history, get job() { return job; }, fail(value: boolean) { fail = value; } };
}

test("receipt confirmation has no fields, prevents repeat submits and waits for the server before advancing", async ({ page }) => {
  // A wrong client clock must not become the receipt timestamp.
  await page.clock.install({ time: new Date("2000-01-01T00:00:00Z") });
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const h = await setup(page, baseJob, gate);
  await page.getByRole("button", { name: "รับเอกสารแล้ว", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "ยืนยันการรับเอกสาร", exact: true })).toBeVisible();
  await expect(dialog).toContainText("ได้รับเอกสารและจัดเข้าแฟ้มงานเรียบร้อยแล้ว");
  await expect(dialog.locator("input, textarea, select")).toHaveCount(0);
  await page.screenshot({ path: test.info().outputPath("receipt-confirmation.png") });
  await dialog.locator("form").evaluate(form => { (form as HTMLFormElement).requestSubmit(); (form as HTMLFormElement).requestSubmit(); });
  await expect(dialog.getByRole("button", { name: "กำลังบันทึก...", exact: true })).toBeDisabled();
  await expect.poll(() => h.writes.length).toBe(1);
  expect(h.job.document_received_at).toBeNull();
  await expect(page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true })).toHaveCount(0);
  release();
  await expect(dialog).toHaveCount(0);
  expect(h.job.document_received_at).toBe(serverTime);
  expect(h.job.document_received_by).toBeNull();
  await expect(page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true })).toBeVisible();
  await expect(page.locator("article")).toContainText("รับเอกสารและจัดเข้าแฟ้มแล้ว");
  await page.reload();
  await page.getByRole("button", { name: "ดูข้อมูลการรับเอกสาร", exact: true }).click();
  await expect(dialog).toContainText("2569");
  await expect(dialog).not.toContainText("ชื่อผู้รับที่บันทึกไว้เดิม");
  await dialog.getByRole("button", { name: "ยืนยันรับเอกสาร", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(h.job.document_received_at).toBe(serverTime);
});

test("cancel and save failure keep the receipt pending, and a retry can succeed", async ({ page }) => {
  const h = await setup(page);
  const open = () => page.getByRole("button", { name: "รับเอกสารแล้ว", exact: true }).click();
  await open();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("button", { name: "ยกเลิก", exact: true }).click();
  expect(h.writes).toHaveLength(0);
  await open();
  h.fail(true);
  await dialog.getByRole("button", { name: "ยืนยันรับเอกสาร", exact: true }).click();
  await expect(dialog).toContainText("ทดสอบบันทึกไม่สำเร็จ");
  await expect(dialog.getByRole("button", { name: "ยืนยันรับเอกสาร", exact: true })).toBeEnabled();
  expect(h.job.document_received_at).toBeNull();
  await expect(page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true })).toHaveCount(0);
  h.fail(false);
  await dialog.getByRole("button", { name: "ยืนยันรับเอกสาร", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true })).toBeVisible();
});

test("legacy names remain readable and reconfirming never overwrites their receipt", async ({ page }) => {
  const legacy = { ...baseJob, document_received_at: "2026-10-20T01:00:00Z", document_received_by: "ผู้รับข้อมูลเก่า" };
  const h = await setup(page, legacy);
  await page.getByRole("button", { name: "ดูข้อมูลการรับเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toContainText("ชื่อผู้รับที่บันทึกไว้เดิม: ผู้รับข้อมูลเก่า");
  await expect(dialog.locator("input, textarea, select")).toHaveCount(0);
  await dialog.getByRole("button", { name: "ยืนยันรับเอกสาร", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(h.job).toEqual(legacy);
  await page.getByRole("button", { name: "ดูรายละเอียดเพิ่มเติม" }).click();
  await expect(page.getByText(/รับเอกสารแล้ว · .*ผู้รับข้อมูลเก่า/)).toBeVisible();
});

test("the existing rollback preserves receipt time and legacy name in readable audit history", async ({ page }) => {
  const h = await setup(page, { ...baseJob, document_received_at: "2026-10-20T01:00:00Z", document_received_by: "ผู้รับข้อมูลเก่า" });
  await page.getByRole("button", { name: "ดูรายละเอียดเพิ่มเติม" }).click();
  await page.getByRole("button", { name: "แก้ไข / ย้อนขั้นตอน", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio").first().check();
  await dialog.getByRole("button", { name: "ตรวจสอบผลกระทบ", exact: true }).click();
  await dialog.getByRole("button", { name: "ยืนยันย้อนขั้นตอน", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(h.job.document_received_at).toBeNull();
  expect(h.history).toHaveLength(1);
  await page.getByText("ข้อมูลรับเอกสารก่อนย้อน", { exact: true }).click();
  await expect(page.locator("details")).toContainText("ผู้รับข้อมูลเก่า");
  await expect(page.getByRole("button", { name: "รับเอกสารแล้ว", exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("ข้อมูลรับเอกสารก่อนย้อน", { exact: true })).toBeVisible();
});
