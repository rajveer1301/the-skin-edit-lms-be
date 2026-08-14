export interface GoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

/**
 * Verifies a Google ID token and extracts the profile.
 *
 * When GOOGLE_CLIENT_ID is configured the token is validated against Google's
 * tokeninfo endpoint (checking signature validity and audience). Otherwise
 * (local/demo environments) the JWT payload is decoded without verification so
 * the flow remains usable without external configuration.
 */
export async function verifyGoogleToken(
  credential: string,
  clientId?: string,
): Promise<GoogleProfile> {
  let payload: Record<string, unknown>;

  if (clientId) {
    payload = await fetchTokenInfo(credential);
    if (payload['aud'] !== clientId) {
      throw new Error('Google token audience mismatch');
    }
  } else {
    payload = decodeJwtPayload(credential);
  }

  const email = asString(payload['email']).toLowerCase();
  if (!email) {
    throw new Error('Google token did not contain an email');
  }

  const givenName = asString(payload['given_name']);
  const familyName = asString(payload['family_name']);
  const fullName = asString(payload['name']);
  const [fallbackFirst, ...fallbackRest] = (
    fullName || email.split('@')[0]
  ).split(' ');

  const picture = asString(payload['picture']);

  return {
    email,
    firstName: givenName || fallbackFirst || 'Google',
    lastName: familyName || fallbackRest.join(' ') || 'User',
    picture: picture || undefined,
  };
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

async function fetchTokenInfo(
  credential: string,
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`,
  );
  if (!res.ok) {
    throw new Error('Failed to verify Google token');
  }
  return (await res.json()) as Record<string, unknown>;
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const parts = token.split('.');
  if (parts.length < 2) {
    throw new Error('Malformed Google credential');
  }
  const json = Buffer.from(parts[1], 'base64').toString('utf8');
  return JSON.parse(json) as Record<string, unknown>;
}
