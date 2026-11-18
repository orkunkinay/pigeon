import { readFileSync } from 'node:fs';
export const skill = readFileSync(new URL('./skill/SKILL.md', import.meta.url), 'utf8');

export const awareness = `Pigeon is installed for reaching the human away from this computer. When genuinely blocked on human input or asked for remote updates, read the pigeon skill and use its MCP tools if available. Avoid routine notifications; preserve native approvals and verify external actions after a human reply.`;
