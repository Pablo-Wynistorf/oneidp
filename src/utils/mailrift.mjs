import 'dotenv/config';

const {
  MAILRIFT_API_KEY,
  MAILRIFT_SENDER_EMAIL,
  MAILRIFT_API_URL,
} = process.env;

// MailRift REST (mail) API. The key must be a REST credential (`mrft_rest_` prefix)
// with the `mail:send` permission. See https://mailrift.io/openapi.yaml
const API_URL = (MAILRIFT_API_URL || 'https://api.mailrift.io/v1').replace(/\/+$/, '');

// Callers await this inside the request path (see send-emails.mjs), so the
// timeout has to stay well inside the Lambda budget (`lambda_timeout`, 30s).
const REQUEST_TIMEOUT_MS = 10000;

/**
 * Send a transactional email through MailRift.
 *
 * Resolves with the API payload (`{ success, messageId, emailId }`) and rejects
 * with an Error carrying the API message, so callers can decide between
 * fire-and-forget and surfacing the failure.
 */
async function sendMail({ to, subject, htmlBody, textBody }) {
  if (!MAILRIFT_API_KEY || !MAILRIFT_SENDER_EMAIL) {
    throw new Error('MailRift is not configured: set MAILRIFT_API_KEY and MAILRIFT_SENDER_EMAIL');
  }

  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) {
    throw new Error('MailRift send failed: no recipient provided');
  }

  let response;
  try {
    response = await fetch(`${API_URL}/emails/send`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${MAILRIFT_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: MAILRIFT_SENDER_EMAIL,
        to: recipients,
        subject,
        ...(textBody ? { textBody } : {}),
        ...(htmlBody ? { htmlBody } : {}),
      }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    });
  } catch (error) {
    throw new Error(`MailRift send failed: ${error.message}`);
  }

  // MailRift answers with `{ "error": "message" }` on failures, and uses 422 for
  // permission problems and 429 for rate/quota limits.
  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new Error(`MailRift send failed (${response.status}): ${payload?.error || 'unknown error'}`);
  }

  return payload;
}

export { sendMail };
