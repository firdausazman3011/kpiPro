const express = require('express');
const router = express.Router();

// Home route
router.get('/', (req, res) => {
    res.render('index', { user: req.session.user });
});

module.exports = router; 