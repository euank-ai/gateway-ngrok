# gateway-ngrok

OpenClaw plugin to expose a local gateway via **ngrok JavaScript SDK** (no child process required).

## Commands

- `/gateway_tunnel start`
- `/gateway_tunnel status`
- `/gateway_tunnel stop`

## Config (`plugins.entries.gateway-ngrok.config`)

- `autoStart` (bool)
- `gatewayUrl` (default: `http://127.0.0.1:18789`)
- `authtoken` (required ngrok token)
- `domain` (optional reserved domain)
- `oauth.enabled` (bool)
- `oauth.provider` (`github` or `google`)
- `oauth.allowedUsers` (email allowlist; unauthorized users get HTTP 403)

## OAuth policy behavior

When `oauth.enabled=true`, the plugin applies an ngrok traffic policy:

1. Enforce OAuth login (GitHub or Google)
2. Optionally enforce an email allowlist using `actions.ngrok.oauth.identity.email`

## Security note

Exposing a gateway publicly is high risk. Keep gateway auth enabled and restrict usage appropriately.
