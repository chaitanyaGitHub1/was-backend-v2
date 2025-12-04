const mongoose = require('mongoose');
const { Schema } = mongoose;

const MessageSchema = new Schema({
  sender: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  content: { type: String, required: true },
  imageUrl: { type: String }, // Add this for image S3 URLs
  fileUrl: { type: String }, // Add this for file S3 URLs
  fileName: { type: String }, // Add this for file names
  fileType: { type: String }, // Add this for file types (image, file, etc.)
  sentAt: { type: String, default: () => Date.now().toString() } // Changed to String to match your usage
});

const ChatSchema = new Schema({
  participants: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  messages: [MessageSchema],
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Chat', ChatSchema);