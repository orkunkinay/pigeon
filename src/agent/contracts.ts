export const tools = [
  {
    name: 'pigeon_get_status',
    description:
      'Inspect human communication availability and preferences without sending a message.',
    inputSchema: { type: 'object', properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  },
  ...(['pigeon_notify_human', 'pigeon_ask_human', 'pigeon_request_human_action'] as const).map(
    (name) => ({
      name,
      description:
        name === 'pigeon_notify_human'
          ? 'Send a concise human update without waiting for a human reply. Only delivered confirms transport acceptance. Never use for routine tool activity.'
          : 'Ask the human a question or request an external action and wait for a correlated reply. On pending, reuse request_id. Human-reported completion must be independently verified. Cannot approve native operations or collect secrets.',
      inputSchema: {
        type: 'object',
        properties: {
          message: {
            type: 'string',
            maxLength: 3000,
            description:
              'Question, action instructions, or update. Required for a new request. No credentials or authentication secrets.',
          },
          request_id: {
            type: 'string',
            description: 'Resume an existing request from this same session; does not resend it.',
          },
          reason: {
            type: 'string',
            enum: ['requested', 'important', 'completion'],
            description:
              'Notification reason. Completion obeys quiet mode; explicitly requested updates are always allowed.',
          },
          request_key: {
            type: 'string',
            maxLength: 120,
            description: 'Stable caller-chosen key for retry deduplication of a new message.',
          },
          wait_seconds: {
            type: 'integer',
            minimum: 0,
            maximum: 45,
            description: 'Waiting tools only. Default 40; pending requests survive this wait.',
          },
          expires_in_seconds: {
            type: 'integer',
            minimum: 60,
            maximum: 86400,
            description:
              'New waiting requests only. Default 86400. Expiration never means consent.',
          },
        },
        additionalProperties: false,
        anyOf: [{ required: ['message'] }, { required: ['request_id'] }],
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    }),
  ),
];
export type AgentCall = {
  name: string;
  arguments?: Record<string, unknown>;
  session?: string;
  callKey?: string;
};
