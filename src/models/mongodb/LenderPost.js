const mongoose = require('mongoose');
const { Schema } = mongoose;

const LenderPost = new Schema({
  user: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
  availableAmount: { type: Number, required: true, min: 0 },
  interestRange: {
    min: { type: Number, required: true },
    max: { type: Number, required: true }
  },
  loanTypes: [{ type: String, enum: ['SECURED', 'UNSECURED'], required: true }],
  bio: { type: String, minlength: 100, required: true },
  isVerified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

LenderPost.set('toJSON', { virtuals: true });
LenderPost.set('toObject', { virtuals: true });

module.exports = mongoose.model('LenderPost', LenderPost);
