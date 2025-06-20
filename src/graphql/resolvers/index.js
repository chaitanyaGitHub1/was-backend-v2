const authResolvers = require('./auth');
const userResolvers = require('./user');
const documentResolvers = require('./document');
const s3Resolvers = require('./s3');

// Combine all resolvers
const resolvers = {
  Query: {
    _empty: () => '',
    ...userResolvers.Query, // Add user resolvers
    ...documentResolvers.Query, // Add document resolvers
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...documentResolvers.Mutation, // Add document mutation resolvers
    ...s3Resolvers.Mutation, 
  }
};

module.exports = resolvers;
