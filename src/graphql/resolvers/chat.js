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
};
