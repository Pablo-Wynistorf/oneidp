
document.addEventListener('DOMContentLoaded', () => {
  const emailField = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  const modal = document.getElementById('modal');
  const countdownElement = document.getElementById('countdown');
  const resendEmailButton = document.getElementById('resend-email');
  const redirectLoginButton = document.getElementById('redirect-login');

  let countdown;
  let countdownValue = 30;

  emailField.focus();

  emailField.addEventListener('keypress', function (e) {
    if (e.key === 'Enter') {
      e.preventDefault();
      recover();
    }
  });

  recoverButton.addEventListener('click', recover);
  resendEmailButton.addEventListener('click', resendEmail);
  redirectLoginButton.addEventListener('click', redirect_login);

  async function recover() {
    const resetEmailInput = emailField.value.trim();
    if (resetEmailInput === '') {
      alert('Please enter your email address.');
      return;
    }

    try {
      const response = await fetch('/api/auth/user/resetpassword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmailInput }),
      });

      if (response.ok) {
        openModal();
      } else {
        const errorMessage = await response.text();
        showError(errorMessage);
      }
    } catch (error) {
      showError('An error occurred. Please try again later.');
    }
  }

  function openModal() {
    modal.classList.remove('hidden');
    startCountdown();
  }

  function startCountdown() {
    countdownValue = 60;
    countdownElement.textContent = countdownValue;
    resendEmailButton.disabled = true;
    resendEmailButton.classList.add('bg-gray-300');
    resendEmailButton.classList.remove('hover:bg-blue-600');
    resendEmailButton.classList.add('cursor-not-allowed');

    countdown = setInterval(() => {
      countdownValue--;
      countdownElement.textContent = countdownValue;

      if (countdownValue <= 0) {
        clearInterval(countdown);
        resendEmailButton.classList.remove('bg-gray-300');
        resendEmailButton.classList.add('hover:bg-blue-600');
        resendEmailButton.classList.remove('cursor-not-allowed');
        resendEmailButton.disabled = false;
      }
    }, 1000);
  }

  async function resendEmail() {
    const resetEmailInput = emailField.value.trim();
    if (resetEmailInput === '') {
      alert('Please enter your email address.');
      return;
    }

    try {
      const response = await fetch('/api/auth/user/resetpassword', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email: resetEmailInput }),
      });

      if (response.ok) {
        countdownValue = 30; // Reset countdown value
        countdownElement.textContent = countdownValue;
        clearInterval(countdown); // Clear previous countdown
        startCountdown(); // Start a new countdown
      } else {
        const errorMessage = await response.text();
        showError(errorMessage);
      }
    } catch (error) {
      showError('An error occurred. Please try again later.');
    }
  }

function redirect_login() {
    const redirectUri = getRedirectUri();
    if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
      window.location.href = '/login';
    } else {
      window.location.href = `/login?redirectUri=${redirectUri}`;
    }
}

  function showError(message) {
    const alertMessage = document.getElementById('alert-message');
    alertMessage.textContent = message;
    document.getElementById('alert-box').classList.remove('hidden');
  }
});











function redirect_login() {
  const redirectUri = getRedirectUri();
  if (!redirectUri || redirectUri === 'null' || redirectUri === 'undefined') {
    window.location.href = '/login';
  } else {
    window.location.href = `/login?redirectUri=${redirectUri}`;
  }
}

function getRedirectUri() {
  const urlParams = new URLSearchParams(window.location.search);
  const redirectUri = urlParams.get('redirectUri');
  if (redirectUri) {
    const queryString = window.location.search;
    return queryString.substring(queryString.indexOf('redirectUri=') + 'redirectUri='.length);
  }
  return null;
}


function displayAlertError(message) {
  const alertBox = document.getElementById('alert-box');
  const alertMessage = document.getElementById('alert-message');
  alertMessage.innerText = message;
  alertBox.style.display = 'block';
}