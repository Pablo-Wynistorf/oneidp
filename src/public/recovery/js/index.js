document.addEventListener('DOMContentLoaded', () => {
  const emailField = document.getElementById('email-field');
  const recoverButton = document.getElementById('recover-button');
  const modal = document.getElementById('modal');
  const countdownElement = document.getElementById('countdown');
  const resendEmailButton = document.getElementById('resend-email');
  const redirectLoginButton = document.getElementById('redirect-login');
  const useAnotherEmailButton = document.getElementById('use-another-email');

  let countdown;
  let countdownValue = 30;

  emailField.focus();

  const validateEmailField = () => {
    const email = emailField.value.trim();
    const isValidEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

    recoverButton.disabled = !isValidEmail;
    recoverButton.classList.toggle('opacity-50', !isValidEmail);
    recoverButton.classList.toggle('cursor-not-allowed', !isValidEmail);
  };


  emailField.addEventListener('input', validateEmailField);
  validateEmailField();

  emailField.addEventListener('keypress', function (e) {
    if (e.key === 'Enter' && !recoverButton.disabled) {
      e.preventDefault();
      recover();
    }
  });

  recoverButton.addEventListener('click', recover);
  resendEmailButton.addEventListener('click', resendEmail);
  useAnotherEmailButton.addEventListener('click', () => {
    emailField.value = '';
    closeModal();
    validateEmailField();
    emailField.focus();
  });
  redirectLoginButton.addEventListener('click', redirect_login);

  async function recover() {
    const resetEmailInput = emailField.value.trim();
    if (resetEmailInput === '') {
      displayAlertError('Please enter your email address.');
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
        const errorMessage = await response.json();
        displayAlertError(errorMessage.error);
      }
    } catch (error) {
      displayAlertError('An error occurred. Please try again later.');
    }
  }

  function openModal() {
    modal.classList.remove('hidden');
    startCountdown();
  }

  function closeModal() {
    modal.classList.add('hidden');
    clearInterval(countdown);
    countdownValue = 30;
    countdownElement.textContent = countdownValue;
    resendEmailButton.disabled = false;
    resendEmailButton.classList.remove('bg-gray-300', 'cursor-not-allowed');
    resendEmailButton.classList.add('hover:bg-blue-600');
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
      displayAlertError('Please enter your email address.');
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
        countdownValue = 30;
        countdownElement.textContent = countdownValue;
        clearInterval(countdown);
        startCountdown();
      } else {
        const errorMessage = await response.text();
        displayAlertError(errorMessage);
      }
    } catch (error) {
      displayAlertError('An error occurred. Please try again later.');
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