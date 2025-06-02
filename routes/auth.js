const express = require('express');
const router = express.Router();
const User = require('../models/User');
const { isAuthenticated } = require('../middleware/auth');
const nodemailer = require('nodemailer'); // Import nodemailer
const crypto = require('crypto'); // Import crypto

// Nodemailer transporter setup
const transporter = nodemailer.createTransport({
    service: 'gmail', // Using Gmail service
    auth: {
        user: 'u2100960@siswa.um.edu.my', // Your email address
        pass: 'gsuv rjnu bqqr krbn' // Your App Password
    }
});

// Login form
router.get('/login', (req, res) => {

    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/login', { error: null });
});

// Login process
router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('auth/login', { error: 'Invalid email or password' });
        }

        if (!user.active) {
            return res.render('auth/login', { error: 'Your account has been deactivated. Please contact your manager.' });
        }

        // Set user session with all necessary fields
        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            department: user.department,
            active: user.active
        };

        // Save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('auth/login', { error: 'Error during login. Please try again.' });
            }
            res.redirect(user.role === 'manager' ? '/manager/dashboard' : '/staff/dashboard');
        });
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', { error: 'An error occurred during login. Please try again.' });
    }
});

// Register form
router.get('/register', (req, res) => {
    if (req.session.user) {
        return res.redirect('/');
    }
    res.render('auth/register', { error: null });
});

// Register process
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, organization, department } = req.body;

        // Check if user already exists with this email
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('auth/register', { error: 'Email already registered' });
        }

        // Check if an organization with this name already has a manager
        const existingOrganizationManager = await User.findOne({ organization, role: 'manager' });
        if (existingOrganizationManager) {
            return res.render('auth/register', { error: `Organization '${organization}' already exists with a manager.` });
        }

        // Create new user with role 'manager'
        const user = new User({
            name,
            email,
            password,
            organization,
            department,
            role: 'manager',
            active: true
        });

        await user.save();

        // Set user session with all necessary fields
        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            department: user.department,
            active: user.active
        };

        // Save session before redirect
        req.session.save((err) => {
            if (err) {
                console.error('Session save error:', err);
                return res.render('auth/register', { error: 'Error during registration. Please try again.' });
            }
            res.redirect(user.role === 'manager' ? '/manager/dashboard' : '/staff/dashboard');
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', { error: 'An error occurred during registration. Please try again.' });
    }
});

// Logout
router.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            console.error('Logout error:', err);
        }
        res.redirect('/');
    });
});

// Profile page
router.get('/profile', isAuthenticated, async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect('/auth/login');
        }

        const user = await User.findById(req.session.user._id);
        if (!user) {
            req.session.destroy();
            return res.redirect('/auth/login');
        }

        res.render('auth/profile', { 
            user,
            error: null,
            success: req.query.success === 'true' ? 'Profile updated successfully' : null
        });
    } catch (error) {
        console.error('Profile error:', error);
        res.render('error', { 
            message: 'Error loading profile',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

// Update profile
router.post('/profile', isAuthenticated, async (req, res) => {
    try {
        if (!req.session.user || !req.session.user._id) {
            return res.redirect('/auth/login');
        }

        const { name, email, organization } = req.body;
        const user = await User.findById(req.session.user._id);
        
        if (!user) {
            req.session.destroy();
            return res.redirect('/auth/login');
        }

        // Check if email is already taken by another user
        if (email !== user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser) {
                return res.render('auth/profile', { 
                    user,
                    error: 'Email already taken by another user'
                });
            }
        }

        user.name = name;
        user.email = email;
        user.organization = organization;

        await user.save();

        // Update session
        req.session.user = {
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            organization: user.organization,
            department: user.department,
            active: user.active
        };

        res.redirect('/auth/profile?success=true');
    } catch (error) {
        console.error('Profile update error:', error);
        res.render('auth/profile', { 
            user: req.session.user,
            error: 'Error updating profile'
        });
    }
});

// Forgot password form
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password', { error: null, success: null });
});

// Forgot password process
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            // Render the page with an error message, but don't reveal if the email exists for security reasons
            return res.render('auth/forgot-password', { 
                error: 'If an account with that email address exists, a password reset link will be sent.', 
                success: null 
            });
        }

        // Generate reset token
        const token = crypto.randomBytes(20).toString('hex');

        // Set token and expiration on user document
        user.resetPasswordToken = token;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour

        await user.save();

        // Send reset email
        const resetUrl = `http://${req.headers.host}/auth/reset-password/${token}`; // Construct reset URL

        const mailOptions = {
            to: user.email,
            from: 'u2100960@siswa.um.edu.my', // Your email address
            subject: 'KPIPro Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\nPlease click on the following link, or paste this into your browser to complete the process:\n\n${resetUrl}\n\nIf you did not request this, please ignore this email and your password will remain unchanged.`
        };

        await transporter.sendMail(mailOptions);

        res.render('auth/forgot-password', {
             error: null, 
             success: 'If an account with that email address exists, a password reset link will be sent.' 
        });

    } catch (error) {
        console.error('Forgot password error:', error);
        res.render('auth/forgot-password', { 
            error: 'An error occurred. Please try again.', 
            success: null 
        });
    }
});

// Reset password form
router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // Check if token is not expired
        });

        if (!user) {
            return res.render('auth/reset-password', { 
                error: 'Password reset token is invalid or has expired.', 
                success: null,
                token: null // Don't pass the invalid token to the view
            });
        }

        res.render('auth/reset-password', { 
            error: null, 
            success: null,
            token: req.params.token // Pass the valid token to the view
        });

    } catch (error) {
        console.error('Reset password form error:', error);
        res.render('auth/reset-password', { 
            error: 'An error occurred. Please try again.', 
            success: null,
            token: null
        });
    }
});

// Reset password process
router.post('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() } // Check if token is not expired
        });

        if (!user) {
            return res.render('auth/reset-password', { 
                error: 'Password reset token is invalid or has expired.', 
                success: null,
                token: null
            });
        }

        // Update password
        user.password = req.body.password;
        user.resetPasswordToken = undefined; // Clear token
        user.resetPasswordExpires = undefined; // Clear expiration

        await user.save();

        // Optionally, send a confirmation email that the password has been reset
        const mailOptions = {
            to: user.email,
            from: 'u2100960@siswa.um.edu.my', // Your email address
            subject: 'Your KPIPro password has been changed',
            text: 'This is a confirmation that the password for your account ' + user.email + ' has just been changed.'
        };

        await transporter.sendMail(mailOptions);

        res.render('auth/login', { success: 'Your password has been successfully reset. Please login.', error: null });

    } catch (error) {
        console.error('Reset password process error:', error);
        res.render('auth/reset-password', { 
            error: 'An error occurred while resetting your password. Please try again.', 
            success: null,
            token: req.params.token // Pass the token back in case of error during password update
        });
    }
});

module.exports = router; 