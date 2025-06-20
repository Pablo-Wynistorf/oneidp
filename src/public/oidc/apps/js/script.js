document.addEventListener("DOMContentLoaded", () => {
  const modal = document.querySelector("[data-modal]");
  const closeButton = document.querySelector("[data-close-modal]");
  const editAppModal = document.getElementById("edit-app-modal");
  const closeEditModalButton = document.getElementById("close-edit-modal");
  const createAppButton = document.getElementById("create-app-button");

  const currentURL = window.location.origin;
  setTextContent("oidc-url", currentURL);
  setTextContent("authorization-url", `${currentURL}/api/oauth/authorize`);
  setTextContent("token-url", `${currentURL}/api/oauth/token`);
  setTextContent("token-check-url", `${currentURL}/api/oauth/check_token`);
  setTextContent("userinfo-url", `${currentURL}/api/oauth/userinfo`);

  addCopyListener("oidc-url", "oidc-url-copy");
  addCopyListener("authorization-url", "authorization-url-copy");
  addCopyListener("token-url", "token-url-copy");
  addCopyListener("token-check-url", "token-check-url-copy");
  addCopyListener("userinfo-url", "userinfo-url-copy");

  fetchData();

  closeButton.addEventListener("click", () => modal.close());
  closeEditModalButton.addEventListener("click", () => editAppModal.close());

  if (createAppButton) {
    createAppButton.addEventListener("click", () => createApp());
  }

  document.addEventListener("click", (event) => {
    const deleteButton = event.target.closest(".delete-button");
    const editRolesButton = event.target.closest(".edit-roles-button");
    const editAppButton = event.target.closest(".edit-app-button");
    const oauthAppBox = event.target.closest(".oauth-app-box");

    if (deleteButton) {
      const appId = deleteButton.id.split("-")[1];
      modal.showModal();
      document.getElementById("delete-button").onclick = () => {
        deleteApp(appId);
        modal.close();
      };
    }

    if (editRolesButton) {
      const appId = editRolesButton.id.split("-")[2];
      window.location.href = `/oidc/roles/?oauthAppId=${appId}`;
    }

    if (editAppButton && oauthAppBox) {
      const appId = editAppButton.id.split("-")[2];
      const appName = oauthAppBox.querySelector("h4").textContent;
      const { redirectUri, accessTokenValidity } = extractAppData(oauthAppBox);

      openEditAppModal(appId, appName, redirectUri, accessTokenValidity);
    }
  });

  document.getElementById("edit-app-form").addEventListener("submit", async (event) => {
    event.preventDefault();
    await updateApp();
  });

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

  let allApps = [];

  function displayOAuthApps(data) {
    allApps = data.oauthApps;
    const searchInput = document.getElementById("search-oauth-apps");
    const list = document.getElementById("oauth-apps-container");

    const renderList = (filter = "") => {
      list.innerHTML = "";
      const lowerFilter = filter.toLowerCase();
      allApps
        .filter(app =>
          app.oauthAppName.toLowerCase().includes(lowerFilter) ||
          app.redirectUri.toLowerCase().includes(lowerFilter) ||
          app.clientId.toLowerCase().includes(lowerFilter)
        )
        .forEach(app => {
          const appBox = createAppBox(app);
          list.appendChild(appBox);
          attachCopyListeners(app);
        });
    };

    renderList();

    if (searchInput) {
      if (searchInput._handler) {
        searchInput.removeEventListener("input", searchInput._handler);
      }
      const handler = (e) => renderList(e.target.value);
      searchInput.addEventListener("input", handler);
      searchInput._handler = handler;
    }
  }

  function createAppBox(app) {
    const appBox = document.createElement("div");
    appBox.className = "oauth-app-box bg-gray-900 p-4 rounded-lg shadow hover:shadow-lg transition mb-4 duration-300";
    appBox.id = `${app.oauthClientAppId}`;

    const isPublic = app.isPublicClient;
    const secretId = `client-secret-value-${app.clientSecret}`;
    const secretField = `
    <p class="mt-2"><strong>Client Secret:</strong>
      <span id="${secretId}" class="hidden">${app.clientSecret}</span>
      <button class="ml-2 text-sm text-blue-400 hover:underline" onclick="toggleSecret('${secretId}', this)">Show</button>
      <img src="./svg/clipboard.svg" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75" id="clipboard-client-secret-${app.clientSecret}">
    </p>
  `;

    appBox.innerHTML = `
    <div class="flex justify-between items-start">
      <div class="pr-2 overflow-hidden">
        <h4 class="text-lg font-bold mb-1 truncate">${app.oauthAppName}</h4>
        <p><strong>Client ID:</strong> <span id="client-id-value-${app.clientId}">${app.clientId}</span>
          <img src="./svg/clipboard.svg" class="inline-block w-4 h-4 ml-2 cursor-pointer hover:opacity-75" id="clipboard-client-id-${app.clientId}">
        </p>
        ${!isPublic ? secretField : ""}
        <p><strong>Redirect URI:</strong> ${app.redirectUri}</p>
        <p><strong>Access Token Validity (Seconds):</strong> ${app.accessTokenValidity}</p>
        <p><strong>Public Client:</strong> ${isPublic ? "Yes" : "No"}</p>
      </div>
      <div class="flex flex-col items-end space-y-2 pl-2">
        <img src="./svg/edit-app.svg" title="Edit App" class="w-5 h-5 cursor-pointer edit-app-button" id="edit-app-${app.oauthClientAppId}">
        <img src="./svg/edit-roles.svg" title="Edit Roles" class="w-5 h-5 cursor-pointer edit-roles-button" id="edit-roles-${app.oauthClientAppId}">
        <img src="./svg/trash.svg" title="Delete" class="w-5 h-5 cursor-pointer delete-button" id="delete-${app.oauthClientAppId}">
      </div>
    </div>
  `;

    return appBox;
  }

  function attachCopyListeners(app) {
    const clientIdBtn = document.getElementById(`clipboard-client-id-${app.clientId}`);
    if (clientIdBtn) {
      clientIdBtn.addEventListener("click", () => copyTextToClipboard(`client-id-value-${app.clientId}`));
    }

    if (!app.isPublicClient) {
      const secretBtn = document.getElementById(`clipboard-client-secret-${app.clientSecret}`);
      if (secretBtn) {
        secretBtn.addEventListener("click", () => copyTextToClipboard(`client-secret-value-${app.clientSecret}`));
      }
    }
  }

  async function createApp() {
    const nameField = document.getElementById("appname-field");
    const redirectField = document.getElementById("redirecturl-field");
    const tokenValidityField = document.getElementById("access-token-validity-field");
    const publicToggle = document.getElementById("public-client-toggle");

    const oauthAppName = nameField.value;
    const redirectUri = redirectField.value;
    const accessTokenValidity = tokenValidityField.value;
    const isPublicClient = publicToggle.checked;

    try {
      const response = await fetch(`/api/oauth/settings/apps/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ oauthAppName, redirectUri, accessTokenValidity, isPublicClient }),
      });

      if (!response.ok) {
        displayAlertError("Error: Failed to create app. Please check the input fields.");
        return;
      }

      const data = await response.json();
      const container = document.getElementById("oauth-apps-container");
      const newAppBox = createAppBox(data);
      container.appendChild(newAppBox);
      attachCopyListeners(data);

      nameField.value = "";
      redirectField.value = "";
      tokenValidityField.value = "";
      publicToggle.checked = false;

      document.getElementById("create-app-modal").close();
      displayAlertSuccess("App created successfully");
    } catch (err) {
      console.error("Error creating app:", err);
      displayAlertError("Error: Failed to create app. Please check the input fields.");
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
          } else if (text.startsWith("Access Token Validity (Seconds):")) {
            p.innerHTML = `<strong>Access Token Validity (Seconds):</strong> ${accessTokenValidity}`;
          }
        });
      }

      await fetchData();

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
      } else if (text.startsWith("Access Token Validity (Seconds):")) {
        accessTokenValidity = text.split(": ")[1];
      }
    });
    return { redirectUri, accessTokenValidity };
  }
});


function toggleSecret(id, btn) {
  const el = document.getElementById(id);
  if (!el) return;
  const isHidden = el.classList.contains("hidden");
  el.classList.toggle("hidden");
  btn.textContent = isHidden ? "Hide" : "Show";
}