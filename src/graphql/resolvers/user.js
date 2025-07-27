const User = require("../../models/mongodb/User");

module.exports = {
  Query: {
    async getUserProfile(_, args, context) {
      const user = context.user;
      if (!user) {
        throw new Error("Authentication required");
      }
      console.log("Authenticated user:", user);
      return {
        name: "John Doe",
        phone: user.phone,
        role: user.role,
      };
    },

    async getBorrowers(_, __, context) {
      try {
        // Require authentication
        console.log("Context received:", context);
        if (!context.user) throw new Error("Authentication required");
        console.log("Fetching borrowers for user:", context.user);
        const borrowers = await User.find({ role: "borrower" });
        console.log("Borrowers fetched:", borrowers);

        return borrowers.map((u) => ({
          id: u._id,
          name: u.profile.name,
          phone: u.auth.phone,
          role: u.role,
          avatar: u.profile.avatar,
          bio: u.profile.bio,
        }));
      } catch (error) {
        console.error("Error fetching borrowers:", error);
        throw new Error(`Failed to fetch borrowers: ${error.message}`);
      }
    },
  },
};
