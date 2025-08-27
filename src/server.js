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

app.use((req, res, next) => {
  console.log(`[HTTP ${req.method}] ${req.originalUrl}`);
  next();
});

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
  execute,
  subscribe,
  context: (ctx) => {
    console.log("[WS] Connection established. Params:", ctx.connectionParams);
    return { user: ctx.connectionParams?.authToken ? { /* user details */ } : null };
  },
  onConnect: (ctx) => {
    console.log("[WS] Client connected.");
    return true;
  },
  onSubscribe: (ctx, msg) => {
    console.log("[WS] Subscribing to operation:", msg.payload.operationName);
    console.log("[WS] Query:", msg.payload.query);
    return {
      schema,
      operationName: msg.payload.operationName,
      document: msg.payload.query ? parse(msg.payload.query) : undefined,
      variableValues: msg.payload.variables,
      contextValue: ctx
    };
  },
  onNext: (ctx, msg, args, result) => {
    console.log("[WS] Sending subscription result:", result);
    return result;
  },
  onError: (ctx, msg, error) => {
    console.error("[WS] Subscription error:", error);
  }
}, wsServer);


  const apolloServer = new ApolloServer({
  schema,
  introspection: true,
  plugins: [{
    async serverWillStart() {
      console.log("Apollo Server starting...");
      return {
        async drainServer() {
          console.log("Apollo Server shutting down...");
          await serverCleanup.dispose();
        },
      };
    },
  }],
  context: ({ req }) => {
    try {
      console.log("Processing context for request...", req.headers);
      const user = authMiddleware({ req });
      return { user };
    } catch (err) {
      console.log("AuthMiddleware error:", err.message);
      return {};
    }
  },
});

  
  await apolloServer.start();
  apolloServer.applyMiddleware({ app });

  const PORT = process.env.PORT || 4000;
  httpServer.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}${apolloServer.graphqlPath}`);
    console.log(`Subscriptions available at ws://localhost:${PORT}/graphql`);
  });
}

startServer().catch(error => {
  console.error('Failed to start server:', error);
  process.exit(1);
});