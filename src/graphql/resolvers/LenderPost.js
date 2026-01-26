const LenderPost = require("../../models/mongodb/LenderPost");
const User = require("../../models/mongodb/User");

module.exports = {
  Query: {
    async getLenderPosts(_, { page = 1, limit = 10 }, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        const skip = (page - 1) * limit;
        // Exclude current user's own lender posts
        const posts = await LenderPost.find({ user: { $ne: context.user.userId } })
          .populate('user')
          .skip(skip)
          .limit(limit)
          .sort({ createdAt: -1 });

        console.log(`[getLenderPosts] Found ${posts.length} total posts`);
        posts.forEach((post, idx) => {
          console.log(`[getLenderPosts] Post ${idx}:`, {
            id: post._id,
            userId: post.user?._id || 'NULL',
            userName: post.user?.profile?.name || 'NO NAME',
            availableAmount: post.availableAmount
          });
        });

        // Filter out posts where user is null (orphaned posts)
        const validPosts = posts.filter(post => post.user);

        console.log(`[getLenderPosts] Returning ${validPosts.length} valid posts (filtered out ${posts.length - validPosts.length} orphaned posts)`);

        return validPosts;
      } catch (error) {
        console.error("Error in getLenderPosts:", error);
        throw new Error("Failed to fetch lender posts");
      }
    },

    async getLenderPost(_, { userId }, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        const post = await LenderPost.findOne({ user: userId })
          .populate('user');

        // Return null if post doesn't exist or user is deleted
        if (!post || !post.user) {
          return null;
        }

        return post;
      } catch (error) {
        console.error("Error in getLenderPost:", error);
        throw new Error("Failed to fetch lender post");
      }
    },

    async getMyLenderPost(_, __, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        const post = await LenderPost.findOne({ user: context.user.userId })
          .populate('user');

        return post;
      } catch (error) {
        console.error("Error in getMyLenderPost:", error);
        throw new Error("Failed to fetch lender post");
      }
    }
  },

  Mutation: {
    async createOrUpdateLenderPost(_, { input }, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        console.log("Creating/updating lender post for user:", context.user.userId);
        console.log("Input:", input);

        const {
          availableAmount,
          interestRangeMin,
          interestRangeMax,
          loanTypes,
          bio,
          location
        } = input;

        // Fetch user to get profile location
        const user = await User.findById(context.user.userId);
        const userLocation = user?.location || user?.profile?.location;

        // Validate bio length
        if (bio.length < 100) {
          throw new Error("Bio must be at least 100 characters long");
        }

        // Find existing post or create new one
        let post = await LenderPost.findOne({ user: context.user.userId });

        const locationData = location ? {
          type: 'Point',
          coordinates: location.coordinates,
          formattedAddress: location.formattedAddress,
          city: location.city
        } : userLocation;

        if (post) {
          // Update existing post
          post.availableAmount = availableAmount;
          post.interestRange = {
            min: interestRangeMin,
            max: interestRangeMax
          };
          post.loanTypes = loanTypes;
          post.bio = bio;
          post.location = locationData;
        } else {
          // Create new post
          post = new LenderPost({
            user: context.user.userId,
            availableAmount,
            interestRange: {
              min: interestRangeMin,
              max: interestRangeMax
            },
            loanTypes,
            bio,
            location: locationData
          });
        }

        await post.save();

        // Update user role to 'both' if they're currently just a borrower
        // This allows them to both lend and borrow
        if (user.role === 'borrower') {
          user.role = 'both';
          await user.save();
          console.log(`Updated user ${context.user.userId} role from 'borrower' to 'both'`);
        }

        // Ensure deep population with all required fields
        await post.populate({
          path: 'user',
          select: 'profile.name auth.phone role profile.avatar profile.bio'
        });

        console.log("Populated post:", JSON.stringify({
          id: post._id,
          user: {
            id: post.user._id,
            profile: post.user.profile
          }
        }));

        return post;
      } catch (error) {
        console.error("Error in createOrUpdateLenderPost:", error);
        throw error;
      }
    },

    async deleteMyLenderPost(_, __, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        const result = await LenderPost.deleteOne({ user: context.user.userId });

        return result.deletedCount > 0;
      } catch (error) {
        console.error("Error in deleteMyLenderPost:", error);
        throw new Error("Failed to delete lender post");
      }
    }
  },

  // Field resolvers for LenderPost
  LenderPost: {
    id: (post) => post._id || post.id,
    createdAt: (post) => post.createdAt.toISOString(),
    user: (post) => {
      if (!post.user) {
        console.warn(`LenderPost ${post._id} has null user - this is an orphaned post`);
        return null;
      }
      return post.user;
    }
  }
};
