// Web Crypto API ECDSA P-256 utilities for Browser-side Offline Cryptography
// Fully compatible with Python cryptography ECDSA SECP256R1 SHA-256

/**
 * Deterministic JSON stringifier (matching Python canonical_json_bytes).
 * Keys are strictly sorted, no unnecessary whitespace.
 */
export function canonicalJson(obj) {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return '[' + obj.map(canonicalJson).join(',') + ']';
  }
  const keys = Object.keys(obj).sort();
  const pairs = keys.map(k => JSON.stringify(k) + ':' + canonicalJson(obj[k]));
  return '{' + pairs.join(',') + '}';
}

/**
 * Convert ArrayBuffer to Base64 string
 */
export function bufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert Base64 string to ArrayBuffer
 */
export function base64ToBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Generate a new browser ECDSA P-256 keypair
 */
export async function generateDeviceKeypair() {
  const keypair = await window.crypto.subtle.generateKey(
    {
      name: 'ECDSA',
      namedCurve: 'P-256'
    },
    true, // extractable so we can export public key and persist private key in IndexedDB
    ['sign', 'verify']
  );

  // Export SPKI format public key as Base64
  const spkiBuffer = await window.crypto.subtle.exportKey('spki', keypair.publicKey);
  const public_key_spki = bufferToBase64(spkiBuffer);

  return {
    keypair,
    public_key_spki
  };
}

/**
 * Sign a JavaScript payload using the device's ECDSA P-256 private key.
 * Produces IEEE P1363 64-byte raw signature encoded as Base64.
 */
export async function signPayload(privateKey, payload) {
  const canonical = canonicalJson(payload);
  const dataBytes = new TextEncoder().encode(canonical);

  const rawSigBuffer = await window.crypto.subtle.sign(
    {
      name: 'ECDSA',
      hash: { name: 'SHA-256' }
    },
    privateKey,
    dataBytes
  );

  return bufferToBase64(rawSigBuffer);
}

/**
 * Verify an ECDSA P-256 SHA-256 signature against an SPKI Base64 public key
 */
export async function verifySignature(publicKeySpkiB64, payload, signatureB64) {
  try {
    const spkiBuffer = base64ToBuffer(publicKeySpkiB64);
    const pubKey = await window.crypto.subtle.importKey(
      'spki',
      spkiBuffer,
      {
        name: 'ECDSA',
        namedCurve: 'P-256'
      },
      true,
      ['verify']
    );

    const canonical = canonicalJson(payload);
    const dataBytes = new TextEncoder().encode(canonical);
    const sigBuffer = base64ToBuffer(signatureB64);

    return await window.crypto.subtle.verify(
      {
        name: 'ECDSA',
        hash: { name: 'SHA-256' }
      },
      pubKey,
      sigBuffer,
      dataBytes
    );
  } catch (err) {
    console.error('Signature verification error:', err);
    return false;
  }
}

/**
 * Computes SHA-256 hex digest of a string
 */
export async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const hashBuffer = await window.crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}
