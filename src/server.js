const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const http = require('http');
const { execute, subscribe } = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws'); 
const { connectMongo } = require('./db/mongo');
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
const authMiddleware = require('./middleware/auth');
const { parse } = require('graphql');
require('dotenv').config();

const app = express();
app.use(express.json());
const httpServer = http.createServer(app);

async function startServer() {
  await connectMongo();
  
  const schema = makeExecutableSchema({ typeDefs, resolvers });

  // Set up WebSocket server for subscriptions
  const wsServer = new WebSocketServer({
    server: httpServer,
    path: '/graphql',
  });

// In your startServer function
const serverCleanup = useServer({
  schema,
  execute,  // Add this line
  subscribe, // Add this line
  context: (ctx) => {
    console.log("WebSocket connection established");
    console.log("Connection params:", ctx.connectionParams);
    return { user: ctx.connectionParams?.authToken ? { /* user details */ } : null };
  },
  onConnect: (ctx) => {
    console.log("Client connected to WebSocket");
    return true;
  },
  onSubscribe: (ctx, msg) => {
    console.log("Client subscribing to:", msg.payload.operationName);
    console.log("With variables:", msg.payload.variables);
    // Important: Return an execution result or execution arguments
    return {
      schema,
      operationName: msg.payload.operationName,
      document: msg.payload.query ? parse(msg.payload.query) : undefined,
      variableValues: msg.payload.variables,
      contextValue: ctx
    };
  },
  onNext: (ctx, msg, args, result) => {
    console.log("Sending subscription data:", result);
    return result;
  },
}, wsServer);

  const apolloServer = new ApolloServer({
    schema,
    introspection: true,
    plugins: [{
      async serverWillStart() {
        return {
          async drainServer() {
            await serverCleanup.dispose();
          },
        };
      },
    }],
    context: ({ req }) => {
      try {
        const user = authMiddleware({ req });
        return { user };
      } catch (err) {
        return {};
      }
    },
  });
  
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`);
    console.log(`Subscriptions available at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});