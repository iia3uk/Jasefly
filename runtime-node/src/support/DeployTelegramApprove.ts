/**
 * Opt-in human gate for Node VPS deploys (SSH apply stays on mcp-cms).
 * Secrets only from process env / AppConfig — never Mail DB / mcp-cms.
 *
 * Flow: request → Telegram Approve → status=approved → MCP redeem → SSH deploy.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { AppConfig } from '../config.js';

export type DeployPendingStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'redeemed';

export type DeployPendingMeta = {
  id: string;
  package: string;
  sha256: string;
  created_at: string;
  expires_at: string;
  status: DeployPendingStatus;
  requested_by: 'mcp' | 'admin';
  message_id: number | null;
  chat_id: string;
  approved_at?: string;
  rejected_at?: string;
  redeemed_at?: string;
  runtime: 'node-vps';
};

function truthy(v: string): boolean {
  return ['1', 'true', 'yes', 'on'].includes(v.trim().toLowerCase());
}

function timingSafeEqualStr(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

export class DeployTelegramApprove {
  private pendingDir: string;

  constructor(private cfg: AppConfig) {
    this.pendingDir = path.join(cfg.storagePath, 'updates', 'pending');
  }

  static enabled(cfg: AppConfig): boolean {
    return truthy(cfg.telegramDeployApprove || process.env.TELEGRAM_DEPLOY_APPROVE || '0');
  }

  static configured(cfg: AppConfig): boolean {
    return Boolean(
      (cfg.telegramDeployBotToken || '').trim()
        && (cfg.telegramDeployChatId || '').trim()
        && (cfg.telegramDeployWebhookSecret || '').trim(),
    );
  }

  static assertConfigured(cfg: AppConfig): void {
    if (!this.configured(cfg)) {
      throw new Error(
        'TELEGRAM_DEPLOY_APPROVE включён, но не заданы TELEGRAM_DEPLOY_BOT_TOKEN / '
          + 'TELEGRAM_DEPLOY_CHAT_ID / TELEGRAM_DEPLOY_WEBHOOK_SECRET в runtime .env',
      );
    }
  }

  statusPublic(): { enabled: boolean; configured: boolean; pending: Array<Record<string, unknown>> } {
    return {
      enabled: DeployTelegramApprove.enabled(this.cfg),
      configured: DeployTelegramApprove.configured(this.cfg),
      pending: this.listPendingSummaries(),
    };
  }

  /**
   * Stage a VPS deploy request (artifact stays on MCP host until Approve + redeem).
   */
  async request(opts: {
    package: string;
    sha256: string;
    requestedBy?: 'mcp' | 'admin';
  }): Promise<Record<string, unknown>> {
    if (!DeployTelegramApprove.enabled(this.cfg)) {
      throw Object.assign(new Error('TELEGRAM_DEPLOY_APPROVE выключен'), { status: 400 });
    }
    DeployTelegramApprove.assertConfigured(this.cfg);
    const pkg = String(opts.package || '').trim();
    const sha = String(opts.sha256 || '').trim().toLowerCase();
    if (!pkg || !/^[a-f0-9]{64}$/.test(sha)) {
      throw Object.assign(new Error('package и sha256 (64 hex) обязательны'), { status: 422 });
    }

    this.ensurePendingDir();
    this.expireStale();

    // Reuse open pending for same sha
    for (const meta of this.allMeta()) {
      if (meta.sha256 === sha && (meta.status === 'pending' || meta.status === 'approved')) {
        if (meta.status === 'pending' && !meta.message_id) {
          const mid = await this.notifyPending(meta);
          meta.message_id = mid;
          this.writeMeta(meta);
        }
        return {
          ok: true,
          pending_approval: meta.status === 'pending',
          approved: meta.status === 'approved',
          deploy_id: meta.id,
          package: meta.package,
          sha256: meta.sha256,
          expires_at: meta.expires_at,
          message:
            meta.status === 'approved'
              ? 'Уже одобрено в Telegram — вызовите redeem и SSH deploy.'
              : 'Пакет ждёт Approve в Telegram (или admin escape hatch).',
        };
      }
    }

    const id = crypto.randomBytes(16).toString('hex');
    const ttl = Math.max(120, cfgTtl(this.cfg));
    const meta: DeployPendingMeta = {
      id,
      package: pkg,
      sha256: sha,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + ttl * 1000).toISOString(),
      status: 'pending',
      requested_by: opts.requestedBy === 'admin' ? 'admin' : 'mcp',
      message_id: null,
      chat_id: this.cfg.telegramDeployChatId,
      runtime: 'node-vps',
    };
    this.writeMeta(meta);

    try {
      await this.ensureWebhook();
      meta.message_id = await this.notifyPending(meta);
      this.writeMeta(meta);
    } catch (e) {
      try {
        fs.unlinkSync(this.metaPath(id));
      } catch {
        /* ignore */
      }
      throw new Error(
        `Pending сохранён, но Telegram недоступен: ${e instanceof Error ? e.message : String(e)}`,
      );
    }

    return {
      ok: true,
      pending_approval: true,
      deploy_id: id,
      package: pkg,
      sha256: sha,
      expires_at: meta.expires_at,
      message: 'VPS deploy ждёт Approve в Telegram. После клика — снова cms_deploy_update(confirm=true).',
    };
  }

  /** Mark approved (Telegram or admin). Does not run SSH. */
  approve(id: string, via: string): Record<string, unknown> {
    const meta = this.loadMeta(id);
    if (!meta) throw Object.assign(new Error('Pending deploy не найден'), { status: 404 });
    if (meta.status !== 'pending') {
      throw Object.assign(new Error(`Deploy уже обработан (${meta.status})`), { status: 409 });
    }
    if (this.isExpired(meta)) {
      meta.status = 'expired';
      this.writeMeta(meta);
      throw Object.assign(new Error('Pending deploy протух (TTL)'), { status: 410 });
    }
    meta.status = 'approved';
    meta.approved_at = new Date().toISOString();
    this.writeMeta(meta);
    void this.editMessage(
      meta.message_id ?? 0,
      `✅ VPS deploy одобрен (${via})\n📦 ${meta.package}\nid: \`${meta.id}\`\nЖдёт mcp-cms SSH redeem.`,
    );
    return {
      ok: true,
      pending_approval: false,
      approved: true,
      deploy_id: id,
      sha256: meta.sha256,
      message: 'Одобрено. MCP может redeem + SSH.',
    };
  }

  reject(id: string, via: string): Record<string, unknown> {
    const meta = this.loadMeta(id);
    if (!meta) throw Object.assign(new Error('Pending deploy не найден'), { status: 404 });
    if (meta.status !== 'pending' && meta.status !== 'approved') {
      throw Object.assign(new Error(`Deploy уже обработан (${meta.status})`), { status: 409 });
    }
    meta.status = 'rejected';
    meta.rejected_at = new Date().toISOString();
    this.writeMeta(meta);
    void this.editMessage(
      meta.message_id ?? 0,
      `❌ VPS deploy отклонён (${via})\n📦 ${meta.package}\nid: \`${meta.id}\``,
    );
    return { ok: true, status: 'rejected', deploy_id: id, message: 'Pending отклонён.' };
  }

  /**
   * Consume an approved pending so MCP may run SSH once.
   */
  redeem(opts: { deploy_id?: string; sha256?: string }): Record<string, unknown> {
    this.expireStale();
    let meta: DeployPendingMeta | null = null;
    const id = String(opts.deploy_id || '').trim();
    const sha = String(opts.sha256 || '').trim().toLowerCase();
    if (id) meta = this.loadMeta(id);
    else if (sha) {
      meta = this.allMeta().find((m) => m.sha256 === sha && (m.status === 'approved' || m.status === 'pending')) ?? null;
    }
    if (!meta) throw Object.assign(new Error('Pending deploy не найден'), { status: 404 });
    if (meta.status === 'pending') {
      throw Object.assign(new Error('Ещё ждёт Approve в Telegram'), { status: 409, code: 'still_pending' });
    }
    if (meta.status === 'rejected' || meta.status === 'expired') {
      throw Object.assign(new Error(`Deploy ${meta.status}`), { status: 410 });
    }
    if (meta.status === 'redeemed') {
      throw Object.assign(new Error('Уже redeemed — нужен новый request'), { status: 409 });
    }
    if (meta.status !== 'approved') {
      throw Object.assign(new Error(`Нельзя redeem в статусе ${meta.status}`), { status: 409 });
    }
    meta.status = 'redeemed';
    meta.redeemed_at = new Date().toISOString();
    this.writeMeta(meta);
    return {
      ok: true,
      redeemed: true,
      deploy_id: meta.id,
      sha256: meta.sha256,
      package: meta.package,
      message: 'Redeem OK — можно SSH atomic deploy.',
    };
  }

  async handleWebhook(secretHeader: string | undefined, rawBody: string): Promise<Record<string, unknown>> {
    if (!DeployTelegramApprove.enabled(this.cfg)) return { ok: false, error: 'disabled' };
    if (!DeployTelegramApprove.configured(this.cfg)) return { ok: false, error: 'misconfigured' };
    const expected = this.cfg.telegramDeployWebhookSecret;
    if (!secretHeader || !timingSafeEqualStr(expected, secretHeader)) {
      return { ok: false, error: 'bad_secret' };
    }
    let update: Record<string, unknown>;
    try {
      update = JSON.parse(rawBody) as Record<string, unknown>;
    } catch {
      return { ok: false, error: 'bad_json' };
    }
    const cb = update.callback_query as Record<string, unknown> | undefined;
    if (!cb) return { ok: true, ignored: true };

    const msg = (cb.message || {}) as Record<string, unknown>;
    const chat = (msg.chat || {}) as Record<string, unknown>;
    const from = (cb.from || {}) as Record<string, unknown>;
    const chatId = String(chat.id ?? from.id ?? '');
    if (!chatId || !timingSafeEqualStr(this.cfg.telegramDeployChatId, chatId)) {
      await this.answerCallback(String(cb.id || ''), 'Чат не в allowlist');
      return { ok: false, error: 'chat_denied' };
    }

    const data = String(cb.data || '');
    const cbId = String(cb.id || '');
    const appM = /^dapp:([a-f0-9]{32})$/.exec(data);
    if (appM) {
      try {
        this.approve(appM[1], 'telegram');
        await this.answerCallback(cbId, 'Одобрено');
        return { ok: true, action: 'approved', deploy_id: appM[1] };
      } catch (e) {
        await this.answerCallback(cbId, String(e instanceof Error ? e.message : e).slice(0, 180));
        return { ok: false, error: e instanceof Error ? e.message : String(e), deploy_id: appM[1] };
      }
    }
    const rejM = /^drej:([a-f0-9]{32})$/.exec(data);
    if (rejM) {
      try {
        this.reject(rejM[1], 'telegram');
        await this.answerCallback(cbId, 'Отклонено');
        return { ok: true, action: 'rejected', deploy_id: rejM[1] };
      } catch (e) {
        await this.answerCallback(cbId, String(e instanceof Error ? e.message : e).slice(0, 180));
        return { ok: false, error: e instanceof Error ? e.message : String(e), deploy_id: rejM[1] };
      }
    }
    await this.answerCallback(cbId, 'Неизвестная кнопка');
    return { ok: true, ignored: true };
  }

  private listPendingSummaries(): Array<Record<string, unknown>> {
    this.expireStale();
    return this.allMeta()
      .filter((m) => m.status === 'pending' || m.status === 'approved')
      .sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))
      .map((m) => ({
        id: m.id,
        package: m.package,
        sha256: m.sha256,
        created_at: m.created_at,
        expires_at: m.expires_at,
        status: m.status,
        requested_by: m.requested_by,
        runtime: m.runtime,
      }));
  }

  private async ensureWebhook(): Promise<void> {
    const base = this.cfg.url.replace(/\/$/, '');
    if (!base) throw new Error('APP_URL пуст — нельзя зарегистрировать Telegram webhook');
    await this.telegramApi('setWebhook', {
      url: `${base}/api/v1/telegram/deploy-webhook`,
      secret_token: this.cfg.telegramDeployWebhookSecret,
      allowed_updates: JSON.stringify(['callback_query']),
      drop_pending_updates: 'false',
    });
  }

  private async notifyPending(meta: DeployPendingMeta): Promise<number> {
    const text = [
      '🔐 VPS deploy ждёт подтверждения',
      `📦 ${meta.package}`,
      `via: ${meta.requested_by}`,
      `id: \`${meta.id}\``,
      `sha: \`${meta.sha256.slice(0, 12)}…\``,
      `expires: ${meta.expires_at}`,
      '',
      'После Approve снова вызовите cms_deploy_update(confirm=true).',
    ].join('\n');
    const keyboard = {
      inline_keyboard: [[
        { text: '✅ Approve', callback_data: `dapp:${meta.id}` },
        { text: '❌ Reject', callback_data: `drej:${meta.id}` },
      ]],
    };
    const json = await this.telegramApi('sendMessage', {
      chat_id: this.cfg.telegramDeployChatId,
      text: text.slice(0, 4000),
      parse_mode: 'Markdown',
      disable_web_page_preview: '1',
      reply_markup: JSON.stringify(keyboard),
    });
    return Number((json.result as { message_id?: number } | undefined)?.message_id || 0);
  }

  private async answerCallback(callbackId: string, text: string): Promise<void> {
    if (!callbackId) return;
    try {
      await this.telegramApi('answerCallbackQuery', {
        callback_query_id: callbackId,
        text: text.slice(0, 180),
        show_alert: 'false',
      });
    } catch {
      /* non-fatal */
    }
  }

  private async editMessage(messageId: number, text: string): Promise<void> {
    if (messageId <= 0) return;
    try {
      await this.telegramApi('editMessageText', {
        chat_id: this.cfg.telegramDeployChatId,
        message_id: String(messageId),
        text: text.slice(0, 4000),
        parse_mode: 'Markdown',
        disable_web_page_preview: '1',
      });
    } catch {
      /* non-fatal */
    }
  }

  private async telegramApi(method: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const token = this.cfg.telegramDeployBotToken;
    const url = `https://api.telegram.org/bot${encodeURIComponent(token)}/${method}`;
    const body = new URLSearchParams(params);
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(20000),
    });
    const json = (await res.json()) as Record<string, unknown>;
    if (!json.ok) {
      throw new Error(`Telegram API error: ${String(json.description || 'unknown')}`);
    }
    return json;
  }

  private ensurePendingDir(): void {
    fs.mkdirSync(this.pendingDir, { recursive: true });
  }

  private metaPath(id: string): string {
    return path.join(this.pendingDir, `${id}.json`);
  }

  private writeMeta(meta: DeployPendingMeta): void {
    this.ensurePendingDir();
    fs.writeFileSync(this.metaPath(meta.id), JSON.stringify(meta, null, 2), 'utf8');
  }

  private loadMeta(id: string): DeployPendingMeta | null {
    if (!/^[a-f0-9]{32}$/.test(id)) return null;
    const p = this.metaPath(id);
    if (!fs.existsSync(p)) return null;
    try {
      return JSON.parse(fs.readFileSync(p, 'utf8')) as DeployPendingMeta;
    } catch {
      return null;
    }
  }

  private allMeta(): DeployPendingMeta[] {
    if (!fs.existsSync(this.pendingDir)) return [];
    const out: DeployPendingMeta[] = [];
    for (const name of fs.readdirSync(this.pendingDir)) {
      if (!name.endsWith('.json')) continue;
      const m = this.loadMeta(name.replace(/\.json$/, ''));
      if (m) out.push(m);
    }
    return out;
  }

  private isExpired(meta: DeployPendingMeta): boolean {
    const t = Date.parse(meta.expires_at || '');
    return Number.isFinite(t) && t < Date.now();
  }

  private expireStale(): void {
    for (const meta of this.allMeta()) {
      if (meta.status === 'pending' && this.isExpired(meta)) {
        meta.status = 'expired';
        this.writeMeta(meta);
      }
    }
  }
}

function cfgTtl(cfg: AppConfig): number {
  return Number(cfg.telegramDeployTtlSeconds || process.env.TELEGRAM_DEPLOY_TTL_SECONDS || 3600);
}
