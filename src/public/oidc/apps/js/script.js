document.addEventListener("DOMContentLoaded", function() {
  // Modal elements
  const modal = document.querySelector("[data-modal]");
  const closeButton = document.querySelector("[data-close-modal]");

  // Event listener for delete button
  document.addEventListener("click", function(event) {
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

  closeButton.addEventListener("click", function() {
    modal.close();
  });

  document.addEventListener("click", function(event) {
    const editButton = event.target.closest(".edit-roles-button");
    if (editButton) {
      const appId = editButton.id.split("-")[1];
      window.location.href = `/oidc/roles/?oauthAppId=${appId}`;
    }
  });

  fetchData();

  var currentURL = window.location.origin;
  document.getElementById("oidc-url").textContent = currentURL;
  document.getElementById("authorization-url").textContent =
    currentURL + "/api/oauth/authorize";
  document.getElementById("token-url").textContent =
    currentURL + "/api/oauth/token";
  document.getElementById("token-check-url").textContent =
    currentURL + "/api/oauth/check_token";
  document.getElementById("userinfo-url").textContent =
    currentURL + "/api/oauth/userinfo";

  document.getElementById("oidc-url-copy").addEventListener("click", function() {
    copyTextToClipboard("oidc-url");
  });

  document.getElementById("authorization-url-copy").addEventListener("click", function() {
    copyTextToClipboard("authorization-url");
  });

  document.getElementById("token-url-copy").addEventListener("click", function() {
    copyTextToClipboard("token-url");
  });

  document.getElementById("token-check-url-copy").addEventListener("click", function() {
    copyTextToClipboard("token-check-url");
  });

  document.getElementById("userinfo-url-copy").addEventListener("click", function() {
    copyTextToClipboard("userinfo-url");
  });
});

async function fetchData() {
  try {
    const response = await fetch("/api/oauth/settings/apps/get", {});
    if (!response.ok) {
      handleResponse(response);
      return;
    }
    const data = await response.json();
    displayOAuthApps(data);
  } catch (error) {
    console.error("Error fetching data:", error);
  }
}

function displayOAuthApps(data) {
  const container = document.querySelector("#oauth-apps-container");
  container.innerHTML = "";
  data.oauthApps.forEach((app) => {
    const appBox = document.createElement("div");
    appBox.classList.add("oauth-app-box", "p-4", "bg-gray-900", "rounded-lg", "shadow-md", "transition", "transform", "mb-4", "max-w-full", "overflow-hidden", "break-all");
    appBox.id = app.oauthClientAppId;

    appBox.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h4 class="text-lg font-semibold">${app.oauthAppName}</h4>
        <div class="flex space-x-3">
          <a class="edit-app-button cursor-pointer" id="app-${app.oauthClientAppId}">
            <img src="./svg/edit-app.svg" alt="Edit Icon" class="w-5 h-5 hover:opacity-75">
          </a>
          <a class="edit-roles-button cursor-pointer" id="app-${app.oauthClientAppId}">
            <img src="./svg/edit-roles.svg" alt="Edit Icon" class="w-5 h-5 hover:opacity-75">
          </a>
          <a class="delete-button cursor-pointer" id="${app.oauthClientAppId}">
            <img src="./svg/trash.svg" alt="Trash Icon" class="w-5 h-5 hover:opacity-75">
          </a>
        </div>
      </div>
      <p><strong>OAuth App ID:</strong> ${app.oauthClientAppId}</p>
      <p><strong>Client ID:</strong> <span id="client-id-value-${app.clientId}">${app.clientId}</span> 
      <img id="clipboard-client-id-${app.clientId}" src="./svg/clipboard.svg" alt="Copy Client ID" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75"></p>
      <p><strong>Client Secret:</strong> <span id="client-secret-value-${app.clientSecret}">${app.clientSecret}</span> 
      <img id="clipboard-client-secret-${app.clientSecret}" src="./svg/clipboard.svg" alt="Copy Client Secret" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75"></p>
      <p><strong>Redirect URI:</strong> ${app.redirectUri}</p>
      <p><strong>Access Token Validity:</strong> ${app.accessTokenValidity}</p>
    `;

    container.appendChild(appBox);

    const clientIdCopyBtn = document.getElementById(`clipboard-client-id-${app.clientId}`);
    const clientSecretCopyBtn = document.getElementById(`clipboard-client-secret-${app.clientSecret}`);

    clientIdCopyBtn.addEventListener("click", function() {
      copyTextToClipboard(`client-id-value-${app.clientId}`);
    });

    clientSecretCopyBtn.addEventListener("click", function() {
      copyTextToClipboard(`client-secret-value-${app.clientSecret}`);
    });
  });
}

// Create a new OAuth app
function create_app() {
  const oauthAppName = document.getElementById("appname-field").value;
  const redirectUri = document.getElementById("redirecturl-field").value;
  const accessTokenValidity = document.getElementById("access-token-validity-field").value;

  try {
    fetch(`/api/oauth/settings/apps/add`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ redirectUri, oauthAppName, accessTokenValidity }),
    })
      .then((response) => {
        if (!response.ok) {
          return displayAlertError("Error: Failed to create app. Please check the app name, redirect URI, or access token validity.");
        }
        return response.json();
      })
      .then((data) => {
        const container = document.querySelector("#oauth-apps-container");
        const newAppBox = document.createElement("div");
        newAppBox.classList.add("oauth-app-box", "p-4", "bg-gray-900", "rounded-lg", "shadow-md", "transition", "transform", "mb-4", "max-w-full", "overflow-hidden", "break-all");
        newAppBox.id = data.oauthClientAppId;

        const appBoxHTML = `
          <div class="flex justify-between items-center mb-4">
            <h4 class="text-lg font-semibold">${data.oauthAppName}</h4>
            <div class="flex space-x-3">
              <a class="edit-app-button cursor-pointer" id="app-${data.oauthClientAppId}">
                <img src="./svg/edit-app.svg" alt="Edit Icon" class="w-5 h-5 hover:opacity-75">
              </a>
              <a class="edit-roles-button cursor-pointer" id="app-${data.oauthClientAppId}">
                <img src="./svg/edit-roles.svg" alt="Edit Icon" class="w-5 h-5 hover:opacity-75">
              </a>
              <a class="delete-button cursor-pointer" id="${data.oauthClientAppId}">
                <img src="./svg/trash.svg" alt="Delete Icon" class="w-5 h-5 hover:opacity-75">
              </a>
            </div>
          </div>
          <p><strong>OAuth App ID:</strong> ${data.oauthClientAppId}</p>
          <p><strong>Client ID:</strong> <span id="client-id-${data.clientId}">${data.clientId}</span> 
          <img id="clipboard-client-id-${data.clientId}" src="./svg/clipboard.svg" alt="Copy Client ID" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75"></p>
          <p><strong>Client Secret:</strong> <span id="client-secret-${data.clientSecret}">${data.clientSecret}</span> 
          <img id="clipboard-client-secret-${data.clientSecret}" src="./svg/clipboard.svg" alt="Copy Client Secret" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75"></p>
          <p><strong>Redirect URI:</strong> ${data.redirectUri}</p>
          <p><strong>Access Token Validity:</strong> ${data.accessTokenValidity}</p>
        `;

        newAppBox.innerHTML = appBoxHTML;
        container.appendChild(newAppBox);

        displayAlertSuccess("App created successfully");

        const clientIdCopyBtn = document.getElementById(`clipboard-client-id-${data.clientId}`);
        const clientSecretCopyBtn = document.getElementById(`clipboard-client-secret-${data.clientSecret}`);

        clientIdCopyBtn.addEventListener("click", function() {
          copyTextToClipboard(`client-id-${data.clientId}`);
        });

        clientSecretCopyBtn.addEventListener("click", function() {
          copyTextToClipboard(`client-secret-${data.clientSecret}`);
        });
      })
      .catch((error) => {
        console.error("Error creating app:", error);
        displayAlertError("Error: Failed to create app. Please check the app name, redirect URI, or access token validity.");
      });
  } catch (error) {
    console.error("Error:", error);
    displayAlertError("An unexpected error occurred.");
  }
}

// Delete an OAuth app
function delete_app(oauthClientAppId) {
  try {
    fetch(`/api/oauth/settings/apps/delete`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oauthClientAppId }),
    })
      .then((response) => {
        if (!response.ok) {
          displayAlertError("Error: Failed to delete app. Please try again.");
          return;
        }
        const appBox = document.getElementById(oauthClientAppId);
        if (appBox) {
          appBox.remove();
        }
        displayAlertSuccess("App deleted successfully");
      })
      .catch((error) => {
        console.error("Error deleting app:", error);
        displayAlertError("Error: Failed to delete app. Please try again.");
      });
  } catch (error) {
    console.error("Error:", error);
    displayAlertError("An unexpected error occurred.");
  }
}


document.addEventListener("DOMContentLoaded", function () {
  const editAppModal = document.getElementById("edit-app-modal");
  const closeEditModalButton = document.getElementById("close-edit-modal");

  document.addEventListener("click", function (event) {
      const editAppButton = event.target.closest(".edit-app-button");
      const oauthAppBox = event.target.closest(".oauth-app-box");
      if (editAppButton && oauthAppBox) {
          const appId = editAppButton.id.split("-")[1];

          const appName = oauthAppBox.querySelector("h4").textContent;
          const redirectUri = oauthAppBox.querySelector("p:nth-of-type(4)").textContent.split(": ")[1];
          const accessTokenValidity = oauthAppBox.querySelector("p:nth-of-type(5)").textContent.split(": ")[1];
          
          openEditAppModal(appId, appName, redirectUri, accessTokenValidity);
      }
  });

  closeEditModalButton.addEventListener("click", function () {
      editAppModal.close();
  });

  function openEditAppModal(appId, appName, redirectUri, accessTokenValidity) {
      document.getElementById("edit-app-id").value = appId;
      document.getElementById("edit-appname").value = appName;
      document.getElementById("edit-redirecturl").value = redirectUri;
      document.getElementById("edit-access-token-validity").value = accessTokenValidity;

      editAppModal.showModal();
  }
});

document.getElementById("edit-app-form").addEventListener("submit", async function (event) {
  const editAppModal = document.getElementById("edit-app-modal");
  event.preventDefault();

  const oauthClientAppId = document.getElementById("edit-app-id").value;
  const oauthAppName = document.getElementById("edit-appname").value;
  const redirectUri = document.getElementById("edit-redirecturl").value;
  const accessTokenValidity = document.getElementById("edit-access-token-validity").value;

  try {
      const response = await fetch("/api/oauth/settings/apps/edit", {
          method: "POST",
          headers: {
              "Content-Type": "application/json",
          },
          body: JSON.stringify({
              oauthClientAppId,
              oauthAppName,
              redirectUri,
              accessTokenValidity
          }),
      });

      if (!response.ok) {
          displayAlertError("Error: Failed to save changes. Please check your inputs.");
          return;
      }

      const updatedAppBox = document.getElementById(oauthClientAppId);
      if (updatedAppBox) {
          updatedAppBox.querySelector("h4").textContent = oauthAppName;
          updatedAppBox.querySelector("p:nth-of-type(4)").innerHTML = `<strong>Redirect URI:</strong> ${redirectUri}`;
          updatedAppBox.querySelector("p:nth-of-type(5)").innerHTML = `<strong>Access Token Validity:</strong> ${accessTokenValidity}`;
      }

      displayAlertSuccess("Changes saved successfully");
      editAppModal.close();
  } catch (error) {
      console.error("Error saving changes:", error);
      displayAlertError("An unexpected error occurred while saving changes.");
  }
});





// Handle responses for error messages
function handleResponse(response) {
  if (!response.ok) {
    if (response.status === 404) {
      return;
    } else if (response.status === 500) {
      displayAlertError("Error: Internal Server Error. Please try again later.");
    } else {
      displayAlertError("Error: An unexpected error occurred.");
    }
  }
}

// Copy text to clipboard
function copyTextToClipboard(elementId) {
  const element = document.getElementById(elementId);
  const text = element.textContent;

  if (!navigator.clipboard) {
    const textArea = document.createElement("textarea");
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    try {
      document.execCommand("copy");
    } catch (err) {
      console.error("Fallback: Oops, unable to copy", err);
    }
    document.body.removeChild(textArea);
  } else {
    navigator.clipboard.writeText(text).then(
      function() {
        displayAlertSuccess("Copied to clipboard successfully!");
      },
      function(err) {
        console.error("Async: Could not copy text:", err);
        displayAlertError("Failed to copy to clipboard.");
      }
    );
  }
}
