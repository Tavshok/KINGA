// @ts-nocheck
/**
 * File scanning utility for malware detection and content validation.
 * Uses ClamAV daemon when available, falls back to MIME type validation.
 * 
 * Production: Install ClamAV daemon (clamav-daemon) on the host.
 * Development: Falls back to extension/MIME validation only.
 */

const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export interface ScanResult {
  safe: boolean;
  reason?: string;
}

export async function scanFile(
  buffer: Buffer,
  mimeType: string,
  filename: string
): Promise<ScanResult> {
  // Step 1: Validate MIME type
  if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
    return { safe: false, reason: `Disallowed file type: ${mimeType}` };
  }

  // Step 2: Validate file size
  if (buffer.length > MAX_FILE_SIZE) {
    return {
      safe: false,
      reason: `File exceeds maximum size of ${MAX_FILE_SIZE / 1024 / 1024}MB`,
    };
  }

  // Step 3: Validate file signature (magic bytes)
  const signatureValid = validateFileSignature(buffer, mimeType);
  if (!signatureValid) {
    return {
      safe: false,
      reason: 'File content does not match declared MIME type',
    };
  }

  // Step 4: ClamAV scan (if daemon is available)
  try {
    const clamResult = await scanWithClamAV(buffer);
    if (!clamResult.safe) {
      return clamResult;
    }
  } catch (err) {
    // ClamAV not available; log warning and continue with basic validation
    console.warn(
      '[FileScanner] ClamAV daemon not available, proceeding with basic validation only'
    );
  }

  return { safe: true };
}

function validateFileSignature(buffer: Buffer, mimeType: string): boolean {
  const signatures: Record<string, number[][]> = {
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47]],
    'image/gif': [
      [0x47, 0x49, 0x46, 0x38],
    ],
    'image/webp': [[0x52, 0x49, 0x46, 0x46]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  };

  const expected = signatures[mimeType];
  if (!expected) return true; // No signature check for this type

  return expected.some((sig) => sig.every((byte, i) => buffer[i] === byte));
}

async function scanWithClamAV(buffer: Buffer): Promise<ScanResult> {
  const net = await import('net');
  return new Promise((resolve, reject) => {
    const socket = net.createConnection(
      { path: '/var/run/clamav/clamd.ctl' },
      () => {
        socket.write('zINSTREAM\0');
        const sizeBuffer = Buffer.alloc(4);
        sizeBuffer.writeUInt32BE(buffer.length, 0);
        socket.write(sizeBuffer);
        socket.write(buffer);
        const endBuffer = Buffer.alloc(4);
        endBuffer.writeUInt32BE(0, 0);
        socket.write(endBuffer);
      }
    );

    let response = '';
    socket.on('data', (data) => {
      response += data.toString();
    });
    socket.on('end', () => {
      if (response.includes('OK')) {
        resolve({ safe: true });
      } else {
        resolve({ safe: false, reason: `Malware detected: ${response.trim()}` });
      }
    });
    socket.on('error', (err) => reject(err));
    socket.setTimeout(10000, () => {
      socket.destroy();
      reject(new Error('ClamAV scan timeout'));
    });
  });
}
