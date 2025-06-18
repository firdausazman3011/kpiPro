const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const flash = require('connect-flash');

const app = express();

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/kpi-management', {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => console.error('MongoDB connection error:', err));

// Session configuration
app.use(session({
    secret: 'your-secret-key',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: 'mongodb://localhost:27017/kpi-management' }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 // 1 day
    }
}));

// Connect flash middleware
app.use(flash());

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Serve uploaded evidence files statically
const uploadsEvidencePath = path.join(__dirname, 'uploads/evidence');
console.log('Serving uploaded evidence from:', uploadsEvidencePath);
app.use('/uploads/evidence', express.static(uploadsEvidencePath));

// Global middleware
app.use((req, res, next) => {
    // Initialize res.locals if it doesn't exist
    res.locals = res.locals || {};
    // Set user from session, defaulting to null if not present
    res.locals.user = req.session.user || null;
    // Set flash messages
    res.locals.success_msg = req.flash('success');
    res.locals.error_msg = req.flash('error');
    res.locals.info_msg = req.flash('info');
    next();
});

// Set a more permissive Content Security Policy
app.use((req, res, next) => {
    res.setHeader('Content-Security-Policy', "default-src 'self'; font-src 'self' https://fonts.gstatic.com; style-src 'self' https://fonts.googleapis.com; script-src 'self' https://cdn.jsdelivr.net");
    next();
});

// View engine setup
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(expressLayouts);
app.set('layout', 'layouts/main');
app.set('layout extractScripts', true);
app.set('layout extractStyles', true);

// Routes
app.use('/', require('./routes/index'));
app.use('/auth', require('./routes/auth'));
app.use('/manager', require('./routes/manager'));
app.use('/staff', require('./routes/staff'));

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500);
    res.render('error', {
        message: err.message || 'An unexpected error occurred',
        error: process.env.NODE_ENV === 'development' ? err : {},
        user: req.user
    });
});

// 404 handler
app.use((req, res) => {
    res.status(404);
    res.render('error', {
        message: 'Page not found',
        error: {}
    });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});

module.exports = app;