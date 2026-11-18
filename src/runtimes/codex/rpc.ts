import { EventEmitter } from 'node:events';
import { homedir } from 'node:os';
import { join } from 'node:path';
import WebSocket from 'ws';

export type RpcMessage = { id?: number | string; method?: string; params?: any; result?: any; error?: { code: number; message: string } };
export class RpcError extends Error { constructor(public code: number, message: string) { super(message); } }
/** Connect to the existing daemon; never create a second runtime. */
export class CodexRpc extends EventEmitter {
  private socket?: WebSocket;
  private nextId = 0;
  private pending = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void; timer: NodeJS.Timeout }>();
  get connected() { return this.socket?.readyState === WebSocket.OPEN; }
  async connect(socketPath = join(process.env.CODEX_HOME || join(homedir(), '.codex'), 'app-server-control/app-server-control.sock')) {
    if (this.socket) throw new Error('Already connected');
    const ws = new WebSocket(`ws+unix://${socketPath}:/`, { maxPayload: 32 * 1024 * 1024, handshakeTimeout: 5000 });
    this.socket = ws;
    ws.on('message', raw => {
      let message: RpcMessage;
      try { message = JSON.parse(raw.toString()); } catch { ws.close(1002); return; }
      if (message.method) { this.emit(message.id === undefined ? 'notification' : 'request', message); return; }
      const pending = this.pending.get(message.id as number);
      if (!pending) return;
      clearTimeout(pending.timer); this.pending.delete(message.id as number);
      message.error ? pending.reject(new RpcError(message.error.code, message.error.message)) : pending.resolve(message.result);
    });
    ws.on('error', () => {}); // connect rejects; close rejects all in-flight requests
    ws.on('close', () => {
      if (this.socket === ws) this.socket = undefined;
      for (const p of this.pending.values()) { clearTimeout(p.timer); p.reject(new Error('Codex disconnected; delivery may be unknown')); }
      this.pending.clear(); this.emit('disconnected');
    });
    try {
      await new Promise<void>((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
      const info = await this.call('initialize', { clientInfo: { name: 'pigeon', version: '0.1.0' }, capabilities: { experimentalApi: true, requiredHumanApproval: true } });
      this.send({ method: 'initialized' }); return info;
    } catch (e) { ws.terminate(); throw e; }
  }
  call(method: string, params: unknown, timeout = 15000): Promise<any> {
    if (!this.connected) return Promise.reject(new Error('Codex is disconnected'));
    const id = ++this.nextId;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`${method} timed out; delivery may be unknown`)); }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try { this.send({ id, method, params }); } catch (e) { clearTimeout(timer); this.pending.delete(id); reject(e); }
    });
  }
  send(message: RpcMessage) { if (!this.connected) throw new Error('Codex is disconnected'); this.socket!.send(JSON.stringify(message)); }
  respond(id: string | number, result: unknown) { this.send({ id, result }); }
  close() { this.socket?.close(); }
}
