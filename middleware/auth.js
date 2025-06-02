const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Authentication middleware
const isAuthenticated = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }
    
    // Verify user still exists in database
    User.findById(req.session.user._id)
        .then(user => {
            if (!user) {
                req.session.destroy();
                return res.redirect('/auth/login');
            }
            if (!user.active) {
                req.session.destroy();
                return res.redirect('/auth/login');
            }
            // Set user in both session and locals
            req.session.user = user;
            res.locals.user = user;
            next();
        })
        .catch(error => {
            console.error('Auth middleware error during DB lookup:', error);
            res.redirect('/auth/login');
        });
};

// Manager authorization middleware
const isManager = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }
    
    if (req.session.user.role !== 'manager') {
        return res.status(403).render('error', { 
            message: 'Access denied. Manager privileges required.',
            error: {}
        });
    }
    next();
};

// Staff authorization middleware
const isStaff = (req, res, next) => {
    if (!req.session || !req.session.user) {
        return res.redirect('/auth/login');
    }
    
    if (req.session.user.role !== 'staff') {
        return res.status(403).render('error', { 
            message: 'Access denied. Staff privileges required.',
            error: {}
        });
    }
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