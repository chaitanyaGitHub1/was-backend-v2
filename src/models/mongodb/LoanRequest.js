const mongoose = require('mongoose');
const { Schema } = mongoose;

const LoanRequestSchema = new Schema({
  // Requester - reference to User schema
  borrower: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },

  // Basic Loan Details
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  purpose: {
    type: String,
    required: true
  },
  durationMonths: {
    type: Number,
    required: true,
    min: 1
  },
  creditScore: {
    type: Number,
    min: 300,
    max: 850
  },

  // Security Details
  securityType: {
    type: String,
    required: true,
    enum: ['secured', 'unsecured']
  },
  
  // Collateral (only required if securityType is 'secured')
  collateral: {
    type: {
      type: String,
      enum: ['Real Estate', 'Gold', 'Automobile', 'Stocks', 'Other'],
      required: function() { return this.securityType === 'secured'; }
    },
    estimatedValue: {
      type: Number,
      min: 0,
      required: function() { return this.securityType === 'secured'; }
    },
    documents: [{
      type: {
        type: String,
        enum: ['photo', 'pdf']
      },
      url: String,
      name: String,
      uploadedAt: {
        type: Date,
        default: Date.now
      }
    }]
  },

  // Additional Details
  description: String,

  // Status tracking
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'funded', 'cancelled'],
    default: 'pending'
  },
  
  // Interested lenders (multiple lenders might be interested)
  interestedLenders: [{
    lender: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    interestRate: Number,
    message: String,
    timestamp: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Selected lender (once borrower selects one)
  selectedLender: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  
  // Final agreement details (once terms are set)
  agreement: {
    interestRate: Number,
    startDate: Date,
    endDate: Date,
    termsAccepted: {
      type: Boolean,
      default: false
    }
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
LoanRequestSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Add indexes for common queries
LoanRequestSchema.index({ borrower: 1, status: 1 });
LoanRequestSchema.index({ status: 1, createdAt: -1 });
LoanRequestSchema.index({ selectedLender: 1 });
LoanRequestSchema.index({ 'interestedLenders.lender': 1 });

// Add virtual for loan term calculations
LoanRequestSchema.virtual('endDate').get(function() {
  if (this.agreement && this.agreement.startDate) {
    const endDate = new Date(this.agreement.startDate);
    endDate.setMonth(endDate.getMonth() + this.durationMonths);
    return endDate;
  }
  return null;
});

module.exports = mongoose.model('LoanRequest', LoanRequestSchema);