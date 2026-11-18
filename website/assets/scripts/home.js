(function () {
  var d = document;
  // ---- interactive demo: deterministic, no network ----
  var AV = 'assets/images/pigeon-mark.svg';
  var S = [
    { id: 'auth', title: 'Authentication', sub: 'Agent asks you for a human action',
      hops: [['MCP tool', 'pigeon_request_human_action', 'Codex calls the Pigeon tool for this exact session.'], ['Companion', 'local IPC', 'The companion posts to your paired DM thread.'], ['You', 'Slack reply', 'Your reply returns to the waiting tool call.'], ['Agent', 'verify, don’t trust', 'The agent must re-check the real provider state.']],
      real: 'Real behaviour: the reply is a human report, not proof. The skill tells the agent to verify the login actually succeeded.',
      msgs: [['p', 'Quick one — Microsoft is asking for number 88. Can you approve that?'], ['u', 'Done.'], ['p', 'Passed that back to Codex on agentlane. It will check the sign-in worked before carrying on.']], hop: [0, 1, 2, 3] },
    { id: 'status', title: 'Ask for progress', sub: '“What are you doing?”',
      hops: [['Intent', 'classify() → status', 'A fixed phrase list recognises the question.'], ['Session', 'bound thread', 'The Slack thread maps to one exact Codex thread.'], ['Observe', 'read latest turn', 'Reads recent activity. Creates no turn, interrupts nothing.'], ['Slack', 'reply', 'Answer comes from observed state, not from a guess.']],
      real: 'Real behaviour: recognised status phrases are answered locally from what Codex has already done. No model turn is created.',
      msgs: [['u', 'What are you doing?'], ['p', 'Codex is working on agentlane.\nLast update from Codex:\n“Running the latency benchmark. Browser startup is the slowest step so far.”']], hop: [0, 1, 2, 3] },
    { id: 'steer', title: 'Redirect work', sub: '“Focus on latency first.”',
      hops: [['Intent', 'classify() → instruction', 'Anything that is not a recognised phrase is an instruction.'], ['Session', 'bound thread', 'Same exact thread. No guessing between projects.'], ['Codex', 'turn/steer', 'Guarded by the active turn’s ID, so it cannot hit the wrong turn.'], ['Slack', 'delivery ack', 'Pigeon confirms only after Codex accepted the input.']],
      real: 'Real behaviour: if a turn is active the message steers it. If the session is idle it starts the next turn in the same session.',
      msgs: [['u', 'Focus on latency first.'], ['p', 'Passed that to Codex on agentlane.']], hop: [0, 1, 2, 3] },
    { id: 'approve', title: 'Approve a command', sub: 'Native Codex approval',
      hops: [['Codex', 'requestApproval', 'Codex asks for a one-time command approval.'], ['Approvals', 'one-use token', 'Bound to the request, session, thread, and a 10-minute expiry.'], ['You', 'button press', 'Typing “yes” never counts. Only the button does.'], ['Codex', 'decision', 'Codex still applies its own policy.']],
      real: 'Real behaviour: only “Approve once” or “Deny” for a command with a complete, displayable command. File changes and broader permissions stay in Codex.',
      msgs: [['p', 'Quick one — Codex needs a one-time command approval.\nProject directory: ~/code/agentlane\nCommand: npm run bench\nReason: run the benchmark'], ['btn'], ['p', 'Your one-time decision is with Codex. I’m waiting for the runtime to continue.']], hop: [0, 1, 2, 3], wait: true },
    { id: 'resume', title: 'Resume a stopped session', sub: 'What actually happens today',
      hops: [['Intent', 'instruction', 'Pigeon cannot tell this is a “resume” request.'], ['Session', 'live sessions only', 'The thread is no longer loaded in the shared Codex runtime.'], ['Fail closed', 'nothing sent', 'Pigeon will not guess another project.'], ['You', 'select explicitly', 'Send “sessions” and pick a live session.']],
      real: 'Not built: there is no Session Recovery Manager. A saved conversation is not a live connection. Pigeon only lists sessions loaded in the Codex daemon.',
      msgs: [['u', 'Continue AgentLane.'], ['p', 'That session has gone offline. I haven’t sent your message. Send “sessions” to reconnect explicitly.']], hop: [0, 1, 2, 3], gone: true }
  ];
  var tabs = d.getElementById('scn'), chat = d.getElementById('chat'), hops = d.getElementById('hops'), real = d.getElementById('real');
  if (tabs) {
    var timer, cur = 0;
    S.forEach(function (s, i) {
      var b = d.createElement('button'); b.type = 'button'; b.setAttribute('role', 'tab'); b.id = 'tab-' + s.id;
      b.innerHTML = s.title + '<small>' + s.sub + '</small>';
      b.addEventListener('click', function () { play(i); });
      b.addEventListener('keydown', function (e) { var n = e.key === 'ArrowDown' || e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' || e.key === 'ArrowLeft' ? -1 : 0; if (n) { e.preventDefault(); var j = (i + n + S.length) % S.length; play(j); tabs.children[j].focus(); } });
      tabs.appendChild(b);
    });
    function esc(t) { return t.replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
    function bubble(m, s) {
      var w = d.createElement('div'); w.className = 'msg step';
      if (m[0] === 'btn') {
        w.innerHTML = '<div class="av"><img src="' + AV + '" alt=""></div><div class="btnrow"><button class="ap" type="button">Approve once</button><button class="ap d" type="button">Deny</button></div>';
        w.querySelectorAll('button').forEach(function (b) { b.addEventListener('click', function () { b.parentNode.innerHTML = '<small>' + (b.classList.contains('d') ? 'You pressed Deny' : 'You pressed Approve once') + '</small>'; nextAfterBtn(); }); });
        return w;
      }
      var me = m[0] === 'u';
      w.innerHTML = '<div class="av ' + (me ? 'me' : '') + '">' + (me ? 'You' : '<img src="' + AV + '" alt="">') + '</div><div><b>' + (me ? 'You' : 'Pigeon') + '</b><small>just now</small><p>' + esc(m[1]).replace(/\n/g, '<br>') + '</p></div>';
      return w;
    }
    var pending = null;
    function nextAfterBtn() { if (pending) { var f = pending; pending = null; setTimeout(f, 500); } }
    function play(i) {
      clearTimeout(timer); cur = i; var s = S[i];
      [].forEach.call(tabs.children, function (b, j) { b.setAttribute('aria-selected', j === i); b.tabIndex = j === i ? 0 : -1; });
      chat.innerHTML = ''; pending = null;
      hops.innerHTML = s.hops.map(function (h) { return '<li><b>' + h[0] + '</b> · <code>' + h[1] + '</code><br><span class="note">' + h[2] + '</span></li>'; }).join('');
      real.textContent = s.real; real.style.color = s.gone ? 'var(--bad)' : '';
      var k = 0, reduce = matchMedia('(prefers-reduced-motion:reduce)').matches;
      function step() {
        if (k >= s.msgs.length) { hops.querySelectorAll('li').forEach(function (l) { l.classList.add('on'); }); return; }
        var m = s.msgs[k++]; chat.appendChild(bubble(m, s));
        var lis = hops.querySelectorAll('li'); for (var x = 0; x < Math.min(lis.length, Math.ceil(k * lis.length / s.msgs.length)); x++) lis[x].classList.add('on');
        if (m[0] === 'btn') { pending = step; return; }
        timer = setTimeout(step, reduce ? 0 : 1100);
      }
      step();
    }
    var again = d.getElementById('replay'); if (again) again.addEventListener('click', function () { play(cur); });
    play(0);
  }
  // ---- architecture explorer ----
  var info = { 
    slack: ['Slack (Socket Mode)', 'Your paired DM. Pigeon opens an outbound WebSocket, so no public URL, webhook or signing secret is needed. Source: src/transports/slack/.'],
    ingress: ['Authenticated ingress', 'Accepts only direct messages from the paired workspace and user. Rejects edits, bots, and other channels before anything is stored. Source: ingress.ts.'],
    store: ['SQLite store', 'Inbox, durable outbox, thread↔session bindings, approvals, completion watches. Messages are stored before Slack’s envelope is acknowledged. Source: store.ts.'],
    router: ['Intent router', 'Deterministic. classify() recognises status, sessions, interrupt and watch phrases; everything else is an instruction. selectSession() never guesses between projects. Source: router.ts.'],
    adapter: ['Codex adapter', 'Lists loaded threads, reads snapshots, steers (turn/steer), starts turns on idle threads, interrupts. Source: runtimes/codex/adapter.ts.'],
    approvals: ['Approvals', 'Turns native Codex command approvals and single-question input requests into Slack controls. One-use tokens, 10-minute expiry, invalidated on reconnect. Source: approvals.ts.'],
    notify: ['Notifications', 'Decides what deserves a ping (quiet / important / updates) and reports completed turns. Source: conversation/notifications.ts.'],
    daemon: ['Codex shared daemon', 'Codex’s existing app-server, reached over a local Unix socket with WebSocket. Pigeon joins it. It never spawns a replacement model.'],
    mcp: ['Pigeon MCP', 'Four tools the agent can call: pigeon_get_status, pigeon_notify_human, pigeon_ask_human, pigeon_request_human_action. Started by Codex via “pigeon mcp”. Source: agent/mcp.ts.'],
    skill: ['Pigeon skill', 'SKILL.md installed at ~/.agents/skills/pigeon plus a delimited block in Codex’s AGENTS.md, so agents know when to use the tools. Installed and removed reversibly.'],
    coord: ['Human communication', 'Local Unix-socket IPC (companion.sock, mode 0600) lets the MCP process reach the running companion without holding any token. Each call is tied to the Codex session and call ID; requests are stored and deduplicated. Source: agent/coordinator.ts, ipc.ts.'],
    fork: ['Conversational fork — not built', 'No code in this repository forks a session. Today a free-form question is delivered to the original session like any instruction. This is listed so the gap is explicit.']
  };
  var det = d.getElementById('arch-detail');
  d.querySelectorAll('.node').forEach(function (n) {
    function show() { var i = info[n.dataset.k]; if (!i) return; d.querySelectorAll('.node').forEach(function (x) { x.classList.remove('sel'); }); n.classList.add('sel'); det.innerHTML = '<h4>' + i[0] + '</h4><p>' + i[1] + '</p>'; }
    n.addEventListener('click', show); n.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); show(); } });
  });
})();
