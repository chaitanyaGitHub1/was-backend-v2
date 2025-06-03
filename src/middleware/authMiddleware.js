const jwt = require('jsonwebtoken');

module.exports = ({ req }) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    throw new Error('Authorization header must be provided');
  }

  const token = authHeader.split('Bearer ')[1];
  if (!token) {
    throw new Error('Authentication token must be "Bearer [token]"');
  }

  try {
    const decodedToken = jwt.verify(token, process.env.JWT_SECRET);
    return decodedToken; // Return the decoded token (user data)
  } catch (err) {
    throw new Error('Invalid/Expired token');
  }
};