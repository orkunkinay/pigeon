import { Voice } from '../../conversation/voice.js';
import { timingSafeEqual } from 'node:crypto';
import { saveConfig, type Config } from '../../config.js';
import { Store } from '../../store.js';
import { classify } from '../../router.js';
import { log } from '../../log.js';
export function authorized(config: Config, team: unknown, user: unknown, channel: unknown) {
  return (
    !!config.userId &&
    team === config.teamId &&
    user === config.userId &&
    typeof channel === 'string' &&
    channel.startsWith('D')
  );
}
export class SlackIngress {
  constructor(
    readonly config: Config,
    private store: Store,
    private connected: () => boolean,
    private pairingCode?: string,
    private persist: (config: Config) => void = saveConfig,
    private voice: () => Voice = () => new Voice(),
  ) {}
  receive(body: any) {
    const event = body?.event;
    if (!event || event.type !== 'message') return;
    if (
      event.bot_id ||
      event.subtype ||
      !event.text ||
      event.channel_type !== 'im' ||
      body.team_id !== this.config.teamId
    )
      return;
    if (!this.config.userId) {
      const candidate = event.text.trim(),
        expected = 'pair ' + this.pairingCode;
      if (
        !this.pairingCode ||
        Buffer.byteLength(candidate) !== Buffer.byteLength(expected) ||
        !timingSafeEqual(Buffer.from(candidate), Buffer.from(expected))
      )
        return;
      this.config.userId = event.user;
      this.config.dmChannel = event.channel;
      this.persist(this.config);
      this.pairingCode = undefined;
      this.store.post('paired', event.channel, event.ts, this.voice().say('paired'));
      log('paired');
      return;
    }
    if (!authorized(this.config, body.team_id, event.user, event.channel)) return;
    const eventId = body.event_id || event.client_msg_id || `${event.channel}:${event.ts}`;
    if (!this.connected() && classify(event.text) === 'interrupt') {
      this.store.post(
        `offline-stop:${eventId}`,
        event.channel,
        event.thread_ts || event.ts,
        this.voice().say('offlineStop'),
      );
      return;
    }
    const inserted = this.store.enqueue(
      body.event_id || event.client_msg_id || `${event.channel}:${event.ts}`,
      event.channel,
      event.thread_ts || event.ts,
      event.text,
    );
    if (inserted && !this.connected())
      this.store.post(
        `queued:${eventId}`,
        event.channel,
        event.thread_ts || event.ts,
        this.voice().say('queued'),
      );
  }
}
