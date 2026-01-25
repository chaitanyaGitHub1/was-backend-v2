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
    enum: ['SECURED', 'UNSECURED']
  },

  // Collateral (only required if securityType is 'secured')
  collateral: {
    type: {
      type: String,
      enum: ['REAL_ESTATE', 'GOLD', 'AUTOMOBILE', 'STOCKS', 'OTHER'],
      required: function () { return this.securityType === 'SECURED'; }
    },
    estimatedValue: {
      type: Number,
      min: 0,
      required: function () { return this.securityType === 'SECURED'; }
    },
    documents: [{
      type: {
        type: String,
        enum: ['PHOTO', 'PDF']
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

  // Geolocation for the request
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    formattedAddress: { type: String },
  },

  // Status tracking
  status: {
    type: String,
    enum: ['PENDING', 'APPROVED', 'REJECTED', 'FUNDED', 'CANCELLED', 'LOAN_RECEIVED_PENDING'],
    default: 'PENDING'
  },

  // Link to active loan (once loan tracking begins)
  linkedLoan: {
    type: Schema.Types.ObjectId,
    ref: 'Loan'
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
LoanRequestSchema.pre('save', function (next) {
  this.updatedAt = Date.now();
  next();
});

// Add indexes for common queries
LoanRequestSchema.set('toJSON', { virtuals: true });
LoanRequestSchema.set('toObject', { virtuals: true });
LoanRequestSchema.index({ borrower: 1, status: 1 });
LoanRequestSchema.index({ status: 1, createdAt: -1 });
LoanRequestSchema.index({ selectedLender: 1 });
LoanRequestSchema.index({ 'interestedLenders.lender': 1 });

// Add virtual for loan term calculations
LoanRequestSchema.virtual('endDate').get(function () {
  if (this.agreement && this.agreement.startDate) {
    const endDate = new Date(this.agreement.startDate);
    endDate.setMonth(endDate.getMonth() + this.durationMonths);
    return endDate;
  }
  return null;
});

// Geolocation index
LoanRequestSchema.index({ location: '2dsphere' });

module.exports = mongoose.model('LoanRequest', LoanRequestSchema);