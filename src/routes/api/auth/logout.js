const express = require('express');

const router = express.Router();

router.post('/', (req, res) => {
  res.clearCookie('access_token');
  return res.status(200).json({ success: true });
});

module.exports = router;