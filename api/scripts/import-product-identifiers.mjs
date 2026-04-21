import { readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dataDir = join(__dirname, '..', '..', 'data');

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

function parseCSV(file) {
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

const articles = parseCSV(join(dataDir, 'artikel.csv'));

const seen = new Map();
const collisions = [];
const lines = [];
for (const a of articles) {
  const nArticle = a.Id;
  let pid = (a.Product_Identifier ?? '').trim();
  if (!nArticle || !pid) continue;
  if (seen.has(pid)) {
    const count = seen.get(pid) + 1;
    seen.set(pid, count);
    const suffixed = `${pid}-${count}`;
    collisions.push({ nArticle, original: pid, assigned: suffixed });
    pid = suffixed;
  } else {
    seen.set(pid, 1);
  }
  const esc = pid.replace(/"/g, '""');
  lines.push(`UPDATE t_articles SET product_identifier = "${esc}" WHERE tenant_id = 1 AND n_article = ${nArticle};`);
}

const sql = lines.join('\n') + '\n';
const outFile = join(__dirname, 'import-product-identifiers.sql');
writeFileSync(outFile, sql, 'utf-8');

console.log(`Generated ${lines.length} UPDATE statements for product_identifier`);
if (collisions.length) {
  console.log(`Resolved ${collisions.length} collision(s) via suffix:`);
  for (const c of collisions) {
    console.log(`  n_article=${c.nArticle}: "${c.original}" -> "${c.assigned}"`);
  }
}
