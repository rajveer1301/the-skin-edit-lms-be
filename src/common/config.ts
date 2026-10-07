export function validateConfig(
  env: Record<string, unknown>,
): Record<string, unknown> {
  for (const key of ['JWT_ACCESS_SECRET', 'JWT_REFRESH_SECRET']) {
    if (typeof env[key] !== 'string' || !env[key].trim())
      throw new Error(`${key} is required`);
    if (env.NODE_ENV === 'production' && env[key].length < 32)
      throw new Error(`${key} must have at least 32 characters in production`);
  }
  if (env.JWT_ACCESS_SECRET === env.JWT_REFRESH_SECRET)
    throw new Error('Access and refresh secrets must differ');
  const zone = env.CLINIC_TIMEZONE || 'Asia/Kolkata';
  if (typeof zone !== 'string') throw new Error('Invalid CLINIC_TIMEZONE');
  new Intl.DateTimeFormat('en', { timeZone: zone });
  return env;
}
