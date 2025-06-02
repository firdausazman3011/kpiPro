const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    console.log('isAuthenticated middleware running for', req.method, req.originalUrl);
    console.log('Session user in isAuthenticated:', req.session ? req.session.user : 'No session');

    if (!req.session || !req.session.user) {
        console.log('isAuthenticated: No session or user, redirecting to login');
        return res.redirect('/auth/login');
    }
    
    // Verify user still exists in database
    User.findById(req.session.user._id)
        .then(user => {
            if (!user) {
                console.log('isAuthenticated: User not found in DB, destroying session');
                req.session.destroy();
                return res.redirect('/auth/login');
            }
            if (!user.active) {
                console.log('isAuthenticated: User inactive, destroying session');
                req.session.destroy();
                return res.redirect('/auth/login');
            }
            // Attach user to request for later middleware/routes
            req.user = user;
            console.log('isAuthenticated: User authenticated');
            next();
        })
        .catch(error => {
            console.error('Auth middleware error during DB lookup:', error);
            res.redirect('/auth/login');
        });
};

// Manager authorization middleware
const isManager = (req, res, next) => {
    console.log('isManager middleware running for', req.method, req.originalUrl);
    console.log('Session user in isManager:', req.session ? req.session.user : 'No session');
    console.log('req.user in isManager:', req.user ? req.user.role : 'No req.user');

    if (!req.session || !req.session.user) {
         console.log('isManager: No session or user, redirecting to login (should not happen after isAuthenticated)');
        return res.redirect('/auth/login');
    }
    
    // Use req.user which was set by isAuthenticated
    if (!req.user || req.user.role !== 'manager') {
         console.log('isManager: User is not manager, denying access');
        return res.status(403).render('error', { 
            message: 'Access denied. Manager privileges required.',
            error: {}
        });
    }
     console.log('isManager: User is manager, granting access');
    next();
};

// Staff authorization middleware
const isStaff = (req, res, next) => {
     console.log('isStaff middleware running for', req.method, req.originalUrl);
     console.log('Session user in isStaff:', req.session ? req.session.user : 'No session');
     console.log('req.user in isStaff:', req.user ? req.user.role : 'No req.user');

    if (!req.session || !req.session.user) {
         console.log('isStaff: No session or user, redirecting to login (should not happen after isAuthenticated)');
        return res.redirect('/auth/login');
    }
    
    // Use req.user which was set by isAuthenticated
    if (!req.user || req.user.role !== 'staff') {
         console.log('isStaff: User is not staff, denying access');
        return res.status(403).render('error', { 
            message: 'Access denied. Staff privileges required.',
            error: {}
        });
    }
     console.log('isStaff: User is staff, granting access');
    next();
};

// Middleware to check if user is accessing their own data
// Note: This middleware currently relies on req.user being set by isAuthenticated
exports.isOwner = async (req, res, next) => {
    try {
         console.log('isOwner middleware running');
         console.log('req.user in isOwner:', req.user ? req.user.role : 'No req.user');
        // Ensure req.user is available from isAuthenticated
        if (!req.user || !req.user._id) {
             console.log('isOwner: req.user not available, denying access');
            return res.status(401).render('error', { error: 'Authentication required' });
        }

        const kpiId = req.params.id;
        const kpi = await KPI.findById(kpiId);
        
        if (!kpi) {
             console.log('isOwner: KPI not found');
            return res.status(404).render('error', { error: 'KPI not found' });
        }

        if (req.user.role === 'manager' && kpi.manager && kpi.manager.toString() === req.user._id.toString()) {
             console.log('isOwner: Manager owns KPI, granting access');
            next();
        } else if (req.user.role === 'staff' && kpi.staff && kpi.staff.toString() === req.user._id.toString()) {
             console.log('isOwner: Staff owns KPI, granting access');
            next();
        } else {
             console.log('isOwner: User does not own KPI, denying access');
            res.status(403).render('error', { error: 'Access denied. You can only access your own KPIs.' });
        }
    } catch (error) {
        console.error('Owner middleware error:', error);
        res.status(500).render('error', { error: 'Internal server error' });
    }
};

module.exports = {
    isAuthenticated,
    isManager,
    isStaff
}; 