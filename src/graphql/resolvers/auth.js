const AWS = require('aws-sdk');
const User = require('../../models/mongodb/User');
const DocumentVerification = require('../../models/mongodb/DocumentVerification');
const jwt = require('jsonwebtoken');

module.exports = {
  Mutation: {
    async requestOtp(_, { phone }) {
      // Generate OTP and save to user
      console.log(`Requesting OTP for phone: ${phone}`);

      // Use default OTP for test mode (demo purposes)
      const isTestMode = process.env.TEST_MODE === 'true';
      const otpCode = isTestMode ? '000000' : Math.floor(100000 + Math.random() * 900000).toString();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

      let user = await User.findOne({ 'auth.phone': phone });
      if (!user) {
        // Create a new user with just the phone number and a temporary name
        console.log(otpCode, expiresAt);
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
            // OR completely remove the location property here15
          }
        });
      } else {
        user.auth.otp = { code: otpCode, expiresAt, attempts: 0 };
        console.log(otpCode, expiresAt);
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
      return {
        token,
        userId: user._id,
        documentSubmitted: user.documentSubmitted,
        verificationStatus: user.verificationStatus,
        verificationNote: user.verificationNote
      };
    },

    async approveUser(_, { userId, adminPassword }) {
      // Simple password check
      if (adminPassword !== 'password') {
        throw new Error('Invalid admin password');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.verificationStatus = 'VERIFIED';
      user.verifiedAt = new Date();
      await user.save();

      return user;
    },

    async declineUser(_, { userId, note, adminPassword }) {
      // Simple password check
      if (adminPassword !== 'password') {
        throw new Error('Invalid admin password');
      }

      const user = await User.findById(userId);
      if (!user) {
        throw new Error('User not found');
      }

      user.verificationStatus = 'DECLINED';
      user.verificationNote = note;
      await user.save();

      return user;
    }
  },

  Query: {
    async getPendingUsers(_, { adminPassword }) {
      // Simple password check
      if (adminPassword !== 'password') {
        throw new Error('Invalid admin password');
      }

      const users = await User.find({
        verificationStatus: 'PENDING_VERIFICATION'
      }).sort({ updatedAt: -1 });

      const s3 = new AWS.S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        signatureVersion: 'v4'
      });

      const getSignedUrl = (url) => {
        if (!url) return null;
        try {
          const urlObj = new URL(url);
          const key = urlObj.pathname.startsWith('/') ? urlObj.pathname.substring(1) : urlObj.pathname;
          return s3.getSignedUrl('getObject', {
            Bucket: process.env.AWS_S3_BUCKET_NAME,
            Key: decodeURIComponent(key),
            Expires: 3600
          });
        } catch (e) {
          console.error('Error signing URL:', e);
          return url;
        }
      };

      return Promise.all(users.map(async (user) => {
        const docVerification = await DocumentVerification.findOne({ userId: user._id });

        let documents = null;
        if (docVerification && docVerification.documents) {
          const d = docVerification.documents;
          documents = {
            aadharCard: d.aadharCard ? {
              frontImage: getSignedUrl(d.aadharCard.frontImage),
              backImage: getSignedUrl(d.aadharCard.backImage),
              verified: d.aadharCard.verified
            } : null,
            panCard: d.panCard ? {
              image: getSignedUrl(d.panCard.image),
              verified: d.panCard.verified
            } : null,
            selfie: d.selfie ? {
              image: getSignedUrl(d.selfie.image),
              verificationCode: d.selfie.verificationCode,
              verified: d.selfie.verified
            } : null
          };
        }

        return {
          id: user._id,
          profile: user.profile,
          phone: user.auth.phone,
          email: user.auth.email,
          role: user.role,
          documentSubmitted: user.documentSubmitted,
          verificationStatus: user.verificationStatus,
          createdAt: user.createdAt.getTime().toString(),
          documents
        };
      }));
    }
  }
};