let mfaActivationCode;

document.addEventListener("DOMContentLoaded", function () {
  fetchUserData();
  fetchActiveSessions();
});


function fetchUserData() {
  try {
    fetch(`/api/oauth/userinfo`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        updateMfaBox(data.mfaEnabled);
        updatePasskeyBox(data.passkeyEnabled);
      })
      .catch((error) => {
        handleError();
        window.location.href = "/login";
      });
  } catch (error) {
    handleError();
  }
}

function updateMfaBox(isMfaEnabled) {
  const mfaBox = document.getElementById("mfa-box");
  mfaBox.innerHTML = "";

  if (isMfaEnabled) {
    const disableMfaButton = document.createElement("button");
    disableMfaButton.textContent = "Disable MFA";
    disableMfaButton.className =
      "w-full px-4 py-2 bg-red-700 text-white font-semibold rounded-md hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500";
    disableMfaButton.onclick = disableMfa;

    mfaBox.appendChild(disableMfaButton);
  } else {
    const enableMfaButton = document.createElement("button");
    enableMfaButton.textContent = "Enable MFA";
    enableMfaButton.className =
      "w-full px-4 py-2 bg-blue-700 text-white font-semibold rounded-md hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
    enableMfaButton.onclick = openMfaModal;

    mfaBox.appendChild(enableMfaButton);
  }
}

function updatePasskeyBox(isPasskeyEnabled) {
  const passkeyBox = document.getElementById("passkey-box");
  passkeyBox.innerHTML = "";

  if (isPasskeyEnabled) {
    const deletePasskeyButton = document.createElement("button");
    deletePasskeyButton.textContent = "Delete Passkey";
    deletePasskeyButton.className =
      "w-full px-4 py-2 bg-red-700 text-white font-semibold rounded-md hover:bg-red-800 focus:outline-none focus:ring-2 focus:ring-red-500";
    deletePasskeyButton.onclick = deletePasskey;

    passkeyBox.appendChild(deletePasskeyButton);
  } else {
    const enablePasskeyButton = document.createElement("button");
    enablePasskeyButton.textContent = "Enable Passkey";
    enablePasskeyButton.id = "passkey-button";
    enablePasskeyButton.className =
      "w-full px-4 py-2 bg-blue-700 text-white font-semibold rounded-md hover:bg-blue-800 focus:outline-none focus:ring-2 focus:ring-blue-500";
    enablePasskeyButton.onclick = enablePasskey;

    passkeyBox.appendChild(enablePasskeyButton);
  }

}

function openMfaModal() {
  const mfaModal = document.getElementById("mfa-modal");
  const mfaQrCode = document.getElementById("mfa-qr-code");
  const mfaCodeInput = document.getElementById("mfa-code");
  mfaModal.classList.remove("hidden");
  mfaModal.classList.add("flex");
  mfaCodeInput.focus();

  fetch("/api/auth/mfa/setup", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => response.json())
    .then((data) => {
      if (data.success) {
        mfaQrCode.src = data.imageUrl;
        mfaActivationCode = data.mfaActivationCode;
      } else {
        handleError();
      }
    })
    .catch((error) => handleError());

  mfaCodeInput.addEventListener("input", function () {
    if (mfaCodeInput.value.length === 6) {
      verifyMfaCode(mfaCodeInput.value, mfaModal);
    }
  });
}

function verifyMfaCode(code, modal) {
  fetch("/api/auth/mfa/setup/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ mfaVerifyCode: code }),
  })
    .then((response) => {
      if (response.ok) {
        modal.classList.add("hidden");
        displayAlertSuccess("MFA setup successfully.");
        fetchUserData();
      } else {
        displayAlertError("Invalid code.");
        document.getElementById("mfa-code").value = "";
      }
    })
    .catch(() => handleError());
}

function disableMfa() {
  fetch("/api/auth/mfa/disable", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
  })
    .then((response) => {
      if (response.ok) {
        displayAlertSuccess("MFA disabled successfully.");
        fetchUserData();
      } else {
        handleError();
      }
    })
    .catch(() => handleError());
}


function copyMfaActivationCode() {
  const textArea = document.createElement("textarea");
  textArea.value = mfaActivationCode;
  document.body.appendChild(textArea);
  textArea.select();
  document.execCommand("copy");
  document.body.removeChild(textArea);
  displayAlertSuccess("Activation code copied to clipboard.");
}

document
  .getElementById("close-mfa-modal")
  .addEventListener("click", function () {
    document.getElementById("mfa-modal").classList.add("hidden");
    document.getElementById("mfa-qr-code").src = "img/qr-code.png";
  });

function changePassword() {
  const currentPasswordInput = document.getElementById(
    "current-password-input"
  ).value;
  const newPasswordInput = document.getElementById("new-password-input").value;

  if (!currentPasswordInput || !newPasswordInput) {
    displayAlertError("Error: Both fields are required.");
    return;
  }

  try {
    fetch(`/api/auth/user/changepassword`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        currentPassword: currentPasswordInput,
        newPassword: newPasswordInput,
      }),
    }).then((response) => {
      if (response.ok) {
        document.getElementById("current-password-input").value = "";
        document.getElementById("new-password-input").value = "";
        displayAlertSuccess("Password changed successfully.");
      } else if (response.status === 460) {
        displayAlertError(
          "Error: Password must have at least 8 characters, contain at least one uppercase letter, one lowercase letter, one digit, and one special character"
        );
      } else if (response.status === 461) {
        displayAlertError("Error: Current password is incorrect");
      } else {
        handleError();
      }
    });
  } catch (error) {
    handleError();
  }
}

function logout_everywhere() {
  try {
    fetch(`/api/auth/logoutall`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => {
        if (response.ok) {
          window.location.href = "/login";
        } else {
          handleError();
        }
      })
      .catch((error) => {
        handleError();
      });
  } catch (error) {
    handleError();
  }
}

function fetchActiveSessions() {
  try {
    fetch(`/api/auth/user/session`, {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success && data.sessions) {
          displayActiveSessions(data.sessions);
        } else {
          handleError();
          window.location.href = "/login";
        }
      })
      .catch((error) => {
        handleError();
        window.location.href = "/login";
      });
  } catch (error) {
    handleError();
  }
}

function displayActiveSessions(sessions) {
  const activeSessionsContainer = document.getElementById(
    "active-sessions-container"
  );
  activeSessionsContainer.innerHTML = "";

  sessions.forEach((session) => {
    const sessionDiv = document.createElement("div");
    sessionDiv.classList.add(
      "p-4",
      "bg-gray-800",
      "rounded-md",
      "shadow-md",
      "flex",
      "justify-between",
      "items-center"
    );

    const logoutButton = session.currentSession === "false" 
      ? `<div class="cursor-pointer text-gray-300 hover:text-red-600" data-session-id="${session.sessionId}">
          <img src="svg/logout-session.svg" alt="Logout Session" width="24" height="24" />
        </div>` 
      : 'Current Session';

    sessionDiv.innerHTML = `
      <div>
        <p class="text-gray-300">Session ID: ${session.sessionId}</p>
        <p class="text-gray-300">Device: ${session.sessionData.deviceType}</p>
        <p class="text-gray-300">Source IP: ${session.sessionData.ipAddr}</p>
        <p class="text-gray-300">Login Time: ${new Date(
          session.sessionData.createdAt * 1000
        ).toLocaleString("en-US")}</p>
      </div>
      ${logoutButton}
    `;

    activeSessionsContainer.appendChild(sessionDiv);
  });

  document.querySelectorAll("div[data-session-id]").forEach((icon) => {
    icon.addEventListener("click", function () {
      const sessionId = this.getAttribute("data-session-id");
      logoutSession(sessionId);
    });
  });
}


function logoutSession(sessionId) {
  try {
    fetch(`/api/auth/user/session`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ sessionId }),
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success && data.sessions) {
          displayAlertSuccess("Session logged out successfully.");
          displayActiveSessions(data.sessions);
        } else {
          handleError();
          window.location.href = "/login";
        }
      })
      .catch((error) => {
        handleError();
        window.location.href = "/login";
      });
  } catch (error) {
    handleError();
  }
}


async function enablePasskey() {
      try {
        const res = await fetch("/api/auth/passkey/setup/generate", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        });

        if (!res.ok) throw new Error("Failed to generate registration options");

        const options = await res.json();

        // Convert base64 fields to ArrayBuffers
        options.challenge = base64urlToBuffer(options.challenge);
        options.user.id = base64urlToBuffer(options.user.id);

        const cred = await navigator.credentials.create({ publicKey: options });

        const credentialResponse = {
          id: cred.id,
          rawId: bufferToBase64url(cred.rawId),
          type: cred.type,
          response: {
            attestationObject: bufferToBase64url(cred.response.attestationObject),
            clientDataJSON: bufferToBase64url(cred.response.clientDataJSON),
          },
        };

        const verifyRes = await fetch("/api/auth/passkey/setup/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ response: credentialResponse }),
        });

        const verifyData = await verifyRes.json();

        if (verifyData.success) {
          displayAlertSuccess("Passkey registered successfully!");
          fetchUserData();
        } else {
          displayAlertError("Passkey registration failed: " + (verifyData.error || "Unknown error"));
        }
      } catch (err) {
        console.error("Passkey registration error:", err);
        displayAlertError("Passkey registration error: " + err.message);
      }
};

async function deletePasskey() {
  try {
    const res = await fetch("/api/auth/passkey/delete", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.ok) {
      displayAlertSuccess("Passkey deleted successfully.");
      fetchUserData();
    } else {
      handleError();
    }
  } catch (error) {
    handleError();
  }
}



function base64urlToBuffer(base64url) {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4);
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/') + padding;
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function bufferToBase64url(buffer) {
  return btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

