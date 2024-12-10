document.addEventListener("DOMContentLoaded", () => {
  const modal = document.querySelector("[data-modal]");
  const closeButton = document.querySelector("[data-close-modal]");
  const editAppModal = document.getElementById("edit-app-modal");
  const closeEditModalButton = document.getElementById("close-edit-modal");
  const createAppButton = document.getElementById("create-app-button");

  // Set OIDC URLs
  const currentURL = window.location.origin;
  setTextContent("oidc-url", currentURL);
  setTextContent("authorization-url", `${currentURL}/api/oauth/authorize`);
  setTextContent("token-url", `${currentURL}/api/oauth/token`);
  setTextContent("token-check-url", `${currentURL}/api/oauth/check_token`);
  setTextContent("userinfo-url", `${currentURL}/api/oauth/userinfo`);

  // Copy buttons for OIDC URLs
  addCopyListener("oidc-url", "oidc-url-copy");
  addCopyListener("authorization-url", "authorization-url-copy");
  addCopyListener("token-url", "token-url-copy");
  addCopyListener("token-check-url", "token-check-url-copy");
  addCopyListener("userinfo-url", "userinfo-url-copy");

  // Fetch initial data
  fetchData();

  // Modal close button
  closeButton.addEventListener("click", () => modal.close());
  closeEditModalButton.addEventListener("click", () => editAppModal.close());

  // Create app button
  if (createAppButton) {
    createAppButton.addEventListener("click", () => createApp());
  }

  // Delegated event listeners for actions
  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-button");
    const editRolesButton = event.target.closest(".edit-roles-button");
    const editAppButton = event.target.closest(".edit-app-button");
    const oauthAppBox = event.target.closest(".oauth-app-box");

    // Delete App
    if (deleteButton) {
      const appId = deleteButton.id;
      modal.showModal();
      document.getElementById("delete-button").onclick = () => {
        deleteApp(appId);
        modal.close();
      };
    }

    // Edit Roles
    if (editRolesButton) {
      const appId = editRolesButton.id.split("-")[1];
      window.location.href = `/oidc/roles/?oauthAppId=${appId}`;
    }

    // Edit App (Open Edit Modal)
    if (editAppButton && oauthAppBox) {
      const appId = editAppButton.id.split("-")[1];
      const appName = oauthAppBox.querySelector("h4").textContent;
      const { redirectUri, accessTokenValidity } = extractAppData(oauthAppBox);

      openEditAppModal(appId, appName, redirectUri, accessTokenValidity);
    }
  });

  // Handle edit app form submission
  document.getElementById("edit-app-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateApp();
  });

  // Functions
  async function fetchData() {
    try {
      const response = await fetch("/api/oauth/settings/apps/get");
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
    const container = document.getElementById("oauth-apps-container");
    container.innerHTML = "";

    data.oauthApps.forEach((app) => {
      const appBox = createAppBox(app);
      container.appendChild(appBox);
      attachCopyListeners(app);
    });
  }

  function createAppBox(app) {
    const appBox = document.createElement("div");
    appBox.classList.add(
      "oauth-app-box",
      "p-4",
      "bg-gray-900",
      "rounded-lg",
      "shadow-md",
      "transition",
      "transform",
      "mb-4",
      "max-w-full",
      "overflow-hidden",
      "break-all"
    );
    appBox.id = app.oauthClientAppId;

    appBox.innerHTML = `
      <div class="flex justify-between items-center mb-4">
        <h4 class="text-lg font-semibold">${app.oauthAppName}</h4>
        <div class="flex space-x-3">
          <a class="edit-app-button cursor-pointer" id="app-${app.oauthClientAppId}">
            <img src="./svg/edit-app.svg" alt="Edit Icon" class="w-5 h-5 hover:opacity-75">
          </a>
          <a class="edit-roles-button cursor-pointer" id="app-${app.oauthClientAppId}">
            <img src="./svg/edit-roles.svg" alt="Edit Roles Icon" class="w-5 h-5 hover:opacity-75">
          </a>
          <a class="delete-button cursor-pointer" id="${app.oauthClientAppId}">
            <img src="./svg/trash.svg" alt="Trash Icon" class="w-5 h-5 hover:opacity-75">
          </a>
        </div>
      </div>
      <p><strong>OAuth App ID:</strong> ${app.oauthClientAppId}</p>
      <p><strong>Client ID:</strong> <span id="client-id-value-${app.clientId}">${app.clientId}</span>
        <img id="clipboard-client-id-${app.clientId}" src="./svg/clipboard.svg" alt="Copy Client ID" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75">
      </p>
      ${
        !app.isPublicClient
          ? `<p><strong>Client Secret:</strong> <span id="client-secret-value-${app.clientSecret}">${app.clientSecret}</span>
             <img id="clipboard-client-secret-${app.clientSecret}" src="./svg/clipboard.svg" alt="Copy Client Secret" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75">
             </p>`
          : ``
      }
      <p><strong>Redirect URI:</strong> ${app.redirectUri}</p>
      <p><strong>Access Token Validity:</strong> ${app.accessTokenValidity}</p>
      <p><strong>Public Client:</strong> ${app.isPublicClient ? "Yes" : "No"}</p>
    `;
    return appBox;
  }

  function attachCopyListeners(app) {
    const clientIdCopyBtn = document.getElementById(`clipboard-client-id-${app.clientId}`);
    if (clientIdCopyBtn) {
      clientIdCopyBtn.addEventListener("click", () => copyTextToClipboard(`client-id-value-${app.clientId}`));
    }

    if (!app.isPublicClient) {
      const clientSecretCopyBtn = document.getElementById(`clipboard-client-secret-${app.clientSecret}`);
      if (clientSecretCopyBtn) {
        clientSecretCopyBtn.addEventListener("click", () => copyTextToClipboard(`client-secret-value-${app.clientSecret}`));
      }
    }
  }

  async function createApp() {
    const oauthAppName = document.getElementById("appname-field").value;
    const redirectUri = document.getElementById("redirecturl-field").value;
    const accessTokenValidity = document.getElementById("access-token-validity-field").value;
    const isPublicClient = document.getElementById("public-client-toggle").checked;

    try {
      const response = await fetch(`/api/oauth/settings/apps/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ redirectUri, isPublicClient, oauthAppName, accessTokenValidity }),
      });

      if (!response.ok) {
        displayAlertError("Error: Failed to create app. Please check the app name, redirect URI, or access token validity.");
        return;
      }

      const data = await response.json();
      const container = document.getElementById("oauth-apps-container");
      const newAppBox = createAppBox(data);
      container.appendChild(newAppBox);
      attachCopyListeners(data);
      
      document.getElementById("appname-field").value = "";
      document.getElementById("redirecturl-field").value = "";
      document.getElementById("access-token-validity-field").value = "";
      document.getElementById("public-client-toggle").checked = false;

      const createAppModal = document.getElementById("create-app-modal");
      createAppModal.close();

      displayAlertSuccess("App created successfully");
    } catch (error) {
      console.error("Error creating app:", error);
      displayAlertError("Error: Failed to create app. Please check the app name, redirect URI, or access token validity.");
    }
  }

  async function deleteApp(oauthClientAppId) {
    try {
      const response = await fetch(`/api/oauth/settings/apps/delete`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauthClientAppId }),
      });

      if (!response.ok) {
        displayAlertError("Error: Failed to delete app. Please try again.");
        return;
      }

      const appBox = document.getElementById(oauthClientAppId);
      if (appBox) {
        appBox.remove();
      }
      displayAlertSuccess("App deleted successfully");
    } catch (error) {
      console.error("Error deleting app:", error);
      displayAlertError("Error: Failed to delete app. Please try again.");
    }
  }

  function openEditAppModal(appId, appName, redirectUri, accessTokenValidity) {
    document.getElementById("edit-app-id").value = appId;
    document.getElementById("edit-appname").value = appName;
    document.getElementById("edit-redirecturl").value = redirectUri;
    document.getElementById("edit-access-token-validity").value = accessTokenValidity;
    editAppModal.showModal();
  }

  async function updateApp() {
    const editAppModal = document.getElementById("edit-app-modal");
    const oauthClientAppId = document.getElementById("edit-app-id").value;
    const oauthAppName = document.getElementById("edit-appname").value;
    const redirectUri = document.getElementById("edit-redirecturl").value;
    const accessTokenValidity = document.getElementById("edit-access-token-validity").value;

    try {
      const response = await fetch("/api/oauth/settings/apps/edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauthClientAppId, oauthAppName, redirectUri, accessTokenValidity }),
      });

      if (!response.ok) {
        displayAlertError("Error: Failed to save changes. Please check your inputs.");
        return;
      }

      const updatedAppBox = document.getElementById(oauthClientAppId);
      if (updatedAppBox) {
        updatedAppBox.querySelector("h4").textContent = oauthAppName;

        const paragraphs = updatedAppBox.querySelectorAll("p");
        paragraphs.forEach((p) => {
          const text = p.textContent.trim();
          if (text.startsWith("Redirect URI:")) {
            p.innerHTML = `<strong>Redirect URI:</strong> ${redirectUri}`;
          } else if (text.startsWith("Access Token Validity:")) {
            p.innerHTML = `<strong>Access Token Validity:</strong> ${accessTokenValidity}`;
          }
        });
      }

      displayAlertSuccess("Changes saved successfully");
      editAppModal.close();
    } catch (error) {
      console.error("Error saving changes:", error);
      displayAlertError("An unexpected error occurred while saving changes.");
    }
  }

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

  function copyTextToClipboard(elementId) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const text = element.textContent;
    if (!navigator.clipboard) {
      // Fallback if navigator.clipboard is not available
      const textArea = document.createElement("textarea");
      textArea.value = text;
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand("copy");
        displayAlertSuccess("Copied to clipboard successfully!");
      } catch (err) {
        console.error("Fallback copy failed:", err);
        displayAlertError("Failed to copy to clipboard.");
      }
      document.body.removeChild(textArea);
    } else {
      navigator.clipboard.writeText(text).then(
        () => displayAlertSuccess("Copied to clipboard successfully!"),
        (err) => {
          console.error("Async: Could not copy text:", err);
          displayAlertError("Failed to copy to clipboard.");
        }
      );
    }
  }

  // Helper functions
  function setTextContent(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  function addCopyListener(textElementId, buttonId) {
    const button = document.getElementById(buttonId);
    if (button) {
      button.addEventListener("click", () => copyTextToClipboard(textElementId));
    }
  }

  function extractAppData(oauthAppBox) {
    let redirectUri = "";
    let accessTokenValidity = "";
    const paragraphs = oauthAppBox.querySelectorAll("p");
    paragraphs.forEach((p) => {
      const text = p.textContent.trim();
      if (text.startsWith("Redirect URI:")) {
        redirectUri = text.split(": ")[1];
      } else if (text.startsWith("Access Token Validity:")) {
        accessTokenValidity = text.split(": ")[1];
      }
    });
    return { redirectUri, accessTokenValidity };
  }
});
