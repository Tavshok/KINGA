import { Buffer } from "node:buffer";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { request as httpsRequest } from "node:https";

export const DIRECT_MEDIA_DEFAULT_MAX_BYTES = 50 * 1024 * 1024;

export type DirectProviderMediaConfig = {
  allowedHosts: readonly string[];
  maxBytes?: number;
  signal?: AbortSignal;
};

export type DirectProviderMedia = {
  data: string;
  mimeType: string;
};

type ResolvedPublicAddress = { address: string; family: 4 | 6 };

function normalizeMimeType(value: string | null | undefined): string | null {
  if (!value) return null;
  const normalized = value.split(";", 1)[0]?.trim().toLowerCase();
  return normalized || null;
}

function assertSafeMimeType(mimeType: string): void {
  if (
    mimeType === "application/pdf" ||
    mimeType.startsWith("image/") ||
    mimeType.startsWith("audio/") ||
    mimeType.startsWith("video/")
  ) {
    return;
  }

  throw new Error(`Unsupported direct-provider media type: ${mimeType}`);
}

function parseDataUrl(url: string, maxBytes: number): DirectProviderMedia {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/u.exec(url);
  if (!match) {
    throw new Error("Direct provider media must be a base64 data URL");
  }

  const mimeType = normalizeMimeType(match[1]);
  if (!mimeType) {
    throw new Error("Direct provider media data URL has no MIME type");
  }
  assertSafeMimeType(mimeType);

  const buffer = Buffer.from(match[2].replace(/\s/g, ""), "base64");
  if (buffer.byteLength === 0 || buffer.byteLength > maxBytes) {
    throw new Error(
      `Direct provider media must be between 1 and ${maxBytes} bytes`
    );
  }

  return { data: buffer.toString("base64"), mimeType };
}

/** Exact public DNS hostname only: no URLs, ports, wildcard, or IP literals. */
export function isValidDirectMediaHost(value: string): boolean {
  const host = value.trim().toLowerCase();
  if (!host || host.length > 253 || isIP(host) !== 0 || !host.includes(".")) {
    return false;
  }
  return host
    .split(".")
    .every(label => /^(?!-)[a-z0-9-]{1,63}(?<!-)$/u.test(label));
}

function normalizedAllowedHosts(hosts: readonly string[]): Set<string> {
  const normalized = hosts
    .map(host => host.trim().toLowerCase())
    .filter(Boolean);
  if (
    normalized.length === 0 ||
    normalized.some(host => !isValidDirectMediaHost(host))
  ) {
    throw new Error(
      "DIRECT_MEDIA_ALLOWED_HOSTS must list exact public DNS hostnames"
    );
  }
  return new Set(normalized);
}

function assertAllowedHttpsUrl(url: URL, allowedHosts: Set<string>): void {
  if (url.protocol !== "https:") {
    throw new Error("Direct provider media URLs must use HTTPS");
  }
  if (url.username || url.password || url.port) {
    throw new Error(
      "Direct provider media URLs must not include credentials or a port"
    );
  }
  if (!allowedHosts.has(url.hostname.toLowerCase())) {
    throw new Error("Direct provider media URL host is not allowlisted");
  }
}

function isPublicIPv4(address: string): boolean {
  const octets = address.split(".").map(Number);
  if (octets.length !== 4 || octets.some(part => !Number.isInteger(part)))
    return false;
  const [a, b, c] = octets;
  return !(
    a === 0 ||
    a === 10 ||
    a === 127 ||
    a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 0) ||
    (a === 192 && b === 0 && c === 2) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    (a === 198 && b === 51 && c === 100) ||
    (a === 203 && b === 0 && c === 113)
  );
}

function expandIpv6(address: string): number[] | null {
  let source = address.toLowerCase();
  const dotted = /(?::|^)(\d+\.\d+\.\d+\.\d+)$/u.exec(source);
  if (dotted) {
    const octets = dotted[1].split(".").map(Number);
    if (octets.length !== 4 || octets.some(part => part < 0 || part > 255))
      return null;
    source =
      source.slice(0, dotted.index) +
      `:${((octets[0] << 8) | octets[1]).toString(16)}:${((octets[2] << 8) | octets[3]).toString(16)}`;
  }
  const pieces = source.split("::");
  if (pieces.length > 2) return null;
  const left = pieces[0] ? pieces[0].split(":") : [];
  const right = pieces.length === 2 && pieces[1] ? pieces[1].split(":") : [];
  if (left.length + right.length > 8) return null;
  const groups = [
    ...left,
    ...Array(Math.max(0, 8 - left.length - right.length)).fill("0"),
    ...right,
  ];
  if (
    groups.length !== 8 ||
    groups.some(group => !/^[0-9a-f]{1,4}$/u.test(group))
  )
    return null;
  return groups.map(group => Number.parseInt(group, 16));
}

function isPublicIPv6(address: string): boolean {
  const groups = expandIpv6(address);
  if (!groups) return false;
  const first = groups[0];
  const isUnspecified = groups.every(group => group === 0);
  const isLoopback =
    groups.slice(0, 7).every(group => group === 0) && groups[7] === 1;
  const isMulticast = (first & 0xff00) === 0xff00;
  const isUla = (first & 0xfe00) === 0xfc00;
  const isLinkLocal = (first & 0xffc0) === 0xfe80;
  const isDiscardOnly =
    first === 0x0100 && groups.slice(1, 4).every(group => group === 0);
  const isIetfProtocolAssignment =
    first === 0x2001 && (groups[1] & 0xfe00) === 0;
  const isNat64LocalUse =
    first === 0x0064 && groups[1] === 0xff9b && groups[2] === 1;
  const isDocumentation = first === 0x2001 && groups[1] === 0x0db8;
  if (
    isUnspecified ||
    isLoopback ||
    isMulticast ||
    isUla ||
    isLinkLocal ||
    isDiscardOnly ||
    isIetfProtocolAssignment ||
    isNat64LocalUse ||
    isDocumentation
  ) {
    return false;
  }

  const isIpv4Compatible = groups.slice(0, 6).every(group => group === 0);
  const isIpv4Mapped =
    groups.slice(0, 5).every(group => group === 0) && groups[5] === 0xffff;
  if (isIpv4Compatible || isIpv4Mapped) {
    const ipv4 = [
      groups[6] >> 8,
      groups[6] & 0xff,
      groups[7] >> 8,
      groups[7] & 0xff,
    ].join(".");
    return isPublicIPv4(ipv4);
  }
  return true;
}

function isPublicAddress(address: string, family: number): boolean {
  return family === 4 ? isPublicIPv4(address) : isPublicIPv6(address);
}

async function resolvePinnedPublicAddress(
  hostname: string
): Promise<ResolvedPublicAddress> {
  let addresses: Array<{ address: string; family: number }>;
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new Error("Direct provider media hostname could not be resolved");
  }

  if (
    addresses.length === 0 ||
    addresses.some(entry => !isPublicAddress(entry.address, entry.family))
  ) {
    throw new Error(
      "Direct provider media hostname resolved to a non-public address"
    );
  }

  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

async function downloadPinnedHttpsMedia(
  url: URL,
  resolved: ResolvedPublicAddress,
  maxBytes: number,
  signal: AbortSignal | undefined
): Promise<{ buffer: Buffer; contentType: string | null }> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error: Error) => {
      if (!settled) {
        settled = true;
        reject(error);
      }
    };

    const request = httpsRequest(
      {
        protocol: "https:",
        hostname: url.hostname,
        path: `${url.pathname}${url.search}`,
        method: "GET",
        port: 443,
        servername: url.hostname,
        headers: {
          Host: url.hostname,
          Accept: "application/pdf,image/*,audio/*,video/*",
        },
        lookup: (_hostname, _options, callback) =>
          callback(null, resolved.address, resolved.family),
      },
      response => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          response.resume();
          fail(new Error("Direct provider media URL must not redirect"));
          return;
        }
        if (status < 200 || status >= 300) {
          response.resume();
          fail(new Error(`Direct provider media download failed (${status})`));
          return;
        }

        const contentLength = response.headers["content-length"];
        const declaredLength =
          typeof contentLength === "string"
            ? Number(contentLength)
            : Number.NaN;
        if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
          response.resume();
          fail(new Error(`Direct provider media exceeds ${maxBytes} bytes`));
          return;
        }

        const chunks: Buffer[] = [];
        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxBytes) {
            request.destroy();
            response.destroy();
            fail(new Error(`Direct provider media exceeds ${maxBytes} bytes`));
            return;
          }
          chunks.push(chunk);
        });
        response.on("error", error =>
          fail(
            error instanceof Error
              ? error
              : new Error("Direct provider media stream failed")
          )
        );
        response.on("end", () => {
          if (settled) return;
          if (received === 0) {
            fail(
              new Error("Direct provider media must contain at least one byte")
            );
            return;
          }
          settled = true;
          resolve({
            buffer: Buffer.concat(chunks),
            contentType:
              typeof response.headers["content-type"] === "string"
                ? response.headers["content-type"]
                : null,
          });
        });
      }
    );

    const onAbort = () =>
      request.destroy(new Error("Direct provider media download aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    request.once("error", error =>
      fail(
        error instanceof Error
          ? error
          : new Error("Direct provider media request failed")
      )
    );
    request.end();
  });
}

/**
 * Downloads only a fresh, controlled object-storage URL before supplying its
 * bytes to a direct provider. It resolves every allowed hostname first,
 * rejects private/reserved answers, then pins the HTTPS connection to that
 * public address so a DNS rebinding response cannot redirect the request. The
 * body is streamed and capped before aggregation.
 */
export async function loadDirectProviderMedia(
  url: string,
  declaredMimeType: string | undefined,
  config: DirectProviderMediaConfig
): Promise<DirectProviderMedia> {
  const maxBytes = config.maxBytes ?? DIRECT_MEDIA_DEFAULT_MAX_BYTES;
  if (!Number.isInteger(maxBytes) || maxBytes < 1) {
    throw new Error("Direct provider media maximum must be a positive integer");
  }

  if (url.startsWith("data:")) {
    return parseDataUrl(url, maxBytes);
  }

  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Direct provider media URL is invalid");
  }

  assertAllowedHttpsUrl(parsed, normalizedAllowedHosts(config.allowedHosts));
  const resolved = await resolvePinnedPublicAddress(parsed.hostname);
  const downloaded = await downloadPinnedHttpsMedia(
    parsed,
    resolved,
    maxBytes,
    config.signal
  );
  const mimeType =
    normalizeMimeType(declaredMimeType) ??
    normalizeMimeType(downloaded.contentType);
  if (!mimeType) {
    throw new Error("Direct provider media response has no MIME type");
  }
  assertSafeMimeType(mimeType);

  return { data: downloaded.buffer.toString("base64"), mimeType };
}

export function parseAllowedMediaHosts(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map(host => host.trim().toLowerCase())
    .filter(host => host.length > 0);
}

export const DIRECT_PROVIDER_MEDIA_INTERNALS = {
  isPublicAddress,
  isValidDirectMediaHost,
};
