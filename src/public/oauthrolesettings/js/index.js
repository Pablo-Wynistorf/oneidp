const errorBox = document.createElement("div");
const successBox = document.createElement("div");

errorBox.className = "error-box";
successBox.className = "success-box";


async function fetchData() {
  try {
    const oauthClientAppId = window.location.search.split("=")[1];
    if (!oauthClientAppId) {
      return window.location.replace("/home/oauth/settings");
    }
    const response = await fetch("/api/oauth/settings/roles/get", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oauthClientAppId }),
    });
    if (!response.ok) {
      handleResponse(response);
    }
    const data = await response.json();
    displayOAuthRoles(data);
  } catch (error) {}
}

async function addRole() {
  try {
    const oauthClientAppId = window.location.search.split("=")[1];
    const oauthRoleName = document.getElementById("role-name").value;
    if (!oauthRoleName) {
      return displayError("Role name is required");
    }
    const response = await fetch("/api/oauth/settings/roles/add", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ oauthClientAppId, oauthRoleName }),
    });
    if (!response.ok) {
      return handleResponse(response);
    }
    await fetchData();
    closeModal();
    displaySuccess("Role added successfully");
  } catch (error) {
    displayError("Something went wrong");
  }
}


function displayOAuthRoles(data) {
  const tableBody = document.querySelector('tbody');
  tableBody.innerHTML = ''; // Clear existing rows
  
  data.oauthRoles.forEach(role => {
    const row = document.createElement('tr');
    
    // Role Id
    const roleIdCell = document.createElement('td');
    roleIdCell.textContent = role.oauthRoleId;
    roleIdCell.classList.add('whitespace-nowrap', 'py-4', 'pl-4', 'pr-3', 'text-sm', 'font-medium', 'text-gray-900', 'sm:pl-6');
    row.appendChild(roleIdCell);
    
    // Role Name
    const roleNameCell = document.createElement('td');
    roleNameCell.textContent = role.oauthRoleName;
    roleNameCell.classList.add('whitespace-nowrap', 'px-3', 'py-4', 'text-sm', 'text-gray-500');
    row.appendChild(roleNameCell);
    
    // User Ids
    const userIdsCell = document.createElement('td');
    userIdsCell.textContent = role.oauthUserIds.join(', ');
    userIdsCell.classList.add('whitespace-nowrap', 'px-3', 'py-4', 'text-sm', 'text-gray-500');
    row.appendChild(userIdsCell);
    
    // Edit Link
    const editCell = document.createElement('td');
    const editLink = document.createElement('a');
    editLink.href = '#';
    editLink.textContent = 'Edit';
    editLink.classList.add('text-indigo-600', 'hover:text-indigo-900');
    editCell.appendChild(editLink);
    editCell.classList.add('relative', 'whitespace-nowrap', 'py-4', 'pl-3', 'pr-4', 'text-right', 'text-sm', 'font-medium', 'sm:pr-6');
    row.appendChild(editCell);
    
    tableBody.appendChild(row);
  });
}

const modal = document.getElementById("add-role");

function openModal() {
    modal.showModal();
};

function closeModal() {
    modal.close();
};





function handleResponse(response) {
  if (response.status === 200) {
  } else if (response.status === 404) {
    return handle404Error();
  } else if (response.status === 460) {
    return handle460Error();
  } else if (response.status === 461) {
    return handle461Error();
  } else if (response.status === 462) {
    return handle462Error();
  } else if (response.status === 463) {
    return handle463Error();
  } else {
    handleError();
  }
}

function handle404Error() {
  displayError("Error: No oauth apps found for this user");
}

function handle460Error() {
  displayError("Error: User has no permissions to manage oauth apps");
}

function handle461Error() {
  displayError("Error: User has no permissions to manage this oauth app");
}

function handle462Error() {
  displayError("Error: Invalid role name")
}

function handle463Error() {
  displayError("Error: Role already exists")
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
