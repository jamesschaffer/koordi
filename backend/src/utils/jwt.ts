import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRES_IN = '7d'; // 7 days

// Validate JWT_SECRET at module load time
if (!JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is not set');
  console.error('Generate one with: openssl rand -base64 32');
  throw new Error('JWT_SECRET must be configured');
}

if (JWT_SECRET.length < 32) {
  console.error('CRITICAL: JWT_SECRET must be at least 32 characters');
  throw new Error('JWT_SECRET must be at least 32 characters');
}

export interface JWTPayload {
  userId: string;
  email: string;
}

export const generateToken = (payload: JWTPayload): string => {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
};

export const verifyToken = (token: string): JWTPayload => {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch (error) {
    throw new Error('Invalid or expired token');
  }
};

export const decodeToken = (token: string): JWTPayload | null => {
  try {
    return jwt.decode(token) as JWTPayload;
  } catch (error) {
    return null;
  }
};
