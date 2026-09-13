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
const peopleMigration = source("../../sql/028_people_master.sql");
const peoplePage = source("../app/(app)/people/page.tsx");
const peopleRoute = source("../app/api/people/route.ts");
const personSelect = source("../components/people/PersonSelect.tsx");
const noticeModal = source("../components/NoticeScheduleModal.tsx");
const noticeCompletionRoute = source(
  "../app/api/jobs/[id]/notice-completion/route.ts"
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
    /equipment_code, responsible_unit, work_supervisor_person_id, work_supervisor_name, work_supervisor_person:/
  );
  assert.match(editPage, /customerCountDisplay/);
  assert.match(editPage, /formatCustomerCount\(customerCountPreview\.value\)/);
  assert.match(editPage, /: "—"/);
  assert.match(jobCard, /typeof job\.customer_count === "number"/);
  assert.match(jobCard, /<Users /);
  assert.match(jobCard, /formatCustomerCount\(job\.customer_count\)/);
});

test("legacy work-supervisor text remains while new selections use the people master", () => {
  assert.match(
    workSupervisorMigration,
    /ADD COLUMN IF NOT EXISTS work_supervisor_name text NULL/
  );
  assert.doesNotMatch(
    workSupervisorMigration,
    /NOT NULL|DROP TABLE|TRUNCATE|DELETE FROM/i
  );
  assert.match(newPage, /ผู้ควบคุมงาน/);
  assert.match(newPage, /<PersonSelect/);
  assert.match(newPage, /if \(!workSupervisorPerson\)/);
  assert.match(newPage, /work_supervisor_person_id: workSupervisorPerson\?\.id \?\? null/);
  assert.match(jobsRoute, /findActiveWorkSupervisor/);
  assert.match(editPage, /setWorkSupervisorPerson\(null\)/);
  assert.match(editPage, /setLegacyWorkSupervisorName\(null\)/);
  assert.match(editPage, /legacyName=\{legacyWorkSupervisorName\}/);
  assert.match(editRoute, /preservingExistingSelection/);
  assert.match(editRoute, /!requestedWorkSupervisorPersonId/);
  assert.match(jobsRepo, /work_supervisor_name: string \| null/);
  assert.match(jobsRepo, /work_supervisor_person_id: string \| null/);
  assert.match(peopleMigration, /work_supervisor_person_id uuid null/);
  assert.doesNotMatch(peopleMigration, /update public\.outage_jobs[\s\S]*work_supervisor_person_id/i);
});

test("people master supports search, department filters, and soft activation", () => {
  assert.match(peoplePage, /เพิ่มบุคลากร/);
  assert.match(peoplePage, /ค้นหาชื่อบุคลากร/);
  assert.match(peoplePage, /departmentFilter/);
  assert.match(peoplePage, /is_active: isActive/);
  assert.match(peopleRoute, /\.ilike\("full_name"/);
  assert.match(peopleRoute, /\.eq\("department", department\)/);
  assert.doesNotMatch(peoplePage, /DELETE/);
  assert.doesNotMatch(peopleMigration, /role|roles|junction/i);
});

test("person selectors filter distributors strictly while Ao Nang supervisors see all departments", () => {
  assert.match(personSelect, /active: "true"/);
  assert.match(personSelect, /if \(!includeAllDepartments\) params\.set\("department", department\)/);
  assert.match(newPage, /responsibleUnit === AONANG_RESPONSIBLE_UNIT/);
  assert.match(newPage, /showDepartment=/);
  assert.match(newPage, /isWorkSupervisorDepartmentEligible/);
  assert.match(editPage, /isWorkSupervisorDepartmentEligible/);
  assert.match(newPage, /setWorkSupervisorPerson\(null\)/);
  assert.match(noticeModal, /department=\{distributionWorkflow\?\.responsibleUnit \?\? ""\}/);
  assert.match(noticeModal, /ยังไม่มีรายชื่อบุคลากรในหน่วยงานนี้/);
  assert.match(noticeModal, /completed_by_person_id/);
  assert.match(noticeCompletionRoute, /findActivePersonForDepartment/);
  assert.match(noticeCompletionRoute, /distributionWorkflow\.responsibleUnit/);
  assert.doesNotMatch(noticeModal, /placeholder="ชื่อผู้ที่ดำเนินการจริง"/);
});
