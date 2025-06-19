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

setInterval(checkIfVerifiedAndLoggedIn, 10000);