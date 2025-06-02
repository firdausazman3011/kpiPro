const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        unique: true // Department names should be unique within an organization
    },
    organization: {
        type: String,
        required: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    isActive: {
        type: Boolean,
        default: true
    }
}, {
    timestamps: true
});

// Add a compound unique index to ensure department name is unique within an organization
departmentSchema.index({ name: 1, organization: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema); 