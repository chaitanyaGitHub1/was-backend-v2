const User = require("../../models/mongodb/User");

module.exports = {
  Query: {
    async getUserProfile(_, args, context) {
      if (!context.user) {
        throw new Error("Authentication required");
      }
      
      const user = await User.findById(context.user.userId);
      if (!user) throw new Error("User not found");
      
      return {
        name: user.profile.name,
        phone: user.auth.phone,
        role: user.role,
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
};
