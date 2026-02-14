import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk";
import ngrok from "@ngrok/ngrok";

type OAuthCfg = {
  enabled?: boolean;
  provider?: "github" | "google";
  allowedUsers?: string[];
};

type TunnelCfg = {
  enabled?: boolean;
  autoStart?: boolean;
  gatewayUrl?: string;
  authtoken?: string;
  domain?: string;
  endpointUrl?: string;
  oauth?: OAuthCfg;
};

let listener: ngrok.Listener | null = null;
let lastPublicUrl: string | null = null;

function getCfg(api: OpenClawPluginApi): TunnelCfg {
  return (api.entry?.config ?? {}) as TunnelCfg;
}

function buildTrafficPolicy(oauth: OAuthCfg | undefined): string | undefined {
  if (!oauth?.enabled) return undefined;

  const provider = oauth.provider ?? "github";
  const policy: {
    on_http_request: Array<{
      expressions?: string[];
      actions: Array<{ type: string; config?: Record<string, unknown> }>;
    }>;
  } = {
    on_http_request: [
      {
        actions: [
          {
            type: "oauth",
            config: { provider },
          },
        ],
      },
    ],
  };

  const allowedUsers = (oauth.allowedUsers ?? []).map((x) => x.trim()).filter(Boolean);
  if (allowedUsers.length > 0) {
    const identityField = "actions.ngrok.oauth.identity.email";
    const usersJson = JSON.stringify(allowedUsers);
    const celExpr = `!(${identityField} in ${usersJson})`;

    policy.on_http_request.push({
      expressions: [celExpr],
      actions: [
        {
          type: "custom-response",
          config: {
            status_code: 403,
            content: `Access denied. Your account (\${${identityField}}) is not authorized.`,
            headers: { "content-type": "text/plain" },
          },
        },
      ],
    });
  }

  return JSON.stringify(policy);
}

async function startTunnel(api: OpenClawPluginApi): Promise<string> {
  if (listener) return "already running";

  const cfg = getCfg(api);
  if (cfg.enabled === false) return "disabled by config";

  const gatewayUrl = cfg.gatewayUrl ?? "http://127.0.0.1:18789";
  const authtoken = cfg.authtoken?.trim();
  if (!authtoken) {
    return "missing authtoken (set plugins.entries.gateway-ngrok.config.authtoken)";
  }

  const trafficPolicy = buildTrafficPolicy(cfg.oauth);

  const options: Record<string, unknown> = {
    addr: gatewayUrl,
    authtoken,
  };
  const domain = cfg.endpointUrl?.trim() || cfg.domain?.trim();
  if (domain) options.domain = domain;
  if (trafficPolicy) options.traffic_policy = trafficPolicy;

  try {
    const newListener = await ngrok.forward(options);
    listener = newListener;
    lastPublicUrl = newListener.url();
    api.logger.info(`gateway-ngrok: tunnel url ${lastPublicUrl}`);
    return `started (${lastPublicUrl})`;
  } catch (err) {
    const msg = String(err);
    api.logger.error(`gateway-ngrok start failed: ${msg}`);
    return `failed to start (${msg})`;
  }
}

async function stopTunnel(): Promise<string> {
  if (!listener) return "not running";
  try {
    await listener.close();
  } finally {
    listener = null;
  }
  return "stopped";
}

export default function register(api: OpenClawPluginApi) {
  api.logger.info("gateway-ngrok: register() called");

  const service: OpenClawPluginService = {
    id: "gateway-ngrok-service",
    start: async () => {
      api.logger.info("gateway-ngrok: service start() called");
      const cfg = getCfg(api);
      api.logger.info(`gateway-ngrok: cfg=${JSON.stringify({ enabled: cfg.enabled, autoStart: cfg.autoStart, hasAuthtoken: !!cfg.authtoken, endpointUrl: cfg.endpointUrl, oauthEnabled: cfg.oauth?.enabled })}`);
      if (cfg.enabled === false || cfg.autoStart !== true) {
        api.logger.info(`gateway-ngrok: skipping (enabled=${cfg.enabled}, autoStart=${cfg.autoStart})`);
        return;
      }
      try {
        const result = await startTunnel(api);
        api.logger.info(`gateway-ngrok: ${result}`);
      } catch (err) {
        api.logger.error(`gateway-ngrok service start error: ${String(err)}`);
      }
    },
    stop: async () => {
      await stopTunnel();
    },
  };

  api.registerService(service);

  api.registerCommand({
    name: "gateway_tunnel",
    description: "Manage ngrok tunnel for OpenClaw gateway.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const action = (ctx.args ?? "status").trim().toLowerCase();

      if (action === "start") {
        return { text: `gateway tunnel: ${await startTunnel(api)}` };
      }
      if (action === "stop") {
        return { text: `gateway tunnel: ${await stopTunnel()}` };
      }

      const running = listener ? "running" : "stopped";
      const publicUrl = listener?.url?.() ?? lastPublicUrl;
      const exposure = publicUrl ? `\nPublic URL: ${publicUrl}` : "\nPublic URL: unavailable";
      const oauthCfg = getCfg(api).oauth;
      const oauthState = oauthCfg?.enabled ? `enabled (${oauthCfg.provider ?? "github"})` : "disabled";

      return {
        text:
          `gateway tunnel status: ${running}${exposure}` +
          `\nOAuth policy: ${oauthState}` +
          "\nCommands: /gateway_tunnel start | /gateway_tunnel stop | /gateway_tunnel status",
      };
    },
  });
}
