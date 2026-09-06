export function bearerToken(authorization?: string): string | undefined {
  return /^Bearer ([^\s]+)$/i.exec(authorization ?? '')?.[1];
}
