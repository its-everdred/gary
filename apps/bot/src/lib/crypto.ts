import { createHmac } from 'crypto';

export function hmac(userId: string, salt: string): string {
  return createHmac('sha256', salt)
    .update(userId)
    .digest('hex');
}