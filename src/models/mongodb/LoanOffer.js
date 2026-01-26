const mongoose = require('mongoose');
const { Schema } = mongoose;

const LoanOfferSchema = new Schema({
    loanRequestId: {
        type: Schema.Types.ObjectId,
        ref: 'LoanRequest',
        required: true,
        index: true
    },
    lenderId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
    },
    interestRate: {
        type: Number,
        required: true,
        min: 0,
        max: 100
    },
    amount: {
        type: Number,
        required: true,
        min: 0
    },
    status: {
        type: String,
        enum: ['PENDING', 'ACCEPTED', 'REJECTED', 'WITHDRAWN'],
        default: 'PENDING'
    },
    message: {
        type: String,
        maxlength: 500
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    updatedAt: {
        type: Date,
        default: Date.now
    }
});

// Compound index to prevent duplicate offers from same lender to same request
LoanOfferSchema.index({ loanRequestId: 1, lenderId: 1 }, { unique: true });

// Update timestamp on save
LoanOfferSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

module.exports = mongoose.model('LoanOffer', LoanOfferSchema);
