// Storage façade: managed deployments use Forge; external Render deployments
// use only the configured S3-compatible object store. Both adapters expose the
// same opaque-key and short-lived retrieval URL contract.

import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import {
  ENV,
  getConfiguredObjectStorageProvider,
  getConfiguredRuntimeMode,
} from "./_core/env";
import { isValidDirectMediaHost } from "./_core/direct-provider-media";

type ForgeStorageConfig = { baseUrl: string; apiKey: string };

export type DirectStorageConfig = {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint?: string;
  forcePathStyle: boolean;
};

/** Hard timeout for managed Forge storage API calls. */
const STORAGE_TIMEOUT_MS = 30_000;
const DEFAULT_SIGNED_URL_SECONDS = 3600;
const MAX_SIGNED_URL_SECONDS = 7 * 24 * 60 * 60;

function assertNoDirectStorageAccessDuringTests(): void {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    throw new Error(
      "Direct storage access is disabled during tests. Mock server/storage at the test boundary."
    );
  }
}

async function fetchWithTimeout(
  url: URL | string,
  init: RequestInit = {}
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      (err.name === "AbortError" || controller.signal.aborted)
    ) {
      throw new Error(
        `Storage request timed out after ${STORAGE_TIMEOUT_MS / 1000}s`
      );
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

function normalizeKey(relKey: string): string {
  const key = relKey.replace(/^\/+/, "");
  if (!key || key.includes("..") || key.includes("\\")) {
    throw new Error("Storage key is invalid");
  }
  return key;
}

function normalizeSignedUrlTtl(expiresInSeconds?: number): number {
  const ttl = expiresInSeconds ?? DEFAULT_SIGNED_URL_SECONDS;
  if (!Number.isInteger(ttl) || ttl < 1 || ttl > MAX_SIGNED_URL_SECONDS) {
    throw new Error(
      `Storage URL expiry must be an integer between 1 and ${MAX_SIGNED_URL_SECONDS}`
    );
  }
  return ttl;
}

function getForgeStorageConfig(): ForgeStorageConfig {
  const baseUrl = ENV.forgeApiUrl;
  const apiKey = ENV.forgeApiKey;
  if (!baseUrl || !apiKey) {
    throw new Error(
      "Storage proxy credentials missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"
    );
  }
  return { baseUrl: baseUrl.replace(/\/+$/, ""), apiKey };
}

export function parseDirectStorageConfig(input: {
  bucket: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  endpoint: string;
  forcePathStyle: boolean;
}): DirectStorageConfig {
  const bucket = input.bucket.trim();
  const region = input.region.trim();
  const accessKeyId = input.accessKeyId.trim();
  const secretAccessKey = input.secretAccessKey.trim();
  const endpoint = input.endpoint.trim();

  if (!bucket || !region || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "Direct S3 storage requires S3_BUCKET, S3_REGION, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY"
    );
  }
  if (endpoint) {
    let parsed: URL;
    try {
      parsed = new URL(endpoint);
    } catch {
      throw new Error("S3_ENDPOINT must be a valid HTTPS URL");
    }
    if (
      parsed.protocol !== "https:" ||
      parsed.username ||
      parsed.password ||
      parsed.port ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !isValidDirectMediaHost(parsed.hostname)
    ) {
      throw new Error("S3_ENDPOINT must be a credential-free HTTPS URL");
    }
  }

  return {
    bucket,
    region,
    accessKeyId,
    secretAccessKey,
    ...(endpoint ? { endpoint } : {}),
    forcePathStyle: input.forcePathStyle,
  };
}

function getDirectStorageConfig(): DirectStorageConfig {
  return parseDirectStorageConfig({
    bucket: ENV.s3Bucket,
    region: ENV.s3Region,
    accessKeyId: ENV.s3AccessKeyId,
    secretAccessKey: ENV.s3SecretAccessKey,
    endpoint: ENV.s3Endpoint,
    forcePathStyle: ENV.s3ForcePathStyle,
  });
}

function directS3Client(config: DirectStorageConfig): S3Client {
  return new S3Client({
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    ...(config.endpoint ? { endpoint: config.endpoint } : {}),
    forcePathStyle: config.forcePathStyle,
  });
}

function ensureTrailingSlash(value: string): string {
  return value.endsWith("/") ? value : `${value}/`;
}

function buildUploadUrl(baseUrl: string, key: string): URL {
  const url = new URL("v1/storage/upload", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", key);
  return url;
}

function buildAuthHeaders(apiKey: string): HeadersInit {
  return { Authorization: `Bearer ${apiKey}` };
}

function toFormData(
  data: Buffer | Uint8Array | string,
  contentType: string,
  fileName: string
): FormData {
  const blob = new Blob([data as BlobPart], { type: contentType });
  const form = new FormData();
  form.append("file", blob, fileName || "file");
  return form;
}

async function forgePut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getForgeStorageConfig();
  const response = await fetchWithTimeout(buildUploadUrl(baseUrl, key), {
    method: "POST",
    headers: buildAuthHeaders(apiKey),
    body: toFormData(data, contentType, key.split("/").pop() ?? key),
  });
  if (!response.ok) {
    throw new Error(`Storage upload failed (${response.status})`);
  }
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Storage upload returned no URL");
  return { key, url: body.url };
}

async function forgeGet(
  key: string,
  expiresInSeconds?: number
): Promise<{ key: string; url: string }> {
  const { baseUrl, apiKey } = getForgeStorageConfig();
  const url = new URL("v1/storage/downloadUrl", ensureTrailingSlash(baseUrl));
  url.searchParams.set("path", key);
  if (expiresInSeconds)
    url.searchParams.set("expiresIn", String(expiresInSeconds));
  const response = await fetchWithTimeout(url, {
    method: "GET",
    headers: buildAuthHeaders(apiKey),
  });
  if (!response.ok)
    throw new Error(`Storage retrieval failed (${response.status})`);
  const body = (await response.json()) as { url?: string };
  if (!body.url) throw new Error("Storage retrieval returned no URL");
  return { key, url: body.url };
}

async function directPut(
  key: string,
  data: Buffer | Uint8Array | string,
  contentType: string
): Promise<{ key: string; url: string }> {
  const config = getDirectStorageConfig();
  const client = directS3Client(config);
  try {
    await client.send(
      new PutObjectCommand({
        Bucket: config.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
      })
    );
  } catch {
    throw new Error("Direct S3 upload failed");
  }
  return directGetWithClient(key, config, client);
}

async function directGetWithClient(
  key: string,
  config: DirectStorageConfig,
  client: S3Client,
  expiresInSeconds?: number
): Promise<{ key: string; url: string }> {
  try {
    const url = await getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: config.bucket, Key: key }),
      { expiresIn: normalizeSignedUrlTtl(expiresInSeconds) }
    );
    return { key, url };
  } catch {
    throw new Error("Direct S3 retrieval URL generation failed");
  }
}

async function directGet(
  key: string,
  expiresInSeconds?: number
): Promise<{ key: string; url: string }> {
  const config = getDirectStorageConfig();
  return directGetWithClient(
    key,
    config,
    directS3Client(config),
    expiresInSeconds
  );
}

/**
 * Stores application bytes under an opaque key. External mode is deliberately
 * direct-only: it has no Forge fallback, even if Forge variables are present.
 */
export async function storagePut(
  relKey: string,
  data: Buffer | Uint8Array | string,
  contentType = "application/octet-stream"
): Promise<{ key: string; url: string }> {
  assertNoDirectStorageAccessDuringTests();
  const key = normalizeKey(relKey);
  const runtimeMode = getConfiguredRuntimeMode(ENV.runtimeMode);
  const provider = getConfiguredObjectStorageProvider(
    runtimeMode,
    ENV.objectStorageProvider
  );
  if (provider === "s3") {
    return directPut(key, data, contentType);
  }
  if (provider === "forge") {
    return forgePut(key, data, contentType);
  }
  throw new Error("Unsupported object storage provider");
}

/** Returns a fresh short-lived URL for an already-authorized opaque key. */
export async function storageGet(
  relKey: string,
  expiresInSeconds?: number
): Promise<{ key: string; url: string }> {
  assertNoDirectStorageAccessDuringTests();
  const key = normalizeKey(relKey);
  const runtimeMode = getConfiguredRuntimeMode(ENV.runtimeMode);
  const provider = getConfiguredObjectStorageProvider(
    runtimeMode,
    ENV.objectStorageProvider
  );
  if (provider === "s3") {
    return directGet(key, expiresInSeconds);
  }
  if (provider === "forge") {
    return forgeGet(key, expiresInSeconds);
  }
  throw new Error("Unsupported object storage provider");
}

export const DIRECT_STORAGE_INTERNALS = {
  normalizeKey,
  normalizeSignedUrlTtl,
  parseDirectStorageConfig,
};
