const Chat = require("../../models/mongodb/Chat");
const User = require("../../models/mongodb/User");
const pubsub = require("../../utils/pubsub");

// Define event constants
const MESSAGE_SENT = "MESSAGE_SENT";
const NEW_CHAT = "NEW_CHAT";

module.exports = {
  Query: {
    async getChats(_, __, context) {
      console.log("=== DEBUG getChats ===");
      if (!context.user) {
        console.error("Authentication required");
        throw new Error("Authentication required");
      }
      console.log("Fetching chats for user:", context.user.userId);
      const chats = await Chat.find({ participants: context.user.userId })
        .populate("participants")
        .populate("messages.sender");
      console.log("Found chats:", chats.length);
      return chats;
    },

    async getChat(_, { chatId }, context) {
      console.log("=== DEBUG getChat ===");
      if (!context.user) {
        console.error("Authentication required");
        throw new Error("Authentication required");
      }
      console.log(
        "Fetching chat with ID:",
        chatId,
        "for user:",
        context.user.userId
      );
      const chat = await Chat.findById(chatId)
        .populate("participants")
        .populate("messages.sender");
      if (!chat) {
        console.error("Chat not found:", chatId);
      } else {
        console.log("Found chat:", chat._id);
      }
      return chat;
    },
  },
  Mutation: {
    async createChat(_, { participantIds }, context) {
      try {
        if (!context.user) throw new Error("Authentication required");
        const allParticipants = [context.user.userId, ...participantIds];

        console.log("Creating chat with participants:", allParticipants);

        // Find existing chat with exactly these participants
        let chat = await Chat.findOne({
          participants: {
            $all: allParticipants,
            $size: allParticipants.length,
          },
        });

        if (chat) {
          // Populate before returning (use array syntax for multiple paths)
          chat = await Chat.findById(chat._id)
            .populate("participants")
            .populate("messages.sender");
          return chat;
        }

        // Add this check before creating chat
        const usersExist = await User.countDocuments({
          _id: { $in: allParticipants },
        });

        if (usersExist !== allParticipants.length) {
          throw new Error("One or more participants do not exist");
        }

        // If not found, create new chat
        chat = await Chat.create({ participants: allParticipants });
        await User.updateMany(
          { _id: { $in: allParticipants } },
          { $push: { chatSessions: chat._id } }
        );

        // Populate before returning
        const populatedChat = await Chat.findById(chat._id)
          .populate("participants")
          .populate("messages.sender");
        console.log("Populated chat:", populatedChat);

        return populatedChat;
      } catch (error) {
        console.error("Error in createChat:", error);
        throw new Error("Failed to create chat: " + error.message);
      }
    },
    async sendMessage(
      _,
      { chatId, content, fileUrl, fileType, imageUrl, fileName },
      context
    ) {
      if (!context.user) throw new Error("Authentication required");
      const chat = await Chat.findById(chatId);
      if (!chat) {
        throw new Error("Chat not found");
      }

      // Add message with all possible fields
      chat.messages.push({
        sender: context.user.userId,
        content,
        fileUrl,
        fileType,
        imageUrl,
        fileName,
        sentAt: Date.now().toString(),
      });

      await chat.save();

      // Better population approach - get the index of the new message
      const newMessageIndex = chat.messages.length - 1;

      // Populate both participants and messages.sender
      const populatedChat = await Chat.findById(chatId)
        .populate("participants")
        .populate({
          path: "messages.sender",
          model: "User", // Make sure this matches your User model name
        });

      // Debug population
      console.log(
        "Message sender populated:",
        populatedChat.messages[newMessageIndex].sender ? "Yes" : "No",
        "ID:",
        populatedChat.messages[newMessageIndex].sender?._id || "Missing"
      );

      const plainChat = populatedChat.toObject
        ? populatedChat.toObject()
        : JSON.parse(JSON.stringify(populatedChat));

      // Fix the ID field - MongoDB uses _id but GraphQL expects id
      plainChat.id = plainChat._id.toString();

      // Fix IDs in nested objects too and ensure sender is never null
      if (plainChat.messages && Array.isArray(plainChat.messages)) {
        plainChat.messages = plainChat.messages.map((msg) => {
          msg.id = msg._id.toString();

          // Ensure sender is always properly populated
          if (msg.sender && msg.sender._id) {
            msg.sender.id = msg.sender._id.toString();
          } else {
            // If sender is missing, use a placeholder or the current user

            msg.sender = {
              id: context.user.userId.toString(),
              name: "Unknown User",
              email: "unknown@example.com",
              // Remove the duplicate name line and the "so" typo
            };
          }

          return msg;
        });
      }

    // Add after your messages handling block (around line 152)
    // Fix IDs and ensure required fields exist for participants
    if (plainChat.participants && Array.isArray(plainChat.participants)) {
      plainChat.participants = plainChat.participants.map(participant => {
        // Fix ID
        participant.id = participant._id.toString();
        
        // Ensure name is always present (required by your schema)
        if (!participant.name) {
          participant.name = "Unknown User";
        }
        
        // Add other required fields if missing
        if (!participant.email) {
          participant.email = "unknown@example.com";
        }
        
        return participant;
      });
    }

    // Add debug logging before publishing
    console.log("Publishing chat with participants:", 
      plainChat.participants.map(p => ({id: p.id, name: p.name || "MISSING NAME"}))
    );

    // Now publish the correctly transformed object
    pubsub.publish(`${MESSAGE_SENT}.${chatId}`, { 
      messageSent: plainChat
    });

      return populatedChat;
    },
  },
  // Fix the newChat subscription
  Subscription: {
    // In your Subscription section:
    messageSent: {
      subscribe: (_, { chatId }, context) => {
        console.log("Subscribing to messages for chat:", chatId);
        try {
          if (!pubsub || typeof pubsub.asyncIterator !== "function") {
            console.error(
              "PubSub or its asyncIterator method is not available!"
            );
            throw new Error("Subscription system unavailable");
          }
          const channel = `${MESSAGE_SENT}.${chatId}`;
          console.log(`Using channel: ${channel}`);
          return pubsub.asyncIterator(channel);
        } catch (error) {
          console.error("Error in messageSent subscription:", error);
          throw error;
        }
      },
    },
    newChat: {
      // Change parameter from chatId to userId
      subscribe: (_, { userId }) => {
        console.log(`Subscribing to new chats for user: ${userId}`);
        // Change channel to use NEW_CHAT constant
        const channel = `${NEW_CHAT}.${userId}`;
        console.log(`Channel: ${channel}`);
        return pubsub.asyncIterator(channel);
      },
    },
  },
  Chat: {
    participants: async (chat) => {
      try {
        // Fetch users with full data
        const users = await User.find({
          _id: { $in: chat.participants },
        });

        // Debug users being returned
        console.log(`Found ${users.length} participants for chat ${chat._id}`);

        // Map to ensure all required fields have values
        return users.map((user) => ({
          id: user._id,
          // Ensure name is never null - critical fix
          name: user.profile?.name || "Unknown User",
          role: user.role || "unknown",
          avatar: user.profile?.avatar || null,
          phone: user.auth?.phone || null,
          bio: user.profile?.bio || null,
          // Add any other fields needed
        }));
      } catch (error) {
        console.error(`Error resolving chat ${chat._id} participants:`, error);
        // Return empty array rather than failing entirely
        return [];
      }
    },

    // New resolvers for message preview
    latestMessage: async (chat) => {
      if (chat.messages && chat.messages.length > 0) {
        return chat.messages[chat.messages.length - 1];
      }
      return null;
    },

    messages: async (chat, args, context) => {
      // Support limit parameter
      const { limit } = args;
      let messages = chat.messages || [];

      // If limit is provided, return only the latest messages
      if (limit && limit > 0 && messages.length > limit) {
        messages = messages.slice(-limit);
      }

      return messages;
    },

    unreadCount: async (chat, _, context) => {
      if (!context.user) return 0;

      // Count messages not from current user that aren't read
      return (chat.messages || []).reduce((count, msg) => {
        if (msg.sender.toString() !== context.user.userId && 
            !msg.readBy?.includes(context.user.userId)) {
          return count + 1;
        }
        return count;
      }, 0);
    }
  }
};
