import { createServer, request } from 'node:http';
import { chmod, mkdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { home } from '../config.js';
import type { AgentCall } from './contracts.js';

export const socketPath = join(home, 'companion.sock');
/** No TCP listener, tokens, Slack client, or Codex control in MCP processes. */
export async function serveAgentCalls(
  handle: (call: AgentCall, signal: AbortSignal) => Promise<unknown>,
  path = socketPath,
) {
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST' || req.url !== '/call') {
      res.writeHead(404).end();
      return;
    }
    const abort = new AbortController();
    res.on('close', () => abort.abort());
    try {
      let body = '';
      for await (const data of req) {
        body += data;
        if (Buffer.byteLength(body) > 16384) throw Error('Request too large');
      }
      const value = await handle(JSON.parse(body), abort.signal);
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ result: value }));
    } catch (e) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: e instanceof Error ? e.message : 'Communication failed' }));
    }
  });
  await mkdir(join(path, '..'), { recursive: true, mode: 0o700 });
  await rm(path, { force: true }); // caller already holds the exclusive companion lock
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(path, resolve);
  });
  await chmod(path, 0o600);
  return async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(path, { force: true });
  };
}
export function companionCall(
  call: AgentCall,
  signal?: AbortSignal,
  path = socketPath,
): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = request(
      {
        socketPath: path,
        path: '/call',
        method: 'POST',
        signal,
        timeout: 50000,
        headers: { 'Content-Type': 'application/json' },
      },
      (res) => {
        let body = '';
        res.on('data', (b) => {
          body += b;
          if (body.length > 32768) res.destroy(Error('Response too large'));
        });
        res.on('error', reject);
        res.on('end', () => {
          try {
            const data = JSON.parse(body);
            data.error ? reject(Error(data.error)) : resolve(data.result);
          } catch (e) {
            reject(e);
          }
        });
      },
    );
    req.on('timeout', () =>
      req.destroy(Error('Companion timed out; check request status before resending')),
    );
    req.on('error', (e) =>
      reject(
        Error(
          `Pigeon companion unavailable (${(e as NodeJS.ErrnoException).code || 'connection failed'}). Run pigeon doctor.`,
        ),
      ),
    );
    req.end(JSON.stringify(call));
  });
}
