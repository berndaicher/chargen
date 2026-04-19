export type Bindings = {
  DB: D1Database;
  ENTRA_AUDIENCE: string;
  ENTRA_TENANT_MODE: 'single' | 'multi';
  DEV_AUTH_BYPASS?: boolean;
  DEV_TENANT_ID?: string;
};

export type AuthContext = {
  tenantId: number;
  tenantExternalId: string;
  userOid: string;
  role: 'reader' | 'editor' | 'admin';
};
