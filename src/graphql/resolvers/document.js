const DocumentVerification = require('../../models/mongodb/DocumentVerification');
const User = require('../../models/mongodb/User');

module.exports = {
  Query: {
    async getDocumentVerification(_, args, context) {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Find document verification for the authenticated user
      const documentVerification = await DocumentVerification.findOne({ 
        userId: context.user.userId 
      });

      return documentVerification;
    },

    async getDocumentVerificationStatus(_, args, context) {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Find document verification for the authenticated user
      const documentVerification = await DocumentVerification.findOne({ 
        userId: context.user.userId 
      });

      return documentVerification ? documentVerification.verificationStatus : 'not_submitted';
    }
  },

  Mutation: {
async submitDocumentVerification(_, { input }, context) {
  console.log('=== DEBUG submitDocumentVerification ===');
  console.log('Context user:', context.user);
  console.log('Input received:', input);

  // Check if user is authenticated
  if (!context.user) {
    throw new Error('Authentication required');
  }

  const userId = context.user.userId;
  console.log('User ID:', userId);

  try {
    // Check if user already has a document verification
    console.log('Checking for existing verification...');
    const existingVerification = await DocumentVerification.findOne({ userId });
    console.log('Existing verification:', existingVerification);
    
    if (existingVerification) {
      throw new Error('Document verification already submitted');
    }

    // Create new document verification
    console.log('Creating new document verification...');
    const documentVerification = new DocumentVerification({
      userId,
      fullName: input.fullName,
      dateOfBirth: input.dateOfBirth,
      address: input.address,
      gender: input.gender,
      documents: {
        aadharCard: {
          frontImage: input.aadharFrontImage,
          backImage: input.aadharBackImage,
          verified: false
        },
        panCard: {
          image: input.panImage,
          verified: false
        },
        selfie: {
          image: input.selfieImage,
          verificationCode: input.verificationCode,
          verified: false
        }
      },
      verificationStatus: 'pending'
    });

    console.log('Document verification object created:', documentVerification);

    // Save document verification
    console.log('Saving document verification...');
    const savedDoc = await documentVerification.save();
    console.log('Document verification saved:', savedDoc);

    // Update user's profile name if it's still the default
    console.log('Updating user profile...');
    const user = await User.findById(userId);
    console.log('Found user:', user);
    
    if (user && user.profile && user.profile.name && user.profile.name.startsWith('User-')) {
      user.profile.name = input.fullName;
      await user.save();
      console.log('User profile updated');
    }

    console.log('=== DEBUG END ===');
    return savedDoc;
  } catch (error) {
    console.error('Error in submitDocumentVerification:', error);
    throw error;
  }
},

    async updateDocumentVerification(_, { id, input }, context) {
      // Check if user is authenticated
      if (!context.user) {
        throw new Error('Authentication required');
      }

      // Find document verification
      const documentVerification = await DocumentVerification.findById(id);
      if (!documentVerification) {
        throw new Error('Document verification not found');
      }

      // Check if user is authorized to update this document verification
      if (documentVerification.userId.toString() !== context.user.userId) {
        throw new Error('Not authorized');
      }

      // Check if document verification is already verified
      if (documentVerification.verificationStatus === 'verified') {
        throw new Error('Cannot update verified documents');
      }

      // Update document verification
      documentVerification.fullName = input.fullName;
      documentVerification.dateOfBirth = input.dateOfBirth;
      documentVerification.address = input.address;
      documentVerification.gender = input.gender;
      documentVerification.documents = {
        aadharCard: {
          frontImage: input.aadharFrontImage,
          backImage: input.aadharBackImage,
          verified: false
        },
        panCard: {
          image: input.panImage,
          verified: false
        },
        selfie: {
          image: input.selfieImage,
          verificationCode: input.verificationCode,
          verified: false
        }
      };
      documentVerification.verificationStatus = 'pending';

      // Save updated document verification
      await documentVerification.save();

      return documentVerification;
    },

    async verifyDocument(_, { id, documentType, verified }, context) {
      // Check if user is authenticated and is an admin
      if (!context.user || context.user.role !== 'admin') {
        throw new Error('Admin authorization required');
      }

      // Find document verification
      const documentVerification = await DocumentVerification.findById(id);
      if (!documentVerification) {
        throw new Error('Document verification not found');
      }

      // Update document verification based on document type
      switch (documentType) {
        case 'aadharCard':
          documentVerification.documents.aadharCard.verified = verified;
          break;
        case 'panCard':
          documentVerification.documents.panCard.verified = verified;
          break;
        case 'selfie':
          documentVerification.documents.selfie.verified = verified;
          break;
        default:
          throw new Error('Invalid document type');
      }

      // Save updated document verification
      await documentVerification.save();

      return documentVerification;
    },

    async updateVerificationStatus(_, { id, status, rejectionReason }, context) {
      // Check if user is authenticated and is an admin
      if (!context.user || context.user.role !== 'admin') {
        throw new Error('Admin authorization required');
      }

      // Find document verification
      const documentVerification = await DocumentVerification.findById(id);
      if (!documentVerification) {
        throw new Error('Document verification not found');
      }

      // Update verification status
      documentVerification.verificationStatus = status;
      
      // If status is rejected, set rejection reason
      if (status === 'rejected') {
        documentVerification.rejectionReason = rejectionReason || 'Documents could not be verified';
      }
      
      // If status is verified, set verified date
      if (status === 'verified') {
        documentVerification.verifiedAt = new Date();
      }

      // Save updated document verification
      await documentVerification.save();

      return documentVerification;
    }
  }
};
