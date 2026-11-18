// Illustrative diagrams of Slack's setup pages. They are drawn, not captured, and labelled as such.
const e = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');
const R = (x, y, w, h, fill = '#fff', stroke = '#d8d8d8', rx = 6) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}" stroke="${stroke}"/>`;
const T = (x, y, t, s = 15, w = 400, fill = '#1d1c1d', f = '') => `<text x="${x}" y="${y}" font-size="${s}" font-weight="${w}" fill="${fill}" ${f}>${e(t)}</text>`;
const M = (x, y, t, s = 13, fill = '#1d1c1d') => `<text x="${x}" y="${y}" font-size="${s}" fill="${fill}" font-family="ui-monospace,Menlo,monospace">${e(t)}</text>`;
const B = (x, y, w, h, label, primary) => R(x, y, w, h, primary ? '#007a5a' : '#fff', primary ? '#007a5a' : '#8a8a8a', 5) + T(x + w / 2, y + h / 2 + 5, label, 14, 700, primary ? '#fff' : '#1d1c1d', 'text-anchor="middle"');
const N = (x, y, n) => `<g><circle cx="${x}" cy="${y}" r="13" fill="#e8267a" stroke="#fff" stroke-width="2"/><text x="${x}" y="${y + 5}" font-size="14" font-weight="800" fill="#fff" text-anchor="middle">${n}</text></g>`;
const F = (x, y, w, h) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="7" fill="rgba(232,38,122,.08)" stroke="#e8267a" stroke-width="3" stroke-dasharray="7 4"/>`;
function page({ url, title, nav = [], active = -1, body = '', ann = '', label = 'Illustrative diagram, not a screenshot' }) {
  const side = nav.map((n, i) => (i === active ? R(0, 96 + i * 34, 190, 32, '#e5f3ee', 'none', 0) + T(16, 117 + i * 34, n, 14, 700, '#007a5a') : T(16, 117 + i * 34, n, 14, 400, '#454245'))).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 540" class="ss" role="img" aria-label="${e(title)}">
<title>${e(title)}</title>
<rect width="960" height="540" fill="#fff"/>
<rect width="960" height="40" fill="#eceae4"/><circle cx="18" cy="20" r="6" fill="#ff5f57"/><circle cx="38" cy="20" r="6" fill="#febc2e"/><circle cx="58" cy="20" r="6" fill="#28c840"/>
<rect x="90" y="8" width="560" height="24" rx="12" fill="#fff"/><text x="106" y="25" font-size="13" fill="#555" font-family="ui-monospace,Menlo,monospace">${e(url)}</text>
<rect y="40" width="960" height="44" fill="#3f0e40"/><text x="20" y="68" font-size="17" font-weight="800" fill="#fff">slack api</text><text x="840" y="68" font-size="13" fill="#d9c3d9">Your Apps</text>
${nav.length ? `<rect y="84" width="190" height="456" fill="#f8f8f8"/>${side}<line x1="190" y1="84" x2="190" y2="540" stroke="#e0e0e0"/>` : ''}
<g transform="translate(${nav.length ? 190 : 0},84)">${body}</g>
${ann}
<rect x="12" y="506" width="262" height="22" rx="4" fill="#fff6dc" stroke="#d9b45a"/><text x="22" y="521" font-size="11.5" fill="#7a5a00" font-weight="600">${e(label)}</text>
</svg>`;
}
const nav = ['Basic Information', 'Collaborators', 'Socket Mode', 'Install App', 'App Home', 'Interactivity & Shortcuts', 'OAuth & Permissions', 'Event Subscriptions', 'App Manifest'];
export const shots = {
  'slack-apps': page({ url: 'api.slack.com/apps', title: 'Slack Your Apps page with the Create New App button',
    body: T(40, 60, 'Your Apps', 28, 800) + B(560, 36, 150, 38, 'Create New App', true) + R(40, 110, 670, 70) + T(60, 140, 'Existing apps appear here', 15, 400, '#777') + T(60, 160, 'Sign in to the workspace you want Pigeon in', 13, 400, '#999'),
    ann: F(590, 112, 156, 44) + N(584, 132, 1) }),
  'slack-method': page({ url: 'api.slack.com/apps', title: 'Create an app dialog with the From a manifest option',
    body: R(120, 20, 520, 330, '#fff', '#bbb', 10) + T(150, 64, 'Create an app', 22, 800) + R(150, 90, 460, 90, '#fff', '#ccc') + T(172, 122, 'From scratch', 16, 700) + T(172, 146, 'Configure each setting by hand', 13, 400, '#777') + R(150, 196, 460, 90, '#fff', '#ccc') + T(172, 228, 'From a manifest', 16, 700) + T(172, 252, 'Paste a manifest to create the app with its settings', 13, 400, '#777'),
    ann: F(144, 190, 472, 102) + N(138, 242, 1) }),
  'slack-manifest': page({ url: 'api.slack.com/apps', title: 'Pick a workspace and paste the Pigeon manifest',
    body: T(40, 50, 'Pick a workspace to develop your app in', 18, 800) + R(40, 66, 520, 40) + T(56, 92, 'Your workspace  ▾', 14) + T(40, 150, 'Paste your manifest code (JSON)', 18, 800) + R(40, 166, 600, 200, '#fbfbfb', '#bbb') + M(56, 192, '{', 13) + M(70, 212, '"display_information": { "name": "Pigeon", ... },', 12) + M(70, 232, '"oauth_config": { "scopes": { "bot": [', 12) + M(86, 252, '"chat:write", "im:history"', 12) + M(70, 272, '] } },', 12) + M(70, 292, '"settings": { "socket_mode_enabled": true, ... }', 12) + M(56, 312, '}', 13) + B(540, 378, 100, 34, 'Next', true),
    ann: F(34, 58, 532, 56) + N(28, 86, 1) + F(34, 158, 612, 216) + N(28, 240, 2) + F(534, 372, 112, 46) + N(528, 400, 3) }),
  'slack-install': page({ url: 'api.slack.com/apps/…/general', title: 'Basic Information page with Install to Workspace', nav, active: 0,
    body: T(30, 50, 'Basic Information', 26, 800) + T(30, 88, 'Building Apps for Slack', 16, 700) + R(30, 102, 640, 110, '#fff', '#ddd') + T(50, 132, 'Install your app', 16, 700) + T(50, 154, 'Install your app to your workspace to start using it.', 13, 400, '#666') + B(50, 168, 180, 34, 'Install to Workspace', true) + T(30, 252, 'App-Level Tokens', 16, 700) + R(30, 266, 640, 110, '#fff', '#ddd') + T(50, 296, 'Generate tokens for Socket Mode and other app-level APIs.', 13, 400, '#666') + B(50, 316, 220, 34, 'Generate Token and Scopes', false),
    ann: F(44, 160, 192, 48) + N(40, 184, 1) }),
  'slack-permission': page({ url: 'api.slack.com/apps/…/oauth', title: 'Slack permission request listing chat:write and im:history',
    body: R(120, 14, 500, 330, '#fff', '#bbb', 10) + T(150, 54, 'Pigeon is requesting permission to access your workspace', 17, 800) + T(150, 90, 'View messages and other content in direct messages that Pigeon has been added to', 13) + T(150, 124, 'Send messages as @Pigeon', 13) + R(150, 160, 440, 1, '#ddd', '#ddd', 0) + B(150, 290, 100, 34, 'Cancel', false) + B(470, 290, 120, 34, 'Allow', true),
    ann: F(146, 76, 450, 60) + N(140, 106, 1) + F(464, 284, 132, 46) + N(458, 306, 2),
  }),
  'slack-apptoken': page({ url: 'api.slack.com/apps/…/general', title: 'Generate an app-level token with connections:write', nav, active: 0,
    body: R(110, 20, 480, 300, '#fff', '#bbb', 10) + T(136, 56, 'Generate an app-level token', 20, 800) + T(136, 92, 'Token Name', 13, 700) + R(136, 100, 420, 34) + T(150, 122, 'Pigeon', 14) + T(136, 164, 'Scopes', 13, 700) + R(136, 172, 420, 34) + T(150, 194, 'connections:write', 14, 400, '#1d1c1d', '') + T(136, 232, 'Add only this scope. Pigeon needs nothing else.', 12.5, 400, '#777') + B(136, 262, 100, 34, 'Generate', true),
    ann: F(130, 94, 432, 46) + N(124, 118, 1) + F(130, 166, 432, 46) + N(124, 190, 2) + F(130, 256, 112, 46) + N(124, 280, 3) }),
  'slack-apptoken-copy': page({ url: 'api.slack.com/apps/…/general', title: 'Copy the generated xapp token', nav, active: 0,
    body: R(110, 20, 480, 210, '#fff', '#bbb', 10) + T(136, 56, 'Your app-level token', 20, 800) + R(136, 74, 420, 34, '#f6f6f6') + M(148, 96, 'xapp-1-••••••••••••••••••••', 13) + B(136, 126, 80, 32, 'Copy', true) + T(136, 190, 'Treat this like a password. It is shown once here.', 12.5, 400, '#777'),
    ann: F(130, 120, 92, 44) + N(124, 142, 1) + F(130, 68, 432, 46) + N(124, 92, 2) }),
  'slack-bottoken': page({ url: 'api.slack.com/apps/…/oauth', title: 'OAuth and Permissions page with the Bot User OAuth Token', nav, active: 6,
    body: T(30, 50, 'OAuth & Permissions', 26, 800) + T(30, 96, 'OAuth Tokens', 16, 700) + R(30, 108, 640, 100, '#fff', '#ddd') + T(50, 136, 'Bot User OAuth Token', 14, 700) + R(50, 148, 440, 34, '#f6f6f6') + M(62, 170, 'xoxb-••••••••••••••••••••', 13) + B(506, 148, 80, 34, 'Copy', true) + T(30, 250, 'Scopes › Bot Token Scopes', 16, 700) + T(50, 280, 'chat:write     im:history', 14, 400, '#444', 'font-family="ui-monospace,Menlo,monospace"'),
    ann: F(44, 142, 552, 46) + N(38, 166, 1) + F(44, 262, 330, 30) + N(38, 277, 2) }),
};
