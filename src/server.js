const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const { createServer } = require('http');
const { execute, subscribe } = require('graphql');
const { SubscriptionServer } = require('subscriptions-transport-ws');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { connectMongo } = require('./db/mongo');
const { connectPostgres } = require('./db/postgres');
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
const cors = require('cors');
const authMiddleware = require('./middleware/authMiddleware');
require('dotenv').config();

async function startServer() {
  // Initialize Express
  const app = express();
  app.use(cors());
  app.use(express.json());

  // Connect to databases
  await connectMongo();
  // await connectPostgres();

  //   // Create HTTP server
  const httpServer = createServer(app);

  //   // Set up GraphQL schema
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  //   // Create Apollo Server
  const apolloServer = new ApolloServer({
      typeDefs,
  resolvers,
    schema,
    introspection: true, // Enable introspection
    context: ({ req }) => {
      try {
        // Attempt to authenticate the user
        const user = authMiddleware({ req });
        return { user };
      } catch (err) {
        // If authentication fails, return an empty context for unauthenticated operations
        return {};
      }
    },
  });
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });

  // Set up subscriptions for real-time features
  SubscriptionServer.create(
    { schema, execute, subscribe },
    { server: httpServer, path: apolloServer.graphqlPath }
  );

  // Start server
  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`);
    console.log(`Subscriptions available at ws://localhost:${PORT}${apolloServer.graphqlPath}`);
  });
}

startServer().catch(err => {
  console.error('Failed to start server:', err);
});