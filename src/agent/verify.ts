import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { CodexRpc } from '../runtimes/codex/rpc.js';
import { tools } from './contracts.js';
import { home } from '../config.js';

export async function verifyAgentIntegration(cli: string) {
  const rpc = new CodexRpc();
  let skillDiscovered = false;
  let discoveryError: string | undefined;
  try {
    await rpc.connect();
    const result = await rpc.call('skills/list', { cwds: [process.cwd()], forceReload: true });
    skillDiscovered = result.data.some((d: any) =>
      d.skills?.some((s: any) => s.name === 'pigeon' && s.enabled),
    );
    if (!skillDiscovered)
      discoveryError = 'Pigeon skill is disabled or not discoverable in this runtime.';
  } catch {
    discoveryError = 'Skill discovery could not be verified: Codex shared runtime is unavailable.';
  } finally {
    await rpc.close();
  }
  const client = new Client({ name: 'pigeon-setup-check', version: '0.1.0' });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [cli, 'mcp'],
    env: {
      ...Object.fromEntries(
        Object.entries(process.env).filter((e): e is [string, string] => typeof e[1] === 'string'),
      ),
      PIGEON_HOME: home,
    },
    stderr: 'ignore',
  });
  let mcpToolsVerified = false;
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    mcpToolsVerified = tools.every((t) => listed.tools.some((found) => found.name === t.name));
  } finally {
    await client.close();
  }
  return { skillDiscovered, mcpToolsVerified, ...(discoveryError ? { discoveryError } : {}) };
}
