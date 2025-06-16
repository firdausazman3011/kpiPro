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
            return res.render('auth/login', { error_msg: 'Invalid email or password' });
        }

        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.render('auth/login', { error_msg: 'Invalid email or password' });
        }

        if (!user.active) {
            return res.render('auth/login', { error_msg: 'Your account has been deactivated. Please contact your manager.' });
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
                return res.render('auth/login', { error_msg: 'Error during login. Please try again.' });
            }
            res.redirect(user.role === 'manager' ? '/manager/dashboard' : '/staff/dashboard');
        });
    } catch (error) {
        console.error('Login error:', error);
        res.render('auth/login', { error_msg: 'An unexpected error occurred during login. Please try again.' });
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
            return res.render('auth/register', { error_msg: 'Email already registered' });
        }

        // Check if an organization with this name already has a manager
        const existingOrganizationManager = await User.findOne({ organization, role: 'manager' });
        if (existingOrganizationManager) {
            return res.render('auth/register', { error_msg: `Organization '${organization}' already exists with a manager.` });
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
                return res.render('auth/register', { error_msg: 'Error during registration. Please try again.' });
            }
            res.redirect(user.role === 'manager' ? '/manager/dashboard' : '/staff/dashboard');
        });
    } catch (error) {
        console.error('Registration error:', error);
        res.render('auth/register', { error_msg: 'An unexpected error occurred during registration. Please try again.' });
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
            error: error
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
                    error: { message: 'Email already taken by another user' },
                    message: 'Email already taken by another user'
                });
            }
        }

        user.name = name;
        user.email = email;
        user.organization = organization;

        await user.save();

        // Update session user to reflect changes
        req.session.user.name = user.name;
        req.session.user.email = user.email;
        req.session.user.organization = user.organization;

        req.flash('success', 'Profile updated successfully.');
        req.session.save((err) => {
            if (err) {
                console.error('Session save error during profile update:', err);
                req.flash('error', 'Error saving session after profile update.');
            }
            res.redirect('/auth/profile?success=true');
        });

    } catch (error) {
        console.error('Update profile error:', error);
        res.render('auth/profile', { 
            user: req.session.user, // Pass the current user data to keep form filled
            error: { message: 'An error occurred while updating profile. Please try again.' },
            message: 'An error occurred while updating profile. Please try again.'
        });
    }
});

// Forgot password form
router.get('/forgot-password', (req, res) => {
    res.render('auth/forgot-password');
});

// Handle forgot password
router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) {
            req.flash('error', 'No account with that email address exists.');
            return res.redirect('/auth/forgot-password');
        }

        // Generate a reset token
        const resetToken = crypto.randomBytes(32).toString('hex');
        user.resetPasswordToken = resetToken;
        user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
        await user.save();

        // Send email
        const resetUrl = `http://${req.headers.host}/auth/reset-password/${resetToken}`;
        const mailOptions = {
            to: user.email,
            from: 'u2100960@siswa.um.edu.my', // Your email
            subject: 'Password Reset',
            text: `You are receiving this because you (or someone else) have requested the reset of the password for your account.\n\n` +
                  `Please click on the following link, or paste this into your browser to complete the process:\n\n` +
                  `${resetUrl}\n\n` +
                  `If you did not request this, please ignore this email and your password will remain unchanged.\n`
        };

        await transporter.sendMail(mailOptions);

        req.flash('success', 'An e-mail has been sent to ' + user.email + ' with further instructions.');
        res.redirect('/auth/forgot-password');

    } catch (error) {
        console.error('Forgot password error:', error);
        req.flash('error', 'Error sending password reset email. Please try again.');
        res.redirect('/auth/forgot-password');
    }
});

// Reset password form
router.get('/reset-password/:token', async (req, res) => {
    try {
        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }

        res.render('auth/reset-password', { token: req.params.token });
    } catch (error) {
        console.error('Reset password form error:', error);
        req.flash('error', 'Error loading password reset form.');
        res.redirect('/auth/forgot-password');
    }
});

// Handle reset password
router.post('/reset-password/:token', async (req, res) => {
    try {
        const { password, confirmPassword } = req.body;

        if (password !== confirmPassword) {
            req.flash('error', 'Passwords do not match.');
            return res.render('auth/reset-password', { token: req.params.token });
        }

        const user = await User.findOne({
            resetPasswordToken: req.params.token,
            resetPasswordExpires: { $gt: Date.now() }
        });

        if (!user) {
            req.flash('error', 'Password reset token is invalid or has expired.');
            return res.redirect('/auth/forgot-password');
        }

        user.password = password; // Hashing handled by pre-save hook in user model
        user.resetPasswordToken = undefined;
        user.resetPasswordExpires = undefined;

        await user.save();

        req.flash('success', 'Your password has been updated.');
        res.redirect('/auth/login');

    } catch (error) {
        console.error('Reset password error:', error);
        req.flash('error', 'Error resetting password. Please try again.');
        res.redirect('/auth/forgot-password');
    }
});

module.exports = router; 