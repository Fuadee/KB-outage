import * as tls from "node:tls";

type SystemCaApi = {
  getCACertificates?: (type: "default" | "system") => string[];
  setDefaultCACertificates?: (certificates: string[]) => void;
};

let systemCasConfigured = false;

export function ensureSystemCertificateAuthorities() {
  if (systemCasConfigured) return;

  const caApi = tls as unknown as SystemCaApi;
  if (!caApi.getCACertificates || !caApi.setDefaultCACertificates) return;

  const certificates = new Set([
    ...caApi.getCACertificates("default"),
    ...caApi.getCACertificates("system")
  ]);

  caApi.setDefaultCACertificates([...certificates]);
  systemCasConfigured = true;
}
