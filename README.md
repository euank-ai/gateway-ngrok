# gateway-ngrok

OpenClaw plugin to expose your local gateway via **ngrok** (JavaScript SDK, no child process). Supports optional OAuth (Google/GitHub) with email allowlists.

## Installation

### From GitHub

Add to your `openclaw.json` under `plugins.entries`:

```json
{
  "plugins": {
    "entries": {
      "gateway-ngrok": {
        "source": "github:euank-ai/gateway-ngrok",
        "config": {
          "autoStart": true,
          "authtoken": "<your-ngrok-authtoken>",
          "endpointUrl": "https://your-domain.ngrok.app",
          "gatewayUrl": "http://127.0.0.1:18789",
          "oauth": {
            "enabled": true,
            "provider": "google",
            "allowedUsers": ["you@gmail.com"]
          }
        }
      }
    }
  }
}
```

Then restart OpenClaw:

```bash
openclaw gateway restart
```

The plugin will be fetched and installed automatically.

### Manual / Local

Clone the repo and point `source` to a local path:

```bash
git clone https://github.com/euank-ai/gateway-ngrok.git
```

```json
"source": "./path/to/gateway-ngrok"
```

## Configuration

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `autoStart` | bool | `false` | Start tunnel automatically on gateway boot |
| `gatewayUrl` | string | `http://127.0.0.1:18789` | Local gateway URL to forward to |
| `authtoken` | string | *required* | Your ngrok authtoken |
| `endpointUrl` | string | — | Public endpoint URL (e.g. `https://foo.ngrok.app`). Domain is extracted automatically. |
| `oauth.enabled` | bool | `false` | Enable OAuth on the tunnel endpoint |
| `oauth.provider` | string | `google` | OAuth provider (`google` or `github`) |
| `oauth.allowedUsers` | string[] | `[]` | Email allowlist; empty = allow all authenticated users |

## Commands

Once running, you can control the tunnel via chat:

- `/gateway_tunnel start` — start the ngrok tunnel
- `/gateway_tunnel stop` — stop the tunnel
- `/gateway_tunnel status` — show tunnel status and URL

## How It Works

The plugin uses the ngrok JavaScript SDK's builder API to create an HTTP endpoint with an inline traffic policy for OAuth enforcement. It forwards traffic to your local gateway URL.

When `oauth.enabled` is true, unauthenticated users are redirected to the OAuth provider. If `allowedUsers` is set, only matching emails are allowed through (others get HTTP 403).

## Requirements

- [ngrok account](https://ngrok.com) with an authtoken
- For custom domains: an ngrok paid plan
- For OAuth: a paid ngrok plan (traffic policies)

## Security

Exposing a gateway publicly is high risk. Always:

1. Keep gateway auth enabled (`gateway.token` in openclaw.json)
2. Use OAuth with a restrictive email allowlist
3. Monitor access via ngrok dashboard
