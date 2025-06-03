const authResolvers = require('./auth');
const userResolvers = require('./user');

// Combine all resolvers
const resolvers = {
  Query: {
    _empty: () => '',
    ...userResolvers.Query, // Add user resolvers
  },
  Mutation: {
    ...authResolvers.Mutation
  }
};

module.exports = resolvers;