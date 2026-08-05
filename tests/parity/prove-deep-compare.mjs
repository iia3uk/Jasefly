/**

 * Prove parity runner deep-compare behavior:

 * 1) fails when scrubbed data diverges while per-runtime assertions pass

 * 2) skips cases marked parity:false

 * 3) passes when envelopes match after scrub/normalize

 */

import http from 'node:http';

import { spawn } from 'node:child_process';

import path from 'node:path';

import { fileURLToPath } from 'node:url';



const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const runner = path.join(root, 'tests/parity/runner.mjs');



function serve(port, handlers) {

  const server = http.createServer((req, res) => {

    const url = req.url || '';

    res.setHeader('Content-Type', 'application/json');

    for (const [prefix, fn] of handlers) {

      if (url.includes(prefix)) {

        fn(req, res);

        return;

      }

    }

    res.statusCode = 404;

    res.end(JSON.stringify({ success: false, error: 'nf' }));

  });

  return new Promise((resolve) => server.listen(port, '127.0.0.1', () => resolve(server)));

}



function runParity(phpPort, nodePort) {

  return new Promise((resolve) => {

    const child = spawn(process.execPath, [runner], {

      env: {

        ...process.env,

        PHP_BASE: `http://127.0.0.1:${phpPort}/api/v1`,

        NODE_BASE: `http://127.0.0.1:${nodePort}/api/v1`,

      },

    });

    let stdout = '';

    let stderr = '';

    child.stdout.on('data', (d) => {

      stdout += d;

    });

    child.stderr.on('data', (d) => {

      stderr += d;

    });

    const timer = setTimeout(() => {

      child.kill('SIGTERM');

      resolve({ status: -1, stdout, stderr: `${stderr}\nTIMEOUT` });

    }, 20000);

    child.on('close', (status) => {

      clearTimeout(timer);

      resolve({ status, stdout, stderr });

    });

  });

}



const okHealth = {

  success: true,

  data: { status: 'ok', api_version: 'v1', time: '2026-01-01T00:00:00Z', runtime: 'php' },

  meta: { api_version: 'v1' },

};

const badHealth = {

  success: true,

  data: { status: 'ok', api_version: 'v2-wrong', time: '2026-01-01T00:00:00Z', runtime: 'node-broken' },

  meta: { api_version: 'v1' },

};



const commonHandlers = [

  ['/capabilities', (_req, res) => {

    res.end(JSON.stringify({

      success: true,

      data: { runtime: 'x', baseline: [], extended: [], available: [] },

    }));

  }],

  ['/site', (_req, res) => {

    res.end(JSON.stringify({ success: true, data: { enabled_plugins: [] } }));

  }],

  ['/auth/login', (_req, res) => {

    res.statusCode = 401;

    res.end(JSON.stringify({ success: false, error: 'Invalid credentials' }));

  }],

  ['/admin/', (_req, res) => {

    res.statusCode = 401;

    res.end(JSON.stringify({ success: false, error: 'Unauthorized' }));

  }],

  ['/translate/batch', (_req, res) => {

    res.end(JSON.stringify({

      success: true,

      data: { translations: ['Hello'], cached: 0, fetched: 0, missing: 1, provider: 'stub' },

    }));

  }],

  ['/access/providers', (_req, res) => {

    res.end(JSON.stringify({ data: [{ id: 'auth', label: 'Auth', available: true, asserts: [] }] }));

  }],

  ['/payments/config', (_req, res) => {

    res.end(JSON.stringify({ success: true, data: { currency: 'RUB', provider: 'manual' } }));

  }],

  ['/forms/no-such-form-slug-xyz', (_req, res) => {

    res.statusCode = 404;

    res.end(JSON.stringify({ success: false, error: 'Not found' }));

  }],

];



const php = await serve(3991, [

  ['/health', (_req, res) => res.end(JSON.stringify(okHealth))],

  ...commonHandlers,

]);

const nodeBad = await serve(3992, [

  ['/health', (_req, res) => res.end(JSON.stringify(badHealth))],

  ...commonHandlers,

]);



const divergeRun = await runParity(3991, 3992);

await new Promise((res) => php.close(res));

await new Promise((res) => nodeBad.close(res));



const divergeOut = `${divergeRun.stdout}\n${divergeRun.stderr}`;

const caughtDivergence =

  divergeRun.status !== 0 && /\[PARITY\] health/.test(divergeOut) && /api_version/.test(divergeOut);



const phpOk = await serve(3993, [

  ['/health', (_req, res) => res.end(JSON.stringify(okHealth))],

  ...commonHandlers,

]);

const nodeOk = await serve(3994, [

  ['/health', (_req, res) => res.end(JSON.stringify({ ...okHealth, data: { ...okHealth.data, runtime: 'node' } }))],

  ...commonHandlers,

]);



const matchRun = await runParity(3993, 3994);

await new Promise((res) => phpOk.close(res));

await new Promise((res) => nodeOk.close(res));



const matchOut = `${matchRun.stdout}\n${matchRun.stderr}`;

const matched =

  matchRun.status === 0 &&

  /\[PARITY OK\] health/.test(matchOut) &&

  /\[PARITY SKIP\] capabilities/.test(matchOut) &&

  /parity runner OK/.test(matchOut);



console.log('--- divergence run (expect fail) ---');

console.log(divergeOut.trim().split('\n').slice(-12).join('\n'));

console.log(caughtDivergence ? 'PROOF_OK: deep parity caught api_version divergence' : 'PROOF_FAIL: divergence not caught');



console.log('\n--- match run (expect pass) ---');

console.log(matchOut.trim().split('\n').slice(-15).join('\n'));

console.log(matched ? 'PROOF_OK: scrubbed parity pass + skip parity:false' : 'PROOF_FAIL: match run failed');



const ok = caughtDivergence && matched;

process.exit(ok ? 0 : 1);


