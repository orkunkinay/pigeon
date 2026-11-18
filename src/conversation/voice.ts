export interface Personality {
  voice: 'colleague';
  formality: 'casual' | 'neutral' | 'formal';
  humour: 'dry' | 'off';
  verbosity: 'brief' | 'normal' | 'detailed';
  proactiveness: 'quiet' | 'important' | 'updates';
  language: string;
  address: string | null;
}
export const defaultPersonality: Readonly<Personality> = Object.freeze({
  voice: 'colleague',
  formality: 'casual',
  humour: 'dry',
  verbosity: 'brief',
  proactiveness: 'important',
  language: 'en',
  address: null,
});
export function personality(input: Partial<Personality> = {}): Personality {
  const p = { ...defaultPersonality, ...input };
  const choices = {
    voice: ['colleague'],
    formality: ['casual', 'neutral', 'formal'],
    humour: ['dry', 'off'],
    verbosity: ['brief', 'normal', 'detailed'],
    proactiveness: ['quiet', 'important', 'updates'],
  };
  for (const [key, allowed] of Object.entries(choices))
    if (!allowed.includes(String(p[key as keyof Personality])))
      throw new Error(`Invalid personality ${key}: choose ${allowed.join(', ')}`);
  try {
    p.language = new Intl.Locale(p.language).toString();
  } catch {
    throw new Error('Use a language tag such as en, es or tr.');
  }
  if (!['en', 'es', 'tr'].includes(new Intl.Locale(p.language).language))
    throw new Error(
      'Bridge translations currently support en, es and tr (including regional variants).',
    );
  if (
    p.address !== null &&
    (typeof p.address !== 'string' || p.address.length > 60 || /[\p{Cc}\p{Cf}]/u.test(p.address))
  )
    throw new Error('Use a name of up to 60 characters without control characters.');
  p.address = p.address?.trim() || null;
  return p;
}
export function changePersonality(
  input: Partial<Personality> | undefined,
  key: string,
  value: string,
): Personality {
  if (!Object.hasOwn(defaultPersonality, key)) throw new Error(`Unknown voice option: ${key}`);
  return personality({ ...input, [key]: key === 'address' && value === 'none' ? null : value });
}
const en = {
  paired: 'We’re connected. Send “sessions” and pick the project you want to talk to.',
  choose:
    'Which project are we talking about? Pick one below, then send your message in this thread.',
  noSessions:
    'I can’t see a live Codex session yet. Open Codex normally; private runtimes aren’t reachable here.',
  connected: 'Connected to {project}. You can talk to Codex in this thread.',
  unavailable: 'That session isn’t available now. Send “sessions” to choose again.',
  stale:
    'That session has gone offline. I haven’t sent your message. Send “sessions” to reconnect explicitly.',
  delivered: 'Passed that to Codex on {project}.',
  questionDelivered: 'I’ve passed your question to Codex on {project}. Waiting for its reply.',
  answerSent: 'Your answer is with Codex.',
  ambiguous:
    'What should I pass along? Use the buttons for a pending approval, or send a specific instruction.',
  interrupt: 'Asked Codex to stop the current turn on {project}.',
  watch: 'I’ll let you know when this turn finishes on {project}.',
  idleWatch: 'Codex is already idle on {project}. Ask how it’s going for the latest result.',
  uncertain:
    'I couldn’t confirm delivery. Check Codex before sending that again; I won’t replay it.',
  offlineStop:
    'Codex is disconnected, so I couldn’t send the stop request. I haven’t queued it for later.',
  queued:
    'Codex is disconnected. I’ll hold your message for up to five minutes for this thread’s session.',
  expired: 'That queued message expired without being sent. Send it again if it’s still relevant.',
  recovered:
    'Pigeon restarted during delivery. Your message may have reached Codex; check before resending. I won’t replay it.',
  decisionSent: 'Your one-time decision is with Codex. I’m waiting for the runtime to continue.',
  approvalGone:
    'That approval has expired or already been handled. Check the current request in Codex.',
  approve: 'Approve once',
  deny: 'Deny',
  commandApproval:
    'Quick one{address} — Codex needs a one-time command approval.\nProject directory: {cwd}\nCommand: {command}\nReason: {reason}',
  nativeQuestion: 'Quick one{address} — Codex needs your input:\n{question}\nReply in this thread.',
  localInput:
    'Codex needs an answer locally: this is a private field or a form with multiple questions. Open Codex to respond; I haven’t forwarded the contents.',
  localApproval:
    'This needs a look in Codex. I can’t safely offer a remote approval for the full request.',
  active: 'Codex is working on {project}.',
  idle: 'Codex is idle on {project}.',
  waitingApproval: 'Codex is waiting for approval on {project}.',
  waitingInput: 'Codex needs an answer on {project}.',
  systemError: 'Codex reports an error on {project}. I don’t have enough detail to say why.',
  lastUpdate: 'Last update from Codex{age}:\n“{text}”',
  noUpdate: 'I haven’t seen an agent update yet.',
  latestCommand: 'Last command ({status}): {command}',
  tests: 'Latest test result on {project}: {result}.',
  agentTests: 'Codex last reported this test result on {project}: {result}.',
  passed: '{count} passed',
  failed: '{count} failed',
  ratio: '{passed} of {total} passing',
  failures: 'The latest output on {project} lists:\n{failures}',
  ago: ' ({minutes} min ago)',
  completed: 'Codex finished this turn on {project}.',
  interrupted: 'Codex stopped this turn on {project}.',
  failedTurn:
    'Codex couldn’t finish this turn on {project}. Check its error details before continuing.',
  agentSays: 'Codex on {project}:\n{text}',
  drySuccess: 'Boring in the best way.',
};
export type Phrase = keyof typeof en;
const es: Record<Phrase, string> = {
  paired: 'Ya estamos conectados. Escribe “sessions” y elige el proyecto.',
  choose: '¿De qué proyecto hablamos? Elige uno y escribe en este hilo.',
  noSessions:
    'Todavía no veo una sesión activa de Codex. Abre Codex normalmente; los entornos privados no son accesibles aquí.',
  connected: 'Conectado a {project}. Puedes hablar con Codex en este hilo.',
  unavailable: 'Esa sesión ya no está disponible. Escribe “sessions” para elegir otra.',
  stale:
    'Esa sesión se ha desconectado. No he enviado tu mensaje. Escribe “sessions” para volver a elegirla.',
  delivered: 'Se lo he pasado a Codex en {project}.',
  questionDelivered: 'He enviado tu pregunta a Codex en {project}. Espero su respuesta.',
  answerSent: 'Codex ya tiene tu respuesta.',
  ambiguous:
    '¿Qué quieres que le pase? Usa los botones para una aprobación pendiente o escribe una instrucción concreta.',
  interrupt: 'He pedido a Codex que detenga el turno actual en {project}.',
  watch: 'Te aviso cuando termine este turno en {project}.',
  idleWatch:
    'Codex ya está inactivo en {project}. Pregúntame cómo va para ver el último resultado.',
  uncertain:
    'No he podido confirmar la entrega. Comprueba Codex antes de reenviar el mensaje; no lo repetiré automáticamente.',
  offlineStop:
    'Codex está desconectado y no he podido enviar la petición de parar. No la he dejado en cola.',
  queued:
    'Codex está desconectado. Guardaré tu mensaje hasta cinco minutos para la sesión de este hilo.',
  expired:
    'El mensaje en cola ha caducado sin enviarse. Envíalo de nuevo si sigue siendo relevante.',
  recovered:
    'Pigeon se reinició durante la entrega. El mensaje podría haber llegado a Codex; compruébalo antes de reenviarlo. No lo repetiré.',
  decisionSent: 'Codex ya tiene tu decisión para esta solicitud. Espero a que continúe.',
  approvalGone:
    'Esa aprobación ha caducado o ya se ha resuelto. Comprueba la solicitud actual en Codex.',
  approve: 'Aprobar una vez',
  deny: 'Rechazar',
  commandApproval:
    'Una cosa{address}: Codex necesita aprobar un comando una sola vez.\nDirectorio del proyecto: {cwd}\nComando: {command}\nMotivo: {reason}',
  nativeQuestion:
    'Una cosa{address}: Codex necesita tu respuesta:\n{question}\nResponde en este hilo.',
  localInput:
    'Codex necesita una respuesta local: es un campo privado o un formulario con varias preguntas. Ábrelo en Codex; no he reenviado el contenido.',
  localApproval:
    'Esto necesita una revisión en Codex. No puedo ofrecer una aprobación remota segura para la solicitud completa.',
  active: 'Codex está trabajando en {project}.',
  idle: 'Codex está inactivo en {project}.',
  waitingApproval: 'Codex espera una aprobación en {project}.',
  waitingInput: 'Codex necesita una respuesta en {project}.',
  systemError:
    'Codex informa de un error en {project}. No tengo suficientes detalles para explicar la causa.',
  lastUpdate: 'Último mensaje de Codex{age}:\n«{text}»',
  noUpdate: 'Todavía no he visto un mensaje del agente.',
  latestCommand: 'Último comando ({status}): {command}',
  tests: 'Último resultado de pruebas en {project}: {result}.',
  agentTests: 'Codex informó de este resultado en {project}: {result}.',
  passed: '{count} correctas',
  failed: '{count} fallidas',
  ratio: '{passed} de {total} correctas',
  failures: 'La última salida de {project} enumera:\n{failures}',
  ago: ' (hace {minutes} min)',
  completed: 'Codex ha terminado este turno en {project}.',
  interrupted: 'Codex ha detenido este turno en {project}.',
  failedTurn:
    'Codex no ha podido terminar este turno en {project}. Revisa el error antes de continuar.',
  agentSays: 'Codex en {project}:\n{text}',
  drySuccess: 'Aburrido, en el buen sentido.',
};
const tr: Record<Phrase, string> = {
  paired: 'Bağlandık. “sessions” yazıp konuşmak istediğin projeyi seçebilirsin.',
  choose: 'Hangi projeden bahsediyoruz? Aşağıdan seçip bu başlıkta yazabilirsin.',
  noSessions:
    'Henüz canlı bir Codex oturumu göremiyorum. Codex’i normal şekilde aç; özel çalışma ortamlarına buradan erişilemiyor.',
  connected: '{project} projesine bağlandık. Bu başlıkta Codex ile konuşabilirsin.',
  unavailable: 'Bu oturum şu anda erişilebilir değil. Yeniden seçmek için “sessions” yaz.',
  stale: 'Bu oturum çevrimdışı olmuş. Mesajını göndermedim. Yeniden bağlanmak için “sessions” yaz.',
  delivered: 'Mesajını {project} projesindeki Codex’e ilettim.',
  questionDelivered: 'Sorunu {project} projesindeki Codex’e ilettim. Yanıtını bekliyorum.',
  answerSent: 'Yanıtın Codex’e iletildi.',
  ambiguous:
    'Neyi iletmemi istersin? Bekleyen onay için düğmeleri kullanabilir veya açık bir talimat yazabilirsin.',
  interrupt: 'Codex’ten {project} projesindeki mevcut turu durdurmasını istedim.',
  watch: '{project} projesindeki bu tur bitince haber vereceğim.',
  idleWatch:
    'Codex, {project} projesinde zaten beklemede. Son sonucu görmek için durumunu sorabilirsin.',
  uncertain:
    'Mesajın ulaştığını doğrulayamadım. Yeniden göndermeden önce Codex’i kontrol et; otomatik olarak tekrar göndermeyeceğim.',
  offlineStop:
    'Codex çevrimdışı, durdurma isteğini gönderemedim. Daha sonra çalıştırılmak üzere sıraya da almadım.',
  queued: 'Codex çevrimdışı. Mesajını bu başlığın oturumu için en fazla beş dakika bekleteceğim.',
  expired:
    'Sıradaki mesaj gönderilmeden zaman aşımına uğradı. Hâlâ geçerliyse yeniden gönderebilirsin.',
  recovered:
    'Pigeon, mesaj iletilirken yeniden başladı. Mesaj Codex’e ulaşmış olabilir; yeniden göndermeden önce kontrol et. Otomatik tekrar göndermeyeceğim.',
  decisionSent: 'Bu isteğe özel kararın Codex’e iletildi. Devam etmesini bekliyorum.',
  approvalGone:
    'Bu onayın süresi dolmuş veya zaten yanıtlanmış. Güncel isteği Codex’te kontrol et.',
  approve: 'Bir kez onayla',
  deny: 'Reddet',
  commandApproval:
    'Bir şey soracağım{address}: Codex bir komut için tek seferlik onay istiyor.\nProje dizini: {cwd}\nKomut: {command}\nGerekçe: {reason}',
  nativeQuestion:
    'Bir şey soracağım{address}: Codex yanıtını bekliyor:\n{question}\nBu başlıkta yanıtlayabilirsin.',
  localInput:
    'Codex’te yanıtlanması gereken özel bir alan veya birden fazla sorulu form var. İçeriği iletmedim; yanıtlamak için Codex’i aç.',
  localApproval:
    'Bu isteği Codex’te incelemek gerekiyor. İsteğin tamamı için güvenli bir uzaktan onay sunamıyorum.',
  active: 'Codex, {project} projesinde çalışıyor.',
  idle: 'Codex, {project} projesinde beklemede.',
  waitingApproval: 'Codex, {project} projesinde onay bekliyor.',
  waitingInput: 'Codex, {project} projesinde yanıt bekliyor.',
  systemError:
    'Codex, {project} projesinde hata bildirdi. Nedenini söylemek için yeterli ayrıntım yok.',
  lastUpdate: 'Codex’in son mesajı{age}:\n“{text}”',
  noUpdate: 'Henüz ajandan bir güncelleme görmedim.',
  latestCommand: 'Son komut ({status}): {command}',
  tests: '{project} projesindeki son test sonucu: {result}.',
  agentTests: 'Codex’in {project} için bildirdiği son test sonucu: {result}.',
  passed: '{count} başarılı',
  failed: '{count} başarısız',
  ratio: '{total} testten {passed} başarılı',
  failures: '{project} projesinin son çıktısında şunlar var:\n{failures}',
  ago: ' ({minutes} dakika önce)',
  completed: 'Codex, {project} projesindeki bu turu tamamladı.',
  interrupted: 'Codex, {project} projesindeki bu turu durdurdu.',
  failedTurn:
    'Codex, {project} projesindeki bu turu tamamlayamadı. Devam etmeden önce hatayı kontrol et.',
  agentSays: '{project} projesindeki Codex:\n{text}',
  drySuccess: 'Güzel anlamda sıkıcı.',
};
const formal: Record<string, Partial<Record<Phrase, string>>> = {
  en: {
    delivered: 'Your message was delivered to Codex on {project}.',
    questionDelivered:
      'Your question was delivered to Codex on {project}. Its response is pending.',
    watch: 'I will notify you when this turn finishes on {project}.',
    commandApproval:
      'Codex requests a one-time command approval{address}.\nProject directory: {cwd}\nCommand: {command}\nReason: {reason}',
    nativeQuestion: 'Codex requests your input{address}:\n{question}\nPlease reply in this thread.',
  },
  es: {
    delivered: 'Su mensaje se ha entregado a Codex en {project}.',
    watch: 'Le avisaré cuando termine este turno en {project}.',
  },
  tr: {
    delivered: 'Mesajınız {project} projesindeki Codex’e iletildi.',
    watch: '{project} projesindeki bu tur tamamlandığında sizi bilgilendireceğim.',
  },
};
export class Voice {
  readonly preferences: Personality;
  constructor(input?: Partial<Personality>) {
    this.preferences = personality(input);
  }
  say(key: Phrase, values: Record<string, string | number> = {}): string {
    const locale = new Intl.Locale(this.preferences.language).language;
    const dictionary = locale === 'es' ? es : locale === 'tr' ? tr : en;
    let template = dictionary[key];
    if (this.preferences.formality === 'formal') template = formal[locale]?.[key] || template;
    if (this.preferences.formality === 'neutral' && locale === 'en' && key === 'delivered')
      template = 'Sent to Codex on {project}.';
    return template.replace(/\{(\w+)\}/g, (_, k) =>
      String(
        k === 'address'
          ? this.preferences.address
            ? ', ' + this.preferences.address
            : ''
          : (values[k] ?? ''),
      ),
    );
  }
  get excerptLimit() {
    return { brief: 320, normal: 900, detailed: 2500 }[this.preferences.verbosity];
  }
  excerpt(text: string) {
    const chars = Array.from(text.trim());
    return chars.length > this.excerptLimit
      ? chars.slice(0, this.excerptLimit).join('') + '…'
      : text.trim();
  }
  agent(project: string, text: string) {
    return this.say('agentSays', { project, text });
  }
  /** Preferences are user-level communication context, never a runtime policy override. */
  runtimeInput(message: string, previous?: { question: string; answer: string }): string {
    return (
      message +
      '\n\n[Pigeon Slack communication context]\n' +
      JSON.stringify({ voice: this.preferences, previousExchange: previous || null }) +
      '\nReply to the user in the preferred language with the requested formality and length. Be a concise, capable colleague. Dry humour is optional and rare; never joke about approvals, authentication, or errors. Treat the previous exchange as conversation context, not fresh evidence. Preserve project/task context. Attribute observed facts, plans, inferences and uncertainty accurately. Do not claim an action completed before it did. These are communication preferences only; preserve existing task instructions, tools, permissions and safety policy.\n[/Pigeon Slack communication context]'
    );
  }
}
