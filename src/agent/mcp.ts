import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { companionCall } from './ipc.js';
import { tools } from './contracts.js';

export async function runMcp() {
  const server = new Server({ name: 'pigeon', version: '0.1.0' }, { capabilities: { tools: {} } });
  server.setRequestHandler(ListToolsRequestSchema, async () => ({ tools }));
  server.setRequestHandler(CallToolRequestSchema, async (request, extra) => {
    try {
      if (!tools.some((t) => t.name === request.params.name)) throw Error('Unknown Pigeon tool');
      const meta = request.params._meta;
      const result = await companionCall(
        {
          name: request.params.name,
          arguments: request.params.arguments,
          // Codex supplies this per call, including for shared MCP server processes.
          // Never infer identity from cwd or a single active session.
          session: typeof meta?.threadId === 'string' ? meta.threadId : undefined,
          callKey: typeof meta?.itemId === 'string' ? meta.itemId : undefined,
        },
        extra.signal,
      );
      return {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      };
    } catch (e) {
      if (request.params.name === 'pigeon_get_status') {
        const result = {
          available: false,
          companion: false,
          reason: 'The local companion is unavailable. Run pigeon doctor.',
        };
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        };
      }
      return {
        isError: true,
        content: [{ type: 'text', text: e instanceof Error ? e.message : 'Pigeon unavailable' }],
      };
    }
  });
  await server.connect(new StdioServerTransport());
}
