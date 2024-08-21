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
    displayOAuthApps(data);
  } catch (error) {
    displayAlertError("Error fetching OAuth apps: " + error.message);
  }
}

function displayOAuthApps(data) {
  const select = document.getElementById("oauth-app-select");
  select.innerHTML = ""; // Clear existing options

  data.oauthApps.forEach(app => {
    const option = document.createElement("option");
    option.value = app.oauthClientAppId;
    option.textContent = app.oauthAppName;
    option.className = "text-white bg-gray-900";
    select.appendChild(option);
  });

  select.value = ""; // No option is selected initially

  select.addEventListener("change", async () => {
    const selectedAppId = select.value;
    if (selectedAppId) {
      currentRole = null; // Reset currentRole to ensure no stale data persists
      displayOAuthRoles({ oauthRoles: [] }); // Clear existing roles
      await fetchData(selectedAppId);
      const url = new URL(window.location);
      url.searchParams.set("oauthAppId", selectedAppId);
      history.pushState({}, '', url);
    }
  });

  const urlParams = new URLSearchParams(window.location.search);
  const selectedAppId = urlParams.get("oauthAppId");
  if (selectedAppId) {
    select.value = selectedAppId;
    fetchData(selectedAppId);
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
    displayOAuthRoles(data);
  } catch (error) {
    displayAlertError("Error fetching data: " + error.message);
  }
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

    // Actions (Delete Role)
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
      displayAlertError('Dialog not supported in this browser'); // Fallback for unsupported browsers
    }
  } catch (error) {
    displayAlertError("Error: " + error.message);
  }
}

document.addEventListener('DOMContentLoaded', () => {
  const toggleCheckbox = document.getElementById('toggle-oauth-display');
  const slider = toggleCheckbox.nextElementSibling.querySelector('span:nth-child(1)');
  const sliderCircle = toggleCheckbox.nextElementSibling.querySelector('span:nth-child(2)');
  const jsonInput = document.getElementById('json-input');

  // Update UI based on toggle state
  const updateUI = () => {
    if (toggleCheckbox.checked) {
      slider.classList.replace('bg-gray-400', 'bg-blue-500');
      sliderCircle.classList.replace('transform', 'translate-x-6');
    } else {
      slider.classList.replace('bg-blue-500', 'bg-gray-400');
      sliderCircle.classList.replace('translate-x-6', 'transform');
    }
  };

  updateUI();

  toggleCheckbox.addEventListener('change', updateUI);
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
      // Usernames are displayed
      if (!Array.isArray(parsedInput.oauthUserNames)) {
        return displayAlertError("Input must be a valid JSON object with an array under 'oauthUserNames'.");
      }
      updatePayload = {
        oauthRoleId: currentRole.oauthRoleId,
        oauthClientAppId: currentRole.oauthClientAppId,
        oauthRoleUserNames: parsedInput.oauthUserNames,
      };
    } else {
      // User IDs are displayed
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
  const toggleCheckbox = document.getElementById('toggle-role-action');
  const actionButton = document.getElementById('dynamic-action-button');

  // Function to update the UI based on the toggle state
  const updateUI = () => {
    if (toggleCheckbox.checked) {
      // Toggle is on
      actionButton.classList.replace('bg-blue-600', 'bg-red-600');
      actionButton.textContent = 'Remove User';
      actionButton.onclick = handleRemoveUser;
    } else {
      // Toggle is off
      actionButton.classList.replace('bg-red-600', 'bg-blue-600');
      actionButton.textContent = 'Add User';
      actionButton.onclick = handleAddUser;
    }
  };

  // Initial UI update
  updateUI();

  // Update UI when toggle changes
  toggleCheckbox.addEventListener('change', updateUI);
});

// Handler for Add User button
function handleAddUser() {
  // Your existing logic to add a user
  const userIdOrUsername = document.getElementById('userid_or_username').value;
  document.getElementById('userid_or_username').value = '';

  fetch('/api/oauth/settings/roles/update/add-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oauthRoleId: currentRole.oauthRoleId,
      oauthClientAppId: currentRole.oauthClientAppId,
      userId_or_username: userIdOrUsername,
    }),
  })
  .then(response => response.json())
  .then(updatedRole => {
    populateJsonDialog(updatedRole);
    displayAlertSuccess("User added successfully");
  })
  .catch(error => displayAlertError("Error: " + error.message));
}

function handleRemoveUser() {
  const userIdOrUsername = document.getElementById('userid_or_username').value;
  document.getElementById('userid_or_username').value = '';

  fetch('/api/oauth/settings/roles/update/remove-user', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      oauthRoleId: currentRole.oauthRoleId,
      oauthClientAppId: currentRole.oauthClientAppId,
      userId_or_username: userIdOrUsername,
    }),
  })
  .then(response => response.json())
  .then(updatedRole => {
    populateJsonDialog(updatedRole);
    displayAlertSuccess("User removed successfully");
  })
  .catch(error => displayAlertError("Error: " + error.message));
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
      const oauthClientAppId = document.getElementById('oauth-app-select').value;
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
    dialog.showModal(); // Show the dialog
  } else {
    displayAlertError('Dialog not supported in this browser'); // Fallback for unsupported browsers
  }
});

document.getElementById('create-role-submit').addEventListener('click', async () => {
  const roleNameInput = document.getElementById('new-role-name').value.trim();
    document.getElementById('new-role-name').value = '';
  if (!roleNameInput) {
    displayAlertError('Please enter a role name');
    return;
  }

  const oauthClientAppId = document.getElementById('oauth-app-select').value;
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