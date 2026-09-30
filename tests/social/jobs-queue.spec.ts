import { expect, test } from "@playwright/test";

// Mock every backend request so checking queues never changes live jobs.
const socialJob = {
  id: "11111111-1111-4111-8111-111111111111",
  equipment_code: "KBB01WF-106",
  outage_date: "2026-10-05",
  doc_status: "GENERATED",
  document_received_at: "2026-09-25T02:00:00Z",
  document_delivered_at: "2026-09-25T03:00:00Z",
  notice_status: "COMPLETED",
  social_status: "DRAFT",
  responsible_unit: "แผนกปฏิบัติการ",
  nakhon_status: "NOT_REQUIRED",
  is_closed: false
};
const noticeJob = {
  ...socialJob,
  id: "22222222-2222-4222-8222-222222222222",
  equipment_code: "KBB09WF-110",
  notice_status: "SCHEDULED",
  notice_date: "2026-09-28"
};
const earlierSocialJob = {
  ...socialJob,
  id: "33333333-3333-4333-8333-333333333333",
  equipment_code: "SOCIAL-EARLIER",
  outage_date: "2026-10-06"
};

for (const day of ["2026-09-30", "2026-10-02", "2026-10-03"]) {
  test(`jobs Social queue and primary action on ${day}`, async ({ page }) => {
    await page.clock.install({ time: new Date(`${day}T12:00:00+07:00`) });
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (url.pathname.includes("/rest/v1/outage_jobs")) return route.fulfill({ json: [earlierSocialJob, noticeJob, socialJob] });
      if (url.hostname !== "localhost") return route.fulfill({ json: [] });
      if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: {}, counts: {} } });
      return route.continue();
    });
    await page.goto("/jobs");
    const socialCard = page.locator("article").filter({ hasText: socialJob.equipment_code });
    const noticeCard = page.locator("article").filter({ hasText: noticeJob.equipment_code });
    await expect(noticeCard).toBeVisible();
    if (day === "2026-09-30") {
      await expect(noticeCard).toContainText("เลยกำหนดแจก 2 วัน");
      await expect(socialCard).toHaveCount(0);
      await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
      await expect(socialCard).toBeVisible();
      await expect(socialCard).toContainText(/รอโพสต์ Social.*02 ต\.ค\. 69/);
      await expect(socialCard).toContainText(/รอบถัดไป.*02 ต\.ค\. 69/);
      await expect(socialCard.getByRole("button", { name: "Post ลงสื่อ Social", exact: true })).toHaveCount(0);
      await expect(socialCard.getByRole("button", { name: "ดู / แก้ไข Social", exact: true })).toBeVisible();
      await expect(noticeCard).toHaveCount(0);
      // Oct 2 Social sorts ahead of Oct 5 Social despite reversed input order.
      await expect(page.locator("article").first()).toContainText(socialJob.equipment_code);
      await page.clock.setSystemTime(new Date("2026-10-02T12:00:00+07:00"));
      await page.evaluate(() => window.dispatchEvent(new Event("focus")));
      await expect(socialCard).toHaveCount(0);
      await page.getByRole("button", { name: "ดำเนินการ", exact: true }).click();
      await expect(socialCard).toBeVisible();
    } else {
      await expect(socialCard).toBeVisible();
    }
    await expect(socialCard.getByRole("button", { name: "Post ลงสื่อ Social", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
    await expect(socialCard).toHaveCount(0);
  });
}

test("completed Social appears in the ready queue", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-09-30T12:00:00+07:00") });
  await page.route("**/*", async route => {
    const url = new URL(route.request().url());
    if (url.pathname.includes("/rest/v1/outage_jobs")) return route.fulfill({ json: [{ ...socialJob, social_status: "POSTED" }] });
    if (url.hostname !== "localhost") return route.fulfill({ json: [] });
    if (url.pathname.startsWith("/api/")) return route.fulfill({ json: { ok: true, data: {}, counts: {} } });
    return route.continue();
  });
  await page.goto("/jobs");
  await expect(page.getByText("ยังไม่มีงานที่ตรงกับตัวกรอง")).toBeVisible();
  await page.getByRole("button", { name: "รอเวลา", exact: true }).click();
  await expect(page.locator("article")).toHaveCount(0);
  await page.goto("/jobs/ready");
  await expect(page.locator("article").filter({ hasText: socialJob.equipment_code })).toBeVisible();
});
