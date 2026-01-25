const mongoose = require('mongoose');
const { Schema } = mongoose;

const RepaymentSchema = new Schema({
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    paidDate: {
        type: Date,
        required: true,
        default: Date.now
    },
    note: {
        type: String
    }
});

const LoanSchema = new Schema({
    // Reference to original loan request
    loanRequest: {
        type: Schema.Types.ObjectId,
        ref: 'LoanRequest',
        required: true
    },

    // Parties involved
    borrower: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    lender: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // Loan terms
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    interestRate: {
        type: Number,
        required: true,
        min: 0
    },
    durationMonths: {
        type: Number,
        required: true,
        min: 1
    },

    // Status tracking
    status: {
        type: String,
        enum: ['LOAN_RECEIVED_PENDING', 'ACTIVE', 'COMPLETED', 'DEFAULTED'],
        default: 'LOAN_RECEIVED_PENDING'
    },

    // Confirmation tracking
    borrowerConfirmed: {
        type: Boolean,
        default: false
    },
    lenderConfirmed: {
        type: Boolean,
        default: false
    },
    selectedLenderByBorrower: {
        type: Schema.Types.ObjectId,
        ref: 'User'
    },

    // Important dates
    disbursementDate: {
        type: Date,
        default: Date.now
    },
    confirmedDate: {
        type: Date
    },
    dueDate: {
        type: Date,
        required: true
    },

    // Repayment tracking
    repayments: [RepaymentSchema],
    totalRepaid: {
        type: Number,
        default: 0,
        min: 0
    },
    remainingAmount: {
        type: Number,
        required: true,
        min: 0
    },

    // System metadata
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Update the updatedAt field on save
LoanSchema.pre('save', function (next) {
    this.updatedAt = Date.now();
    next();
});

// Calculate due date before saving if not set
LoanSchema.pre('save', function (next) {
    if (!this.dueDate && this.disbursementDate) {
        const dueDate = new Date(this.disbursementDate);
        dueDate.setMonth(dueDate.getMonth() + this.durationMonths);
        this.dueDate = dueDate;
    }
    next();
});

// Add indexes for common queries
LoanSchema.set('toJSON', { virtuals: true });
LoanSchema.set('toObject', { virtuals: true });
LoanSchema.index({ borrower: 1, status: 1 });
LoanSchema.index({ lender: 1, status: 1 });
LoanSchema.index({ status: 1, dueDate: 1 });
LoanSchema.index({ status: 1, createdAt: -1 });

// Virtual for checking if loan is overdue
LoanSchema.virtual('isOverdue').get(function () {
    if (this.status === 'ACTIVE' && this.dueDate) {
        return new Date() > this.dueDate && this.remainingAmount > 0;
    }
    return false;
});

module.exports = mongoose.model('Loan', LoanSchema);
