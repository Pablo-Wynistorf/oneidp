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
  const container = document.querySelector('.container');

  const existingAppBox = container.querySelector('.oauth-app-box');

  const newAppBox = document.createElement('div');
  newAppBox.classList.add('oauth-app-box');
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
    .then(response => {
      if (!response.ok) {
        throw new Error('Something went wrong');
      }
      return response.json();
    })
    .then(data => {
      const clientId = data.clientId;
      const clientSecret = data.clientSecret;
      const oauthClientAppId = data.oauthClientAppId;
      const appBoxHTML = `
        <div class="oauth-app-box">
          <h4>OAUTH APP ID: ${oauthClientAppId}</h4>
          <p>Client ID: ${clientId}</p>
          <p>Client Secret: ${clientSecret}</p>
          <p>Redirect URI: ${redirectUri}</p>
        </div>
      `;
      if (existingAppBox) {
        container.insertBefore(newAppBox, existingAppBox);
      } else {
        const oauthAppsContainer = document.querySelector('.oauth-apps-container');
        if (oauthAppsContainer) {
          oauthAppsContainer.appendChild(newAppBox);
        } else {
          container.appendChild(newAppBox);
        }
      }
      newAppBox.innerHTML = appBoxHTML;
    })
    .catch(error => {
      displayError('Something went wrong');
    });
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


function displayOAuthApps(data) {
  const container = document.querySelector('.container'); // Select the container
  data.oauthApps.forEach(app => {
      const appBox = document.createElement('div');
      appBox.classList.add('oauth-app-box'); // Add 'container' class to style like the big container
      appBox.innerHTML = `
          <h4>OAUTH APP ID: ${app.oauthClientAppId}</h4>
          <p>Client ID: ${app.clientId}</p>
          <p>Client Secret: ${app.clientSecret}</p>
          <p>Redirect URI: ${app.redirectUri}</p>
      `;
      container.appendChild(appBox);
  });
}



function handleResponse(response) {
  if (response.status === 200) {
    console.log(response);
  } else if (response.status === 460) {
    return handle460Error();
  } else {
    handleError();
  }
}


function handle460Error() {
  displayError('Error: Invalid redirect URI')
}


function handleError() {
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
