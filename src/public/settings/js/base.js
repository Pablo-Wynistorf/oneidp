document.addEventListener('DOMContentLoaded', function() {
    const logoutButton = document.getElementById('logout-button');
    if (logoutButton) {
      logoutButton.addEventListener('click', logout);
    }
});

function logout() {
    try {
      fetch(`/api/auth/logout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      })
      .then(response => {
        if (response.ok) {
          window.location.href = '/login';
        } else {
          handleError();
        }
      })
    } catch (error) {
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