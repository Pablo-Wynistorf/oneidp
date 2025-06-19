document.addEventListener('DOMContentLoaded', () => {
  function getQueryParam(param) {
    const urlParams = new URLSearchParams(window.location.search);
    return urlParams.get(param);
  }

  function displayEmailMessage() {
    const email = getQueryParam('email');
    const messageElement = document.getElementById('email-message');

    if (messageElement) {
      if (email) {
        messageElement.textContent = `We sent a verification link to: ${email}`;
        const url = new URL(window.location.href);
        url.searchParams.delete('email');
        window.history.replaceState({}, document.title, url.toString());
      } else {
        messageElement.textContent = `We’ve sent you a verification email. Please check your inbox.`;
      }
    }
  }

  async function checkIfVerifiedAndLoggedIn() {
    try {
      const response = await fetch('/api/auth/user/exchange-signup-token', {
        method: 'POST',
        credentials: 'include',
      });

      if (response.ok) {
        const result = await response.json();
        if (result.success) {
          window.location.href = '/dashboard';
        }
      }
    } catch (err) {
      console.error('Verification check failed:', err);
    }
  }

  displayEmailMessage();
  setInterval(checkIfVerifiedAndLoggedIn, 10000);
});
