import crypto from 'crypto';
import { EncryptionError, ConfigurationError } from './errors';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '';
const ALGORITHM = 'aes-256-cbc';
const IV_LENGTH = 16;

/**
 * Validate encryption key at module load time
 */
function validateEncryptionKey(): void {
  if (!ENCRYPTION_KEY) {
    console.error('CRITICAL: ENCRYPTION_KEY environment variable is not set');
    console.error('Please set ENCRYPTION_KEY to a 64-character hex string (32 bytes)');
    console.error('Generate one with: openssl rand -hex 32');
    return;
  }

  if (ENCRYPTION_KEY.length !== 64) {
    console.error(`CRITICAL: ENCRYPTION_KEY must be exactly 64 characters (32 bytes), got ${ENCRYPTION_KEY.length} characters`);
    console.error('Generate a valid key with: openssl rand -hex 32');
    return;
  }

  // Validate it's a valid hex string
  if (!/^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY)) {
    console.error('CRITICAL: ENCRYPTION_KEY must be a valid hexadecimal string');
    console.error('Generate a valid key with: openssl rand -hex 32');
    return;
  }

  console.log('✓ ENCRYPTION_KEY validated successfully');
}

// Validate on module load
validateEncryptionKey();

/**
 * Check if encryption is properly configured
 */
export function isEncryptionConfigured(): boolean {
  return ENCRYPTION_KEY.length === 64 && /^[0-9a-fA-F]{64}$/.test(ENCRYPTION_KEY);
}

/**
 * Encrypt a string
 * @param text - Plain text to encrypt
 * @returns Encrypted text in format: iv:encryptedData
 * @throws {ConfigurationError} If ENCRYPTION_KEY is not properly configured
 * @throws {EncryptionError} If encryption fails
 */
export function encrypt(text: string): string {
  if (!isEncryptionConfigured()) {
    throw new ConfigurationError(
      'ENCRYPTION_KEY not properly configured. Must be a 64-character hex string.',
      { keyLength: ENCRYPTION_KEY.length }
    );
  }

  try {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

    let encrypted = cipher.update(text, 'utf8', 'hex');
    encrypted += cipher.final('hex');

    return `${iv.toString('hex')}:${encrypted}`;
  } catch (error) {
    throw new EncryptionError(
      'Failed to encrypt data',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}

/**
 * Decrypt an encrypted string
 * @param encryptedText - Encrypted text in format: iv:encryptedData
 * @returns Decrypted plain text
 * @throws {ConfigurationError} If ENCRYPTION_KEY is not properly configured
 * @throws {EncryptionError} If decryption fails or format is invalid
 */
export function decrypt(encryptedText: string): string {
  if (!isEncryptionConfigured()) {
    throw new ConfigurationError(
      'ENCRYPTION_KEY not properly configured. Must be a 64-character hex string.',
      { keyLength: ENCRYPTION_KEY.length }
    );
  }

  const parts = encryptedText.split(':');
  if (parts.length !== 2) {
    throw new EncryptionError(
      'Invalid encrypted text format. Expected format: iv:encryptedData',
      { partsCount: parts.length }
    );
  }

  try {
    const iv = Buffer.from(parts[0], 'hex');
    const encryptedData = parts[1];

    const decipher = crypto.createDecipheriv(ALGORITHM, Buffer.from(ENCRYPTION_KEY, 'hex'), iv);

    let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    return decrypted;
  } catch (error) {
    throw new EncryptionError(
      'Failed to decrypt data',
      { originalError: error instanceof Error ? error.message : String(error) }
    );
  }
}
