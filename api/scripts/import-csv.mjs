import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');

function parseCSVSimple(file) {
  const raw = readFileSync(file, 'utf-8');
  const lines = raw.trim().split('\n');
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const vals = parseCSVLine(lines[i]);
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = vals[idx] ?? ''; });
    rows.push(obj);
  }
  return rows;
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

const articles = parseCSVSimple(join(dataDir, 'artikel.csv'));
const charges = parseCSVSimple(join(dataDir, 'chargen.csv'));

const lines = [];

for (const a of articles) {
  const n = a.Id;
  const name = a.Name.replace(/"/g, '""');
  lines.push(`INSERT OR IGNORE INTO t_articles (tenant_id, n_article, article_name) VALUES (1, ${n}, "${name}");`);
}

for (const c of charges) {
  const nArticle = c.Product_Id;
  const chargeId = c.Charge_Id.replace(/"/g, '""');
  const goodTo = c.Good_To?.trim();
  const firstDel = c.First_Delivery?.trim();
  const lastDel = c.Last_Delivery?.trim();

  const gv = goodTo ? `"${goodTo}"` : 'NULL';
  const fv = firstDel ? `"${firstDel}"` : 'NULL';
  const lv = lastDel ? `"${lastDel}"` : 'NULL';

  lines.push(`INSERT OR IGNORE INTO t_charges (tenant_id, n_article, charge_id, good_to, first_delivery, last_delivery) VALUES (1, ${nArticle}, "${chargeId}", ${gv}, ${fv}, ${lv});`);
}

const sql = lines.join('\n');
const outFile = join(__dirname, 'import-data.sql');
writeFileSync(outFile, sql, 'utf-8');

console.log(`Generated ${lines.length} INSERT statements`);
console.log(`Articles: ${articles.length}, Charges: ${charges.length}`);
