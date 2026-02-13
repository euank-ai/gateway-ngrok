# gateway-ngrok

OpenClaw plugin to expose a local gateway via ngrok.

## Commands

- `/gateway_tunnel start`
- `/gateway_tunnel status`
- `/gateway_tunnel stop`

## Config (`plugins.entries.gateway-ngrok.config`)

- `autoStart` (bool)
- `gatewayUrl` (default: `http://127.0.0.1:18789`)
- `inspectAddr` (default: `127.0.0.1:4040`)
- `authtoken` (ngrok token)
- `domain` (optional reserved domain)

## Security note

Exposing a gateway publicly is high risk. Keep gateway auth enabled and restrict usage appropriately.
