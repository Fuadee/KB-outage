import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modal = readFileSync(
  new URL("./Modal.tsx", import.meta.url),
  "utf8"
);
const noticeModal = readFileSync(
  new URL("./NoticeScheduleModal.tsx", import.meta.url),
  "utf8"
);
const jobsPage = readFileSync(
  new URL("../app/(app)/jobs/page.tsx", import.meta.url),
  "utf8"
);
const jobDetailPage = readFileSync(
  new URL("../app/job/[id]/page.tsx", import.meta.url),
  "utf8"
);

test("keeps the scroll-lock lifecycle stable when parent callbacks are recreated", () => {
  assert.match(modal, /const onCloseRef = useRef\(onClose\)/);
  assert.match(modal, /onCloseRef\.current\(\)/);
  assert.match(modal, /\}, \[isOpen\]\);/);
  assert.doesNotMatch(modal, /\}, \[isOpen, onClose\]\);/);
});

test("stateful job modals mount only for their selected job", () => {
  assert.match(jobsPage, /\{noticeJob \? \(\s*<NoticeScheduleModal/);
  assert.match(jobsPage, /\{documentModal \? \(\s*<DocumentWorkflowModal/);
  assert.match(jobDetailPage, /\{noticeOpen && job \? \(\s*<NoticeScheduleModal/);
  assert.match(jobDetailPage, /\{documentMode && job \? \(\s*<DocumentWorkflowModal/);
});

test("notice modal starts from the selected job without a post-paint form reset", () => {
  assert.match(noticeModal, /useState\(\(\) => job\?\.notice_date \?\? ""\)/);
  assert.doesNotMatch(noticeModal, /setNoticeDate\(job\?\.notice_date/);
  assert.doesNotMatch(noticeModal, /setCompletedBy\(job\?\.notice_by/);
});

test("job modal focus does not use a delayed timeout", () => {
  assert.match(jobsPage, /focus\(\{ preventScroll: true \}\)/);
  assert.doesNotMatch(jobsPage, /window\.setTimeout\(\(\) => \{\s*notifiedDateRef/);
  assert.doesNotMatch(jobsPage, /window\.setTimeout\(\(\) => \{\s*docIssueDateRef/);
});
