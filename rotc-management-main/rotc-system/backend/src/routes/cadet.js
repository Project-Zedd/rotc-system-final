const express = require('express');
const router = express.Router();

// Placeholder cadet routes
router.get('/', (req, res) => {
  res.json({ success: true, message: 'Cadet routes placeholder' });
});

module.exports = router;
