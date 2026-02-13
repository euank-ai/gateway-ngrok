import type { OpenClawPluginApi, OpenClawPluginService } from "openclaw/plugin-sdk";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";

type TunnelCfg = {
  enabled?: boolean;
  autoStart?: boolean;
  gatewayUrl?: string;
  inspectAddr?: string;
  authtoken?: string;
  domain?: string;
};

let ngrokProc: ChildProcessWithoutNullStreams | null = null;
let lastPublicUrl: string | null = null;

function getCfg(api: OpenClawPluginApi): TunnelCfg {
  return (api.entry?.config ?? {}) as TunnelCfg;
}

function ngrokApiUrl(inspectAddr: string): string {
  return `http://${inspectAddr.replace(/^https?:\/\//, "")}/api/tunnels`;
}

async function discoverPublicUrl(api: OpenClawPluginApi, inspectAddr: string): Promise<string | null> {
  try {
    const res = await fetch(ngrokApiUrl(inspectAddr));
    if (!res.ok) return null;
    const body = (await res.json()) as { tunnels?: Array<{ public_url?: string }> };
    const url = body.tunnels?.find((t) => t.public_url?.startsWith("https://"))?.public_url ?? body.tunnels?.[0]?.public_url ?? null;
    if (url) lastPublicUrl = url;
    return url;
  } catch (err) {
    api.logger.warn(`gateway-ngrok: failed to query ngrok api: ${String(err)}`);
    return null;
  }
}

function startTunnel(api: OpenClawPluginApi): string {
  if (ngrokProc) return "already running";

  const cfg = getCfg(api);
  if (cfg.enabled === false) return "disabled by config";

  const gatewayUrl = cfg.gatewayUrl ?? "http://127.0.0.1:18789";
  const inspectAddr = cfg.inspectAddr ?? "127.0.0.1:4040";

  const args = ["http", gatewayUrl, "--log=stdout", "--log-format=json", `--api-addr=${inspectAddr}`];
  if (cfg.authtoken && cfg.authtoken.trim()) args.push(`--authtoken=${cfg.authtoken.trim()}`);
  if (cfg.domain && cfg.domain.trim()) args.push(`--domain=${cfg.domain.trim()}`);

  ngrokProc = spawn("ngrok", args, {
    stdio: ["ignore", "pipe", "pipe"],
    env: process.env,
  });

  ngrokProc.stdout.on("data", (chunk) => {
    const line = String(chunk);
    if (line.includes("msg=\"started tunnel\"") || line.includes("started tunnel")) {
      void discoverPublicUrl(api, inspectAddr).then((url) => {
        if (url) api.logger.info(`gateway-ngrok: tunnel url ${url}`);
      });
    }
  });

  ngrokProc.stderr.on("data", (chunk) => {
    api.logger.warn(`gateway-ngrok stderr: ${String(chunk).trim()}`);
  });

  ngrokProc.on("exit", (code, sig) => {
    api.logger.warn(`gateway-ngrok exited code=${String(code)} sig=${String(sig)}`);
    ngrokProc = null;
  });

  return `starting ngrok tunnel to ${gatewayUrl}`;
}

function stopTunnel(): string {
  if (!ngrokProc) return "not running";
  ngrokProc.kill("SIGTERM");
  ngrokProc = null;
  return "stopped";
}

export default function register(api: OpenClawPluginApi) {
  const service: OpenClawPluginService = {
    id: "gateway-ngrok-service",
    start: async () => {
      const cfg = getCfg(api);
      if (cfg.enabled === false || cfg.autoStart !== true) return;
      api.logger.info(`gateway-ngrok: ${startTunnel(api)}`);
      await discoverPublicUrl(api, cfg.inspectAddr ?? "127.0.0.1:4040");
    },
    stop: async () => {
      stopTunnel();
    },
  };

  api.registerService(service);

  api.registerCommand({
    name: "gateway_tunnel",
    description: "Manage ngrok tunnel for OpenClaw gateway.",
    acceptsArgs: true,
    handler: async (ctx) => {
      const action = (ctx.args ?? "status").trim().toLowerCase();
      const cfg = getCfg(api);
      const inspectAddr = cfg.inspectAddr ?? "127.0.0.1:4040";

      if (action === "start") {
        return { text: `gateway tunnel: ${startTunnel(api)}` };
      }
      if (action === "stop") {
        return { text: `gateway tunnel: ${stopTunnel()}` };
      }

      const url = (await discoverPublicUrl(api, inspectAddr)) ?? lastPublicUrl;
      const running = ngrokProc ? "running" : "stopped";
      const exposure = url ? `\nPublic URL: ${url}` : "\nPublic URL: unavailable";
      return {
        text:
          `gateway tunnel status: ${running}${exposure}` +
          "\nCommands: /gateway_tunnel start | /gateway_tunnel stop | /gateway_tunnel status",
      };
    },
  });
}
