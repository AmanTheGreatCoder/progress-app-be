import jwt from 'jsonwebtoken';

const secret = () => process.env.JWT_SECRET || 'dev-jwt-secret';

export function generateToken(userId: string): string {
  return jwt.sign({ sub: userId }, secret(), { expiresIn: '30d' });
}

export function verifyToken(token: string): string | null {
  try {
    const payload = jwt.verify(token, secret()) as { sub: string };
    return payload.sub;
  } catch {
    return null;
  }
}
