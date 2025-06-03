const User = require('../../models/mongodb/User');
const jwt = require('jsonwebtoken');

module.exports = {
  Mutation: {
    async requestOtp(_, { phone }) {
  // Generate OTP and save to user
  const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
  const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

  let user = await User.findOne({ 'auth.phone': phone });
  if (!user) {
    // Create a new user with just the phone number and a temporary name
    user = await User.create({
      auth: { 
        phone, 
        otp: { code: otpCode, expiresAt },
        isVerified: { phone: false }
      },
      role: 'borrower',
      profile: { 
        name: `User-${phone.slice(-4)}`,
        // Either provide default coordinates:
        location: {
          type: 'Point',
          coordinates: [0, 0] // Default coordinates (longitude, latitude)
        }
        // OR completely remove the location property here
      }
    });
  } else {
    user.auth.otp = { code: otpCode, expiresAt, attempts: 0 };
    await user.save();
  }
  
  console.log(`OTP for ${phone}: ${otpCode}`); // For testing
  return true;
},

    async verifyOtp(_, { phone, otp }) {
      const user = await User.findOne({ 'auth.phone': phone });
      if (!user || !user.auth.otp || user.auth.otp.code !== otp) {
        throw new Error('Invalid OTP');
      }
      if (user.auth.otp.expiresAt < new Date()) {
        throw new Error('OTP expired');
      }
      user.auth.isVerified.phone = true;
      user.auth.otp = {};
      await user.save();

      const token = jwt.sign(
        { userId: user._id, phone: user.auth.phone, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
      );
      return { token, userId: user._id };
    }
  }
};