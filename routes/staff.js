const express = require('express');
const router = express.Router();
const KPI = require('../models/KPI');
const { isAuthenticated, isStaff } = require('../middleware/auth');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { isUpdateAllowed } = require('../utils/kpiValidation');

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, '../uploads/evidence');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

// Configure multer for file uploads
const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }
});

const upload = multer({ storage: storage });

// Apply authentication middleware to all routes
router.use(isAuthenticated);
router.use(isStaff);

// Staff Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        // Ensure req.user is available, although middleware should handle this
        if (!req.user || !req.user._id || !req.user.organization) {
            console.error('Staff dashboard: req.user is undefined or missing organization');
            // Redirect to login or show an error, depending on desired behavior
            return res.redirect('/auth/login'); 
        }

        // Fetch KPIs assigned to the staff member and within their organization
        const kpis = await KPI.find({ staff: req.user._id, organization: req.user.organization })
            .populate('manager', 'name email')
            .sort({ createdAt: -1 });

        const completedKPIs = kpis.filter(kpi => kpi.status === 'completed').length;
        const inProgressKPIs = kpis.filter(kpi => kpi.status === 'in-progress').length;
        const overdueKPIs = kpis.filter(kpi => kpi.status === 'overdue').length;

        res.render('staff/dashboard', {
            kpis,
            stats: {
                totalKPIs: kpis.length,
                completedKPIs,
                inProgressKPIs,
                overdueKPIs
            },
            user: req.user
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).render('error', { error: 'Error loading dashboard' });
    }
});

// View KPI Details
router.get('/kpi/:id', async (req, res) => {
    try {
        // Fetch KPI and ensure it's assigned to the staff and within their organization
        const kpi = await KPI.findOne({ _id: req.params.id, staff: req.user._id, organization: req.user.organization })
            .populate('manager', 'name email')
            .populate('staff', 'name email');
        
        if (!kpi) {
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
        }

        res.render('staff/kpi-details', { kpi });
    } catch (error) {
        console.error('KPI details error:', error);
        res.status(500).render('error', { error: 'Error loading KPI details' });
    }
});

// Update KPI Progress
router.post('/kpi/:id/update', async (req, res) => {
    try {
        const { currentValue, comment } = req.body;
        console.log('Attempting to update KPI:', req.params.id);
        console.log('New value:', currentValue);
        console.log('Comment:', comment);

        // Find KPI and ensure it's assigned to the staff and within their organization
        const kpi = await KPI.findOne({ _id: req.params.id, staff: req.user._id, organization: req.user.organization });
        
        if (!kpi) {
            console.log('KPI not found or not authorized');
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
        }

        console.log('Found KPI:', {
            id: kpi._id,
            title: kpi.title,
            measurementFrequency: kpi.measurementFrequency,
            currentValue: kpi.currentValue,
            historicalDataLength: kpi.historicalData.length
        });

        // Check if update is allowed based on measurement frequency
        const canUpdate = await isUpdateAllowed(kpi._id, kpi.measurementFrequency);
        console.log('Update allowed:', canUpdate);

        if (!canUpdate) {
            const errorMessage = `This KPI can only be updated ${kpi.measurementFrequency.toLowerCase()}. Please wait until the next ${kpi.measurementFrequency.toLowerCase()} period.`;
            console.log('Update rejected:', errorMessage);
            // Use flash message for error and redirect back to the details page
            req.flash('error', errorMessage);
            return res.redirect(`/staff/kpi/${kpi._id}`);
        }

        // Cap currentValue at target value
        const updatedValue = Math.min(currentValue, kpi.target);
        console.log('Updating value from', kpi.currentValue, 'to', updatedValue);
        
        // Only save historical data if the currentValue has actually changed
        if (kpi.currentValue !== updatedValue) {
            console.log('Saving historical data');
            // Save historical data before updating the KPI fields that calculate status/progress
            kpi.historicalData.push({
                date: new Date(),
                value: updatedValue,
                target: kpi.target,
                status: kpi.status,
                notes: comment || ''
            });
        }

        kpi.currentValue = updatedValue;
        kpi.calculateProgress();
        kpi.updateStatus();

        if (comment) {
            console.log('Adding comment');
            kpi.comments.push({
                user: req.user._id,
                text: comment
            });
        }

        await kpi.save();
        console.log('KPI updated successfully');
        res.redirect(`/staff/kpi/${kpi._id}`);
    } catch (error) {
        console.error('Update KPI error:', error);
        res.status(500).render('error', { error: 'Error updating KPI' });
    }
});

// Add Comment to KPI
router.post('/kpi/:id/comment', async (req, res) => {
    try {
        const { comment } = req.body;
        // Find KPI and ensure it's assigned to the staff and within their organization
        const kpi = await KPI.findOne({ _id: req.params.id, staff: req.user._id, organization: req.user.organization });
        
        if (!kpi) {
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
        }

        kpi.comments.push({
            user: req.user._id,
            text: comment
        });

        await kpi.save();
        res.redirect(`/staff/kpi/${kpi._id}`);
    } catch (error) {
        console.error('Add comment error:', error);
        res.status(500).render('error', { error: 'Error adding comment' });
    }
});

// Upload Evidence for KPI
router.post('/kpi/:id/upload-evidence', upload.single('kpiEvidence'), async (req, res) => {
    try {
        // Ensure req.user is available and has organization
        if (!req.user || !req.user._id || !req.user.organization) {
            return res.status(401).render('error', { error: 'User not authenticated or missing organization' });
        }

        // Find KPI and ensure it's assigned to the staff and within their organization
        const kpi = await KPI.findOne({ _id: req.params.id, staff: req.user._id, organization: req.user.organization });
        
        if (!kpi) {
            // If KPI not found or not authorized, remove the uploaded file
            if (req.file) {
                fs.unlinkSync(req.file.path);
            }
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
        }

        // Check if a file was actually uploaded
        if (!req.file) {
            return res.status(400).render('error', { error: 'No file uploaded' });
        }

        // Add evidence details to the KPI
        kpi.evidence.push({
            filename: req.file.originalname,
            filepath: '/uploads/evidence/' + req.file.filename // Store a relative path
        });

        await kpi.save();
        res.redirect(`/staff/kpi/${kpi._id}`);

    } catch (error) {
        console.error('Upload evidence error:', error);
        // If an error occurs, remove the uploaded file if it exists
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).render('error', { error: 'Error uploading evidence' });
    }
});

module.exports = router; 