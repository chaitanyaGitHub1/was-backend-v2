const mongoose = require("mongoose");
const { Schema } = mongoose;

const UserSchema = new Schema({
  // Core Identity - Modified for mobile OTP authentication
  auth: {
    phone: { type: String, required: true, unique: true }, // Made required and unique
    email: { type: String, unique: true, sparse: true }, // Made optional
    isVerified: {
      phone: { type: Boolean, default: false },
      email: { type: Boolean, default: false },
    },
    otp: {
      code: { type: String },
      expiresAt: { type: Date },
      attempts: { type: Number, default: 0 },
    },
  },

  documentSubmitted: {
    type: Boolean,
    default: false
  },

  // Profile Configuration (From UX Pilot "Context" section)
  role: {
    type: String,
    required: true,
    enum: ["lender", "borrower", "both"],
    default: "borrower",
  },

  // Unified Profile Fields
  profile: {
    name: { type: String, required: true },
    avatar: { type: String }, // URL for "Image" checkbox
    bio: { type: String, maxlength: 500 }, // "Min. $ characters"
    location: {
      type: { type: String },
      coordinates: { type: [Number], default: undefined },
    },
  },

  // Lender-Specific Data (When role includes 'lender')
  lenderProfile: {
    availableAmount: { type: Number, min: 0 },
    interestRange: {
      min: { type: Number, default: 5 },
      max: { type: Number, default: 25 },
    },
    portfolio: [
      {
        type: Schema.Types.ObjectId,
        ref: "Transaction",
      },
    ],
    documents: [
      {
        type: {
          type: String,
          enum: ["ID", "BankStatement", "License"],
        },
        url: String,
        verified: { type: Boolean, default: false },
      },
    ],
    ratings: [
      {
        stars: { type: Number, min: 1, max: 5 },
        comment: String,
        reviewer: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },

  // Borrower-Specific Data (When role includes 'borrower')
  borrowerProfile: {
    requestedAmount: { type: Number, min: 0 },
    loanPurpose: { type: String },
    creditScore: { type: Number, min: 300, max: 850 },
    repaymentHistory: [
      {
        amount: Number,
        paidOn: Date,
        status: { type: String, enum: ["ontime", "late", "partial"] },
      },
    ],
    supportingDocs: [
      {
        type: {
          type: String,
          enum: ["IncomeProof", "Employment", "Collateral"],
        },
        url: String,
      },
    ],
    ratings: [
      {
        stars: { type: Number, min: 1, max: 5 },
        comment: String,
        reviewer: { type: Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },

  // System Metadata
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  lastLogin: Date,
  chatSessions: [
    {
      type: Schema.Types.ObjectId,
      ref: "Chat",
    },
  ],
});

// Indexes for critical queries
UserSchema.index({ "profile.location": "2dsphere" }); // Geolocation searches
UserSchema.index({ role: 1 }); // Role-based filtering
UserSchema.index({ "auth.phone": 1, "auth.otp.expiresAt": 1 }); // Faster OTP validation
UserSchema.index({ "auth.phone": 1 }, { unique: true }); // Phone-based indexing
UserSchema.index({ "auth.otp.expiresAt": 1 }, { expireAfterSeconds: 0 });
UserSchema.index({ "auth.email": 1 }, { unique: true, sparse: true }); // Email indexing (sparse for
// optional field)
UserSchema.set("toJSON", { virtuals: true });
UserSchema.set("toObject", { virtuals: true });
// Virtual for deep design requirements
UserSchema.virtual("fullProfile").get(function () {
  return {
    role: this.role,
    profile: this.profile,
    lenderStats: this.lenderProfile,
    borrowerStats: this.borrowerProfile,
  };
});

module.exports = mongoose.model("User", UserSchema);
