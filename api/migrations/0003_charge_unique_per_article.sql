CREATE TABLE t_charges_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  tenant_id INTEGER NOT NULL,
  n_article INTEGER NOT NULL,
  charge_id TEXT NOT NULL,
  good_to TEXT,
  first_delivery TEXT,
  last_delivery TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP),
  UNIQUE(tenant_id, n_article, charge_id),
  FOREIGN KEY (tenant_id) REFERENCES app_tenants(id) ON DELETE CASCADE,
  FOREIGN KEY (tenant_id, n_article) REFERENCES t_articles(tenant_id, n_article) ON DELETE CASCADE
);

INSERT INTO t_charges_new (id, tenant_id, n_article, charge_id, good_to, first_delivery, last_delivery, created_at)
SELECT id, tenant_id, n_article, charge_id, good_to, first_delivery, last_delivery, created_at
FROM t_charges;

DROP TABLE t_charges;

ALTER TABLE t_charges_new RENAME TO t_charges;

CREATE INDEX idx_charges_tenant_article ON t_charges(tenant_id, n_article);
