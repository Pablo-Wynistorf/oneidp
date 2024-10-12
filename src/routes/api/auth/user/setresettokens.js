const express = require('express');
const router = express.Router();

router.all('/:password_reset_token', (req, res) => {
  const { password_reset_token } = req.params;
  res.cookie('password_reset_token', password_reset_token, { maxAge: 30 * 60 * 1000, httpOnly: true, path: '/' });
  return res.redirect('/setpassword');
});

module.exports = router;
