const express = require('express');
require('dotenv').config();

const router = express.Router();

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  
  const googleAnalyticsTag = process.env.GOOGLE_ANALYTICS_TAG_ID || 'G-XXXXXXXXXX';

  res.send(`
    (function() {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=${googleAnalyticsTag}';
        document.head.appendChild(script);

        script.onload = function() {
            window.dataLayer = window.dataLayer || [];
            window.gtag = function(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${googleAnalyticsTag}');
        };
    })();
  `);
});

module.exports = router;
