import { LogLevel, type Logger } from '@slack/logger';
export function log(event: string, fields: Record<string, unknown> = {}) {
  console.log(JSON.stringify({ time: new Date().toISOString(), event, ...fields }));
}
// Error payloads from SDKs can contain request data; logs use categories only.
export function failure(event: string) {
  log(event, { status: 'failed' });
}

/** Deliberately discard SDK arguments, which may contain transport credentials. */
export const slackLogger: Logger = {
  debug() {},
  info() {},
  warn() {
    failure('slack_sdk_warning');
  },
  error() {
    failure('slack_sdk_error');
  },
  getLevel() {
    return LogLevel.ERROR;
  },
  setLevel() {},
  setName() {},
};
