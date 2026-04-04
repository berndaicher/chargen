PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS app_tenants (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  entra_tenant_id TEXT NOT NULL UNIQUE,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);

CREATE TABLE IF NOT EXISTS app_users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_oid TEXT NOT NULL,
  email TEXT,
  display_name TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(user_oid)
);

CREATE TABLE IF NOT EXISTS user_tenant_roles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('reader', 'editor', 'admin')),
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(tenant_id, user_id),
  FOREIGN KEY (tenant_id) REFERENCES app_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES app_users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS t_articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  n_article INTEGER NOT NULL,
  article_name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(tenant_id, n_article),
  FOREIGN KEY (tenant_id) REFERENCES app_tenants(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS t_charges (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  n_charge INTEGER,
  n_article INTEGER NOT NULL,
  charge_id TEXT NOT NULL,
  good_to TEXT,
  first_delivery TEXT,
  last_delivery TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(tenant_id, charge_id),
  FOREIGN KEY (tenant_id) REFERENCES app_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, n_article) REFERENCES t_articles(tenant_id, n_article) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_articles_tenant_name ON t_articles(tenant_id, article_name);
CREATE INDEX IF NOT EXISTS idx_charges_tenant_article ON t_charges(tenant_id, n_article);
CREATE INDEX IF NOT EXISTS idx_roles_tenant_role ON user_tenant_roles(tenant_id, role);
