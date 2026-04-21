ALTER TABLE t_articles ADD COLUMN product_identifier TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS idx_articles_tenant_pid
  ON t_articles(tenant_id, product_identifier);
