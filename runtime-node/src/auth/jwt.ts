import { SignJWT, jwtVerify } from 'jose';

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function jwtEncode(
  payload: Record<string, unknown>,
  secret: string,
): Promise<string> {
  const { exp, iat, ...rest } = payload;
  let jwt = new SignJWT(rest as Record<string, unknown>).setProtectedHeader({ alg: 'HS256', typ: 'JWT' });
  if (typeof iat === 'number') jwt = jwt.setIssuedAt(iat);
  if (typeof exp === 'number') jwt = jwt.setExpirationTime(exp);
  return jwt.sign(secretKey(secret));
}

export async function jwtDecode(token: string, secret: string): Promise<Record<string, unknown>> {
  const { payload } = await jwtVerify(token, secretKey(secret), { algorithms: ['HS256'] });
  return payload as Record<string, unknown>;
}
