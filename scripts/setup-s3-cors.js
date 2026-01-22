const AWS = require('aws-sdk');
require('dotenv').config();

const s3 = new AWS.S3({
  region: process.env.AWS_REGION,
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
});

const corsParams = {
  Bucket: process.env.AWS_S3_BUCKET_NAME,
  CORSConfiguration: {
    CORSRules: [
      {
        AllowedHeaders: ['*'],
        AllowedMethods: ['PUT', 'POST', 'GET', 'HEAD'],
        AllowedOrigins: ['*'],
        ExposeHeaders: ['ETag'],
        MaxAgeSeconds: 3000,
      },
    ],
  },
};

console.log(`Setting CORS for bucket: ${process.env.AWS_S3_BUCKET_NAME}...`);

s3.putBucketCors(corsParams, (err, data) => {
  if (err) {
    console.error('Error setting CORS:', err);
  } else {
    console.log('Successfully updated S3 CORS configuration!');
    console.log('CORS Rules applied:', JSON.stringify(corsParams.CORSConfiguration.CORSRules, null, 2));
  }
});
