/**
 * KINGA runtime port-selection contract.
 *
 * Managed development retains the existing nearby-port fallback for local
 * ergonomics. An external host must bind its assigned PORT exactly: accepting a
 * neighbouring port would make the process look healthy locally while being
 * unreachable through the platform's configured service port.
 */

import { type RuntimeMode } from "./runtime-readiness";

type PortEnvironment = Record<string, string | undefined>;

export function configuredPort(env: PortEnvironment = process.env): number {
  const raw = (env.PORT ?? "3000").trim();
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`PORT must be an integer from 1 to 65535; received ${JSON.stringify(raw)}`);
  }
  return port;
}

export async function resolveListenPort(
  runtimeMode: RuntimeMode,
  env: PortEnvironment,
  isPortAvailable: (port: number) => Promise<boolean>,
): Promise<number> {
  const requested = configuredPort(env);

  if (runtimeMode === "external") {
    return requested;
  }

  for (let port = requested; port < requested + 20; port++) {
    if (await isPortAvailable(port)) return port;
  }
  throw new Error(`No available port found starting from ${requested}`);
}
