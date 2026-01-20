export type JWTOptions = {
  email: string;
  key: string;
  scopes: string[];
};

export class JWT {
  constructor(_options: JWTOptions) {
    // Stub for build-time only.
  }
}

export type DriveOptions = {
  version: string;
  auth: JWT;
};

export type DocsOptions = {
  version: string;
  auth: JWT;
};

export const google = {
  auth: {
    JWT
  },
  drive: (_options: DriveOptions) => ({}),
  docs: (_options: DocsOptions) => ({})
};
