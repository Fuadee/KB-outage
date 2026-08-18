export const AUTH_DISABLED =
  process.env.NEXT_PUBLIC_AUTH_DISABLED?.trim().toLowerCase() === "true";

export const AUTH_DISABLED_ACTOR_NAME = "ผู้ใช้งานชั่วคราว (ไม่ใช้ Login)";
