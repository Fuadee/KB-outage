import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const modal = readFileSync(
  new URL("./Modal.tsx", import.meta.url),
  "utf8"
);

test("keeps the scroll-lock lifecycle stable when parent callbacks are recreated", () => {
  assert.match(modal, /const onCloseRef = useRef\(onClose\)/);
  assert.match(modal, /onCloseRef\.current\(\)/);
  assert.match(modal, /\}, \[isOpen\]\);/);
  assert.doesNotMatch(modal, /\}, \[isOpen, onClose\]\);/);
});
