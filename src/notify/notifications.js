require('dotenv').config();

const { DC_MONITORING_WEBHOOK_URL } = process.env;

// Notify when database error occurs.
function notifyError(error) {
  const params = {
    content: `Error: ${error}`
  };
  fetch(DC_MONITORING_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  }).catch((error) => {
    console.error('Internet, or Webhook URL error:', error);
  });
}

// Notify when user logs in
function notifyLogin(username) {
  const params = {
    content: `User with Username: ${username} has just logged in!`
  };
  fetch(DC_MONITORING_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  }).catch((error) => {
    console.error('Internet, or Webhook URL error:', error);
  });
}

// Notify when user has registered
function notifyRegister(username) {
  const params = {
    content: `User with Username: ${username} has just registered!`
  };
  fetch(DC_MONITORING_WEBHOOK_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(params),
  }).catch((error) => {
    console.error('Interet, or Webhook URL error:', error);
  });
}

module.exports = {
  notifyError,
  notifyLogin,
  notifyRegister
};