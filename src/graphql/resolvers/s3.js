const AWS = require('aws-sdk');

module.exports = {
  Mutation: {
    async getPresignedS3Url(_, { fileName, fileType }, context) {
      console.log('Generating presigned S3 URL for:', fileName, fileType);
      // Optional: Add authentication check if needed
      // if (!context.user) throw new Error('Authentication required');

      const s3 = new AWS.S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        signatureVersion: 'v4'
      });

      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        ContentType: fileType,
        Expires: 300, // 5 minutes - enough time for user to select and upload
        ACL: 'private' // Explicitly set ACL
      };

      try {
        const url = await s3.getSignedUrlPromise('putObject', params);
        console.log('✓ Generated presigned URL successfully');
        console.log('  Bucket:', process.env.AWS_S3_BUCKET_NAME);
        console.log('  Key:', fileName);
        console.log('  ContentType:', fileType);
        return { url };
      } catch (err) {
        console.error('❌ Error generating presigned URL:', err);
        throw new Error(`Failed to get presigned URL: ${err.message}`);
      }
    },

     async getPresignedS3GetUrl(_, { fileName }, context) {
      const s3 = new AWS.S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        signatureVersion: 'v4'
      });

      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        Expires: 300, // 5 minutes
      };

      try {
        const url = await s3.getSignedUrlPromise('getObject', params);
        console.log('✓ Generated presigned GET URL for:', fileName);
        return { url };
      } catch (err) {
        console.error('❌ Error generating presigned GET URL:', err);
        throw new Error(`Failed to get presigned GET URL: ${err.message}`);
      }
    },
  }
};