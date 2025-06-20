const mongoose = require('mongoose');
const { Schema } = mongoose;

const DocumentVerificationSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  
  // Basic Details
  fullName: { type: String, required: true },
  dateOfBirth: { type: String, required: true },
  address: { type: String, required: true },
  gender: { 
    type: String, 
    enum: ['male', 'female', 'other'],
    required: true 
  },
  
  // Document Images
  documents: {
    aadharCard: {
      frontImage: { type: String, required: true },
      backImage: { type: String, required: true },
      verified: { type: Boolean, default: false }
    },
    panCard: {
      image: { type: String, required: true },
      verified: { type: Boolean, default: false }
    },
    selfie: {
      image: { type: String, required: true },
      verificationCode: { type: String, required: true },
      verified: { type: Boolean, default: false }
    }
  },
  
  // Verification Status
  verificationStatus: {
    type: String,
    enum: ['pending', 'verified', 'rejected'],
    default: 'pending'
  },
  
  // If rejected, reason for rejection
  rejectionReason: { type: String },
  
  // System Metadata
  submittedAt: { type: Date, default: Date.now },
  verifiedAt: { type: Date },
  updatedAt: { type: Date, default: Date.now }
});

// Update the updatedAt field on save
DocumentVerificationSchema.pre('save', function(next) {
  this.updatedAt = Date.now();
  next();
});

// Indexes for faster queries
DocumentVerificationSchema.index({ userId: 1 });
DocumentVerificationSchema.index({ verificationStatus: 1 });
DocumentVerificationSchema.index({ submittedAt: 1 });

module.exports = mongoose.model('DocumentVerification', DocumentVerificationSchema);
