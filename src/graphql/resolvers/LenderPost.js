const LenderPost = require("../../models/mongodb/LenderPost");
const User = require("../../models/mongodb/User");

module.exports = {
  Query: {
    async getLenderPosts(_, { page = 1, limit = 10 }, context) {
      if (!context.user) throw new Error("Authentication required");
      
      const skip = (page - 1) * limit;
      const posts = await LenderPost.find()
        .populate('user')
        .skip(skip)
        .limit(limit)
        .sort({ createdAt: -1 });
      
      return posts;
    },
    
    async getLenderPost(_, { userId }, context) {
      if (!context.user) throw new Error("Authentication required");
      
      const post = await LenderPost.findOne({ user: userId })
        .populate('user');
      
      return post;
    },
    
    async getMyLenderPost(_, __, context) {
      if (!context.user) throw new Error("Authentication required");
      
      const post = await LenderPost.findOne({ user: context.user.userId })
        .populate('user');
      
      return post;
    }
  },
  
  Mutation: {
    async createOrUpdateLenderPost(_, { input }, context) {
      if (!context.user) throw new Error("Authentication required");
      
      console.log("Creating/updating lender post for user:", context.user.userId);
      console.log("Input:", input);
      
      const { 
        availableAmount, 
        interestRangeMin, 
        interestRangeMax, 
        loanTypes, 
        bio 
      } = input;
      
      // Validate bio length
      if (bio.length < 100) {
        throw new Error("Bio must be at least 100 characters long");
      }
      
      // Find existing post or create new one
      let post = await LenderPost.findOne({ user: context.user.userId });
      
      if (post) {
        // Update existing post
        post.availableAmount = availableAmount;
        post.interestRange = {
          min: interestRangeMin,
          max: interestRangeMax
        };
        post.loanTypes = loanTypes;
        post.bio = bio;
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
          bio
        });
      }
      
      await post.save();
      
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
    },
    
    async deleteMyLenderPost(_, __, context) {
      if (!context.user) throw new Error("Authentication required");
      
      const result = await LenderPost.deleteOne({ user: context.user.userId });
      
      return result.deletedCount > 0;
    }
  },
  
  // Field resolvers for LenderPost
  LenderPost: {
    id: (post) => post._id || post.id,
    createdAt: (post) => post.createdAt.toISOString()
  }
};
