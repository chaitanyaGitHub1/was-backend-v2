module.exports = {
  Query: {
    async getUserProfile(_, args, context) {
      const user = context.user; // Access the authenticated user from the context
      if (!user) {
        throw new Error('Authentication required');
      }

      console.log('Authenticated user:', user);

      // Fetch and return the user's profile
      return {
        name: 'John Doe',
        phone: user.phone,
        role: user.role,
      };
    },
  },
};