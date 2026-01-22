const mongoose = require('mongoose');
const { Schema } = mongoose;

const LenderPostSchema = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  availableAmount: { type: Number, required: true, min: 0 },
  interestRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  loanTypes: [{ type: String, enum: ['SECURED', 'UNSECURED'], required: true }],
  bio: { type: String, minlength: 100, required: true },
  isVerified: { type: Boolean, default: false },
  
  // Geolocation for the post (falls back to user location if not specific)
  location: {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] },
    formattedAddress: { type: String },
  },
  
  createdAt: { type: Date, default: Date.now },
});

LenderPostSchema.index({ location: '2dsphere' });

LenderPostSchema.set('toJSON', { virtuals: true });
LenderPostSchema.set('toObject', { virtuals: true });

module.exports = mongoose.model('LenderPost', LenderPostSchema);
