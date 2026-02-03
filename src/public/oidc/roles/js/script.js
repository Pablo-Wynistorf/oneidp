let allOAuthApps = [];
let allRoles = [];
let selectedAppId = null;

async function fetchOAuthApps() {
  try {
    const response = await fetch("/api/oauth/settings/apps/get", {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    });
    if (!response.ok) {
      handleResponse(response);
      return;
    }
    const data = await response.json();
    allOAuthApps = data.oauthApps || [];
    displayOAuthApps(data);
  } catch (error) {
    displayAlertError("Error fetching OAuth apps: " + error.message);
  }
}

function displayOAuthApps(data) {
  const searchInput = document.getElementById("app-search-input");
  const dropdown = document.getElementById("app-dropdown");
  const selectedAppDisplay = document.getElementById("selected-app-display");
  
  function renderAppDropdown(filter = "") {
    dropdown.innerHTML = "";
    const lowerFilter = filter.toLowerCase();
    const filteredApps = allOAuthApps.filter(app =>
      app.oauthAppName.toLowerCase().includes(lowerFilter) ||
      app.clientId.toLowerCase().includes(lowerFilter)
    );
    
    if (filteredApps.length === 0) {
      const noResults = document.createElement("div");
      noResults.className = "p-3 text-gray-400 text-center";
      noResults.textContent = "No apps found";
      dropdown.appendChild(noResults);
    } else {
      filteredApps.forEach(app => {
        const item = document.createElement("div");
        item.className = "p-3 hover:bg-gray-700 cursor-pointer text-white transition-colors";
        item.innerHTML = `
          <div class="font-medium">${app.oauthAppName}</div>
          <div class="text-xs text-gray-400 truncate">${app.clientId}</div>
        `;
        item.addEventListener("click", () => selectApp(app));
        dropdown.appendChild(item);
      });
    }
  }
  
  function selectApp(app) {
    selectedAppId = app.oauthClientAppId;
    selectedAppDisplay.innerHTML = `
      <span class="font-medium">${app.oauthAppName}</span>
      <button id="clear-app-selection" class="ml-2 text-gray-400 hover:text-white">&times;</button>
    `;
    selectedAppDisplay.classList.remove("hidden");
    searchInput.value = "";
    dropdown.classList.add("hidden");
    
    document.getElementById("clear-app-selection").addEventListener("click", (e) => {
      e.stopPropagation();
      clearAppSelection();
    });
    
    currentRole = null;
    displayOAuthRoles({ oauthRoles: [] });
    fetchData(selectedAppId);
    
    const url = new URL(window.location);
    url.searchParams.set("oauthAppId", selectedAppId);
    history.pushState({}, '', url);
  }
  
  function clearAppSelection() {
    selectedAppId = null;
    selectedAppDisplay.classList.add("hidden");
    selectedAppDisplay.innerHTML = "";
    searchInput.value = "";
    displayOAuthRoles({ oauthRoles: [] });
    
    const url = new URL(window.location);
    url.searchParams.delete("oauthAppId");
    history.pushState({}, '', url);
  }
  
  // Search input handlers
  searchInput.addEventListener("focus", () => {
    renderAppDropdown(searchInput.value);
    dropdown.classList.remove("hidden");
  });
  
  searchInput.addEventListener("input", (e) => {
    renderAppDropdown(e.target.value);
    dropdown.classList.remove("hidden");
  });
  
  // Close dropdown when clicking outside
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#app-selector-container")) {
      dropdown.classList.add("hidden");
    }
  });

  // Check URL params for pre-selected app
  const urlParams = new URLSearchParams(window.location.search);
  const urlAppId = urlParams.get("oauthAppId");
  if (urlAppId) {
    const app = allOAuthApps.find(a => a.oauthClientAppId == urlAppId);
    if (app) {
      selectApp(app);
    }
  }
}

async function fetchData(oauthClientAppId) {
  try {
    const response = await fetch("/api/oauth/settings/roles/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oauthClientAppId }),
    });
    if (!response.ok) {
      handleResponse(response);
      return;
    }
    const data = await response.json();
    allRoles = data.oauthRoles || [];
    displayOAuthRoles(data);
    setupRoleSearch();
  } catch (error) {
    displayAlertError("Error fetching data: " + error.message);
  }
}

function setupRoleSearch() {
  const searchInput = document.getElementById("role-search-input");
  if (!searchInput) return;
  
  if (searchInput._handler) {
    searchInput.removeEventListener("input", searchInput._handler);
  }
  
  const handler = (e) => {
    const filter = e.target.value.toLowerCase();
    const filteredRoles = allRoles.filter(role =>
      role.oauthRoleName.toLowerCase().includes(filter) ||
      role.oauthRoleId.toLowerCase().includes(filter)
    );
    displayOAuthRoles({ oauthRoles: filteredRoles });
  };
  
  searchInput.addEventListener("input", handler);
  searchInput._handler = handler;
}

let currentRole = null;

function displayOAuthRoles(data) {
  const tableBody = document.querySelector('#oauth-apps-container tbody');
  tableBody.innerHTML = ''; // Clear previous roles

  data.oauthRoles.forEach(role => {
    const row = document.createElement('tr');

    // Role ID
    const roleIdCell = document.createElement('td');
    roleIdCell.className = "py-2 px-4 border-b border-gray-600";
    roleIdCell.textContent = role.oauthRoleId;
    row.appendChild(roleIdCell);

    // Role Name
    const roleNameCell = document.createElement('td');
    roleNameCell.className = "py-2 px-4 border-b border-gray-600";
    roleNameCell.textContent = role.oauthRoleName;
    row.appendChild(roleNameCell);

    // User IDs (Edit button)
    const userIdsCell = document.createElement('td');
    userIdsCell.className = "py-2 px-4 border-b border-gray-600";
    userIdsCell.innerHTML = `
      <button class="text-blue-500 hover:underline" onclick='openJsonDialog("${role.oauthRoleId}", "${role.oauthClientAppId}")'>Edit</button>
    `;
    row.appendChild(userIdsCell);

    const actionsCell = document.createElement('td');
    actionsCell.className = "py-2 px-4 border-b border-gray-600 text-center";
    actionsCell.innerHTML = `
        <button class="px-2 py-1 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700" onclick="confirmDeleteRole('${role.oauthRoleId}')">Delete Role</button>
    `;
    row.appendChild(actionsCell);

    tableBody.appendChild(row);
  });
}

async function openJsonDialog(roleId, oauthClientAppId) {
  currentRole = { oauthRoleId: roleId, oauthClientAppId: oauthClientAppId };

  try {
    const response = await fetch(`/api/oauth/settings/roles/get-users`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oauthRoleId: roleId, oauthClientAppId: oauthClientAppId }),
    });

    if (!response.ok) {
      displayAlertError("Error fetching user data");
      return;
    }

    const data = await response.json();
    populateJsonDialog(data);

    const dialog = document.getElementById('json-dialog');
    if (dialog.showModal) {
      dialog.showModal();
    } else {
      displayAlertError('Dialog not supported in this browser');
    }
  } catch (error) {
    displayAlertError("Error: " + error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // Handle OAuth Display Toggle
  const toggleOAuthDisplay = document.getElementById('toggle-oauth-display');
  const oauthDisplaySlider = toggleOAuthDisplay.nextElementSibling.querySelector('span:nth-child(1)');
  const jsonInput = document.getElementById('json-input');

  const updateOAuthDisplayUI = () => {
    if (toggleOAuthDisplay.checked) {
      oauthDisplaySlider.classList.replace('bg-gray-400', 'bg-blue-500');
    } else {
      oauthDisplaySlider.classList.replace('bg-blue-500', 'bg-gray-400');
    }
  };

  updateOAuthDisplayUI();
  toggleOAuthDisplay.addEventListener('change', () => {
    updateOAuthDisplayUI();
    const parsedData = {
      oauthUserIds: JSON.parse(jsonInput.dataset.userIds || '{"oauthUserIds": []}').oauthUserIds,
      oauthUserNames: JSON.parse(jsonInput.dataset.userNames || '{"oauthUserNames": []}').oauthUserNames,
    };
    populateJsonDialog(parsedData);
  });

  // Handle Role Action Toggle
  const toggleRoleAction = document.getElementById('toggle-role-action');
  const actionButton = document.getElementById('dynamic-action-button');

  const updateRoleActionUI = () => {
    if (toggleRoleAction.checked) {
      actionButton.classList.replace('bg-blue-600', 'bg-red-600');
      actionButton.textContent = 'Remove User';
      actionButton.onclick = handleRemoveUser;
    } else {
      actionButton.classList.replace('bg-red-600', 'bg-blue-600');
      actionButton.textContent = 'Add User';
      actionButton.onclick = handleAddUser;
    }
  };

  updateRoleActionUI();
  toggleRoleAction.addEventListener('change', updateRoleActionUI);
});



document.getElementById('toggle-oauth-display').addEventListener('change', function () {
  const jsonInput = document.getElementById('json-input');
  const parsedData = {
    oauthUserIds: JSON.parse(jsonInput.dataset.userIds || '{"oauthUserIds": []}').oauthUserIds,
    oauthUserNames: JSON.parse(jsonInput.dataset.userNames || '{"oauthUserNames": []}').oauthUserNames,
  };

  populateJsonDialog(parsedData);
});



function populateJsonDialog(data) {
  const jsonInput = document.getElementById('json-input');
  const toggleDisplay = document.getElementById('toggle-oauth-display');

  jsonInput.dataset.userIds = JSON.stringify({ oauthUserIds: data.oauthUserIds || [] }, null, 2);
  jsonInput.dataset.userNames = JSON.stringify({ oauthUserNames: data.oauthUserNames || [] }, null, 2);

  if (toggleDisplay.checked) {
    jsonInput.value = jsonInput.dataset.userNames;
  } else {
    jsonInput.value = jsonInput.dataset.userIds;
  }
}





function closeDialog() {
  const dialog = document.getElementById('json-dialog');
  if (dialog.close) {
      dialog.close();
  }
}


document.getElementById('save-bulk-edit-button').addEventListener('click', async () => {
  const jsonInput = document.getElementById('json-input').value;
  const toggleDisplay = document.getElementById('toggle-oauth-display').checked;

  try {
    const parsedInput = JSON.parse(jsonInput);
    let updatePayload;

    if (toggleDisplay) {
      if (!Array.isArray(parsedInput.oauthUserNames)) {
        return displayAlertError("Input must be a valid JSON object with an array under 'oauthUserNames'.");
      }
      updatePayload = {
        oauthRoleId: currentRole.oauthRoleId,
        oauthClientAppId: currentRole.oauthClientAppId,
        oauthRoleUserNames: parsedInput.oauthUserNames,
      };
    } else {
      if (!Array.isArray(parsedInput.oauthUserIds)) {
        return displayAlertError("Input must be a valid JSON object with an array under 'oauthUserIds'.");
      }
      updatePayload = {
        oauthRoleId: currentRole.oauthRoleId,
        oauthClientAppId: currentRole.oauthClientAppId,
        oauthRoleUserIds: parsedInput.oauthUserIds,
      };
    }

    const response = await fetch('/api/oauth/settings/roles/update/bulk-update', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updatePayload),
    });

    if (!response.ok) {
      return displayAlertError(await response.text());
    }

    const updatedRole = await response.json();
    populateJsonDialog(updatedRole);
    displayAlertSuccess("User updated successfully");

    const dialog = document.getElementById('json-dialog');
    if (dialog.close) {
      dialog.close();
    }
  } catch (error) {
    displayAlertError("Error: " + error.message);
  }
});


document.addEventListener('DOMContentLoaded', () => {
  const updateRoleActionUI = () => {
      const toggleRoleAction = document.getElementById('toggle-role-action');
      const dynamicActionButton = document.getElementById('dynamic-action-button');
      const sliderRoleAction = toggleRoleAction.nextElementSibling.querySelector('span:nth-child(1)');

      if (toggleRoleAction.checked) {
          sliderRoleAction.classList.replace('bg-gray-400', 'bg-blue-500');
          dynamicActionButton.classList.replace('bg-blue-600', 'bg-red-600');
          dynamicActionButton.textContent = 'Remove User';
          dynamicActionButton.onclick = handleRemoveUser;
      } else {
          sliderRoleAction.classList.replace('bg-blue-500', 'bg-gray-400');
          dynamicActionButton.classList.replace('bg-red-600', 'bg-blue-600');
          dynamicActionButton.textContent = 'Add User';
          dynamicActionButton.onclick = handleAddUser;
      }
  };

  const toggleRoleAction = document.getElementById('toggle-role-action');
  updateRoleActionUI();

  toggleRoleAction.addEventListener('change', updateRoleActionUI);

  const updateOauthDisplayUI = () => {
      const toggleOauthDisplay = document.getElementById('toggle-oauth-display');
      const sliderOauthDisplay = toggleOauthDisplay.nextElementSibling.querySelector('span:nth-child(1)');

      if (toggleOauthDisplay.checked) {
          sliderOauthDisplay.classList.replace('bg-gray-400', 'bg-blue-500');
      } else {
          sliderOauthDisplay.classList.replace('bg-blue-500', 'bg-gray-400');
      }
  };

  const toggleOauthDisplay = document.getElementById('toggle-oauth-display');
  updateOauthDisplayUI();

  toggleOauthDisplay.addEventListener('change', updateOauthDisplayUI);
});



async function handleAddUser() {
  const userIdOrUsername = document.getElementById('userid_or_username').value;
  document.getElementById('userid_or_username').value = '';

  try {
    const response = await fetch('/api/oauth/settings/roles/update/add-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oauthRoleId: currentRole.oauthRoleId,
        oauthClientAppId: currentRole.oauthClientAppId,
        userId_or_username: userIdOrUsername,
      }),
    });

    const updatedRole = await response.json();
    const errorMessage = updatedRole.error;
    const message = updatedRole.message;

    if (!response.ok) {
      return displayAlertError(errorMessage);
    }

    populateJsonDialog(updatedRole);
    displayAlertSuccess(message);
    return closeDialog();
  } catch (error) {
    displayAlertError(errorMessage);
  }
}
async function handleRemoveUser() {
  const userIdOrUsername = document.getElementById('userid_or_username').value;
  document.getElementById('userid_or_username').value = '';

  try {
    const response = await fetch('/api/oauth/settings/roles/update/remove-user', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        oauthRoleId: currentRole.oauthRoleId,
        oauthClientAppId: currentRole.oauthClientAppId,
        userId_or_username: userIdOrUsername,
      }),
    });

    const updatedRole = await response.json();
    const errorMessage = updatedRole.error;
    const message = updatedRole.message;

    if (!response.ok) {
      return displayAlertError(errorMessage);
    }

    populateJsonDialog(updatedRole);
    displayAlertSuccess(message);
    return closeDialog();
  } catch (error) {
    displayAlertError(errorMessage);
  }
}


document.addEventListener('DOMContentLoaded', () => {
  function closeDialog(dialog) {
      dialog.close();
  }

  document.querySelectorAll('[data-close-modal]').forEach(button => {
      button.addEventListener('click', () => {
          const dialog = button.closest('dialog');
          closeDialog(dialog);
      });
  });

  document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
          const openDialog = document.querySelector('dialog[open]');
          if (openDialog) {
              closeDialog(openDialog);
          }
      }
  });
});

function confirmDeleteRole(roleId) {
  const dialog = document.getElementById('delete-role-dialog');
  
  if (!dialog.showModal) {
    displayAlertError('Dialog not supported in this browser');
    return;
  }
  
  dialog.showModal();
  
  document.getElementById('delete-button').onclick = async () => {
    try {
      const oauthClientAppId = selectedAppId;
      const response = await fetch("/api/oauth/settings/roles/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ oauthClientAppId, oauthRoleId: roleId }),
      });

      if (!response.ok) {
        handleResponse(response);
        return;
      }

      dialog.close();
      removeRoleFromTable(roleId);
      displayAlertSuccess("Role deleted successfully");
    } catch (error) {
      displayAlertError("Something went wrong: " + error.message);
    }
  };
  
  document.querySelector('dialog[data-modal]').addEventListener('click', (event) => {
    if (event.target.hasAttribute('data-close-modal')) {
      dialog.close();
    }
  });
}

function removeRoleFromTable(roleId) {
  const tableBody = document.querySelector('#oauth-apps-container tbody');
  const rows = tableBody.querySelectorAll('tr');

  rows.forEach(row => {
    const idCell = row.querySelector('td:first-child');
    if (idCell && idCell.textContent === roleId) {
      row.remove();
    }
  });
}

function handleResponse(response) {
  if (response.status === 404) {
  }
}

document.addEventListener("DOMContentLoaded", () => {
  fetchOAuthApps();
});

document.getElementById('create-role-button').addEventListener('click', () => {
  const dialog = document.getElementById('create-role-dialog');
  if (dialog.showModal) {
    dialog.showModal();
  } else {
    displayAlertError('Dialog not supported in this browser');
  }
});

document.getElementById('create-role-submit').addEventListener('click', async () => {
  const roleNameInput = document.getElementById('new-role-name').value.trim();
    document.getElementById('new-role-name').value = '';
  if (!roleNameInput) {
    displayAlertError('Please enter a role name');
    return;
  }

  const oauthClientAppId = selectedAppId;
  if (!oauthClientAppId) {
    displayAlertError('Please select an OAuth application');
    return;
  }

  try {
    const response = await fetch('/api/oauth/settings/roles/add', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        oauthClientAppId,
        oauthRoleName: roleNameInput,
      }),
    });

    if (!response.ok) {
      return displayAlertError(await response.text());
    }

    const newRole = await response.json();
    document.getElementById('create-role-dialog').close();
    displayAlertSuccess("Role created successfully");
    fetchData(oauthClientAppId); // Refresh the roles list
  } catch (error) {
    displayAlertError("Error: " + error.message);
  }
});


let timeout;

document.getElementById('userid_or_username').addEventListener('input', function() {
    const query = this.value;

    // Clear the timeout if it exists
    clearTimeout(timeout);

    // Set a new timeout to wait before making the API call
    timeout = setTimeout(async () => {
        if (query.length > 0 && selectedAppId) {
            try {
                const response = await fetch(`/api/oauth/users/search?query=${encodeURIComponent(query)}&oauthClientAppId=${encodeURIComponent(selectedAppId)}`);
                const users = await response.json();
                if (response.ok) {
                    showUserSuggestions(users);
                } else {
                    console.error('Error fetching users:', users.error);
                }
            } catch (error) {
                console.error('Error:', error);
            }
        } else {
            clearUserSuggestions();
        }
    }, 300); // Wait 300ms after the user stops typing
});

function showUserSuggestions(users) {
  const suggestionBox = document.getElementById('user-suggestions');
  suggestionBox.innerHTML = '';

  // Access the `userName` array inside the `users` object
  if (users.userName && Array.isArray(users.userName)) {
      users.userName.forEach(username => {
          const suggestionItem = document.createElement('div');
          suggestionItem.classList.add('p-2', 'cursor-pointer', 'hover:bg-gray-700', 'text-white');
          suggestionItem.textContent = username;
          suggestionItem.addEventListener('click', () => {
              document.getElementById('userid_or_username').value = username;
              clearUserSuggestions();
          });
          suggestionBox.appendChild(suggestionItem);
      });
  }

  suggestionBox.classList.remove('hidden');
}


function clearUserSuggestions() {
    const suggestionBox = document.getElementById('user-suggestions');
    suggestionBox.innerHTML = '';
    suggestionBox.classList.add('hidden');
}
