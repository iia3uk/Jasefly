import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const RUNTIME_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(RUNTIME_ROOT, '..');
export const CONTRACTS_ROOT = path.join(REPO_ROOT, 'contracts');

dotenv.config({ path: path.join(RUNTIME_ROOT, '.env') });
// Optional shared secrets from PHP local config path (dev convenience only)
const phpEnv = path.join(REPO_ROOT, 'backend', 'config', '.env');
if (fs.existsSync(phpEnv)) {
  dotenv.config({ path: phpEnv, override: false });
}

export type DbDriver = 'mysql' | 'pgsql' | 'sqlite';

export interface AppConfig {
  name: string;
  url: string;
  env: string;
  timezone: string;
  port: number;
  jwtSecret: string;
  jwtTtl: number;
  refreshTtl: number;
  mcpApiToken: string;
  mcpSigningSecret: string;
  mcpAuthMode: string;
  mcpAllowedIps: string;
  mcpSkewSeconds: number;
  telegramDeployApprove: string;
  telegramDeployBotToken: string;
  telegramDeployChatId: string;
  telegramDeployWebhookSecret: string;
  telegramDeployTtlSeconds: number;
  corsOrigins: string[];
  storagePath: string;
  runtime: 'node-vps';
  db: {
    driver: DbDriver;
    host: string;
    port: number;
    name: string;
    user: string;
    pass: string;
    path: string;
    charset: string;
  };
}

function loadConfig(): AppConfig {
  const cors = (process.env.CORS_ORIGINS || '*')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const storage = process.env.STORAGE_PATH
    ? path.resolve(RUNTIME_ROOT, process.env.STORAGE_PATH)
    : path.join(RUNTIME_ROOT, 'storage');

  return {
    name: process.env.APP_NAME || 'Jasefly',
    url: (process.env.APP_URL || 'http://localhost:3080').replace(/\/$/, ''),
    env: process.env.APP_ENV || 'production',
    timezone: process.env.APP_TIMEZONE || 'Europe/Moscow',
    port: Number(process.env.PORT || 3080),
    jwtSecret: process.env.JWT_SECRET || '',
    jwtTtl: Number(process.env.JWT_TTL || 3600),
    refreshTtl: Number(process.env.REFRESH_TTL || 604800),
    mcpApiToken: process.env.MCP_API_TOKEN || '',
    mcpSigningSecret: process.env.MCP_SIGNING_SECRET || '',
    mcpAuthMode: process.env.MCP_AUTH_MODE || 'legacy',
    mcpAllowedIps: process.env.MCP_ALLOWED_IPS || '',
    mcpSkewSeconds: Number(process.env.MCP_SKEW_SECONDS || 300),
    telegramDeployApprove: process.env.TELEGRAM_DEPLOY_APPROVE || '0',
    telegramDeployBotToken: process.env.TELEGRAM_DEPLOY_BOT_TOKEN || '',
    telegramDeployChatId: process.env.TELEGRAM_DEPLOY_CHAT_ID || '',
    telegramDeployWebhookSecret: process.env.TELEGRAM_DEPLOY_WEBHOOK_SECRET || '',
    telegramDeployTtlSeconds: Number(process.env.TELEGRAM_DEPLOY_TTL_SECONDS || 3600),
    corsOrigins: cors,
    storagePath: storage,
    runtime: 'node-vps',
    db: {
      driver: (process.env.DB_DRIVER || 'sqlite') as DbDriver,
      host: process.env.DB_HOST || '127.0.0.1',
      port: Number(process.env.DB_PORT || (process.env.DB_DRIVER === 'pgsql' ? 5432 : 3306)),
      name: process.env.DB_NAME || 'jasefly',
      user: process.env.DB_USER || 'jasefly',
      pass: process.env.DB_PASS || '',
      path: process.env.DB_PATH
        ? path.resolve(RUNTIME_ROOT, process.env.DB_PATH)
        : path.join(storage, 'sqlite', 'cms.sqlite'),
      charset: process.env.DB_CHARSET || 'utf8mb4',
    },
  };
}

export const appConfig = loadConfig();

export function readContractJson<T = unknown>(rel: string): T {
  const p = path.join(CONTRACTS_ROOT, rel);
  return JSON.parse(fs.readFileSync(p, 'utf8')) as T;
}
