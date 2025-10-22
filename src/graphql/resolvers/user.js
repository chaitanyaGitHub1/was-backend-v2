const User = require("../../models/mongodb/User");

// Helper functions
const generateOTP = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const sendOTPSMS = async (phone, otp) => {
  // Implement your SMS service here (Twilio, AWS SNS, etc.)
  console.log(`Sending OTP ${otp} to phone ${phone}`);
  return true;
};

module.exports = {
  Query: {
    async getUserProfile(_, args, context) {
      if (!context.user) {
        throw new Error("Authentication required");
      }

      const user = await User.findById(context.user.userId);
      if (!user) throw new Error("User not found");

      return {
        name: user.profile?.name,
        avatar: user.profile?.avatar,
        bio: user.profile?.bio,
        location: user.profile?.location,
        email: user.auth?.email,
        phone: user.auth?.phone,
        documentSubmitted: user.documentSubmitted,
      };
    },

    async getBorrowers(_, __, context) {
      try {
        if (!context.user) throw new Error("Authentication required");
        const borrowers = await User.find({ role: "borrower" });
        return borrowers;
      } catch (error) {
        console.error("Error fetching borrowers:", error);
        throw new Error(`Failed to fetch borrowers: ${error.message}`);
      }
    },
  },
  
  // Field resolvers for User type
  User: {
    id: (user) => user._id || user.id,
    name: (user) => user.profile?.name || "Unknown User", // Critical for nested users
    phone: (user) => user.auth?.phone,
    avatar: (user) => user.profile?.avatar,
    bio: (user) => user.profile?.bio,
    profile: (user) => user.profile || {},
    borrowerProfile: (user) => user.borrowerProfile || {}
  },

  // Mutation resolvers
  Mutation: {
 async updateProfile(_, { input }, context) {
  try {
    console.log("=== updateProfile START ===");
    console.log("Input:", JSON.stringify(input, null, 2));
    console.log("Context user:", context.user);
    
    if (!context.user) {
      throw new Error("Authentication required");
    }

    const user = await User.findById(context.user.userId);
    if (!user) throw new Error("User not found");

    // Build update object for profile fields
    const updateFields = {};
    
    if (input.name !== undefined) {
      updateFields['profile.name'] = input.name;
    }
    if (input.avatar !== undefined) {
      updateFields['profile.avatar'] = input.avatar;
    }
    if (input.bio !== undefined) {
      updateFields['profile.bio'] = input.bio;
    }
    if (input.email !== undefined) {
      updateFields['auth.email'] = input.email;
      updateFields['auth.isVerified.email'] = false;
    }
    if (input.location !== undefined) {
      updateFields['profile.location'] = input.location;
    }

    updateFields.updatedAt = new Date();

    const updatedUser = await User.findByIdAndUpdate(
      context.user.userId,
      { $set: updateFields },
      { new: true, runValidators: true } // Added runValidators
    );

    if (!updatedUser) {
      throw new Error("Failed to update user");
    }

    // CRITICAL FIX: Ensure name is never null/undefined
    // Since name is required in the schema, it should always exist
    // But we add a safety check for the GraphQL type requirement
    const profileName = updatedUser.profile?.name || user.profile?.name || "Unknown User";

    return {
      name: profileName, // Now guaranteed to have a value
      avatar: updatedUser.profile?.avatar || null,
      bio: updatedUser.profile?.bio || null,
      location: updatedUser.profile?.location || null,
      email: updatedUser.auth?.email || null,
      phone: updatedUser.auth?.phone || null,
      documentSubmitted: updatedUser.documentSubmitted || false,
    };
  } catch (error) {
    console.error("updateProfile error:", error);
    throw error;
  }
},

    async requestPhoneUpdateOtp(_, { input }, context) {
      if (!context.user) {
        throw new Error("Authentication required");
      }

      const { newPhone } = input;

      // Check if new phone number is already in use
      const existingUser = await User.findOne({ 'auth.phone': newPhone });
      if (existingUser && existingUser._id.toString() !== context.user.userId) {
        throw new Error("Phone number already in use by another user");
      }

      // Generate OTP
      const otp = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store OTP in existing auth.otp field
      await User.findByIdAndUpdate(context.user.userId, {
        $set: {
          'auth.otp': {
            code: otp,
            expiresAt: expiresAt,
            newPhone: newPhone, // Store the new phone number here
            attempts: 0
          }
        }
      });

      // Send OTP via SMS
      await sendOTPSMS(newPhone, otp);

      return true;
    },

    async verifyPhoneUpdate(_, { input }, context) {
      if (!context.user) {
        throw new Error("Authentication required");
      }

      const { newPhone, otp } = input;

      const user = await User.findById(context.user.userId);
      if (!user) throw new Error("User not found");

      const otpData = user.auth.otp;

      if (!otpData || !otpData.code) {
        throw new Error("No OTP request found. Please request OTP first.");
      }

      if (otpData.newPhone !== newPhone) {
        throw new Error("Phone number mismatch");
      }

      if (new Date() > otpData.expiresAt) {
        throw new Error("OTP has expired. Please request a new OTP.");
      }

      if (otpData.attempts >= 3) {
        throw new Error("Too many failed attempts. Please request a new OTP.");
      }

      if (otpData.code !== otp) {
        // Increment attempts
        await User.findByIdAndUpdate(context.user.userId, {
          $inc: { 'auth.otp.attempts': 1 }
        });
        throw new Error("Invalid OTP");
      }

      // Update phone number and clear OTP data
      const updatedUser = await User.findByIdAndUpdate(
        context.user.userId,
        {
          $set: {
            'auth.phone': newPhone,
            'auth.isVerified.phone': true,
            updatedAt: new Date()
          },
          $unset: {
            'auth.otp': 1 // Clear the entire OTP object
          }
        },
        { new: true }
      );

      return {
        name: updatedUser.profile?.name,
        avatar: updatedUser.profile?.avatar,
        bio: updatedUser.profile?.bio,
        location: updatedUser.profile?.location,
        email: updatedUser.auth?.email,
        phone: updatedUser.auth?.phone,
        documentSubmitted: updatedUser.documentSubmitted,
      };
    },
  },
};
