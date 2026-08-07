/**
 * Opt-in human gate for Node VPS SSH deploys (host TELEGRAM_DEPLOY_*).
 * Artifact stays on MCP machine until Approve + redeem, then deployVpsAtomic.
 */
import path from 'node:path';
import { sha256File } from '../gate.js';

/**
 * @param {import('../client.js').CmsClient} cms
 * @param {string} zipPath
 * @returns {Promise<
 *   | { pending: true, data: Record<string, unknown> }
 *   | { pending: false, skipped?: string, data?: Record<string, unknown>, redeem?: Record<string, unknown> }
 * >}
 */
export async function ensureVpsTelegramGate(cms, zipPath) {
  let updates;
  try {
    updates = await cms.get('/admin/updates');
  } catch {
    // Old Node builds without telegram status — allow SSH (fail-open only when endpoint missing)
    return { pending: false, skipped: 'updates_unreachable' };
  }
  const data = updates?.data ?? updates;
  const tg = data?.telegram_deploy_approve;
  if (!tg || tg.enabled !== true) {
    return { pending: false, skipped: 'disabled' };
  }
  if (tg.configured !== true) {
    throw new Error(
      'VPS TELEGRAM_DEPLOY_APPROVE=1, но на runtime не заданы TELEGRAM_DEPLOY_BOT_TOKEN / '
        + 'CHAT_ID / WEBHOOK_SECRET (только host .env, не mcp-cms).',
    );
  }

  const sha = sha256File(zipPath);
  const pkg = path.basename(zipPath);
  const reqRes = await cms.post('/admin/deploy/telegram/request', {
    package: pkg,
    sha256: sha,
  });
  const req = reqRes?.data ?? reqRes;

  if (req?.pending_approval === true) {
    return { pending: true, data: req };
  }

  const redeemRes = await cms.post('/admin/deploy/telegram/redeem', {
    deploy_id: req?.deploy_id || undefined,
    sha256: sha,
  });
  return {
    pending: false,
    data: req,
    redeem: redeemRes?.data ?? redeemRes,
  };
}
