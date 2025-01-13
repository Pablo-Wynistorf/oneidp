const express = require('express');
require('dotenv').config();

const router = express.Router();

router.get('/', (req, res) => {
  res.setHeader('Content-Type', 'application/javascript');

  res.send(`(function() {
        var script = document.createElement('script');
        script.async = true;
        script.src = 'https://www.googletagmanager.com/gtag/js?id=${process.env.GOOGLE_ANALYTICS_TAG_ID || 'G-XXXXXXXXXX'}';
        document.head.appendChild(script);
        
        script.onload = function() {
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());
            gtag('config', '${process.env.GOOGLE_ANALYTICS_TAG_ID || 'G-XXXXXXXXXX'});
        };
    })();
  `);
});

module.exports = router;
