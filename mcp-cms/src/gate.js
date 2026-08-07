/**
 * Deploy gate: build → test → changelog → only then remote upload.
 * State: mcp-cms/.gate-state.json
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GATE_FILE = path.join(__dirname, '..', '.gate-state.json');
const GATE_TTL_MS = 2 * 60 * 60 * 1000; // 2h

/** @returns {string} */
export function repoRoot() {
  const fromEnv = process.env.CMS_REPO_ROOT || process.env.PORTFOLIO_ROOT;
  if (fromEnv) return path.resolve(fromEnv);
  // mcp-cms/src → repo root
  return path.resolve(__dirname, '..', '..');
}

/** @returns {string} */
export function changelogPath() {
  return path.join(repoRoot(), 'CHANGELOG.md');
}

/** @returns {Record<string, unknown>} */
export function readGate() {
  try {
    if (!fs.existsSync(GATE_FILE)) return { step: 'idle' };
    return JSON.parse(fs.readFileSync(GATE_FILE, 'utf8'));
  } catch {
    return { step: 'idle' };
  }
}

/** @param {Record<string, unknown>} state */
export function writeGate(state) {
  fs.writeFileSync(GATE_FILE, JSON.stringify({ ...state, updated_at: new Date().toISOString() }, null, 2), 'utf8');
}

export function clearGate() {
  if (fs.existsSync(GATE_FILE)) fs.unlinkSync(GATE_FILE);
}

/**
 * @param {string} filePath
 * @returns {string}
 */
export function sha256File(filePath) {
  const hash = crypto.createHash('sha256');
  hash.update(fs.readFileSync(filePath));
  return hash.digest('hex');
}

/**
 * @param {{ force?: boolean }} [opts]
 * @returns {{ ok: boolean, reason?: string, gate: Record<string, unknown> }}
 */
export function assertDeployAllowed(opts = {}) {
  if (opts.force) {
    return { ok: true, gate: readGate(), reason: 'force=true' };
  }
  const gate = readGate();
  if (!gate.build_ok) {
    return { ok: false, reason: 'Сначала cms_local_build (локальный билд не пройден).', gate };
  }
  if (!gate.test_ok) {
    return { ok: false, reason: 'Сначала cms_local_test (локальный тест не пройден).', gate };
  }
  if (!gate.changelog_ok) {
    return {
      ok: false,
      reason: 'Сначала cms_changelog — опиши изменения этого апдейта (summary + changes).',
      gate,
    };
  }
  if (!gate.zip_path || !fs.existsSync(String(gate.zip_path))) {
    return { ok: false, reason: 'ZIP из билда не найден — пересобери cms_local_build.', gate };
  }
  const until = gate.allow_deploy_until ? Date.parse(String(gate.allow_deploy_until)) : 0;
  if (!until || Date.now() > until) {
    return { ok: false, reason: 'Гейт протух (TTL 2ч). Снова: build → test → changelog.', gate };
  }
  const currentHash = sha256File(String(gate.zip_path));
  if (gate.zip_sha256 && gate.zip_sha256 !== currentHash) {
    return { ok: false, reason: 'ZIP изменился после теста — снова cms_local_test → cms_changelog.', gate };
  }
  return { ok: true, gate };
}

/**
 * @param {Partial<{ build_ok: boolean, test_ok: boolean, zip_path: string, zip_sha256: string, build_log: string, test_log: string, step: string }>} patch
 */
export function markBuild(patch) {
  const prev = readGate();
  const zipPath = patch.zip_path || prev.zip_path;
  const sha = zipPath && fs.existsSync(String(zipPath)) ? sha256File(String(zipPath)) : patch.zip_sha256;
  writeGate({
    ...prev,
    ...patch,
    step: 'built',
    build_ok: patch.build_ok !== false,
    test_ok: false,
    changelog_ok: false,
    changelog: null,
    zip_path: zipPath,
    zip_sha256: sha,
    built_at: new Date().toISOString(),
    allow_deploy_until: null,
  });
}

/**
 * @param {Partial<{ test_ok: boolean, test_log: string }>} patch
 */
export function markTest(patch) {
  const prev = readGate();
  if (!prev.build_ok) {
    throw new Error('Нельзя тестировать без успешного cms_local_build.');
  }
  const until = new Date(Date.now() + GATE_TTL_MS).toISOString();
  writeGate({
    ...prev,
    ...patch,
    step: patch.test_ok === false ? 'built' : 'tested',
    test_ok: patch.test_ok !== false,
    // new successful test invalidates previous changelog (must rewrite for this ZIP)
    changelog_ok: false,
    changelog: null,
    tested_at: new Date().toISOString(),
    allow_deploy_until: patch.test_ok === false ? null : until,
  });
}

/**
 * @param {{ summary: string, changes?: string[], body?: string, file?: string }} entry
 */
export function markChangelog(entry) {
  const prev = readGate();
  if (!prev.build_ok || !prev.test_ok) {
    throw new Error('Changelog только после cms_local_build и cms_local_test.');
  }
  const summary = String(entry.summary || '').trim();
  if (summary.length < 8) {
    throw new Error('summary слишком короткий (минимум 8 символов).');
  }
  const changes = Array.isArray(entry.changes)
    ? entry.changes.map((c) => String(c).trim()).filter(Boolean)
    : [];
  writeGate({
    ...prev,
    step: 'changelogged',
    changelog_ok: true,
    changelog: {
      summary,
      changes,
      body: entry.body ? String(entry.body).trim() : '',
      file: entry.file || null,
      written_at: new Date().toISOString(),
      zip_sha256: prev.zip_sha256 || null,
      package: prev.zip_path ? path.basename(String(prev.zip_path)) : null,
    },
  });
  return readGate();
}

/**
 * Prepend a Keep-a-Changelog style entry to repo CHANGELOG.md
 * @param {{ summary: string, changes?: string[], body?: string }} entry
 * @returns {string} absolute path written
 */
export function writeChangelogFile(entry) {
  const file = changelogPath();
  const date = new Date().toISOString().slice(0, 10);
  const changes = Array.isArray(entry.changes) ? entry.changes.filter(Boolean) : [];
  const bullets = changes.length
    ? changes.map((c) => `- ${c}`).join('\n')
    : `- ${entry.summary}`;
  const body = entry.body ? `\n${String(entry.body).trim()}\n` : '';
  const block = `## ${date} — ${entry.summary}\n\n${bullets}\n${body}\n`;

  let prev = '';
  if (fs.existsSync(file)) {
    prev = fs.readFileSync(file, 'utf8');
    if (prev.startsWith('# ')) {
      const nl = prev.indexOf('\n');
      const header = nl === -1 ? prev : prev.slice(0, nl + 1);
      const rest = nl === -1 ? '' : prev.slice(nl + 1).replace(/^\n+/, '');
      prev = `${header}\n${block}${rest}`;
      fs.writeFileSync(file, prev, 'utf8');
      return file;
    }
  } else {
    prev = `# Changelog\n\nИстория апдейтов Jasefly CMS (пишет MCP-агент перед деплоем).\n\n`;
  }
  fs.writeFileSync(file, `${prev}${prev.endsWith('\n') ? '' : '\n'}${block}`, 'utf8');
  return file;
}

export function markDeployed(result) {
  const prev = readGate();
  writeGate({
    ...prev,
    step: 'deployed',
    deployed_at: new Date().toISOString(),
    last_deploy: result,
    build_ok: false,
    test_ok: false,
    changelog_ok: false,
    allow_deploy_until: null,
    pending_telegram: null,
  });
}

/**
 * ZIP staged on host awaiting Telegram Approve — do not clear build gate.
 * @param {{ zip?: string, deploy_id?: string, result?: unknown }} payload
 */
export function markPendingTelegram(payload) {
  const prev = readGate();
  writeGate({
    ...prev,
    step: 'pending_telegram',
    pending_telegram: {
      deploy_id: payload.deploy_id || null,
      zip: payload.zip || prev.zip_path || null,
      at: new Date().toISOString(),
      result: payload.result || null,
    },
  });
}

export function pipelineHelp() {
  return {
    order: [
      '1. cms_local_build — frontend build + hosting update ZIP',
      '2. cms_local_test — lint + проверка ZIP',
      '3. cms_changelog — ОБЯЗАТЕЛЬНО опиши изменения (summary + changes)',
      '4. cms_deploy_update — заливка ZIP (после неё сразу verify)',
      '5. cms_verify_alive — снапшот сайта + БД + API → ready / «Готово»',
      'Или одним вызовом: cms_release({ summary, changes })',
    ],
    content_only: [
      'Контент без кода: cms_write_content_pack → cms_apply_content_pack (гейт билда не нужен).',
      'После деплоя кода смотри ready=true и message «Готово» — иначе problems[].',
      'После миграций: cms_db_schema — какие таблицы есть / expected.missing.',
      'Changelog пишется в CHANGELOG.md и в журнал админки (вкладка MCP / агент).',
    ],
    gate: readGate(),
  };
}
