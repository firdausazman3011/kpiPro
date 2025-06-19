const express = require('express');
const router = express.Router();
const KPI = require('../models/KPI');
const User = require('../models/User');
const KpiCategory = require('../models/KpiCategory');
const { isAuthenticated, isManager } = require('../middleware/auth');
const Department = require('../models/Department');

// Apply authentication middleware to all routes
router.use(isAuthenticated);
router.use(isManager);

// Manager Dashboard
router.get('/dashboard', async (req, res) => {
    try {
        console.log('Fetching manager dashboard data for organization:', req.session.user.organization);
        const userOrganization = req.session.user.organization; // Get the manager's organization

        const stats = {
            totalKPIs: await KPI.countDocuments({ manager: req.session.user._id }), // Count KPIs managed by this manager
            activeKPIs: await KPI.countDocuments({ manager: req.session.user._id, status: 'in-progress' }), // Count active KPIs managed by this manager
            completedKPIs: await KPI.countDocuments({ manager: req.session.user._id, status: 'completed' }), // Count completed KPIs managed by this manager
            totalStaff: await User.countDocuments({ role: 'staff', organization: userOrganization }) // Count staff in the manager's organization
        };

        console.log('Fetched stats:', stats);

        // Fetch KPIs created by this manager
        const kpis = await KPI.find({ manager: req.session.user._id })
            .populate({
                path: 'staff',
                select: 'name organization',
                match: { organization: userOrganization }
            })
            .populate('category', 'name')
            .sort({ createdAt: -1 })
            .limit(10);

        console.log('Fetched KPIs (before filtering):', kpis);

        // Filter out KPIs where assignedTo population failed due to organization mismatch
        const filteredKpis = kpis.filter(kpi => kpi.staff !== null);

        console.log('Filtered KPIs:', filteredKpis);

        // --- Staff Performance Section ---
        // Get all staff in the manager's organization
        const staffList = await User.find({ role: 'staff', organization: userOrganization });
        // For each staff, aggregate their KPI stats
        const staffPerformance = await Promise.all(staffList.map(async staff => {
            const staffKpis = await KPI.find({ staff: staff._id, manager: req.session.user._id });
            const totalKPIs = staffKpis.length;
            const completedKPIs = staffKpis.filter(kpi => kpi.status === 'completed').length;
            const avgProgress = totalKPIs > 0 ? Math.round(staffKpis.reduce((sum, kpi) => sum + (kpi.progress || 0), 0) / totalKPIs) : 0;
            return {
                _id: staff._id,
                name: staff.name,
                department: staff.department,
                totalKPIs,
                completedKPIs,
                avgProgress
            };
        }));
        // --- End Staff Performance Section ---

        res.render('manager/dashboard', { stats, kpis: filteredKpis, user: req.session.user, staffPerformance });
    } catch (error) {
        console.error('Manager Dashboard Error:', error);
        res.render('error', { message: 'Error loading manager dashboard', error: error });
    }
});

// Create KPI
router.get('/kpi/create', async (req, res) => {
    try {
        const staff = await User.find({ role: 'staff', organization: req.session.user.organization });
        const categories = await KpiCategory.find({ organization: req.session.user.organization, isActive: true });
        
        res.render('manager/create-kpi', { staff, categories });
    } catch (error) {
        console.error('Create KPI form error:', error);
        res.status(500).render('error', { message: 'Error loading KPI creation form', error: error });
    }
});

router.post('/kpi/create', async (req, res) => {
    try {
        const { title, description, category, target, unit, staffId, startDate, endDate, measurementFrequency } = req.body;
        
        const kpi = new KPI({
            title,
            description,
            category,
            target,
            unit,
            staff: staffId,
            manager: req.session.user._id,
            organization: req.session.user.organization,
            startDate,
            endDate,
            measurementFrequency
        });

        await kpi.save();
        res.redirect('/manager/dashboard');
    } catch (error) {
        console.error('Create KPI error:', error);
        res.status(500).render('error', { message: 'Error creating KPI', error: error });
    }
});

// View KPI Details
router.get('/kpi/:id', async (req, res) => {
    try {
        const kpi = await KPI.findOne({ _id: req.params.id, organization: req.session.user.organization, manager: req.session.user._id })
            .populate('staff', 'name email organization')
            .populate('category', 'name')
            .populate('comments.user', 'name');
        
        if (!kpi) {
            return res.status(404).render('error', { message: 'KPI not found or not authorized', error: {} });
        }

        res.render('manager/kpi-details', { kpi });
    } catch (error) {
        console.error('Manager KPI details error:', error);
        res.status(500).render('error', { message: 'Error loading KPI details', error: error });
    }
});

// Delete KPI
router.delete('/kpi/:id', async (req, res) => {
    try {
        const result = await KPI.deleteOne({ _id: req.params.id, manager: req.session.user._id });

        if (result.deletedCount === 0) {
            return res.status(404).json({ success: false, message: 'KPI not found or not authorized to delete.' });
        }

        res.json({ success: true, message: 'KPI deleted successfully.' });
    } catch (error) {
        console.error('Delete KPI error:', error);
        res.status(500).json({ success: false, message: 'Error deleting KPI.' });
    }
});

// Staff Management
router.get('/staff', async (req, res) => {
    try {
        const userOrganization = req.session.user.organization;
        const { search, department } = req.query;

        let query = { role: 'staff', organization: userOrganization };

        if (search) {
            query.name = { $regex: search, $options: 'i' };
        }

        if (department && department !== '') {
            query.department = department;
        }

        const staff = await User.find(query);
        const departments = await Department.find({ organization: userOrganization, isActive: true }).sort({ name: 1 });

        res.render('manager/staff', { 
            staff, 
            departments,
            currentSearch: search || '',
            currentDepartment: department || '',
            user: req.session.user
        });
    } catch (error) {
        console.error('Manager Staff list error:', error);
        res.render('error', { message: 'Error loading staff list', error: error });
    }
});

// Create staff form
router.get('/staff/create', async (req, res) => {
    try {
        const departments = await Department.find({ organization: req.session.user.organization, isActive: true });
        res.render('manager/create-staff', { departments });
    } catch (error) {
        console.error('Create staff form error:', error);
        res.status(500).render('error', { message: 'Error loading staff creation form', error: error });
    }
});

// Create staff
router.post('/staff/create', async (req, res) => {
    try {
        const { name, email, password, role, department } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('manager/create-staff', { 
                error: 'Email already registered',
                departments: await Department.find({ organization: req.session.user.organization, isActive: true })
            });
        }

        const user = new User({
            name,
            email,
            password,
            organization: req.session.user.organization,
            role,
            department,
            active: true
        });

        if (role === 'staff' && !department) {
            return res.render('manager/create-staff', {
                error: 'Department is required for staff members',
                departments: await Department.find({ organization: req.session.user.organization, isActive: true })
            });
        }

        await user.save();
        res.redirect('/manager/staff');
    } catch (error) {
        res.render('manager/create-staff', { message: 'Error creating staff member', error: error });
    }
});

// Edit staff form
router.get('/staff/:id/edit', async (req, res) => {
    try {
        const staff = await User.findById(req.params.id);
        if (!staff) {
            return res.render('error', { message: 'Staff member not found', error: {} });
        }
        const departments = await Department.find({ organization: req.session.user.organization, isActive: true }); // Fetch active departments
        res.render('manager/edit-staff', { staff, departments }); // Pass departments to the view
    } catch (error) {
        res.render('error', { message: 'Error loading staff edit form', error: error });
    }
});

// Update staff
router.post('/staff/:id/edit', async (req, res) => {
    try {
        const { name, email, organization, role, department } = req.body;
        const staff = await User.findById(req.params.id);
        
        if (!staff) {
            return res.render('error', { message: 'Staff member not found', error: {} });
        }

        staff.name = name;
        staff.email = email;
        staff.organization = organization;
        staff.role = role;
        staff.department = department;

        // Basic validation: ensure department is provided for staff
        if (staff.role === 'staff' && !staff.department) {
            // Re-fetch departments if rendering the form again due to validation error
            const departments = await Department.find({ organization: req.session.user.organization, isActive: true });
            return res.render('manager/edit-staff', {
                staff: staff, // Pass the staff object back to the view
                departments: departments,
                error: 'Department is required for staff members'
            });
        }

        await staff.save();
        res.redirect('/manager/staff');
    } catch (error) {
        res.render('error', { message: 'Error updating staff member', error: error });
    }
});

// Toggle staff status
router.post('/staff/:id/toggle-status', async (req, res) => {
    try {
        const staff = await User.findById(req.params.id);
        if (!staff) {
            return res.render('error', { message: 'Staff member not found', error: {} });
        }

        // If active is undefined, set it to false, otherwise toggle it
        staff.active = staff.active === undefined ? false : !staff.active;
        await staff.save();
        res.redirect('/manager/staff');
    } catch (error) {
        res.render('error', { message: 'Error toggling staff status', error: error });
    }
});

// Edit KPI
router.get('/kpi/:id/edit', async (req, res) => {
    try {
        const kpi = await KPI.findById(req.params.id)
            .populate('staff', 'name email organization'); // Populate staff to check organization if needed
        
        // Ensure the KPI belongs to the manager's organization
        if (!kpi || kpi.organization !== req.session.user.organization) { 
            return res.status(404).render('error', { message: 'KPI not found or not authorized', error: {} });
        }

        // Fetch staff and categories for the manager's organization
        const staff = await User.find({ role: 'staff', organization: req.session.user.organization });
        const categories = await KpiCategory.find({ isActive: true, organization: req.session.user.organization });

        res.render('manager/edit-kpi', { kpi, staff, categories }); // Pass categories to the view
    } catch (error) {
        res.status(500).render('error', { message: 'Error loading KPI edit form', error: error });
    }
});

router.post('/kpi/:id/edit', async (req, res) => {
    try {
        const { title, description, category, target, unit, staffId, startDate, endDate, measurementFrequency, status } = req.body;
        const kpi = await KPI.findOne({ _id: req.params.id, organization: req.session.user.organization, manager: req.session.user._id });

        if (!kpi) {
            return res.status(404).render('error', { message: 'KPI not found or not authorized', error: {} });
        }

        kpi.title = title;
        kpi.description = description;
        kpi.category = category;
        kpi.target = target;
        kpi.unit = unit;
        kpi.staff = staffId;
        kpi.startDate = startDate;
        kpi.endDate = endDate;
        kpi.measurementFrequency = measurementFrequency;
        kpi.status = status; // Manager can directly set status

        kpi.calculateProgress(); // Recalculate based on new values
        kpi.updateStatus(); // Update status if necessary

        await kpi.save();
        res.redirect('/manager/dashboard');
    } catch (error) {
        res.status(500).render('error', { message: 'Error updating KPI', error: error });
    }
});

// Category Management
router.get('/categories', async (req, res) => {
    try {
        const categories = await KpiCategory.find({ organization: req.session.user.organization, isActive: true }).sort({ name: 1 });
        res.render('manager/categories', { categories });
    } catch (error) {
        res.render('error', { message: 'Error loading KPI categories', error: error });
    }
});

// Create category form
router.get('/categories/create', (req, res) => {
    res.render('manager/create-category', { user: req.session.user });
});

// Create category
router.post('/categories/create', async (req, res) => {
    try {
        const { name, description, weight } = req.body;
        const existingCategory = await KpiCategory.findOne({ name, organization: req.session.user.organization });
        if (existingCategory) {
            return res.render('manager/create-category', { error: 'Category with this name already exists.', user: req.session.user });
        }
        const newCategory = new KpiCategory({ name, description, organization: req.session.user.organization, createdBy: req.session.user._id, isActive: true, weight });
        await newCategory.save();
        res.redirect('/manager/categories');
    } catch (error) {
        res.render('manager/create-category', { message: 'Error creating category', error: error, user: req.session.user });
    }
});

// Edit category form
router.get('/categories/:id/edit', async (req, res) => {
    try {
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!category) {
            return res.status(404).render('error', { message: 'Category not found or not authorized', error: {} });
        }
        res.render('manager/edit-category', { category, user: req.session.user });
    } catch (error) {
        res.render('error', { message: 'Error loading category edit form', error: error });
    }
});

// Update category
router.post('/categories/:id/edit', async (req, res) => {
    try {
        const { name, description, isActive } = req.body;
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!category) {
            return res.status(404).render('error', { message: 'Category not found or not authorized', error: {} });
        }
        category.name = name;
        category.description = description;
        category.isActive = isActive === 'on'; // Checkbox value
        await category.save();
        res.redirect('/manager/categories');
    } catch (error) {
        res.render('error', { message: 'Error updating category', error: error });
    }
});

// Delete category
router.delete('/categories/:id', async (req, res) => {
    try {
        // Find category and ensure it belongs to the manager's organization
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found or not authorized.' });
        }

        // Check if category is being used in any KPIs within the manager's organization
        const kpiCount = await KPI.countDocuments({ category: category._id, organization: req.session.user.organization });
        if (kpiCount > 0) {
            return res.status(400).json({ 
                success: false,
                message: 'Cannot delete category that is being used in KPIs within your organization' 
            });
        }

        await category.deleteOne();
        res.json({ success: true, message: 'Category deleted successfully.' });
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).json({ success: false, message: 'Error deleting category.' });
    }
});

// Toggle category status
router.post('/categories/:id/toggle-status', async (req, res) => {
    try {
        // Find category and ensure it belongs to the manager's organization
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!category) {
            return res.status(404).json({ success: false, message: 'Category not found or not authorized.' });
        }

        category.isActive = !category.isActive;
        await category.save();
        res.json({ success: true, isActive: category.isActive });
    } catch (error) {
        console.error('Toggle category status error:', error);
        res.status(500).json({ success: false, message: 'Error toggling category status.' });
    }
});

// Department Management
router.get('/departments', async (req, res) => {
    try {
        const departments = await Department.find({ organization: req.session.user.organization }).sort({ name: 1 });
        res.render('manager/departments', { departments });
    } catch (error) {
        res.render('error', { message: 'Error loading departments', error: error });
    }
});

// Create department form
router.get('/departments/create', (req, res) => {
    res.render('manager/create-department', { user: req.session.user });
});

// Create department
router.post('/departments/create', async (req, res) => {
    try {
        const { name } = req.body;
        const existingDepartment = await Department.findOne({ name, organization: req.session.user.organization });
        if (existingDepartment) {
            return res.render('manager/create-department', { error: 'Department with this name already exists.', user: req.session.user });
        }
        const newDepartment = new Department({ name, organization: req.session.user.organization, createdBy: req.session.user._id, isActive: true });
        await newDepartment.save();
        res.redirect('/manager/departments');
    } catch (error) {
        res.render('manager/create-department', { message: 'Error creating department', error: error, user: req.session.user });
    }
});

// Edit department form
router.get('/departments/:id/edit', async (req, res) => {
    try {
        const department = await Department.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!department) {
            return res.status(404).render('error', { message: 'Department not found or not authorized', error: {} });
        }
        res.render('manager/edit-department', { department, user: req.session.user });
    } catch (error) {
        res.render('error', { message: 'Error loading department edit form', error: error });
    }
});

// Update department
router.post('/departments/:id/edit', async (req, res) => {
    try {
        const { name } = req.body;
        const department = await Department.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!department) {
            return res.status(404).render('error', { message: 'Department not found or not authorized', error: {} });
        }
        department.name = name;
        await department.save();
        res.redirect('/manager/departments');
    } catch (error) {
        res.render('error', { message: 'Error updating department', error: error });
    }
});

// Delete department
router.post('/departments/:id/delete', async (req, res) => {
    try {
        // Find department and ensure it belongs to the manager's organization
        const department = await Department.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!department) {
            return res.status(404).render('error', { message: 'Department not found or not authorized', error: {} });
        }

        // TODO: Add check if department is being used by any staff before deleting
        const staffCount = await User.countDocuments({ department: department.name, organization: req.session.user.organization });
        if (staffCount > 0) {
            return res.status(400).render('error', {
                error: 'Cannot delete department that is being used by staff within your organization'
            });
        }

        await department.deleteOne();
        res.json({ success: true, message: 'Department deleted successfully.' });
    } catch (error) {
        console.error('Delete department error:', error);
        res.status(500).json({ success: false, message: 'Error deleting department.' });
    }
});

// Toggle department active status
router.post('/departments/:id/toggle-status', async (req, res) => {
    try {
        const department = await Department.findOne({ _id: req.params.id, organization: req.session.user.organization });
        if (!department) {
            return res.status(404).json({ success: false, message: 'Department not found or not authorized.' });
        }
        department.isActive = !department.isActive;
        await department.save();
        res.json({ success: true, isActive: department.isActive });
    } catch (error) {
        console.error('Toggle department status error:', error);
        res.status(500).json({ success: false, message: 'Error toggling department status.' });
    }
});

// Delete staff
router.delete('/staff/:id', async (req, res) => {
    try {
        const staff = await User.findById(req.params.id);
        
        if (!staff) {
            return res.status(404).json({ 
                success: false, 
                message: 'Staff member not found' 
            });
        }

        // Check if staff has any assigned KPIs
        const assignedKPIs = await KPI.countDocuments({ staff: staff._id });
        if (assignedKPIs > 0) {
            return res.status(400).json({ 
                success: false, 
                message: 'Cannot delete staff with assigned KPIs' 
            });
        }

        await User.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        console.error('Delete staff error:', error);
        res.status(500).json({ 
            success: false, 
            message: 'Error deleting staff member' 
        });
    }
});

// Manager Settings page
router.get('/settings', async (req, res) => {
    try {
        // Manager profile is just a placeholder for now, might expand later
        res.render('manager/settings', { user: req.session.user });
    } catch (error) {
        res.render('error', { message: 'Error loading settings page', error: error });
    }
});

// Validate KPI Progress
router.post('/kpi/:id/validate', async (req, res) => {
    try {
        const kpi = await KPI.findOne({ _id: req.params.id, manager: req.session.user._id });
        if (!kpi) {
            return res.status(404).render('error', { message: 'KPI not found or not authorized', error: {} });
        }
        kpi.lastProgressValidated = true;
        await kpi.save();
        res.redirect(`/manager/kpi/${kpi._id}`);
    } catch (error) {
        console.error('KPI validation error:', error);
        res.status(500).render('error', { message: 'Error validating KPI progress', error });
    }
});

module.exports = router; 