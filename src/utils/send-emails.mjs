import { sendMail } from './mailrift.mjs';
import { notifyError } from '../notify/notifications.mjs';

const { URL } = process.env;

/*
 * Email rendering for ONEIDP transactional mail.
 *
 * The three templates below share one layout so the design stays in sync. The
 * palette mirrors the frontend design tokens in `frontend/src/index.css`, but
 * flattened to plain hex: mail clients do not support `color-mix()`/oklab, so
 * the layered translucent surfaces are pre-composited here.
 */
const COLORS = {
  canvas: '#07080d',
  card: '#0f111a',
  cardEdge: '#23262f',
  divider: '#1b1e27',
  ink: '#f4f5fb',
  inkMuted: '#a2a8bd',
  inkFaint: '#6b7189',
  accent: '#7c5cff',
  cyan: '#22d3ee',
  onAccent: '#ffffff',
};

// Inter is the frontend typeface; the rest of the stack covers clients that
// cannot load webfonts (which is most of them).
const FONT_STACK =
  "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif";

/**
 * Escape interpolated values so a username or display name can never inject
 * markup into the rendered email.
 */
function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Outlook on Windows ignores padding on anchors, so the call to action is a
 * table cell with `mso-padding-alt` and the anchor nested inside it.
 */
function renderButton({ label, url }) {
  return `
                      <table role="presentation" cellpadding="0" cellspacing="0" border="0" align="center" style="border-collapse:separate">
                        <tr>
                          <td align="center" bgcolor="${COLORS.accent}" style="border-radius:12px;mso-padding-alt:14px 32px">
                            <a href="${url}" target="_blank" class="btn" style="display:inline-block;padding:14px 32px;font-family:${FONT_STACK};font-size:16px;font-weight:600;line-height:20px;color:${COLORS.onAccent};text-decoration:none;border-radius:12px;background-color:${COLORS.accent}">${label}</a>
                          </td>
                        </tr>
                      </table>`;
}

/**
 * Shared shell: preheader, logo lockup, glass card with a violet-to-cyan
 * hairline, body copy, call to action, and footer.
 */
function renderEmail({ preheader, heading, greeting, paragraphs, action, note }) {
  const body = paragraphs
    .map(
      (text) => `
                      <p style="Margin:0 0 16px;font-family:${FONT_STACK};font-size:15px;line-height:24px;color:${COLORS.inkMuted}">${text}</p>`,
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office" style="background-color:${COLORS.canvas}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="X-UA-Compatible" content="IE=edge">
  <meta name="x-apple-disable-message-reformatting">
  <meta name="format-detection" content="telephone=no">
  <meta name="color-scheme" content="dark">
  <meta name="supported-color-schemes" content="dark">
  <!-- No <title>: Apple Mail renders it as visible text above the layout. -->
  <!--[if mso]>
  <xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml>
  <![endif]-->
  <style>
    a[x-apple-data-detectors] {
      color: inherit !important;
      text-decoration: none !important;
      font-size: inherit !important;
      font-family: inherit !important;
      font-weight: inherit !important;
      line-height: inherit !important;
    }
    #outlook a { padding: 0; }
    @media only screen and (max-width: 600px) {
      .shell { width: 100% !important; }
      .gutter { padding-left: 20px !important; padding-right: 20px !important; }
      .card-pad { padding: 28px 22px !important; }
      .h1 { font-size: 26px !important; line-height: 32px !important; }
      .btn { display: block !important; }
    }
    @media (prefers-color-scheme: light) {
      .canvas { background-color: ${COLORS.canvas} !important; }
    }
  </style>
</head>
<body class="canvas" style="Margin:0;padding:0;width:100%;background-color:${COLORS.canvas}">
  <div style="display:none;font-size:0;line-height:0;max-height:0;max-width:0;opacity:0;overflow:hidden;mso-hide:all">${preheader}</div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLORS.canvas}" style="border-collapse:collapse;background-color:${COLORS.canvas}">
    <tr>
      <td align="center" class="gutter" style="padding:40px 24px">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" class="shell" style="width:600px;max-width:600px;border-collapse:collapse">

          <!-- Brand lockup -->
          <tr>
            <td align="center" style="padding:0 0 28px">
              <a href="${URL}" target="_blank" style="text-decoration:none">
                <img src="${URL}/icons/oneidp-logo.png" alt="ONEIDP" width="56" height="56" style="display:block;Margin:0 auto 12px;border:0;outline:none;text-decoration:none">
                <span style="display:block;font-family:${FONT_STACK};font-size:20px;font-weight:700;letter-spacing:2px;color:${COLORS.ink};text-transform:uppercase">ONEIDP</span>
              </a>
            </td>
          </tr>

          <!-- Card -->
          <tr>
            <td>
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" bgcolor="${COLORS.card}" style="border-collapse:separate;background-color:${COLORS.card};border:1px solid ${COLORS.cardEdge};border-radius:20px">
                <tr>
                  <td bgcolor="${COLORS.accent}" height="3" style="height:3px;line-height:3px;font-size:0;border-radius:20px 20px 0 0;background-color:${COLORS.accent};background-image:linear-gradient(90deg, ${COLORS.accent} 0%, ${COLORS.cyan} 100%)">&nbsp;</td>
                </tr>
                <tr>
                  <td class="card-pad" style="padding:36px 40px 40px">
                    <h1 class="h1" style="Margin:0 0 8px;font-family:${FONT_STACK};font-size:30px;font-weight:700;line-height:38px;letter-spacing:-0.02em;color:${COLORS.ink}">${heading}</h1>
                    ${greeting ? `<p style="Margin:0 0 20px;font-family:${FONT_STACK};font-size:15px;font-weight:600;line-height:22px;color:${COLORS.cyan}">${greeting}</p>` : ''}
                    ${body}
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                      <tr>
                        <td align="center" style="padding:12px 0 8px">${renderButton(action)}</td>
                      </tr>
                    </table>
                    <p style="Margin:20px 0 0;font-family:${FONT_STACK};font-size:12px;line-height:20px;color:${COLORS.inkFaint};word-break:break-all">
                      If the button does not work, paste this link into your browser:<br>
                      <a href="${action.url}" target="_blank" style="color:${COLORS.accent};text-decoration:underline">${action.url}</a>
                    </p>
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse">
                      <tr>
                        <td height="1" style="padding:24px 0 0;font-size:0;line-height:0">
                          <div style="height:1px;line-height:1px;font-size:0;background-color:${COLORS.divider}">&nbsp;</div>
                        </td>
                      </tr>
                    </table>
                    <p style="Margin:20px 0 0;font-family:${FONT_STACK};font-size:13px;line-height:21px;color:${COLORS.inkFaint}">${note}</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:24px 0 0">
              <p style="Margin:0;font-family:${FONT_STACK};font-size:12px;line-height:18px;color:${COLORS.inkFaint}">
                Sent by <a href="${URL}" target="_blank" style="color:${COLORS.inkMuted};text-decoration:none">ONEIDP</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Turn the inline markup used in body copy back into readable plain text. */
function toPlain(html) {
  return String(html)
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

/**
 * Plain-text alternative. Clients that prefer text get readable copy instead of
 * a stripped-tag soup, and it keeps spam scores down.
 */
function renderText({ heading, greeting, paragraphs, action, note }) {
  return [
    'ONEIDP',
    '',
    toPlain(heading),
    ...(greeting ? [toPlain(greeting)] : []),
    '',
    ...paragraphs.map(toPlain),
    '',
    `${action.label}: ${action.url}`,
    '',
    toPlain(note),
    '',
    `Sent by ONEIDP - ${URL}`,
  ].join('\n');
}

/**
 * Build both representations of an email from a single content definition.
 */
function renderBodies(content) {
  return {
    htmlBody: renderEmail(content),
    textBody: renderText(content),
  };
}

/**
 * Resolves to `true` when MailRift accepted the message, `false` when it did
 * not (the failure is reported to the monitoring webhook either way).
 *
 * Callers must await this before responding: on Lambda the execution
 * environment is frozen as soon as the response is returned, which suspends
 * any in-flight fetch and makes it abort on the next thaw.
 */
async function sendRecoveryEmail(username, email, password_reset_token) {
  const content = {
    preheader: 'Set a new password for your ONEIDP account.',
    heading: 'Password reset',
    greeting: `Hello ${escapeHtml(username)}`,
    paragraphs: [
      "You're receiving this email because you requested a password reset for your account. "
      + 'If you did not request this change, please disregard this email. '
      + 'No changes have been made to your account.',
    ],
    action: {
      label: 'Set a new password',
      url: `${URL}/api/auth/user/setresettoken/${password_reset_token}`,
    },
    note: 'Once you click the button above, you will be redirected to a page where you can set a new password.',
  };

  try {
    await sendMail({
      to: email,
      subject: 'Reset your password',
      ...renderBodies(content),
    });
    return true;
  } catch (error) {
    notifyError(error);
    return false;
  }
}

/**
 * Resolves to `true` when MailRift accepted the message, `false` when it did
 * not (the failure is reported to the monitoring webhook either way).
 *
 * Callers must await this before responding: on Lambda the execution
 * environment is frozen as soon as the response is returned, which suspends
 * any in-flight fetch and makes it abort on the next thaw.
 */
async function sendVerificationEmail(username, email, email_verification_token) {
  const content = {
    preheader: 'Verify your email address to finish setting up your ONEIDP account.',
    heading: 'Confirm your email',
    greeting: `Hello ${escapeHtml(username)}`,
    paragraphs: [
      'You’ve received this message because your email address has been registered with our site. '
      + 'Please click the button below to verify your email address and confirm that you are the owner '
      + 'of this account.',
      'If you did not register with us, please disregard this email.',
    ],
    action: {
      label: 'Confirm your account',
      url: `${URL}/api/auth/user/confirmationlink/${email_verification_token}`,
    },
    note: 'Once confirmed, this email will be uniquely associated with your account.',
  };

  try {
    await sendMail({
      to: email,
      subject: 'Your Email Verification Code',
      ...renderBodies(content),
    });
    return true;
  } catch (error) {
    notifyError(error);
    return false;
  }
}

/**
 * Invitation email sent from the admin console.
 *
 * Returns a promise so the caller can surface a delivery failure, unlike the
 * fire-and-forget helpers above: if an invitation email does not arrive, the
 * invitation is useless and the operator needs to know.
 */
function sendInviteEmail(email, invite_token, invitedBy) {
  const inviter = invitedBy ? `${escapeHtml(invitedBy)} has invited you` : 'You have been invited';

  const content = {
    preheader: 'Accept your invitation and create your ONEIDP account.',
    heading: 'You have been invited',
    greeting: '',
    paragraphs: [
      `${inviter} to create a ONEIDP account for <strong style="color:${COLORS.ink}">${escapeHtml(email)}</strong>. `
      + 'Use the button below to choose a username and password.',
    ],
    action: {
      label: 'Accept invitation',
      url: `${URL}/signup?invite=${invite_token}`,
    },
    note: 'This invitation expires in 7 days and can only be used once. '
      + 'If you were not expecting it, you can safely ignore this email.',
  };

  return sendMail({
    to: email,
    subject: 'You have been invited to ONEIDP',
    ...renderBodies(content),
  });
}

export { sendVerificationEmail, sendRecoveryEmail, sendInviteEmail };
