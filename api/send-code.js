/* Nexora Engine — Supabase "Send Email" Auth Hook → Resend
 * ─────────────────────────────────────────────────────────────────────────
 * WHY THIS SHAPE
 *
 * Supabase's built-in mailer is capped at 2 emails/hour per project, which is
 * what produced "email rate limit exceeded" on the first real signups. The
 * supported fix is the Send Email Hook: Supabase still MINTS and VERIFIES the
 * code, but hands delivery to us, and the 2/hour cap no longer applies (it
 * becomes configurable once a custom sender or hook is in place).
 *
 *   browser  → supabase.auth.signUp()      ← Supabase creates the user
 *                    ↓
 *   Supabase Auth  → POST /api/send-code   ← this file (signed webhook)
 *                    ↓
 *   Resend API  → the user's inbox
 *   browser  → supabase.auth.verifyOtp()   ← unchanged; Supabase checks it
 *
 * So this endpoint is a *transport*, never an authority: it can only ever
 * forward a code Supabase already generated, and Supabase remains the only
 * thing that decides whether a code is valid. No code is stored here.
 *
 * CONTRACT (Supabase Send Email Hook, HTTPS type)
 *   in   : standard-webhooks signed POST — { user, email_data }
 *   out  : 200 {} on success; non-2xx marks the delivery failed
 *
 * REQUIRED ENV (Vercel → Project → Settings → Environment Variables)
 *   RESEND_API_KEY         your Resend key (already set)
 *   SEND_EMAIL_HOOK_SECRET the "v1,whsec_…" secret from
 *                          Supabase → Authentication → Hooks → Send Email
 *   RESEND_FROM            optional, e.g. "Nexora Engine <no-reply@yourdomain.lk>"
 */

import crypto from 'node:crypto';

/* ── Env ──────────────────────────────────────────────────────────────── */

/* Resend will only deliver to arbitrary recipients from a domain you have
 * verified in Resend. `onboarding@resend.dev` is Resend's sandbox sender and
 * may ONLY be used to mail your own Resend account address — set RESEND_FROM
 * to a verified domain before real users sign up. */
const RESEND_FROM = process.env.RESEND_FROM || 'Nexora Engine <onboarding@resend.dev>';

/* Supabase shows this as "v1,whsec_<base64>". Both prefixes are stripped,
 * leaving the raw base64 the HMAC key is decoded from. */
function hookSecret() {
  const raw = String(process.env.SEND_EMAIL_HOOK_SECRET || '').trim();
  if (!raw) return null;
  return raw.replace(/^v1,/, '').replace(/^whsec_/, '');
}

/* ── Signature verification (standard-webhooks, Svix-compatible) ─────────
   Signing input is exactly:  <webhook-id>.<webhook-timestamp>.<raw body>
   signed with HMAC-SHA256 over the base64-decoded secret, base64 output.

   This is the whole security boundary of the endpoint. There is no
   unverified fallback path: without a valid signature nothing is sent, so a
   stranger who finds this URL cannot use it to mail arbitrary people.        */

const TOLERANCE_S = 300; // reject replays older than 5 minutes

function header(request, name) {
  try { return request.headers.get(name) || ''; } catch (e) { return ''; }
}

function timingSafeEqual(a, b) {
  const ab = Buffer.from(String(a), 'utf8');
  const bb = Buffer.from(String(b), 'utf8');
  if (ab.length !== bb.length) return false;
  try { return crypto.timingSafeEqual(ab, bb); } catch (e) { return false; }
}

function verifyHookSignature(rawBody, request) {
  const secretB64 = hookSecret();
  if (!secretB64) return { ok: false, reason: 'SEND_EMAIL_HOOK_SECRET is not configured on the server.' };

  const id = header(request, 'webhook-id');
  const ts = header(request, 'webhook-timestamp');
  const sigHeader = header(request, 'webhook-signature');
  if (!id || !ts || !sigHeader) return { ok: false, reason: 'Missing webhook signature headers.' };

  const seconds = parseInt(ts, 10);
  if (!isFinite(seconds)) return { ok: false, reason: 'Webhook timestamp was not a number.' };
  const age = Math.abs(Date.now() / 1000 - seconds);
  if (age > TOLERANCE_S) return { ok: false, reason: 'Webhook timestamp outside tolerance.' };

  let key;
  try { key = Buffer.from(secretB64, 'base64'); } catch (e) { return { ok: false, reason: 'Hook secret is not valid base64.' }; }
  if (!key.length) return { ok: false, reason: 'Hook secret decoded to an empty key.' };

  /* The signed string must use the INTEGER seconds, not the raw header text —
     that is what the reference implementation signs
     (standardwebhooks: `${msgId}.${Math.floor(ts.getTime()/1000)}.${payload}`). */
  const expected = crypto.createHmac('sha256', key)
    .update(id + '.' + String(seconds) + '.' + rawBody)
    .digest('base64');

  /* The header carries space-separated "version,signature" pairs. Only v1 is
     signed by the same scheme, so anything else is skipped rather than
     compared. */
  const parts = sigHeader.split(' ');
  for (let i = 0; i < parts.length; i++) {
    const comma = parts[i].indexOf(',');
    if (comma === -1) continue;
    if (parts[i].slice(0, comma).trim() !== 'v1') continue;
    if (timingSafeEqual(parts[i].slice(comma + 1).trim(), expected)) return { ok: true };
  }
  return { ok: false, reason: 'Signature does not match.' };
}

/* ── Email content ─────────────────────────────────────────────────────── */

function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
}

/* One row per email_action_type Supabase can raise. `code: false` means the
   action is link-based, so the email shows a single button instead. */
const ACTIONS = {
  signup: { subject: 'Your Nexora Engine verification code', heading: 'Verify your email', lead: 'Use this code to finish creating your Nexora Engine account.', code: true },
  reauthentication: { subject: 'Your Nexora Engine verification code', heading: 'Confirm it is you', lead: 'Use this code to continue.', code: true },
  recovery: { subject: 'Reset your Nexora Engine password', heading: 'Reset your password', lead: 'Use this code to set a new password.', code: true },
  invite: { subject: "You've been invited to Nexora Engine", heading: 'You are invited', lead: 'Use this code to accept your invitation.', code: true },
  magiclink: { subject: 'Your Nexora Engine sign-in code', heading: 'Sign in to Nexora Engine', lead: 'Use this code to sign in.', code: true },
  email_change: { subject: 'Confirm your new email address', heading: 'Confirm your new email', lead: 'Use this code to confirm this address.', code: true }
};

function actionCopy(type) {
  return ACTIONS[type] || {
    subject: 'Your Nexora Engine verification code',
    heading: 'Verify your email',
    lead: 'Use this code to continue.',
    code: true
  };
}

function emailHtml(heading, lead, code, link) {
  const codeBlock = code
    ? '<div style="margin:22px 0 6px;padding:16px 10px;border:1px solid #d7dce5;border-radius:10px;background:#f7f9fc;text-align:center;">' +
        '<div style="font:600 11px/1.4 Arial,Helvetica,sans-serif;letter-spacing:2px;text-transform:uppercase;color:#6b7280;">Verification code</div>' +
        '<div style="font:700 34px/1.25 \'Courier New\',monospace;letter-spacing:8px;color:#0b1220;padding-top:6px;">' + esc(code) + '</div>' +
      '</div>'
    : '';
  const linkBlock = link && !code
    ? '<div style="margin:24px 0;"><a href="' + esc(link) + '" style="display:inline-block;padding:12px 22px;border-radius:8px;background:#0b1220;color:#ffffff;font:600 14px/1 Arial,Helvetica,sans-serif;text-decoration:none;">Continue</a></div>'
    : '';
  return '<!DOCTYPE html><html><body style="margin:0;padding:24px 12px;background:#eef1f6;">' +
    '<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="max-width:520px;margin:0 auto;background:#ffffff;border-radius:12px;border:1px solid #e2e6ee;font:14px/1.55 Arial,Helvetica,sans-serif;color:#1f2937;">' +
      '<tr><td style="padding:22px 26px 0;">' +
        '<div style="font:700 15px/1.3 Arial,Helvetica,sans-serif;color:#0b1220;letter-spacing:.4px;">NEXORA ENGINE</div>' +
        '<div style="height:1px;background:#e2e6ee;margin:14px 0 0;"></div>' +
      '</td></tr>' +
      '<tr><td style="padding:20px 26px 26px;">' +
        '<h1 style="margin:0 0 8px;font:700 19px/1.3 Arial,Helvetica,sans-serif;color:#0b1220;">' + esc(heading) + '</h1>' +
        '<p style="margin:0;color:#4b5563;">' + esc(lead) + '</p>' +
        codeBlock + linkBlock +
        '<p style="margin:18px 0 0;color:#6b7280;font-size:13px;">This code expires shortly and can only be used once. If you did not request it, you can safely ignore this email.</p>' +
      '</td></tr>' +
      '<tr><td style="padding:14px 26px 20px;border-top:1px solid #e2e6ee;color:#9aa3b2;font-size:12px;">' +
        'Sent to you by Nexora Engine. Please do not reply to this message.' +
      '</td></tr>' +
    '</table>' +
  '</body></html>';
}

/* ── Handler ────────────────────────────────────────────────────────────
   Web-standard signature (rather than the legacy (req, res) form) so the raw
   request body can be read with request.text(). Vercel's Node runtime parses
   a JSON body before a classic handler runs, which would destroy the exact
   bytes the HMAC is computed over.                                          */

export async function POST(request) {
  let rawBody;
  try { rawBody = await request.text(); }
  catch (e) { return json(400, { error: { message: 'Could not read request body.' } }); }

  const verdict = verifyHookSignature(rawBody, request);
  if (!verdict.ok) {
    // Never reveal which part failed to the caller; log it for the operator.
    console.error('[send-code] rejected: ' + verdict.reason);
    return json(401, { error: { http_code: 401, message: 'Invalid hook signature.' } });
  }

  let payload;
  try { payload = JSON.parse(rawBody); }
  catch (e) { return json(400, { error: { http_code: 400, message: 'Body was not valid JSON.' } }); }

  const user = (payload && payload.user) || {};
  const data = (payload && payload.email_data) || {};
  const to = user.email || user.new_email || '';
  const type = data.email_action_type || 'signup';
  const model = actionCopy(type);

  /* Secure Email Change sends two codes with counterintuitive field naming:
   * for the CURRENT address the pair is (token, token_hash_new). The app does
   * not offer an email-change flow, but getting this wrong would mail the
   * wrong code, so the mapping is explicit rather than assumed. */
  let code = data.token || '';
  if (type === 'email_change') code = data.token_new || data.token || '';
  code = String(code).replace(/\D/g, '').slice(0, 6);

  /* Link fallback only when Supabase sent no OTP (link-based templates). It
   * points at the redirect target, not at a /auth/confirm route this static
   * site does not implement. */
  const link = data.redirect_to || data.site_url || '';

  if (!to || (!code && !link)) {
    console.error('[send-code] payload had no recipient or no token; action=' + type);
    return json(200, {}); // nothing usable to send — do not make Supabase retry
  }

  const subject = model.subject;
  const html = emailHtml(model.heading, model.lead, model.code ? code : '', link);
  const text = code
    ? model.heading + '\n\n' + model.lead + '\n\nCode: ' + code + '\n\nIf you did not request this, ignore this email.'
    : model.heading + '\n\n' + model.lead + '\n\n' + link;

  let response;
  try {
    response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (process.env.RESEND_API_KEY || '')
      },
      body: JSON.stringify({ from: RESEND_FROM, to: [to], subject: subject, html: html, text: text })
    });
  } catch (err) {
    console.error('[send-code] Resend unreachable: ' + (err && err.message));
    return json(502, { error: { http_code: 502, message: 'Could not reach the email provider.' } });
  }

  const bodyText = await response.text();
  if (!response.ok) {
    console.error('[send-code] Resend rejected the send (' + response.status + '): ' + bodyText);
    return json(502, {
      error: {
        http_code: response.status,
        message: 'Email provider rejected the message.',
        detail: bodyText.slice(0, 400)
      }
    });
  }

  return json(200, { sent: true, action: type, id: safeId(bodyText) });
}

/* A browser hitting the URL directly gets an explanation instead of a 405 —
   the endpoint only exists for Supabase's server-side hook. */
export async function GET() {
  return json(200, {
    endpoint: '/api/send-code',
    role: 'Supabase Auth "Send Email" hook receiver — delivers verification codes through Resend.',
    accepts: 'POST only, signed with the Supabase/standard-webhooks signature.',
    configured: {
      RESEND_API_KEY: !!process.env.RESEND_API_KEY,
      SEND_EMAIL_HOOK_SECRET: !!hookSecret(),
      from: RESEND_FROM
    }
  });
}

function json(status, obj) {
  return new Response(JSON.stringify(obj), {
    status: status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
  });
}

function safeId(bodyText) {
  try {
    const parsed = JSON.parse(bodyText);
    return (parsed && parsed.id) || null;
  } catch (e) { return null; }
}
