import { expect, test, type Page } from "@playwright/test";
import type { DocumentDeliveryAudit } from "../../src/lib/documentDelivery";

const person = {
  id: "22222222-2222-4222-8222-222222222222",
  full_name: "สมชาย ต่างสังกัด", department: "แผนกก่อสร้าง", is_active: true
};
const inactive = { ...person, id: "33333333-3333-4333-8333-333333333333", full_name: "บุคลากร ปิดใช้งาน", is_active: false };
const baseJob = {
  id: "11111111-1111-4111-8111-111111111111", equipment_code: "TEST-DELIVERY",
  outage_date: "2026-10-25", responsible_unit: "แผนกปฏิบัติการ", customer_count: 1,
  doc_status: "GENERATED", doc_generated_at: "2026-10-20T00:00:00Z",
  document_received_at: "2026-10-20T01:00:00Z", document_received_by: "ผู้รับเดิม",
  document_delivered_at: null as string | null, document_delivered_by: null as string | null,
  document_delivered_by_person_id: null as string | null, document_delivered_by_department: null as string | null,
  document_delivery_sender_status: null as "PERSON" | "UNKNOWN" | null,
  document_delivery_unknown_reason: null as string | null,
  document_delivery_confirmed_at: null as string | null,
  notice_status: "NONE", social_status: "DRAFT", nakhon_status: "NOT_REQUIRED", is_closed: false
};

async function setup(page: Page, initial = baseJob) {
  let job = { ...initial };
  const writes: Record<string, unknown>[] = [];
  const history: DocumentDeliveryAudit[] = [];
  await page.route("**/*", async route => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname.includes("/rest/v1/outage_jobs")) {
      return route.fulfill({ json: request.headers().accept?.includes("object") ? job : [job] });
    }
    if (url.pathname === "/api/people") {
      if (url.searchParams.get("active") === "true" && !url.searchParams.has("department")) {
        return route.fulfill({ json: { ok: true, data: [person] } });
      }
      return route.fulfill({ status: 400, json: { ok: false } });
    }
    if (url.pathname.endsWith("/document-workflow")) {
      if (request.method() === "GET") return route.fulfill({ json: { ok: true, history: [...history].reverse() } });
      const body = request.postDataJSON();
      writes.push(body);
      const before = { ...job };
      job = {
        ...job, document_delivered_at: body.occurred_at,
        document_delivery_sender_status: body.sender_status === "UNKNOWN" ? "UNKNOWN" : body.person_id ? "PERSON" : null,
        document_delivery_unknown_reason: body.sender_status === "UNKNOWN" ? body.unknown_reason : null,
        document_delivery_confirmed_at: body.sender_status === "UNKNOWN" ? new Date().toISOString() : null,
        ...(body.person_id && body.person_id !== job.document_delivered_by_person_id ? {
          document_delivered_by_person_id: person.id,
          document_delivered_by: person.full_name,
          document_delivered_by_department: person.department
        } : {}),
        ...(body.sender_status === "UNKNOWN" ? {
          document_delivered_by_person_id: null, document_delivered_by: null, document_delivered_by_department: null
        } : {})
      };
      history.push({ id: String(history.length + 1), before_state: before, after_state: { ...job }, created_at: new Date().toISOString() });
      return route.fulfill({ json: { ok: true, job } });
    }
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: {}, counts: {} } });
    return route.continue();
  });
  await page.goto("/jobs");
  return { writes };
}

test("search, cross-department selection, save, reload detail and resave", async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("combobox");
  await input.fill("สมชาย");
  await expect(page.getByRole("option", { name: /สมชาย ต่างสังกัด/ })).toContainText("ผกส.");
  await expect(page.getByRole("option", { name: inactive.full_name })).toHaveCount(0);
  await page.getByRole("option", { name: /สมชาย ต่างสังกัด/ }).click();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].person_id).toBe(person.id);
  expect(writes[0]).not.toHaveProperty("operator");
  await page.reload();
  await expect(page.locator("article")).toContainText(`ส่งเอกสารแล้ว · ${person.full_name} · ${person.department}`);
  await page.getByRole("button", { name: "ดูรายละเอียดเพิ่มเติม" }).click();
  await expect(page.getByText(new RegExp(`.*${person.full_name}.*${person.department}`)).first()).toBeVisible();
  await page.getByRole("button", { name: "แก้ไขการส่งเอกสาร", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("combobox")).toHaveValue(person.full_name);
  await page.getByRole("dialog").getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(writes).toHaveLength(2);
});

test("UNKNOWN requires a reason and delivery confirmation, survives reload and can become a person", async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "ไม่ทราบชื่อผู้ส่งเอกสาร", exact: true }).check();
  await expect(dialog.getByRole("combobox")).toHaveCount(0);
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  expect(writes).toHaveLength(0);
  await dialog.getByRole("textbox", { name: "เหตุผลที่ไม่ทราบชื่อผู้ส่ง", exact: true }).fill("ได้รับเอกสารแล้ว แต่ไม่ได้อยู่ขณะส่ง");
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  expect(writes).toHaveLength(0);
  await dialog.getByRole("checkbox").check();
  await page.screenshot({ path: test.info().outputPath("unknown-modal.png") });
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].sender_status).toBe("UNKNOWN");
  expect(writes[0].person_id).toBeNull();
  expect(writes[0].delivery_confirmed).toBe(true);
  await page.reload();
  await expect(page.locator("article")).toContainText("ไม่ทราบชื่อผู้ส่ง");
  await expect(page.locator("article")).toContainText("ได้รับเอกสารแล้ว แต่ไม่ได้อยู่ขณะส่ง");
  await expect(page.getByText("ไม่ทราบชื่อผู้ส่ง", { exact: true }).locator("..")).toHaveClass(/bg-orange-50/);
  await page.getByRole("button", { name: "ดูรายละเอียดเพิ่มเติม" }).click();
  await expect(page.getByText("ไม่ทราบชื่อผู้ส่ง", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "แก้ไขการส่งเอกสาร", exact: true }).click();
  await expect(dialog.getByRole("radio", { name: "ไม่ทราบชื่อผู้ส่งเอกสาร", exact: true })).toBeChecked();
  await expect(dialog.getByRole("checkbox")).not.toBeChecked();
  await expect(dialog.getByRole("textbox", { name: "เหตุผลที่ไม่ทราบชื่อผู้ส่ง", exact: true })).toHaveValue("ได้รับเอกสารแล้ว แต่ไม่ได้อยู่ขณะส่ง");
  await dialog.getByRole("radio", { name: "เลือกบุคลากร", exact: true }).check();
  await dialog.getByRole("combobox").fill("สมชาย");
  await page.getByRole("option", { name: /สมชาย ต่างสังกัด/ }).click();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[1].sender_status).toBe("PERSON");
  expect(writes[1].person_id).toBe(person.id);
  await expect(page.getByText("ไม่ทราบชื่อผู้ส่ง", { exact: true })).toHaveCount(0);
});

test("correcting a wrong person to UNKNOWN retains the original and new values in history", async ({ page }) => {
  const { writes } = await setup(page, {
    ...baseJob, document_delivered_at: "2026-10-20T03:00:00Z",
    document_delivered_by: "บุคลากรที่เลือกผิด", document_delivered_by_person_id: person.id,
    document_delivered_by_department: "แผนกก่อสร้าง"
  });
  await page.getByRole("button", { name: "แก้ไขข้อมูลการส่งเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: "ไม่ทราบชื่อผู้ส่งเอกสาร", exact: true }).check();
  await dialog.getByRole("textbox", { name: "เหตุผลที่ไม่ทราบชื่อผู้ส่ง", exact: true }).fill("แก้ชื่อที่เลือกผิด ยังไม่ทราบชื่อผู้ส่งจริง");
  await dialog.getByRole("checkbox").check();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].person_id).toBeNull();
  await page.reload();
  await page.getByRole("button", { name: "แก้ไขข้อมูลการส่งเอกสาร", exact: true }).click();
  await dialog.getByText("ประวัติการแก้ไขข้อมูลการส่ง (50 รายการล่าสุด)", { exact: true }).click();
  const history = dialog.locator("details");
  await expect(history).toContainText("บุคลากรที่เลือกผิด");
  await expect(history).toContainText("ไม่ทราบชื่อผู้ส่ง");
  await expect(history).toContainText("แก้ชื่อที่เลือกผิด ยังไม่ทราบชื่อผู้ส่งจริง");
  await expect(history).toContainText("บันทึกเมื่อ");
  await expect(history).toContainText("ระบบไม่มีการยืนยันตัวตน");
});

test("unselected text is rejected and a missing name points to /people", async ({ page }) => {
  const { writes } = await setup(page);
  await page.getByRole("button", { name: "บันทึกการส่งเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("combobox").fill("ไม่พบชื่อนี้");
  await expect(dialog.getByRole("listbox")).toContainText("กรุณาเพิ่มบุคลากรในหน้า /people");
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toContainText("กรุณาระบุวันเวลาและเลือกผู้ดำเนินการ");
  expect(writes).toHaveLength(0);
});

test("legacy text is shown, can be resaved and explicitly replaced", async ({ page }) => {
  const { writes } = await setup(page, {
    ...baseJob, document_delivered_at: "2026-10-20T03:00:00Z", document_delivered_by: "ผู้ส่งเดิม"
  });
  await page.getByRole("button", { name: "แก้ไขข้อมูลการส่งเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("combobox")).toHaveValue("ผู้ส่งเดิม");
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].preserve_existing_sender).toBe(true);
  expect(writes[0].person_id).toBeNull();
  await page.getByRole("button", { name: "แก้ไขข้อมูลการส่งเอกสาร", exact: true }).click();
  await dialog.getByRole("combobox").fill("สมชาย");
  await page.getByRole("option", { name: /สมชาย ต่างสังกัด/ }).click();
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[1].person_id).toBe(person.id);
});

test("a historical inactive sender stays visible and can be resaved without becoming a new option", async ({ page }) => {
  const { writes } = await setup(page, {
    ...baseJob,
    document_delivered_at: "2026-10-20T03:00:00Z",
    document_delivered_by: "ชื่อ ณ วันที่ส่ง",
    document_delivered_by_person_id: inactive.id,
    document_delivered_by_department: "กฟส.อ่าวนาง"
  });
  await page.getByRole("button", { name: "แก้ไขข้อมูลการส่งเอกสาร", exact: true }).click();
  const dialog = page.getByRole("dialog");
  const input = dialog.getByRole("combobox");
  await expect(input).toHaveValue("ชื่อ ณ วันที่ส่ง");
  await input.click();
  await expect(page.getByRole("option", { name: /สมชาย ต่างสังกัด/ })).toBeVisible();
  await expect(page.getByRole("option", { name: /ชื่อ ณ วันที่ส่ง|บุคลากร ปิดใช้งาน/ })).toHaveCount(0);
  await dialog.getByRole("button", { name: "บันทึก", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  expect(writes[0].person_id).toBe(inactive.id);
  await page.reload();
  await expect(page.locator("article")).toContainText("ส่งเอกสารแล้ว · ชื่อ ณ วันที่ส่ง · กฟส.อ่าวนาง");
});
