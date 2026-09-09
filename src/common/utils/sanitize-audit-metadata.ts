const SENSITIVE_KEY =
  /password|token|secret|authorization|cookie|credential|hash/i;

export function sanitizeAuditMetadata(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sanitizeAuditMetadata);
  if (value === null || typeof value !== 'object') return value;

  return Object.fromEntries(
    Object.entries(value).flatMap(([key, nestedValue]) =>
      SENSITIVE_KEY.test(key)
        ? []
        : [[key, sanitizeAuditMetadata(nestedValue)]],
    ),
  );
}
