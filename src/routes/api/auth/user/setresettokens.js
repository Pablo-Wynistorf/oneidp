const express = require('express');
const router = express.Router();

router.all('/:password_reset_token/:password_reset_code', (req, res) => {
  const { password_reset_token, password_reset_code } = req.params;
  res.cookie('password_reset_token', password_reset_token, { maxAge: 1 * 60 * 60 * 1000, httpOnly: true, path: '/' });
  res.cookie('password_reset_code', password_reset_code, { maxAge: 1 * 60 * 60 * 1000, path: '/' });
  return res.redirect('/setpassword');
});

module.exports = router;
