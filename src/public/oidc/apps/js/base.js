document.addEventListener('DOMContentLoaded', function() {
  const logoutButton = document.getElementById('logout-button');
  if (logoutButton) {
    logoutButton.addEventListener('click', logout);
  }
});

async function logout() {
  try {
    const response = await fetch(`/api/auth/logout`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (response.ok) {
      window.location.href = '/login';
    } else {
      handleError();
    }
  } catch (error) {
    console.error('Logout error:', error);
    handleError();
  }
}


function displayAlertSuccess(message) {
new Noty({
    text: message,
    type: 'success',
    layout: 'topRight',
    timeout: 5000,
    theme: 'metroui',
    progressBar: true
}).show();
}

function displayAlertError(message) {
new Noty({
    text: message,
    type: 'error',
    layout: 'topRight',
    timeout: 5000,
    theme: 'metroui',
    progressBar: true
}).show();
}

function handleError() {
displayAlertError('An unexpected error occurred.');
}


document.addEventListener('DOMContentLoaded', () => {
  const createAppModal = document.getElementById('create-app-modal');
  const openCreateModalBtn = document.getElementById('open-create-modal');
  const closeCreateModalBtn = document.getElementById('close-create-modal');

  openCreateModalBtn.addEventListener('click', () => {
      createAppModal.showModal();
  });

  closeCreateModalBtn.addEventListener('click', () => {
      createAppModal.close();
  });
});