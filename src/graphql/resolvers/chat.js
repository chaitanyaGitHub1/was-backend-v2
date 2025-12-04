const Chat = require("../../models/mongodb/Chat");
const User = require("../../models/mongodb/User");
const pubsub = require("../../utils/pubsub");

// Define event constants
const MESSAGE_SENT = "MESSAGE_SENT";
const NEW_CHAT = "NEW_CHAT";

module.exports = {
  Query: {
    async getChats(_, __, context) {
      try {
        console.log("=== DEBUG getChats START ===");

        if (!context.user) {
          console.error("Authentication required - no user in context");
          throw new Error("Authentication required");
        }

        console.log("Fetching chats for user:", context.user.userId);

        const chats = await Chat.find({ participants: context.user.userId })
          .populate("participants")
          .populate("messages.sender")
          .sort({ updatedAt: -1 }); // Sort by most recent

        console.log(`Found ${chats.length} chats for user ${context.user.userId}`);

        // Filter out chats with null participants (orphaned chats)
        const validChats = chats.filter((chat) => {
          const hasValidParticipants = chat.participants.every((p) => p !== null);
          if (!hasValidParticipants) {
            console.warn(`Chat ${chat._id} has null participants - filtering out`);
          }
          return hasValidParticipants;
        });

        console.log(`Returning ${validChats.length} valid chats`);
        console.log("=== DEBUG getChats END ===");

        return validChats;
      } catch (error) {
        console.error("=== ERROR in getChats ===");
        console.error("Error type:", error.name);
        console.error("Error message:", error.message);
        console.error("Error stack:", error.stack);
        console.error("User ID:", context.user?.userId);
        throw new Error(`Failed to fetch chats: ${error.message}`);
      }
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

      console.log(
        "Sending message to chat:",
        chatId,
        "from user:",
        context.user.userId
      );
      console.log("Message data:", {
        content,
        imageUrl,
        fileUrl,
        fileName,
        fileType,
      });

      // Add message with all fields
      chat.messages.push({
        sender: context.user.userId,
        content,
        imageUrl: imageUrl || null,
        fileUrl: fileUrl || null,
        fileName: fileName || null,
        fileType: fileType || null,
        sentAt: Date.now().toString(),
      });

      await chat.save();

      // Populate the chat with all necessary data
      const populatedChat = await Chat.findById(chatId)
        .populate({
          path: "participants",
          select: "name email profile", // Select the fields you need
        })
        .populate({
          path: "messages.sender",
          model: "User",
          select: "name email profile",
        });

      // Convert to plain object
      const plainChat = populatedChat.toObject
        ? populatedChat.toObject()
        : JSON.parse(JSON.stringify(populatedChat));

      // Fix ID fields
      plainChat.id = plainChat._id.toString();

      // Fix message IDs and ensure sender data
      if (plainChat.messages && Array.isArray(plainChat.messages)) {
        plainChat.messages = plainChat.messages.map((msg) => {
          msg.id = msg._id.toString();

          if (msg.sender && msg.sender._id) {
            msg.sender.id = msg.sender._id.toString();
          } else {
            // Fallback if sender is not populated
            msg.sender = {
              id: context.user.userId.toString(),
              name: "Unknown User",
              email: "unknown@example.com",
            };
          }

          return msg;
        });
      }

      // Fix participant IDs
      if (plainChat.participants && Array.isArray(plainChat.participants)) {
        plainChat.participants = plainChat.participants.map((participant) => {
          participant.id = participant._id.toString();

          if (!participant.name) {
            participant.name = "Unknown User";
          }

          if (!participant.email) {
            participant.email = "unknown@example.com";
          }

          return participant;
        });
      }

      console.log("Publishing message with image/file data:", {
        hasImage: !!plainChat.messages[plainChat.messages.length - 1].imageUrl,
        hasFile: !!plainChat.messages[plainChat.messages.length - 1].fileUrl,
      });

      // Publish to subscription
      pubsub.publish(`${MESSAGE_SENT}.${chatId}`, {
        messageSent: plainChat,
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
        if (
          msg.sender.toString() !== context.user.userId &&
          !msg.readBy?.includes(context.user.userId)
        ) {
          return count + 1;
        }
        return count;
      }, 0);
    },
  },
};
