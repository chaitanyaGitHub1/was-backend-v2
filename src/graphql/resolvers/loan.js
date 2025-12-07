const LoanRequest = require('../../models/mongodb/LoanRequest');
const User = require('../../models/mongodb/User');
const pubsub = require('../../utils/pubsub');

// Subscription events
const NEW_LOAN_REQUEST = 'NEW_LOAN_REQUEST';
const LOAN_REQUEST_UPDATED = 'LOAN_REQUEST_UPDATED';
const LOAN_INTEREST_RECEIVED = 'LOAN_INTEREST_RECEIVED';

module.exports = {
  Query: {
 async getLoanRequests(_, { status, page = 1, limit = 10 }, context) {
  if (!context.user) throw new Error("Authentication required");

  const query = status ? { status } : {};
  // Add filter to exclude loan requests with null borrowers
  query.borrower = { $exists: true, $ne: null };
  // Exclude current user's own loan requests
  query.borrower.$ne = context.user.userId;

  const skip = (page - 1) * limit;

  const loanRequests = await LoanRequest.find(query)
    .populate("borrower")
    .populate("selectedLender")
    .populate("interestedLenders.lender")
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit);

  // Extra safety: filter out any that still have null borrowers after populate
  return loanRequests.filter(lr => lr.borrower != null);
},
    async getLoanRequest(_, { id }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(id)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender');
      if (!loanRequest) throw new Error('Loan request not found');
      return loanRequest;
    },

    async getMyLoanRequests(_, __, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequests = await LoanRequest.find({ borrower: context.user.userId })
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender')
        .sort({ createdAt: -1 });

      return loanRequests;
    },

    async getAvailableLoanRequests(_, __, context) {
      if (!context.user) throw new Error('Authentication required');
      if (context.user.role !== 'lender' && context.user.role !== 'both') {
        throw new Error('Only lenders can access available loan requests');
      }

      // Find pending loan requests from other users
      const loanRequests = await LoanRequest.find({
        borrower: { $ne: context.user.userId },
        status: 'PENDING'
      })
        .populate('borrower')
        .sort({ createdAt: -1 });

      return loanRequests;
    }
  },

  Mutation: {

    async createLoanRequest(_, { input }, context) {
      if (!context.user) throw new Error('Authentication required');
      console.log("Debug Input", input);

      try {
        const {
          amount, purpose, durationMonths, creditScore,
          securityType, collateralType, collateralValue, description
        } = input;

        const mappedCollateralType = collateralType
          ? collateralType.toUpperCase().replace(/\s/g, '_')
          : undefined;

        let loanRequest;
        try {
          // Create the loan request instance
          loanRequest = new LoanRequest({
            borrower: context.user.userId,
            amount,
            purpose,
            durationMonths,
            creditScore,
            securityType,
            description,
            collateral: securityType === 'SECURED' ? {
              type: mappedCollateralType,
              estimatedValue: collateralValue,
              documents: []
            } : undefined
          });
          console.log("LoanRequest object created:", loanRequest);
        } catch (err) {
          console.error("Error creating LoanRequest object:", err);
          throw new Error('Failed to construct loan request object');
        }

        try {
          await loanRequest.save();
          console.log("LoanRequest saved:", loanRequest._id);
        } catch (err) {
          console.error("Error saving LoanRequest to DB:", err);
          throw new Error('Failed to save loan request to database');
        }

                let populatedLoanRequest = await LoanRequest.findById(loanRequest._id)
          .populate('borrower')
          .populate('selectedLender')
          .populate('interestedLenders.lender');

        // Convert Mongoose Document to plain object to safely delete properties
        let plainLoanRequest = populatedLoanRequest.toObject();

        // If unsecured loan, remove collateral field entirely
        plainLoanRequest.id = plainLoanRequest._id.toString();
        delete plainLoanRequest._id;
        if (plainLoanRequest.securityType === 'UNSECURED' || plainLoanRequest.securityType === 'Unsecured') {
          delete plainLoanRequest.collateral;
        }

        console.log("Populated LoanRequest (processed):", plainLoanRequest);

        return plainLoanRequest;

      } catch (error) {
        console.error("Loan request submission error (outer catch):", error);
        throw error;
      }
    },


    async updateLoanStatus(_, { id, status }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(id);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check authorization
      const isBorrower = loanRequest.borrower.toString() === context.user.userId;
      const isLender = loanRequest.selectedLender &&
        loanRequest.selectedLender.toString() === context.user.userId;

      if (!isBorrower && !isLender && context.user.role !== 'admin') {
        throw new Error('Not authorized to update this loan request');
      }

      // Update status
      loanRequest.status = status;
      await loanRequest.save();

      // Populate before returning
      const populatedLoanRequest = await LoanRequest.findById(id)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender');

      // Publish loan request updated event
      pubsub.publish(LOAN_REQUEST_UPDATED, {
        loanRequestUpdated: populatedLoanRequest,
        id
      });

      return populatedLoanRequest;
    },

    async addCollateralDocument(_, { input }, context) {
      if (!context.user) throw new Error('Authentication required');

      const { loanRequestId, type, url, name } = input;

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check if user is the borrower
      if (loanRequest.borrower.toString() !== context.user.userId) {
        throw new Error('Not authorized to update this loan request');
      }

      // Ensure collateral exists
      if (!loanRequest.collateral) {
        loanRequest.collateral = { documents: [] };
      }

      // Add document
      loanRequest.collateral.documents.push({
        type,
        url,
        name,
        uploadedAt: new Date()
      });

      await loanRequest.save();

      // Populate before returning
      const populatedLoanRequest = await LoanRequest.findById(loanRequestId)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender');

      // Publish loan request updated event
      pubsub.publish(LOAN_REQUEST_UPDATED, {
        loanRequestUpdated: populatedLoanRequest,
        id: loanRequestId
      });

      return populatedLoanRequest;
    },

    async expressInterest(_, { loanRequestId, interestRate, message }, context) {
      if (!context.user) throw new Error('Authentication required');

      // Verify user is a lender
      if (context.user.role !== 'lender' && context.user.role !== 'both') {
        throw new Error('Only lenders can express interest');
      }

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check if already interested
      const alreadyInterested = loanRequest.interestedLenders.some(
        interest => interest.lender.toString() === context.user.userId
      );

      if (alreadyInterested) {
        // Update existing interest
        loanRequest.interestedLenders = loanRequest.interestedLenders.map(interest => {
          if (interest.lender.toString() === context.user.userId) {
            return {
              ...interest,
              interestRate,
              message,
              timestamp: new Date()
            };
          }
          return interest;
        });
      } else {
        // Add new interest
        loanRequest.interestedLenders.push({
          lender: context.user.userId,
          interestRate,
          message,
          timestamp: new Date()
        });
      }

      await loanRequest.save();

      // Populate before returning
      const populatedLoanRequest = await LoanRequest.findById(loanRequestId)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender');

      // Publish loan interest received event
      pubsub.publish(LOAN_INTEREST_RECEIVED, {
        loanInterestReceived: populatedLoanRequest,
        borrowerId: loanRequest.borrower.toString()
      });

      return populatedLoanRequest;
    },

    async selectLender(_, { loanRequestId, lenderId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check if user is the borrower
      if (loanRequest.borrower.toString() !== context.user.userId) {
        throw new Error('Not authorized to select a lender for this request');
      }

      // Check if lender expressed interest
      const lenderInterest = loanRequest.interestedLenders.find(
        interest => interest.lender.toString() === lenderId
      );

      if (!lenderInterest) {
        throw new Error('This lender has not expressed interest in your loan request');
      }

      // Select the lender and update status
      loanRequest.selectedLender = lenderId;
      loanRequest.status = 'APPROVED';

      // Create loan agreement
      loanRequest.agreement = {
        interestRate: lenderInterest.interestRate,
        startDate: new Date(),
        endDate: new Date(new Date().setMonth(new Date().getMonth() + loanRequest.durationMonths)),
        termsAccepted: false
      };

      await loanRequest.save();

      // Populate before returning
      const populatedLoanRequest = await LoanRequest.findById(loanRequestId)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender');

      // Publish loan request updated event
      pubsub.publish(LOAN_REQUEST_UPDATED, {
        loanRequestUpdated: populatedLoanRequest,
        id: loanRequestId
      });

      return populatedLoanRequest;
    },

    async acceptLoanTerms(_, { loanRequestId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      const isLender = loanRequest.selectedLender &&
        loanRequest.selectedLender.toString() === context.user.userId;

      if (!isLender) {
        throw new Error('Only the selected lender can accept terms');
      }

      // Accept terms and update status
      loanRequest.agreement.termsAccepted = true;
      loanRequest.status = 'FUNDED';
      await loanRequest.save();

      // Populate before returning
      const populatedLoanRequest = await LoanRequest.findById(loanRequestId)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender');

      // Publish loan request updated event
      pubsub.publish(LOAN_REQUEST_UPDATED, {
        loanRequestUpdated: populatedLoanRequest,
        id: loanRequestId
      });

      return populatedLoanRequest;
    }
  },

  Subscription: {
    newLoanRequest: {
      subscribe: () => pubsub.asyncIterator([NEW_LOAN_REQUEST])
    },

    loanRequestUpdated: {
      subscribe: (_, { id }) => pubsub.asyncIterator([`${LOAN_REQUEST_UPDATED}.${id}`])
    },

    loanInterestReceived: {
      subscribe: (_, { borrowerId }) => pubsub.asyncIterator([`${LOAN_INTEREST_RECEIVED}.${borrowerId}`])
    }
  }
};