import { cp } from 'node:fs/promises';
await cp(
  new URL('../src/agent/skill', import.meta.url),
  new URL('../dist/agent/skill', import.meta.url),
  { recursive: true },
);
