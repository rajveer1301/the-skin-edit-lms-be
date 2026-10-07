import { google } from 'googleapis';

export interface GoogleProfile {
  email: string;
  firstName: string;
  lastName: string;
  picture?: string;
}

const verifier = new google.auth.OAuth2();

export async function verifyGoogleToken(
  credential: string,
  clientId?: string,
): Promise<GoogleProfile> {
  const audience = clientId
    ?.split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (!audience?.length) throw new Error('Google sign-in is not configured');
  const ticket = await verifier.verifyIdToken({
    idToken: credential,
    audience,
  });
  const payload = ticket.getPayload();
  if (!payload?.email || !payload.email_verified)
    throw new Error('A verified Google email is required');
  return {
    email: payload.email.toLowerCase(),
    firstName: payload.given_name || '',
    lastName: payload.family_name || '',
    picture: payload.picture,
  };
}
