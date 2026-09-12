export const RESPONSIBLE_UNITS = [
  "แผนกปฏิบัติการ",
  "แผนกก่อสร้าง",
  "กฟส.อ่าวนาง"
] as const;

export type ResponsibleUnit = (typeof RESPONSIBLE_UNITS)[number];

export const MAX_CUSTOMER_COUNT = 2_147_483_647;

export type CustomerCountParseResult =
  | { success: true; value: number | null }
  | { success: false; error: string };

const RESPONSIBLE_UNIT_SHORT_LABELS: Record<ResponsibleUnit, string> = {
  "แผนกปฏิบัติการ": "ผปบ.",
  "แผนกก่อสร้าง": "ผกส.",
  "กฟส.อ่าวนาง": "อ่าวนาง"
};

export function isResponsibleUnit(value: unknown): value is ResponsibleUnit {
  return (
    typeof value === "string" &&
    RESPONSIBLE_UNITS.some((unit) => unit === value)
  );
}

export function getResponsibleUnitLabel(
  value: ResponsibleUnit | null | undefined
): string {
  return value ?? "ไม่ระบุหน่วยงาน";
}

export function getResponsibleUnitShortLabel(value: unknown): string {
  return isResponsibleUnit(value)
    ? RESPONSIBLE_UNIT_SHORT_LABELS[value]
    : "ไม่ระบุ";
}

export function parseCustomerCount(value: unknown): CustomerCountParseResult {
  if (value === null || value === undefined) {
    return { success: true, value: null };
  }

  if (typeof value === "string" && value.trim() === "") {
    return { success: true, value: null };
  }

  const normalizedString = typeof value === "string" ? value.trim() : null;
  const parsedValue =
    typeof value === "number"
      ? value
      : normalizedString !== null && /^\d+$/.test(normalizedString)
        ? Number(normalizedString)
        : Number.NaN;

  if (
    !Number.isInteger(parsedValue) ||
    parsedValue < 0 ||
    parsedValue > MAX_CUSTOMER_COUNT
  ) {
    return {
      success: false,
      error: `จำนวนผู้ใช้ไฟฟ้าต้องเป็นจำนวนเต็มตั้งแต่ 0 ถึง ${MAX_CUSTOMER_COUNT.toLocaleString("en-US")}`
    };
  }

  return { success: true, value: parsedValue };
}

export function formatCustomerCount(value: number): string {
  return value.toLocaleString("en-US");
}

export function getSwitchingLabel(value: boolean | null | undefined): string {
  if (value === true) return "มี";
  if (value === false) return "ไม่มี";
  return "ยังไม่ได้ระบุ";
}
