import 'dotenv/config';

const { DC_MONITORING_WEBHOOK_URL } = process.env;

// Post a message to the Discord monitoring webhook (no-op if not configured).
function postToWebhook(content) {
  if (!DC_MONITORING_WEBHOOK_URL) {
    return;
  }
  fetch(DC_MONITORING_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ content }),
  }).catch((error) => {
    console.error('Internet, or Webhook URL error:', error);
  });
}

// Notify when a database / application error occurs.
function notifyError(error) {
  // Always surface the real error in the logs, even without a webhook.
  console.error('Application error:', error);
  postToWebhook(`Error: ${error}`);
}

// Notify when user logs in
function notifyLogin(username) {
  postToWebhook(`User with Username: ${username} has just logged in!`);
}

// Notify when user has registered
function notifyRegister(username) {
  postToWebhook(`User with Username: ${username} has just registered!`);
}

export {
  notifyError,
  notifyLogin,
  notifyRegister
};
