const authResolvers = require('./auth');
const userResolvers = require('./user');
const documentResolvers = require('./document');
const s3Resolvers = require('./s3');
const chatResolvers = require('./chat');
const loanResolvers = require('./loan'); // Add this line
const lenderPostResolver = require('./LenderPost'); // Add this line




const resolvers = {
  Query: {
    _empty: () => '',
    ...userResolvers.Query,
    ...documentResolvers.Query,
    ...chatResolvers.Query,
    ...loanResolvers.Query, // Add this line
    ...lenderPostResolver.Query, // Add this line
    // Remove duplicate userResolvers.Query
  },
  Mutation: {
    ...authResolvers.Mutation,
    ...documentResolvers.Mutation,
    ...s3Resolvers.Mutation, 
    ...chatResolvers.Mutation,
    ...loanResolvers.Mutation, // Add this line
    ...lenderPostResolver.Mutation, // Add this line
  },
  Subscription: {
    ...chatResolvers.Subscription,
    ...loanResolvers.Subscription, // Add this line
  }
};

module.exports = resolvers;
