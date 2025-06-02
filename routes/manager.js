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
        console.log('Fetching manager dashboard data for organization:', req.user.organization);
        const userOrganization = req.user.organization; // Get the manager's organization

        const stats = {
            totalKPIs: await KPI.countDocuments({ manager: req.user._id }), // Count KPIs managed by this manager
            activeKPIs: await KPI.countDocuments({ manager: req.user._id, status: 'in-progress' }), // Count active KPIs managed by this manager
            completedKPIs: await KPI.countDocuments({ manager: req.user._id, status: 'completed' }), // Count completed KPIs managed by this manager
            // totalStaff: await User.countDocuments({ role: 'staff' }) // This statistic might not be needed here or needs adjustment
            totalStaff: await User.countDocuments({ role: 'staff', organization: userOrganization }) // Count staff in the manager's organization
        };

        console.log('Fetched stats:', stats);

        // Fetch KPIs created by this manager, populating assigned staff to filter by organization if needed for the future
        const kpis = await KPI.find({ manager: req.user._id })
            .populate({
                path: 'staff',
                select: 'name organization',
                match: { organization: userOrganization } // Ensure assigned staff are in the same organization
            })
             .populate('category', 'name')
            .sort({ createdAt: -1 })
            .limit(10);

        console.log('Fetched KPIs (before filtering):', kpis);

         // Filter out KPIs where assignedTo population failed due to organization mismatch (if match is used)
        const filteredKpis = kpis.filter(kpi => kpi.assignedTo !== null);

        console.log('Filtered KPIs:', filteredKpis);

        res.render('manager/dashboard', { stats, kpis: filteredKpis,user:req.user }); // Use filteredKpis
    } catch (error) {
        console.error('Manager Dashboard Error:', error);
        res.render('error', { error: error.message });
    }
});

// Create KPI
router.get('/kpi/create', async (req, res) => {
    try {
        const staff = await User.find({ role: 'staff', organization: req.user.organization });
        const categories = await KpiCategory.find({ isActive: true });
        res.render('manager/create-kpi', { staff, categories });
    } catch (error) {
        console.error('Create KPI form error:', error);
        res.status(500).render('error', { error: 'Error loading form' });
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
            manager: req.user._id,
            organization: req.user.organization,
            startDate,
            endDate,
            measurementFrequency
        });

        await kpi.save();
        res.redirect('/manager/dashboard');
    } catch (error) {
        console.error('Create KPI error:', error);
        res.status(500).render('error', { error: 'Error creating KPI' });
    }
});

// View KPI Details
router.get('/kpi/:id', async (req, res) => {
    try {
        // Fetch KPI by ID, ensuring it belongs to the manager's organization and was created by this manager (optional but good practice)
        const kpi = await KPI.findOne({ _id: req.params.id, organization: req.user.organization, manager: req.user._id })
            .populate('staff', 'name email organization') // Populate assigned staff details
            .populate('category', 'name') // Populate category details
            .populate('comments.user', 'name'); // Populate user names for comments
        
        if (!kpi) {
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
        }

        res.render('manager/kpi-details', { kpi }); // Render the new manager KPI details view

    } catch (error) {
        console.error('Manager KPI details error:', error);
        res.status(500).render('error', { error: 'Error loading KPI details' });
    }
});

// Staff Management
router.get('/staff', async (req, res) => {
    try {
        const userOrganization = req.user.organization;
        const { search, department } = req.query; // Get search and department query parameters

        let query = { role: 'staff', organization: userOrganization }; // Base query

        // Add search filter if search term is provided
        if (search) {
            query.name = { $regex: search, $options: 'i' }; // Case-insensitive partial match on name
        }

        // Add department filter if department is selected
        if (department && department !== '') { // Check for non-empty department value
            query.department = department;
        }

        const staff = await User.find(query);
        
        // Fetch departments to populate the filter dropdown
        const departments = await Department.find({ organization: userOrganization, isActive: true }).sort({ name: 1 });

        res.render('manager/staff', { 
            staff, 
            departments, // Pass departments to the view
            currentSearch: search || '', // Pass current search term back to the view
            currentDepartment: department || '', // Pass current department filter back to the view 
            user: req.user  
        });
    } catch (error) {
        console.error('Manager Staff list error:', error);
        res.render('error', { error: error.message });
    }
});

// Create staff form
router.get('/staff/create', async (req, res) => {
    try {
        const departments = await Department.find({ organization: req.user.organization, isActive: true });
        res.render('manager/create-staff', { departments });
    } catch (error) {
        console.error('Create staff form error:', error);
        res.status(500).render('error', { error: 'Error loading form' });
    }
});

// Create staff
router.post('/staff/create', async (req, res) => {
    try {
        const { name, email, password, role, department } = req.body;
        
        // Check if user already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.render('manager/create-staff', { 
                error: 'Email already registered' 
            });
        }

        // Create new user with the same organization as the manager and add department
        const user = new User({
            name,
            email,
            password,
            organization: req.user.organization,
            role,
            department,
            active: true
        });

        // Basic validation: ensure department is provided for staff
        if (role === 'staff' && !department) {
            return res.render('manager/create-staff', {
                error: 'Department is required for staff members'
            });
        }

        await user.save();
        res.redirect('/manager/staff');
    } catch (error) {
        res.render('manager/create-staff', { error: error.message });
    }
});

// Edit staff form
router.get('/staff/:id/edit', async (req, res) => {
    try {
        const staff = await User.findById(req.params.id);
        if (!staff) {
            return res.render('error', { error: 'Staff member not found' });
        }
        const departments = await Department.find({ organization: req.user.organization, isActive: true }); // Fetch active departments
        res.render('manager/edit-staff', { staff, departments }); // Pass departments to the view
    } catch (error) {
        res.render('error', { error: error.message });
    }
});

// Update staff
router.post('/staff/:id/edit', async (req, res) => {
    try {
        const { name, email, organization, role, department } = req.body;
        const staff = await User.findById(req.params.id);
        
        if (!staff) {
            return res.render('error', { error: 'Staff member not found' });
        }

        staff.name = name;
        staff.email = email;
        staff.organization = organization;
        staff.role = role;
        staff.department = department;

        // Basic validation: ensure department is provided for staff
        if (staff.role === 'staff' && !staff.department) {
            return res.render('manager/edit-staff', {
                staff: staff, // Pass the staff object back to the view
                error: 'Department is required for staff members'
            });
        }

        await staff.save();
        res.redirect('/manager/staff');
    } catch (error) {
        res.render('error', { error: error.message });
    }
});

// Toggle staff status
router.post('/staff/:id/toggle-status', async (req, res) => {
    try {
        const staff = await User.findById(req.params.id);
        if (!staff) {
            return res.render('error', { error: 'Staff member not found' });
        }

        // If active is undefined, set it to false, otherwise toggle it
        staff.active = staff.active === undefined ? false : !staff.active;
        await staff.save();
        res.redirect('/manager/staff');
    } catch (error) {
        res.render('error', { error: error.message });
    }
});

// Edit KPI
router.get('/kpi/:id/edit', async (req, res) => {
    try {
        const kpi = await KPI.findById(req.params.id)
            .populate('staff', 'name email organization'); // Populate staff to check organization if needed
        
        // Ensure the KPI belongs to the manager's organization
        if (!kpi || kpi.organization !== req.user.organization) { 
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
        }

        // Fetch staff and categories for the manager's organization
        const staff = await User.find({ role: 'staff', organization: req.user.organization });
        const categories = await KpiCategory.find({ isActive: true, organization: req.user.organization });

        res.render('manager/edit-kpi', { kpi, staff, categories }); // Pass categories to the view
    } catch (error) {
        console.error('Edit KPI form error:', error);
        res.status(500).render('error', { error: 'Error loading form' });
    }
});

router.post('/kpi/:id/edit', async (req, res) => {
    try {
        const { title, description, category, target, unit, staffId, startDate, endDate, measurementFrequency } = req.body;
        const kpi = await KPI.findOne({ _id: req.params.id, organization: req.user.organization, manager: req.user._id });

        if (!kpi) {
            return res.status(404).render('error', { error: 'KPI not found or not authorized' });
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

        await kpi.save();
        res.redirect('/manager/dashboard');
    } catch (error) {
        console.error('Edit KPI error:', error);
        res.status(500).render('error', { error: 'Error updating KPI' });
    }
});

// Delete KPI
router.post('/kpi/:id/delete', async (req, res) => {
    try {
        await KPI.findByIdAndDelete(req.params.id);
        res.redirect('/manager/dashboard');
    } catch (error) {
        console.error('Delete KPI error:', error);
        res.status(500).render('error', { error: 'Error deleting KPI' });
    }
});

// Category Management
router.get('/categories', async (req, res) => {
    try {
        // Fetch categories only for the manager's organization
        const categories = await KpiCategory.find({ organization: req.user.organization })
            .populate('createdBy', 'name') // Consider populating createdBy only if needed and filtering by organization
            .sort({ createdAt: -1 });
        res.render('manager/categories', { categories });
    } catch (error) {
        console.error('Categories list error:', error);
        res.status(500).render('error', { error: 'Error loading categories' });
    }
});

// Create category form
router.get('/categories/create', (req, res) => {
    res.render('manager/create-category');
});

// Create category
router.post('/categories/create', async (req, res) => {
    try {
        const { name, description, organization, weight } = req.body;
        
        // Check if user is authenticated
        if (!req.user || !req.user._id) {
            return res.status(401).render('error', { 
                error: 'You must be logged in to create a category' 
            });
        }

        // Check if category already exists
        const existingCategory = await KpiCategory.findOne({ name });
        if (existingCategory) {
            return res.render('manager/create-category', { 
                error: 'Category with this name already exists' 
            });
        }

        const category = new KpiCategory({
            name,
            description,
            organization: req.user.organization,
            weight: parseInt(weight),
            createdBy: req.user._id,
            isActive: true
        });

        await category.save();
        res.redirect('/manager/categories');
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).render('error', { 
            error: 'Error creating category. Please try again.' 
        });
    }
});

// Edit category form
router.get('/categories/:id/edit', async (req, res) => {
    try {
        // Find category and ensure it belongs to the manager's organization
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!category) {
            return res.status(404).render('error', { error: 'Category not found or not authorized' });
        }
        res.render('manager/edit-category', { category });
    } catch (error) {
        console.error('Edit category form error:', error);
        res.status(500).render('error', { error: 'Error loading form' });
    }
});

// Update category
router.post('/categories/:id/edit', async (req, res) => {
    try {
        const { name, description, organization: org, weight } = req.body; // Changed from department to organization and renamed organization to org to avoid conflict
        
        // Find category and ensure it belongs to the manager's organization
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!category) {
            return res.status(404).render('error', { error: 'Category not found or not authorized' });
        }

        // Check if name is being changed and if it conflicts with another category within the same organization
        if (name !== category.name) {
            const existingCategory = await KpiCategory.findOne({ name, organization: req.user.organization });
            if (existingCategory) {
                return res.render('manager/edit-category', { 
                    category,
                    error: 'Category with this name already exists in your organization' 
                });
            }
        }

        category.name = name;
        category.description = description;
        category.organization = org; // Update the organization field
        category.weight = weight;

        await category.save();
        res.redirect('/manager/categories');
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).render('error', { error: 'Error updating category' });
    }
});

// Delete category
router.post('/categories/:id/delete', async (req, res) => {
    try {
        // Find category and ensure it belongs to the manager's organization
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!category) {
            return res.status(404).render('error', { error: 'Category not found or not authorized' });
        }

        // Check if category is being used in any KPIs within the manager's organization
        const kpiCount = await KPI.countDocuments({ category: category._id, organization: req.user.organization });
        if (kpiCount > 0) {
            return res.status(400).render('error', { 
                error: 'Cannot delete category that is being used in KPIs within your organization' 
            });
        }

        await category.deleteOne();
        res.redirect('/manager/categories');
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).render('error', { error: 'Error deleting category' });
    }
});

// Toggle category status
router.post('/categories/:id/toggle-status', async (req, res) => {
    try {
        // Find category and ensure it belongs to the manager's organization
        const category = await KpiCategory.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!category) {
            return res.status(404).render('error', { error: 'Category not found or not authorized' });
        }

        category.isActive = !category.isActive;
        await category.save();
        res.redirect('/manager/categories');
    } catch (error) {
        console.error('Toggle category status error:', error);
        res.status(500).render('error', { error: 'Error updating category status' });
    }
});

// Department Management
router.get('/departments', async (req, res) => {
    try {
        // Fetch departments only for the manager's organization
        const departments = await Department.find({ organization: req.user.organization })
            .populate('createdBy', 'name') // Populate createdBy user's name
            .sort({ createdAt: -1 });
        res.render('manager/departments', { departments });
    } catch (error) {
        console.error('Departments list error:', error);
        res.status(500).render('error', { error: 'Error loading departments' });
    }
});

// Create department form
router.get('/departments/create', (req, res) => {
    res.render('manager/create-department');
});

// Create department
router.post('/departments/create', async (req, res) => {
    try {
        const { name, description } = req.body; // Assuming department only has name and organization for now
        
        // Check if user is authenticated (already done by middleware, but good practice)
        if (!req.user || !req.user._id) {
            return res.status(401).render('error', { 
                error: 'You must be logged in to create a department' 
            });
        }

        // Check if department already exists within the organization
        const existingDepartment = await Department.findOne({ name, organization: req.user.organization });
        if (existingDepartment) {
            return res.render('manager/create-department', { 
                error: 'Department with this name already exists in your organization' 
            });
        }

        const department = new Department({
            name,
            organization: req.user.organization,
            createdBy: req.user._id,
            isActive: true
        });

        await department.save();
        res.redirect('/manager/departments');
    } catch (error) {
        console.error('Create department error:', error);
        res.status(500).render('error', { 
            error: 'Error creating department. Please try again.' 
        });
    }
});

// Edit department form
router.get('/departments/:id/edit', async (req, res) => {
    try {
        // Find department and ensure it belongs to the manager's organization
        const department = await Department.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!department) {
            return res.status(404).render('error', { error: 'Department not found or not authorized' });
        }
        res.render('manager/edit-department', { department });
    } catch (error) {
        console.error('Edit department form error:', error);
        res.status(500).render('error', { error: 'Error loading form' });
    }
});

// Update department
router.post('/departments/:id/edit', async (req, res) => {
    try {
        const { name } = req.body; // Assuming only name is editable for now
        
        // Find department and ensure it belongs to the manager's organization
        const department = await Department.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!department) {
            return res.status(404).render('error', { error: 'Department not found or not authorized' });
        }

        // Check if name is being changed and if it conflicts with another department within the same organization
        if (name !== department.name) {
            const existingDepartment = await Department.findOne({ name, organization: req.user.organization });
            if (existingDepartment) {
                return res.render('manager/edit-department', { 
                    department,
                    error: 'Department with this name already exists in your organization' 
                });
            }
        }

        department.name = name;
        // department.organization = req.user.organization; // Organization should not be changed
        
        await department.save();
        res.redirect('/manager/departments');
    } catch (error) {
        console.error('Update department error:', error);
        res.status(500).render('error', { error: 'Error updating department' });
    }
});

// Delete department
router.post('/departments/:id/delete', async (req, res) => {
    try {
        // Find department and ensure it belongs to the manager's organization
        const department = await Department.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!department) {
            return res.status(404).render('error', { error: 'Department not found or not authorized' });
        }

        // TODO: Add check if department is being used by any staff before deleting
        const staffCount = await User.countDocuments({ department: department.name, organization: req.user.organization });
        if (staffCount > 0) {
             return res.status(400).render('error', { 
                error: 'Cannot delete department that has assigned staff' 
            });
        }

        await department.deleteOne();
        res.redirect('/manager/departments');
    } catch (error) {
        console.error('Delete department error:', error);
        res.status(500).render('error', { error: 'Error deleting department' });
    }
});

// Toggle department status (Optional - similar to category status)
router.post('/departments/:id/toggle-status', async (req, res) => {
    try {
        // Find department and ensure it belongs to the manager's organization
        const department = await Department.findOne({ _id: req.params.id, organization: req.user.organization });
        if (!department) {
            return res.status(404).render('error', { error: 'Department not found or not authorized' });
        }

        department.isActive = !department.isActive;
        await department.save();
        res.redirect('/manager/departments');
    } catch (error) {
        console.error('Toggle department status error:', error);
        res.status(500).render('error', { error: 'Error updating department status' });
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
        // We will pass any necessary data for the settings page here later
        res.render('manager/settings', {});
    } catch (error) {
        console.error('Settings page error:', error);
        res.status(500).render('error', { 
            message: 'Error loading settings page',
            error: process.env.NODE_ENV === 'development' ? error : {}
        });
    }
});

module.exports = router; 