# Slack setup

`pigeon setup` opens a short-lived loopback page and provides `slack-manifest.json`.
You need permission to install a custom app in the intended workspace.

1. Open the linked Slack developer Apps page. Choose Create New App → Paste a manifest.
2. Paste the supplied manifest and select the intended workspace. Review and create.
3. Install the app in that workspace. Approve only the listed scopes.
4. Copy the Bot User OAuth Token into the local page’s **Bot token** password field.
5. Under Basic Information → App-Level Tokens, create a token named Pigeon with
   **only `connections:write`**. Copy it into the local **App-level token** field.
6. Save to Keychain. Pigeon validates the credentials with Slack, then displays a random
   pairing phrase locally. DM that phrase to Pigeon from the Slack identity you will use.
7. After pairing, the background service is installed. DM `sessions`, choose your project,
   and continue in that Slack thread.

Only the first setup needs these Slack developer steps. No public webhook, signing
secret, user OAuth token, browser cookie, or app configuration token is required.
The current installer does not automate Slack’s browser authorization; an authorized
computer-use assistant can perform those same steps when available.

| Permission | Purpose |
| --- | --- |
| `chat:write` | Post the agent’s messages and interactive controls. |
| `im:history` | Receive private bot DM events; the explicit integration verifier also reads its own test thread. |
| App token `connections:write` | Open Socket Mode connections for this app. |

No public/private channel-history, search, workspace-directory, file-upload, or
administrator scopes are requested. The bridge additionally restricts incoming
commands to its paired workspace/user and DM surface.

The bot token’s Slack capabilities are broader than Pigeon’s application allowlist:
protect the token accordingly. A workspace administrator can revoke the app;
Keychain storage does not make a compromised Slack account safe.

Rerun `pigeon setup` to refresh credentials. It stops Pigeon’s service during the
flow and preserves pairing when the workspace stays the same. Leave the app-token
field blank to keep its saved Keychain value. A different workspace requires pairing again. Do not revoke other apps’
tokens or change workspace security controls to get Pigeon working.
