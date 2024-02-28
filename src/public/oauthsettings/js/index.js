const errorBox = document.createElement("div");
const successBox = document.createElement("div");

errorBox.className = "error-box";
successBox.className = "success-box";


function create_app() {
  const container = document.querySelector(".container");
  const oauthAppName = document.getElementById("appname-field").value;
  const redirectUri = document.getElementById("redirecturl-field").value;
  const access_token_validity = document.getElementById("access-token-validity-field").value;
  try {
    fetch(`/api/oauth/settings/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redirectUri, oauthAppName, access_token_validity }),
    })
      .then((response) => {
        if (!response.ok) {
          return displayError("Error: Failed to create app, the redirect URI, the appname or the access token validity may be invalid");
        }
        return response.json();
      })
      .then((data) => {
        const newAppBox = document.createElement("div");
        newAppBox.classList.add("oauth-app-box");
        newAppBox.id = data.oauthClientAppId;

        const appBoxHTML = `
          <a class="edit-button" id="app-${data.oauthClientAppId}">
           <img src="./images/edit.svg" alt="Edit Icon">
          </a>
          <a class="delete-button" id="${data.oauthClientAppId}">
            <img src="./images/trash.svg" alt="Delete Icon">
          </a>
          <h4>APP NAME: ${data.oauthAppName}</h4>
          <p>OAuth App ID: ${data.oauthClientAppId}</p>
          <p>Client ID: ${data.clientId}</p>
          <p>Client Secret: ${data.clientSecret}</p>
          <p>Redirect URI: ${data.redirectUri}</p>
          <p>Access Token Validity: ${data.access_token_validity}</p>
        `;

        newAppBox.innerHTML = appBoxHTML;

        const oauthAppInfo = container.querySelector(".oauth-app-info");
        if (oauthAppInfo) {
          oauthAppInfo.insertAdjacentElement("afterend", newAppBox);
        } else {
          container.appendChild(newAppBox);
        }
        displaySuccess("App created successfully");
      })
      .catch((error) => {
        return displayError("Error: Failed to create app, the redirect URI or the appname may be invalid");
      });
  } catch (error) {
    console.error("Error:", error);
    displayError("Failed to create app");
  }
}


const modal = document.querySelector("[data-modal]");
const closeButton = document.querySelector("[data-close-modal]");

document.addEventListener("click", function (event) {
  const deleteButton = event.target.closest(".delete-button");
  if (deleteButton) {
    modal.showModal();
    document.getElementById("delete-button").onclick = function () {
      const appId = deleteButton.id;
      delete_app(appId);
      modal.close();
    };
  }
});

closeButton.addEventListener("click", function () {
  modal.close();
});

document.addEventListener("click", function (event) {
  const editButton = event.target.closest(".edit-button");
  if (editButton) {
    const appId = editButton.id.split("-")[1];
    window.location.href = `/home/oauth/settings/roles/?oauthClientAppId=${appId}`;
  }
});



function delete_app(appId) {
  const oauthClientAppId = appId;
  try {
    fetch(`/api/oauth/settings/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oauthClientAppId }),
    })
      .then((response) => {
        if (response.ok) {
          document.getElementById(oauthClientAppId).remove();
          displaySuccess("App deleted successfully");
        } else if (response.status === 460) {
          displayError("Error: App Deletion Failed");
        } else {
          handleError();
        }
      })
      .catch((error) => {
        displayError("Something went wrong");
      });
  } catch (error) {
    displayError("An error occurred while deleting the app");
  }
}


async function fetchData() {
  try {
    const response = await fetch("/api/oauth/settings/get", {
    });
    if (!response.ok) {
      handleResponse(response);
    }
    const data = await response.json();
    displayOAuthApps(data);
  } catch (error) {}
}

function displayOAuthApps(data) {
  const container = document.querySelector(".container");
  data.oauthApps.forEach((app) => {
    const appBox = document.createElement("div");
    appBox.innerHTML = `
       <div class="oauth-app-box" id="${app.oauthClientAppId}">
          <a class="edit-button" id="app-${app.oauthClientAppId}">
           <img src="./images/edit.svg" alt="Edit Icon">
          </a>
          <a class="delete-button" id="${app.oauthClientAppId}">
           <img src="./images/trash.svg" alt="Trash Icon">
          </a>
          <h4>APP NAME: ${app.oauthAppName}</h4>
          <p>OAuth App ID: ${app.oauthClientAppId}</p>
          <p>Client ID: ${app.clientId}</p>
          <p>Client Secret: ${app.clientSecret}</p>
          <p>Redirect URI: ${app.redirectUri}</p>
          <p>Access Token Validity: ${app.access_token_validity}</p>
       </div>
      `;
    container.appendChild(appBox);
  });
}

function handleResponse(response) {
  if (response.status === 200) {
  } else if (response.status === 404) {
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 465) {
    return handle465Error();
  } else {
    handleError();
  }
}

function handle460Error() {
  displayError("Error: Invalid redirect URI");
}

function handle465Error() {
  displayError("Error: You have no access to this resource");
}

function handleError() {
  displayError("Something went wrong");
}

var currentURL = window.location.origin;
document.getElementById("authorization-url").textContent =
  currentURL + "/api/oauth/authorize";
document.getElementById("token-url").textContent =
  currentURL + "/api/oauth/token";
document.getElementById("token-check-url").textContent =
  currentURL + "/api/oauth/check_token";
document.getElementById("userinfo-uri").textContent =
  currentURL + "/api/oauth/userinfo";

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
  }, 4000);
}
