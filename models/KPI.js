const mongoose = require('mongoose');

const kpiSchema = new mongoose.Schema({
    title: {
        type: String,
        required: true,
        trim: true
    },
    description: {
        type: String,
        required: true
    },
    category: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'KpiCategory',
        required: true
    },
    target: {
        type: Number,
        required: true
    },
    currentValue: {
        type: Number,
        default: 0
    },
    unit: {
        type: String,
        required: true
    },
    organization: {
        type: String,
        required: true
    },
    staff: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    status: {
        type: String,
        enum: ['pending', 'in-progress', 'completed', 'overdue'],
        default: 'pending'
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    measurementFrequency: {
        type: String,
        enum: ['Daily', 'Weekly', 'Monthly', 'Quarterly', 'Yearly'],
        required: true
    },
    progress: {
        type: Number,
        default: 0,
        min: 0,
        max: 100
    },
    comments: [{
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        text: String,
        createdAt: {
            type: Date,
            default: Date.now
        }
    }],
    evidence: [{
        filename: String,
        filepath: String,
        uploadedAt: {
            type: Date,
            default: Date.now
        }
    }],
    createdAt: {
        type: Date,
        default: Date.now
    },
    historicalData: [{
        date: {
            type: Date,
            default: Date.now
        },
        value: Number,
        target: Number,
        status: String,
        notes: String
    }],
    lastProgressValidated: {
        type: Boolean,
        default: true
    }
});

// Calculate progress based on current value and target
kpiSchema.methods.calculateProgress = function() {
    this.progress = Math.round((this.currentValue / this.target) * 100);
    return this.progress;
};

// Update status based on dates and progress
kpiSchema.methods.updateStatus = function() {
    const now = new Date();
    
    if (this.progress >= 100) {
        this.status = 'completed';
    } else if (now > this.endDate) {
        this.status = 'overdue';
    } else if (this.progress > 0) {
        this.status = 'in-progress';
    } else {
        this.status = 'pending';
    }
    
    return this.status;
};

module.exports = mongoose.model('KPI', kpiSchema); 