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
      const appBoxHTML = `
       <div class="oauth-app-box" id="${data.oauthClientAppId}">
       <a href="#" class="icon-button" id="${data.oauthClientAppId}">
        <img src="./images/trash.svg" alt="Trash Icon">
        </a>
        <h4>OAUTH APP ID: ${data.oauthClientAppId}</h4>
        <p>Client ID: ${data.clientId}</p>
        <p>Client Secret: ${data.clientSecret}</p>
        <p>Redirect URI: ${data.redirectUri}</p>
      </div>
      `;
      if (existingAppBox) {
        container.insertBefore(newAppBox, existingAppBox);
      } else {
        const oauthAppsContainer = document.querySelector('.oauth-apps-container');
        if (oauthAppsContainer) {
          oauthAppsContainer.appendChild(newAppBox);
          displaySuccess('App created successfully');
        } else {
          container.appendChild(newAppBox);
          displaySuccess('App created successfully');
        }
      }
      newAppBox.innerHTML = appBoxHTML;
    })
    .catch(error => {
    });
  }
}

document.addEventListener('click', function(event) {
  const iconButton = event.target.closest('.icon-button');
  if (iconButton) {
    showConfirmationBox(event);
  }
});

function showConfirmationBox(event) {
  var confirmationBox = document.getElementById('confirmation-box');
  confirmationBox.style.display = 'block';
  document.getElementById('delete-button').onclick = function() {
    delete_app(event);
    hideConfirmationBox();
  }
}

function hideConfirmationBox() {
  var confirmationBox = document.getElementById('confirmation-box');
  confirmationBox.style.display = 'none';
}



function delete_app(event) {
  event.preventDefault();
  const oauthClientAppId = event.target.offsetParent.id;
  const accessToken = getCookie('access_token');
  if (accessToken) {
    fetch(`/api/oauth/settings/delete`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`
      },
      body: JSON.stringify({ oauthClientAppId })
    }).then(response => {
      if (response.ok) {
        event.target.offsetParent.remove();
        document.getElementById(oauthClientAppId).remove();
        displaySuccess('App deleted successfully');
      } else if (response.status === 460) {
        displayError('Error: App Deletion Failed')
      } else {
        handleError();
      }})
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
    }
}


function displayOAuthApps(data) {
  const container = document.querySelector('.container');
  data.oauthApps.forEach(app => {
      const appBox = document.createElement('div');
      appBox.innerHTML = `
       <div class="oauth-app-box" id="${app.oauthClientAppId}">
          <a href="#" class="icon-button" id="${app.oauthClientAppId}">
          <img src="./images/trash.svg" alt="Trash Icon">
          </a>
          <h4>OAUTH APP ID: ${app.oauthClientAppId}</h4>
          <p>Client ID: ${app.clientId}</p>
          <p>Client Secret: ${app.clientSecret}</p>
          <p>Redirect URI: ${app.redirectUri}</p>
       </div>
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


var currentURL = window.location.origin;
document.getElementById('authorization-url').textContent = currentURL + "/api/oauth/authorize";
document.getElementById('token-url').textContent = currentURL + "/api/oauth/token";
document.getElementById('userinfo-uri').textContent = currentURL + "/api/oauth/userinfo";



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