import type { AuthError, Session, SupabaseClient, User } from '@supabase/supabase-js';
import { sanitizeEmail, sanitizePasswordForSignIn } from '@/lib/auth-helpers';

export type EmailPasswordSignInCredentials = {
  email: string;
  passwordLength: number;
};

export type EmailPasswordSignInSuccess = {
  ok: true;
  session: Session;
  user: User;
  credentials: EmailPasswordSignInCredentials;
};

export type EmailPasswordSignInFailure = {
  ok: false;
  error: AuthError;
  credentials: EmailPasswordSignInCredentials;
};

export type EmailPasswordSignInResult = EmailPasswordSignInSuccess | EmailPasswordSignInFailure;

/**
 * Single path for email/password sign-in: normalize inputs → Supabase password grant only.
 * No owner/MFA/session side effects (handle those in AuthProvider after this returns).
 */
export async function signInWithEmailPassword(
  client: SupabaseClient,
  rawEmail: string,
  rawPassword: string,
): Promise<EmailPasswordSignInResult> {
  const email = sanitizeEmail(rawEmail);
  const password = sanitizePasswordForSignIn(rawPassword);
  const credentials: EmailPasswordSignInCredentials = {
    email,
    passwordLength: password.length,
  };

  const { data, error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    return { ok: false, error, credentials };
  }

  const session = data.session;
  const user = data.user;
  if (!session || !user) {
    const synthetic: AuthError = {
      name: 'AuthError',
      message: 'Sign-in succeeded but no session or user was returned.',
      status: 500,
      code: 'session_missing',
    } as AuthError;
    return { ok: false, error: synthetic, credentials };
  }

  return { ok: true, session, user, credentials };
}
