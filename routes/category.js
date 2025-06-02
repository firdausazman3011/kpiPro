const express = require('express');
const router = express.Router();
const KpiCategory = require('../models/KpiCategory');
const { isAuthenticated, isManager } = require('../middleware/auth');

// Apply authentication middleware to all routes
router.use(isAuthenticated);
router.use(isManager);

// List all categories
router.get('/', async (req, res) => {
    try {
        const categories = await KpiCategory.find()
            .populate('createdBy', 'name')
            .sort({ createdAt: -1 });
        res.render('manager/categories', { categories });
    } catch (error) {
        console.error('Category list error:', error);
        res.status(500).render('error', { error: 'Error loading categories' });
    }
});

// Create category form
router.get('/create', (req, res) => {
    res.render('manager/create-category');
});

// Create category
router.post('/create', async (req, res) => {
    try {
        const { name, description, department, weight } = req.body;
        
        const category = new KpiCategory({
            name,
            description,
            department,
            weight,
            createdBy: req.user._id
        });

        await category.save();
        res.redirect('/category');
    } catch (error) {
        console.error('Create category error:', error);
        res.status(500).render('error', { error: 'Error creating category' });
    }
});

// Edit category form
router.get('/:id/edit', async (req, res) => {
    try {
        const category = await KpiCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).render('error', { error: 'Category not found' });
        }
        res.render('manager/edit-category', { category });
    } catch (error) {
        console.error('Edit category form error:', error);
        res.status(500).render('error', { error: 'Error loading form' });
    }
});

// Update category
router.post('/:id/edit', async (req, res) => {
    try {
        const { name, description, department, weight, isActive } = req.body;
        
        const category = await KpiCategory.findById(req.params.id);
        if (!category) {
            return res.status(404).render('error', { error: 'Category not found' });
        }

        category.name = name;
        category.description = description;
        category.department = department;
        category.weight = weight;
        category.isActive = isActive === 'on';

        await category.save();
        res.redirect('/category');
    } catch (error) {
        console.error('Update category error:', error);
        res.status(500).render('error', { error: 'Error updating category' });
    }
});

// Delete category
router.post('/:id/delete', async (req, res) => {
    try {
        await KpiCategory.findByIdAndDelete(req.params.id);
        res.redirect('/category');
    } catch (error) {
        console.error('Delete category error:', error);
        res.status(500).render('error', { error: 'Error deleting category' });
    }
});

module.exports = router; 