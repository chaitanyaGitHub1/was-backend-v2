const User = require('../../models/mongodb/User');
const LenderPost = require('../../models/mongodb/LenderPost');
const LoanRequest = require('../../models/mongodb/LoanRequest');

module.exports = {
  Query: {
    async search(_, { query, filter, securityType, page = 1, limit = 10 }, context) {
      if (!context.user) throw new Error('Authentication required');
      console.log(`Search Query: ${query}, Filter: ${filter}, SecurityType: ${securityType}, Page: ${page}, Limit: ${limit}`);
      const skip = (page - 1) * limit;
      const searchQuery = { $regex: query, $options: 'i' }; // Case-insensitive search

      let results = [];

      if (filter === 'LENDERS') {
        // For lenders, we first find users whose names match the query.
        const matchingUsers = await User.find({ 'profile.name': searchQuery }).select('_id');
        const userIds = matchingUsers.map((user) => user._id);

        const lenderQuery = { user: { $in: userIds } };
        
        // Add security type filter if provided
        if (securityType) {
          lenderQuery.loanTypes = securityType;
        }

        const lenderPosts = await LenderPost.find(lenderQuery)
          .populate('user')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);

        console.log('Lender Posts Found:', lenderPosts);

        // Add __typename for the union type resolution
        results = lenderPosts.map((post) => ({
          ...post.toObject(),
          __typename: 'LenderPost',
        }));

      } else if (filter === 'LOAN_REQUESTS') {
        // For loan requests, we search in the purpose, description, AND borrower name.
        const matchingUsers = await User.find({ 'profile.name': searchQuery }).select('_id');
        const userIds = matchingUsers.map((user) => user._id);

        const loanQuery = {
          $or: [
            { purpose: searchQuery },
            { description: searchQuery },
            { borrower: { $in: userIds } }
          ],
        };

        // Add security type filter if provided
        if (securityType) {
          loanQuery.securityType = securityType;
        }

        const loanRequests = await LoanRequest.find(loanQuery)
          .populate('borrower')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(limit);

        // Add __typename for the union type resolution
        results = loanRequests.map((request) => ({
          ...request.toObject(),
          __typename: 'LoanRequest',
        }));
      }

      return results;
    },
  },
  // This is a resolver for the SearchResult union. It tells GraphQL
  // how to determine the type of an object in the results array.
  SearchResult: {
    __resolveType(obj, context, info) {
      if (obj.availableAmount) {
        return 'LenderPost'; // LenderPosts have an availableAmount
      }
      if (obj.borrower) {
        return 'LoanRequest'; // LoanRequests have a borrower
      }
      return null; // Should not happen
    },
  },
};
