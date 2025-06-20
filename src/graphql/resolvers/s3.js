const AWS = require('aws-sdk');

module.exports = {
  Mutation: {
    async getPresignedS3Url(_, { fileName, fileType }, context) {
      // Optional: Add authentication check if needed
      // if (!context.user) throw new Error('Authentication required');

      const s3 = new AWS.S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

      const params = {

        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        ContentType: fileType,
        Expires: 60,
      };

      try {
        const url = await s3.getSignedUrlPromise('putObject', params);
        return { url };
      } catch (err) {
        throw new Error('Failed to get presigned URL');
      }
    },

     async getPresignedS3GetUrl(_, { fileName }, context) {
      const s3 = new AWS.S3({
        region: process.env.AWS_REGION,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      });

      const params = {
        Bucket: process.env.AWS_S3_BUCKET_NAME,
        Key: fileName,
        Expires: 60, // URL valid for 60 seconds
      };

      try {
        const url = await s3.getSignedUrlPromise('getObject', params);
        return { url };
      } catch (err) {
        throw new Error('Failed to get presigned GET URL');
      }
    },
  }
};