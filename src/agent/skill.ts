import { readFileSync } from 'node:fs';
export const skill = readFileSync(new URL('./skill/SKILL.md', import.meta.url), 'utf8');
export const skillFiles: Record<string, string> = {
  'SKILL.md': skill,
  'references/routing.md': readFileSync(
    new URL('./skill/references/routing.md', import.meta.url),
    'utf8',
  ),
  'agents/openai.yaml': readFileSync(
    new URL('./skill/agents/openai.yaml', import.meta.url),
    'utf8',
  ),
};

export const awareness = `Pigeon is available as your human communication channel. When human input or an important requested update is necessary, use the Pigeon tools and follow the pigeon skill; continue autonomously otherwise. Talk to the fork. Direct the main. Approve through the coordinator. Preserve native permissions and verify external actions after human replies.`;
