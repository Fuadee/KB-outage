import { google } from "googleapis";

const GOOGLE_SERVICE_ACCOUNT_EMAIL =
  process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY =
  process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY;

const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents"
];

export function createJWTAuth() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    throw new Error(
      "Missing Google service account env vars. Set GOOGLE_SERVICE_ACCOUNT_EMAIL and GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY."
    );
  }

  return new google.auth.JWT({
    email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
    key: GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, "\n"),
    scopes: GOOGLE_SCOPES
  });
}

export function createDriveClient() {
  return google.drive({ version: "v3", auth: createJWTAuth() });
}

export function createDocsClient() {
  return google.docs({ version: "v1", auth: createJWTAuth() });
}
