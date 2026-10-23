// Virhang V2.6, intended for Supabase Edge Functions (Verify JWT OFF for pre-login requests).
// Production note: add IP-based distributed rate limiting, abuse monitoring/CAPTCHA before public launch.
import { createClient } from 'npm:@supabase/supabase-js@2';
import { acceptsLoginPolicy } from './login-policy.mjs';

const url = Deno.env.get('SUPABASE_URL')!;
const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!; // legacy key provisioned by Supabase
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!; // server-only
const admin = createClient(url, serviceKey, {auth: {persistSession: false, autoRefreshToken: false}});
const auth = createClient(url, anonKey, {auth: {persistSession: false, autoRefreshToken: false}});
const environment = Deno.env.get('VIRHANG_ENV') || 'production';
const allowedOrigin = Deno.env.get('VIRHANG_SITE_ORIGIN') || '';

function headers(req: Request) {
  const origin = req.headers.get('origin');
  return {
    'Access-Control-Allow-Origin': allowedOrigin && origin === allowedOrigin ? allowedOrigin : 'null',
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    'Vary': 'Origin',
    'Cache-Control': 'no-store',
    'Content-Type': 'application/json'
  };
}
function json(req: Request, status: number, payload: unknown) {
  return new Response(JSON.stringify(payload), {status, headers: headers(req)});
}
const invalid = {error: '아이디 또는 비밀번호가 올바르지 않습니다.'};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, {status: 204, headers: headers(req)});
  if (req.method !== 'POST') return json(req, 405, {error: 'Method not allowed'});
  if (!allowedOrigin || req.headers.get('origin') !== allowedOrigin) return json(req, 403, {error: 'Forbidden'});
  try {
    const raw = await req.text();
    if (new TextEncoder().encode(raw).length > 4096) return json(req, 413, {error: 'Request too large'});
    let input: unknown;
    try { input = JSON.parse(raw); } catch { return json(req, 400, {error: 'Invalid request'}); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) return json(req, 400, {error: 'Invalid request'});
    const {username, password} = input as Record<string, unknown>;
    if (typeof username !== 'string' || !/^[a-z0-9]{4,20}$/.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128)
      return json(req, 401, invalid);

    // Fail closed on environment mismatch or a legacy limiter overwrite.
    const {data: policy, error: policyError} = await admin.rpc('virhang_login_policy');
    if (policyError || !acceptsLoginPolicy(environment, policy))
      return json(req, 503, {error: '로그인 보안 설정을 확인해야 합니다.'});

    // DB RPC atomically increments an account-scoped attempt counter. This is NOT an IP limit.
    const {data: permitted, error: limitError} = await admin.rpc('virhang_check_login_limit', {p_username: username});
    if (limitError) { console.error('Login rate-limit RPC failed:', limitError.message); return json(req, 503, {error: '로그인 서비스를 잠시 사용할 수 없습니다.'}); }
    if (permitted !== true) return json(req, 429, {error: '로그인 시도가 많습니다. 15분 뒤 다시 시도해주세요.'});

    const {data: profile, error: profileError} = await admin.from('virhang_users').select('id').eq('username', username).maybeSingle();
    if (profileError) throw profileError;
    if (!profile) return json(req, 401, invalid);

    const {data: account, error: lookupError} = await admin.auth.admin.getUserById(profile.id);
    if (lookupError || !account?.user?.email || !account.user.email_confirmed_at) return json(req, 401, invalid);
    const {data: verified, error: signInError} = await auth.auth.signInWithPassword({email: account.user.email, password});
    if (signInError || !verified.session || verified.user?.id !== profile.id) return json(req, 401, invalid);
    return json(req, 200, {
      access_token: verified.session.access_token,
      refresh_token: verified.session.refresh_token,
      expires_in: verified.session.expires_in,
      token_type: verified.session.token_type
    });
  } catch (err) {
    console.error('Username login exception:', err instanceof Error ? err.message : 'Unknown error');
    return json(req, 500, {error: '로그인 처리 중 오류가 발생했습니다.'});
  }
});
