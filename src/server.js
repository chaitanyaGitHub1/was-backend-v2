const path = require('path');
const express = require('express');
const { ApolloServer } = require('apollo-server-express');
const http = require('http');
const { execute, subscribe } = require('graphql');
const { makeExecutableSchema } = require('@graphql-tools/schema');
const { WebSocketServer } = require('ws');
const { useServer } = require('graphql-ws/lib/use/ws');
const { ApolloServerPluginLandingPageLocalDefault } = require('apollo-server-core');
const { connectMongo } = require('./db/mongo');
const typeDefs = require('./graphql/schema');
const resolvers = require('./graphql/resolvers');
const authMiddleware = require('./middleware/auth');
const { parse } = require('graphql');
require('dotenv').config();
const cors = require('cors');

const app = express();
app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
const httpServer = http.createServer(app);

app.use((req, res, next) => {
  console.log(`[HTTP ${req.method}] ${req.originalUrl} | Origin: ${req.headers.origin}`);
  next();
});

app.get('/', (req, res) => {
  res.send('Server is running. Go to <a href="/graphql">/graphql</a> to use the GraphQL Playground.');
});

// Serve admin panel
app.use(express.static(path.join(__dirname, '../public')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Detailed Logging Plugin for Apollo
const loggingPlugin = {
  async requestDidStart(requestContext) {
    const startTime = Date.now();
    const op = requestContext.request.operationName || 'Unnamed Op';
    console.log(`\n--- [GraphQL Request] ${op} ---`);
    if (requestContext.request.variables) {
      console.log('Variables:', JSON.stringify(requestContext.request.variables, null, 2));
    }

    return {
      async didEncounterErrors(rc) {
        console.error(`[GraphQL Error] in ${op}:`, rc.errors);
      },
      async willSendResponse(rc) {
        const duration = Date.now() - startTime;
        console.log(`--- [GraphQL Response] ${op} (${duration}ms) ---`);
        // Optional: Log response data (careful with large payloads)
        // console.log('Response:', JSON.stringify(rc.response.data, null, 2));
      },
    };
  },
};

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
      console.log("[WS] Connection established.");
      return { user: ctx.connectionParams?.authToken ? { /* user details */ } : null };
    },
    onConnect: (ctx) => {
      console.log("[WS] Client connected.");
      return true;
    },
    onSubscribe: (ctx, msg) => {
      console.log(`[WS] Subscribing: ${msg.payload.operationName || 'Unnamed'}`);
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
    plugins: [
      ApolloServerPluginLandingPageLocalDefault({ embed: true }),
      loggingPlugin, // Added detailed logging
      {
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
        const user = authMiddleware({ req });
        return { user };
      } catch (err) {
        // console.log("AuthMiddleware error:", err.message);
        return {};
      }
    },
  });


  await apolloServer.start();
  apolloServer.applyMiddleware({ app, cors: false });

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