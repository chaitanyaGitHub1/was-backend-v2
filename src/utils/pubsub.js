const { PubSub } = require('graphql-subscriptions');
const EventEmitter = require('events');

// Check if normal PubSub works
let pubsub;
try {
  pubsub = new PubSub();
  console.log("Standard PubSub instance created");
  
  // Test if asyncIterator exists
  if (typeof pubsub.asyncIterator !== 'function') {
    throw new Error("Missing asyncIterator method");
  }
} catch (error) {
  console.log("Creating custom PubSub implementation with EventEmitter");
  
  // Custom implementation with EventEmitter
  const emitter = new EventEmitter();
  emitter.setMaxListeners(100);
  
  pubsub = {
    publish(channel, payload) {
      console.log(`Publishing to ${channel}`);
      emitter.emit(channel, payload);
      return true;
    },
    
    asyncIterator(triggers) {
      console.log(`Creating iterator for ${triggers}`);
      const channels = Array.isArray(triggers) ? triggers : [triggers];
      
      return {
        [Symbol.asyncIterator]() {
          const queue = [];
          const onMessage = (message) => {
            queue.push(message);
          };
          
          channels.forEach(channel => {
            emitter.on(channel, onMessage);
          });
          
          return {
            next() {
              if (queue.length > 0) {
                return Promise.resolve({ value: queue.shift(), done: false });
              }
              
              return new Promise(resolve => {
                const check = setInterval(() => {
                  if (queue.length > 0) {
                    clearInterval(check);
                    resolve({ value: queue.shift(), done: false });
                  }
                }, 100);
              });
            },
            
            return() {
              channels.forEach(channel => {
                emitter.removeListener(channel, onMessage);
              });
              return Promise.resolve({ value: undefined, done: true });
            }
          };
        }
      };
    }
  };
}

module.exports = pubsub;