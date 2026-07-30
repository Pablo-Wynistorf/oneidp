import express from 'express';
import { userDB } from '../../../database/mongodb.mjs';
import { notifyError } from '../../../notify/notifications.mjs';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    const result = await userDB.findOne({});
    if (!result) {
      return res.status(200).json({ status: 'warning', message: 'Database is accessible but not initialized.' });
    }

    const response = await fetch('https://google.com', { method: 'GET' });
    if (!response.ok) {
      notifyError('Application has no connection to the internet');
      return res.status(500).json({ error: 'Application has no connection to the internet' });
    }

    res.status(200).json({ status: 'ok' });
  } catch (error) {
    notifyError(error);
    res.status(500).json({ error: 'Application has encountered an error.', details: error.toString() });
  }
});

export default router;
