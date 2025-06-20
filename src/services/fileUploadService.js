const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Create uploads directory if it doesn't exist
const uploadsDir = path.join(__dirname, '../../uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Create subdirectories for different document types
const aadharDir = path.join(uploadsDir, 'aadhar');
const panDir = path.join(uploadsDir, 'pan');
const selfieDir = path.join(uploadsDir, 'selfie');

if (!fs.existsSync(aadharDir)) {
  fs.mkdirSync(aadharDir, { recursive: true });
}

if (!fs.existsSync(panDir)) {
  fs.mkdirSync(panDir, { recursive: true });
}

if (!fs.existsSync(selfieDir)) {
  fs.mkdirSync(selfieDir, { recursive: true });
}

/**
 * Save a base64 image to the file system
 * @param {string} base64Image - Base64 encoded image data
 * @param {string} documentType - Type of document (aadhar, pan, selfie)
 * @param {string} userId - User ID
 * @param {string} side - Side of the document (front, back) - only for aadhar
 * @returns {string} - Path to the saved image
 */
const saveBase64Image = (base64Image, documentType, userId, side = null) => {
  // Remove data:image/jpeg;base64, prefix if present
  const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
  const buffer = Buffer.from(base64Data, 'base64');
  
  // Generate a unique filename
  const filename = `${userId}_${uuidv4()}.jpg`;
  
  // Determine the directory based on document type
  let saveDir;
  switch (documentType) {
    case 'aadhar':
      saveDir = aadharDir;
      break;
    case 'pan':
      saveDir = panDir;
      break;
    case 'selfie':
      saveDir = selfieDir;
      break;
    default:
      throw new Error('Invalid document type');
  }
  
  // For aadhar, append side to filename
  const finalFilename = documentType === 'aadhar' && side 
    ? `${side}_${filename}` 
    : filename;
  
  // Save the file
  const filePath = path.join(saveDir, finalFilename);
  fs.writeFileSync(filePath, buffer);
  
  // Return the relative path to the file
  return `/uploads/${documentType}/${finalFilename}`;
};

/**
 * Delete an image from the file system
 * @param {string} filePath - Path to the image
 * @returns {boolean} - True if successful, false otherwise
 */
const deleteImage = (filePath) => {
  try {
    // Get the absolute path
    const absolutePath = path.join(__dirname, '../..', filePath);
    
    // Check if file exists
    if (fs.existsSync(absolutePath)) {
      // Delete the file
      fs.unlinkSync(absolutePath);
      return true;
    }
    return false;
  } catch (error) {
    console.error('Error deleting file:', error);
    return false;
  }
};

module.exports = {
  saveBase64Image,
  deleteImage
};
