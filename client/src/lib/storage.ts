/**
 * Client-side storage helper for file uploads
 * 
 * Provides a simple interface for uploading files to S3 via the backend.
 */

import { trpc } from "./trpc";

/**
 * Upload a file to S3 storage
 * 
 * @param key - S3 object key (path)
 * @param data - File data as Uint8Array
 * @param contentType - MIME type of the file
 * @returns Promise with the uploaded file URL
 */
export async function storagePut(
  key: string,
  data: Uint8Array,
  contentType: string
): Promise<{ url: string }> {
  // Convert Uint8Array to base64 for transmission
  const base64 = btoa(String.fromCharCode(...Array.from(data)));
  
  // Call backend storage API
  const response = await fetch("/api/storage/upload", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      data: base64,
      contentType,
    }),
  });

  if (!response.ok) {
    throw new Error(`Storage upload failed: ${response.statusText}`);
  }

  const result = await response.json();
  return { url: result.url };
}

/**
 * Get a presigned URL for downloading a file from S3
 * 
 * @param key - S3 object key (path)
 * @param expiresIn - URL expiration time in seconds (default: 3600)
 * @returns Promise with the presigned URL
 */
export async function storageGet(
  key: string,
  expiresIn: number = 3600
): Promise<{ url: string }> {
  const response = await fetch("/api/storage/download", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key,
      expiresIn,
    }),
  });

  if (!response.ok) {
    throw new Error(`Storage download failed: ${response.statusText}`);
  }

  const result = await response.json();
  return { url: result.url };
}
