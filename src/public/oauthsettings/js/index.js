const errorBox = document.createElement('div');
const successBox = document.createElement('div');

errorBox.className = 'error-box';
successBox.className = 'success-box';

function getCookie(name) {
  const cookieArray = document.cookie.split(';');
  for (const cookie of cookieArray) {
    const [cookieName, cookieValue] = cookie.trim().split('=');
    if (cookieName === name) {
      return cookieValue;
    }
  }
  return null;
}


function create_app() {
  const accessToken = getCookie('access_token');
  const redirectUri = document.getElementById('redirecturl-field').value;
  if (accessToken) {
    fetch(`/api/oauth/settings/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ redirectUri })
    })
    .then(handleResponse)
  }
}


async function fetchData() {
    try {
        const accessToken = getCookie('access_token');
        const response = await fetch('/api/oauth/settings/get', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        if (!response.ok) {
            throw new Error('Network response was not ok');
        }
        const data = await response.json();
        displayOAuthApps(data);
    } catch (error) {
        console.error('There was a problem fetching the data:', error);
    }
}


function handle404Error() {
  document.getElementById('email-field').value = '';
  displayError('Error: No account found with that email address.')
}


function handleError() {
  document.getElementById('email-field').value = '';
  displayError('Something went wrong')
}

function displaySuccess(successMessage) {
  successBox.textContent = successMessage;
  document.body.appendChild(successBox);
  setTimeout(() => {
      successBox.remove();
  }, 2500);
}

function displayError(errorMessage) {
  errorBox.textContent = errorMessage;
  document.body.appendChild(errorBox);
  setTimeout(() => {
      errorBox.remove();
  }, 2500);
}
