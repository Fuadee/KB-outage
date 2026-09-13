import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

function source(relativePath: string) {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const newPage = source("../app/new/page.tsx");
const editPage = source("../app/job/[id]/page.tsx");
const jobsRoute = source("../app/api/jobs/route.ts");
const editRoute = source("../app/api/jobs/[id]/route.ts");
const jobsRepo = source("./jobsRepo.ts");
const jobCard = source("../components/job/JobCard.tsx");
const migration = source("../../sql/021_outage_job_responsible_unit.sql");
const customerCountMigration = source(
  "../../sql/022_outage_job_customer_count.sql"
);
const workSupervisorMigration = source(
  "../../sql/027_outage_job_work_supervisor_name.sql"
);

test("new-job UI requires an explicit responsible-unit selection", () => {
  assert.match(newPage, /หน่วยงานผู้รับผิดชอบ/);
  assert.match(newPage, /<select[\s\S]*required/);
  assert.match(newPage, /<option value="" disabled>/);
});

test("server create validates and persists the same responsible-unit field", () => {
  assert.match(jobsRoute, /isResponsibleUnit\(body\?\.responsible_unit\)/);
  assert.match(jobsRoute, /responsible_unit: body\.responsible_unit/);
  assert.match(jobsRepo, /responsible_unit: ResponsibleUnit/);
});

test("edit loads, updates, and permits the null value of legacy jobs", () => {
  assert.match(editPage, /data\.responsible_unit/);
  assert.match(editPage, /responsible_unit: responsibleUnit \|\| null/);
  assert.match(editRoute, /responsibleUnit === null \|\| isResponsibleUnit/);
  assert.match(editRoute, /ensureSystemCertificateAuthorities\(\)/);
  assert.match(
    editRoute,
    /data\.responsible_unit !== responsibleUnit/
  );
  assert.match(
    jobsRepo,
    /result\.data\?\.responsible_unit !== patch\.responsible_unit/
  );
});

test("job card displays the responsible unit with a legacy fallback", () => {
  assert.match(jobCard, /getResponsibleUnitLabel\(job\.responsible_unit\)/);
  assert.match(jobCard, /text-slate-400/);
});

test("migration preserves legacy rows and constrains future unit values", () => {
  assert.match(migration, /ADD COLUMN IF NOT EXISTS responsible_unit text NULL/);
  assert.match(migration, /responsible_unit IS NULL/);
  assert.match(migration, /outage_jobs_responsible_unit_check/);
});

test("customer count migration is nullable, integer, and non-negative", () => {
  assert.match(
    customerCountMigration,
    /ADD COLUMN IF NOT EXISTS customer_count integer NULL/
  );
  assert.match(customerCountMigration, /customer_count IS NULL/);
  assert.match(customerCountMigration, /customer_count >= 0/);
  assert.doesNotMatch(customerCountMigration, /DROP TABLE|TRUNCATE|DELETE FROM/i);
});

test("create validates and persists a normalized customer count", () => {
  assert.match(newPage, /จำนวนผู้ใช้ไฟฟ้า/);
  assert.match(newPage, /type="number"/);
  assert.match(newPage, /min=\{0\}/);
  assert.match(newPage, /parseCustomerCount\(customerCount\)/);
  assert.match(newPage, /customer_count: parsedCustomerCount\.value/);
  assert.match(jobsRoute, /parseCustomerCount\(body\?\.customer_count\)/);
  assert.match(jobsRoute, /customer_count: customerCount\.value/);
});

test("edit loads, validates, updates, and can clear customer count", () => {
  assert.match(editPage, /data\.customer_count === null \? ""/);
  assert.match(editPage, /parseCustomerCount\(customerCount\)/);
  assert.match(editPage, /customer_count: parsedCustomerCount\.value/);
  assert.match(editRoute, /parseCustomerCount\(body\?\.customer_count\)/);
  assert.match(editRoute, /customer_count: customerCount\.value/);
  assert.match(editRoute, /data\.customer_count !== customerCount\.value/);
  assert.match(jobsRepo, /result\.data\?\.customer_count !== patch\.customer_count/);
});

test("list, detail, and card expose the same customer count field", () => {
  assert.match(jobsRepo, /customer_count: number \| null/);
  assert.match(
    jobsRepo,
    /equipment_code, responsible_unit, work_supervisor_name, has_switching, customer_count, note/
  );
  assert.match(editPage, /customerCountDisplay/);
  assert.match(editPage, /formatCustomerCount\(customerCountPreview\.value\)/);
  assert.match(editPage, /: "—"/);
  assert.match(jobCard, /typeof job\.customer_count === "number"/);
  assert.match(jobCard, /<Users /);
  assert.match(jobCard, /formatCustomerCount\(job\.customer_count\)/);
});

test("work supervisor is optional and persists through create and edit", () => {
  assert.match(
    workSupervisorMigration,
    /ADD COLUMN IF NOT EXISTS work_supervisor_name text NULL/
  );
  assert.doesNotMatch(
    workSupervisorMigration,
    /NOT NULL|DROP TABLE|TRUNCATE|DELETE FROM/i
  );
  assert.match(newPage, /ผู้ควบคุมงาน/);
  assert.match(newPage, /placeholder="ระบุชื่อผู้ควบคุมงาน"/);
  assert.match(newPage, /work_supervisor_name: workSupervisorName\.trim\(\) \|\| null/);
  assert.match(jobsRoute, /work_supervisor_name: workSupervisorName/);
  assert.match(editPage, /setWorkSupervisorName\(data\.work_supervisor_name \?\? ""\)/);
  assert.match(editPage, /work_supervisor_name: workSupervisorName\.trim\(\) \|\| null/);
  assert.match(editRoute, /work_supervisor_name: workSupervisorName/);
  assert.match(editRoute, /data\.work_supervisor_name !== workSupervisorName/);
  assert.match(jobsRepo, /work_supervisor_name: string \| null/);
  assert.match(
    jobsRepo,
    /result\.data\?\.work_supervisor_name !== data\.work_supervisor_name/
  );
  assert.match(
    jobsRepo,
    /result\.data\?\.work_supervisor_name !== patch\.work_supervisor_name/
  );
});
