import type { DbDriver } from '../config.js';

/**
 * Transpile MySQL-flavored migration SQL for sqlite/pgsql.
 * Pure TypeScript — no PHP subprocess in any path.
 */
export function transpileSql(stmt: string, driver: DbDriver): string[] {
  const s = stmt.trim();
  if (!s) return [];
  if (/^SET\s+NAMES\s+/i.test(s) || /^SET\s+FOREIGN_KEY_CHECKS\s*=/i.test(s)) return [];
  if (driver === 'mysql') return [s];
  return transpileJs(s, driver);
}

function transpileJs(stmt: string, driver: DbDriver): string[] {
  let out = stmt;
  out = out.replace(/\s+CHARACTER\s+SET\s*=?\s*[A-Za-z0-9_]+/gi, '');
  out = out.replace(/\s+COLLATE\s*=?\s*[A-Za-z0-9_]+/gi, '');
  out = out.replace(/\bENGINE\s*=\s*\w+/gi, '');
  out = out.replace(/\bDEFAULT\s+CHARSET\s*=\s*\w+/gi, '');
  out = out.replace(/\bUNSIGNED\b/gi, '');
  out = out.replace(/`([^`]+)`/g, '"$1"');
  // MySQL dual stub — invalid on sqlite/pgsql
  out = out.replace(/\s+FROM\s+DUAL\b/gi, '');
  // Inline column/table COMMENT '…' (SQLite/PG reject MySQL COMMENT keyword)
  out = out.replace(/\s+COMMENT\s+'([^']|\\')*'/gi, '');
  out = out.replace(/\s+COMMENT\s+"([^"]|\\")*"/gi, '');

  if (driver === 'sqlite' || driver === 'pgsql') {
    const delJoin = transpileDeleteJoin(out, driver);
    if (delJoin) return delJoin;
  }

  if (driver === 'sqlite') {
    // MySQL UUID() / IF() helpers used in data backfills
    out = out.replace(/\bUUID\s*\(\s*\)/gi, 'lower(hex(randomblob(16)))');
    out = transpileMysqlIf(out);
    out = out.replace(/\bJSON\b/gi, 'TEXT');
    if (/^INSERT\s+IGNORE\b/i.test(out)) {
      return [out.replace(/^INSERT\s+IGNORE\b/i, 'INSERT OR IGNORE')];
    }
    if (/^ALTER\s+TABLE\b/i.test(out) && /ADD\s+CONSTRAINT\b/i.test(out)) return [];
    if (/^ALTER\s+TABLE\b/i.test(out) && /MODIFY\s+/i.test(out)) return [];
    if (/^CREATE\s+(?:UNIQUE\s+)?FULLTEXT\s+INDEX\b/i.test(out)) {
      return [
        out.replace(/^CREATE\s+(?:UNIQUE\s+)?FULLTEXT\s+INDEX/i, (m) =>
          /UNIQUE/i.test(m) ? 'CREATE UNIQUE INDEX' : 'CREATE INDEX',
        ),
      ];
    }
    if (/^CREATE\s+TABLE\b/i.test(out)) {
      return transpileSqliteCreateTable(out);
    }
    if (/^ALTER\s+TABLE\b/i.test(out) && /\bADD\b/i.test(out)) {
      const m = out.match(/^ALTER\s+TABLE\s+("?[\w]+"?)\s+(.*)$/is);
      if (m) {
        const table = m[1];
        const parts = m[2]
          .split(/,\s*(?=ADD\s+)/i)
          .map((p) => p.trim())
          .filter(Boolean);
        const stmts: string[] = [];
        for (const part of parts) {
          if (/^ADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\b/i.test(part)) {
            const idx = part.match(
              /^ADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\s+"?([\w]+)"?\s*\(([^)]+)\)/i,
            );
            if (idx) {
              const cols = idx[2].replace(/"/g, '');
              stmts.push(`CREATE INDEX IF NOT EXISTS "${idx[1]}" ON ${table} (${cols})`);
            }
            continue;
          }
          if (/^ADD\s+(?:COLUMN\s+)?/i.test(part) && !/^ADD\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\b/i.test(part)) {
            let col = part.replace(/^ADD\s+(?:COLUMN\s+)?/i, 'ADD COLUMN ');
            col = col.replace(/\s+AFTER\s+(?:"[^"]+"|`[^`]+`|\w+)/gi, '');
            col = col.replace(/\s+FIRST\b/gi, '');
            col = mapSqliteColumnTypes(col);
            col = col.replace(/\bDEFAULT\s+CURRENT_TIMESTAMP\b/gi, '');
            if (/\bADD COLUMN\s+(?:UNIQUE\s+)?(?:INDEX|KEY)\b/i.test(col)) continue;
            stmts.push(`ALTER TABLE ${table} ${col}`);
          }
        }
        return stmts.length ? stmts : [];
      }
    }
    out = mapSqliteColumnTypes(out);
    out = out.replace(/,\s*(?:FULLTEXT\s+)?(?:UNIQUE\s+)?(?:INDEX|KEY)\s+"?[\w]+"?\s*\([^)]+\)/gi, '');
    out = out.replace(/\b(?:FULLTEXT\s+)?(?:UNIQUE\s+)?(?:INDEX|KEY)\s+"?[\w]+"?\s*\([^)]+\)\s*,?/gi, '');
    out = out.replace(/,\s*\)/g, ')');
  }

  if (driver === 'pgsql') {
    if (/^INSERT\s+IGNORE\b/i.test(out)) {
      return [out.replace(/^INSERT\s+IGNORE\b/i, 'INSERT') + ' ON CONFLICT DO NOTHING'];
    }
    out = out.replace(
      /\bid\s+(?:BIG)?INT(?:EGER)?(?:\s+UNSIGNED)?\s+(?:NOT\s+NULL\s+)?AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi,
      'id SERIAL PRIMARY KEY',
    );
    out = out.replace(/\bAUTO_INCREMENT\b/gi, '');
    out = out.replace(/\bTINYINT\s*\(\s*1\s*\)/gi, 'BOOLEAN');
    out = out.replace(/\bDATETIME\b/gi, 'TIMESTAMP');
    out = out.replace(/\bLONGTEXT\b/gi, 'TEXT');
    out = out.replace(/\bMEDIUMTEXT\b/gi, 'TEXT');
    out = out.replace(/\bDOUBLE\b/gi, 'DOUBLE PRECISION');
    out = out.replace(/\bENUM\s*\([^)]+\)/gi, 'TEXT');
  }

  return [out];
}

/** MySQL IF(cond, a, b) → CASE WHEN cond THEN a ELSE b END (non-nested). */
function transpileMysqlIf(sql: string): string {
  // Repeatedly replace innermost-looking IF(…) with three comma-separated args.
  let out = sql;
  for (let n = 0; n < 32; n++) {
    const m = out.match(/\bIF\s*\(/i);
    if (!m || m.index === undefined) break;
    const start = m.index;
    const open = start + m[0].length - 1;
    const parts: string[] = [];
    let depth = 0;
    let cur = '';
    let i = open + 1;
    for (; i < out.length; i++) {
      const ch = out[i];
      if (ch === '(') {
        depth++;
        cur += ch;
        continue;
      }
      if (ch === ')') {
        if (depth === 0) {
          parts.push(cur.trim());
          i++;
          break;
        }
        depth--;
        cur += ch;
        continue;
      }
      if (ch === ',' && depth === 0) {
        parts.push(cur.trim());
        cur = '';
        continue;
      }
      cur += ch;
    }
    if (parts.length !== 3) break;
    const repl = `CASE WHEN ${parts[0]} THEN ${parts[1]} ELSE ${parts[2]} END`;
    out = out.slice(0, start) + repl + out.slice(i);
  }
  return out;
}

function mapSqliteColumnTypes(sql: string): string {
  let out = sql;
  out = out.replace(
    /\b((?:id|[a-z_]+_id))\s+(?:BIG)?INT(?:EGER)?(?:\s+UNSIGNED)?\s+(?:NOT\s+NULL\s+)?AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi,
    '$1 INTEGER PRIMARY KEY AUTOINCREMENT',
  );
  out = out.replace(
    /\b(?:BIG)?INT(?:EGER)?(?:\s+UNSIGNED)?\s+(?:NOT\s+NULL\s+)?AUTO_INCREMENT\s+PRIMARY\s+KEY\b/gi,
    'INTEGER PRIMARY KEY AUTOINCREMENT',
  );
  out = out.replace(/\bAUTO_INCREMENT\b/gi, '');
  out = out.replace(/\b(?:BIG)?INT(?:EGER)?(?:\s+UNSIGNED)?\b/gi, 'INTEGER');
  out = out.replace(/\bTINYINT\s*\(\s*1\s*\)/gi, 'INTEGER');
  out = out.replace(/\bVARCHAR\s*\(\s*\d+\s*\)/gi, 'TEXT');
  out = out.replace(/\bDATETIME\b/gi, 'TEXT');
  out = out.replace(/\bTIMESTAMP\b/gi, 'TEXT');
  out = out.replace(/\bLONGTEXT\b/gi, 'TEXT');
  out = out.replace(/\bMEDIUMTEXT\b/gi, 'TEXT');
  out = out.replace(/\bDOUBLE(?:\s+PRECISION)?\b/gi, 'REAL');
  out = out.replace(/\bDECIMAL\s*\([^)]+\)/gi, 'REAL');
  out = out.replace(/\bENUM\s*\([^)]+\)/gi, 'TEXT');
  out = out.replace(/\bON\s+UPDATE\s+CURRENT_TIMESTAMP(?:\(\))?/gi, '');
  out = out.replace(/\bUNSIGNED\b/gi, '');
  return out;
}

function transpileSqliteCreateTable(stmt: string): string[] {
  const tableMatch = stmt.match(/^CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?("?[\w]+"?)/i);
  const table = tableMatch?.[1] ?? 'unknown';
  const indexes: string[] = [];
  let body = stmt;
  body = body.replace(/\s+ENGINE\b[\s\S]*$/i, '');
  body = body.replace(/\s+DEFAULT\s+CHARSET\b[\s\S]*$/i, '');
  body = body.trimEnd();
  if (!body.endsWith(')')) body = `${body})`;

  body = body.replace(
    /,\s*(?:CONSTRAINT\s+"?[\w]+"?\s*)?FOREIGN\s+KEY\s*\([^)]*\)\s*REFERENCES\s+"?[\w]+"?\s*\([^)]*\)(?:\s+ON\s+(?:DELETE|UPDATE)\s+(?:CASCADE|SET\s+NULL|RESTRICT|NO\s+ACTION))*/gi,
    '',
  );

  // Named: UNIQUE KEY uq_x (col) · Unnamed: UNIQUE KEY (col)
  const keyRe =
    /,\s*(FULLTEXT\s+)?(UNIQUE\s+)?(INDEX|KEY)(?:\s+("?[A-Za-z_][\w]*"?))?\s*(?=\()/gi;
  const removals: Array<{ start: number; end: number; unique: boolean; name: string; cols: string }> = [];
  let m: RegExpExecArray | null;
  let anon = 0;
  while ((m = keyRe.exec(body)) !== null) {
    const before = body.slice(Math.max(0, m.index - 16), m.index + m[0].length).toUpperCase();
    if (before.includes('PRIMARY KEY')) continue;
    const colsStart = m.index + m[0].length;
    if (body[colsStart] !== '(') continue;
    let depth = 0;
    let i = colsStart;
    for (; i < body.length; i++) {
      if (body[i] === '(') depth++;
      else if (body[i] === ')') {
        depth--;
        if (depth === 0) {
          i++;
          break;
        }
      }
    }
    let cols = body.slice(colsStart + 1, i - 1);
    cols = cols.replace(/"([^"]+)"\s*\(\s*\d+\s*\)/g, '"$1"');
    cols = cols.replace(/\b([A-Za-z_][\w]*)\s*\(\s*\d+\s*\)/g, '$1');
    const rawName = (m[4] || '').replace(/"/g, '');
    const name = rawName || `auto_${table.replace(/"/g, '')}_${++anon}`;
    removals.push({
      start: m.index,
      end: i,
      unique: Boolean(m[2]) || /UNIQUE/i.test(m[0]),
      name,
      cols,
    });
  }
  for (const r of removals.sort((a, b) => b.start - a.start)) {
    body = body.slice(0, r.start) + body.slice(r.end);
    const uniq = r.unique ? 'UNIQUE ' : '';
    indexes.push(`CREATE ${uniq}INDEX IF NOT EXISTS "${r.name}" ON ${table} (${r.cols})`);
  }

  body = mapSqliteColumnTypes(body);
  body = body.replace(/,\s*\)/g, ')');
  if (!/\)\s*$/.test(body)) body = `${body.trimEnd()})`;
  return [body, ...indexes];
}

function transpileDeleteJoin(stmt: string, driver: DbDriver): string[] | null {
  const m = stmt.match(/^DELETE\s+(\w+)\s+FROM\s+("?[\w]+"?)\s+\1\b([\s\S]*)$/i);
  if (!m) return null;
  const alias = m[1];
  const table = m[2];
  const body = m[3];
  if (driver === 'sqlite') {
    return [
      `DELETE FROM ${table} WHERE rowid IN (SELECT ${alias}.rowid FROM ${table} ${alias}${body})`,
    ];
  }
  return [
    `DELETE FROM ${table} WHERE ctid IN (SELECT ${alias}.ctid FROM ${table} ${alias}${body})`,
  ];
}
