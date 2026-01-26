const LoanRequest = require('../../models/mongodb/LoanRequest');
const Loan = require('../../models/mongodb/Loan');
const LoanOffer = require('../../models/mongodb/LoanOffer');
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
    },

    async getMyLoans(_, { type, status }, context) {
      if (!context.user) throw new Error('Authentication required');

      const query = {};

      // Filter by type (borrowed or lended)
      if (type === 'borrowed') {
        query.borrower = context.user.userId;
      } else if (type === 'lended') {
        query.lender = context.user.userId;
      } else {
        throw new Error('Type must be either "borrowed" or "lended"');
      }

      // Filter by status if provided
      if (status) {
        query.status = status;
      }

      const loans = await Loan.find(query)
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower')
        .sort({ createdAt: -1 });

      return loans;
    },

    async getLoanMetrics(_, __, context) {
      if (!context.user) throw new Error('Authentication required');

      // Get borrowed loans
      const borrowedLoans = await Loan.find({ borrower: context.user.userId });
      const lendedLoans = await Loan.find({ lender: context.user.userId });

      // Calculate metrics
      const totalBorrowed = borrowedLoans.reduce((sum, loan) => sum + loan.amount, 0);
      const totalLended = lendedLoans.reduce((sum, loan) => sum + loan.amount, 0);

      const activeBorrowedCount = borrowedLoans.filter(l =>
        l.status === 'ACTIVE' || l.status === 'LOAN_RECEIVED_PENDING'
      ).length;

      const activeLendedCount = lendedLoans.filter(l =>
        l.status === 'ACTIVE' || l.status === 'LOAN_RECEIVED_PENDING'
      ).length;

      const completedBorrowedCount = borrowedLoans.filter(l => l.status === 'COMPLETED').length;
      const completedLendedCount = lendedLoans.filter(l => l.status === 'COMPLETED').length;

      const totalToRepay = borrowedLoans
        .filter(l => l.status === 'ACTIVE' || l.status === 'LOAN_RECEIVED_PENDING')
        .reduce((sum, loan) => sum + loan.remainingAmount, 0);

      const now = new Date();
      const overdueLoans = borrowedLoans.filter(l =>
        (l.status === 'ACTIVE' || l.status === 'LOAN_RECEIVED_PENDING') &&
        l.dueDate &&
        new Date(l.dueDate) < now &&
        l.remainingAmount > 0
      ).length;

      return {
        totalBorrowed,
        totalLended,
        activeBorrowedCount,
        activeLendedCount,
        completedBorrowedCount,
        completedLendedCount,
        totalToRepay,
        overdueLoans
      };
    },

    async getActiveLoan(_, __, context) {
      if (!context.user) throw new Error('Authentication required');

      const activeLoan = await Loan.findOne({
        borrower: context.user.userId,
        status: { $in: ['LOAN_RECEIVED_PENDING', 'ACTIVE'] }
      })
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower');

      return activeLoan;
    },

    async getLoanHistory(_, { type, page = 1, limit = 10 }, context) {
      if (!context.user) throw new Error('Authentication required');

      const query = {};

      if (type === 'borrowed') {
        query.borrower = context.user.userId;
      } else if (type === 'lended') {
        query.lender = context.user.userId;
      } else {
        throw new Error('Type must be either "borrowed" or "lended"');
      }

      const skip = (page - 1) * limit;

      const loans = await Loan.find(query)
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit);

      return loans;
    },

    async getLoan(_, { id }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loan = await Loan.findById(id)
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower');

      if (!loan) throw new Error('Loan not found');

      // Check authorization
      const isBorrower = loan.borrower._id.toString() === context.user.userId;
      const isLender = loan.lender._id.toString() === context.user.userId;

      if (!isBorrower && !isLender) {
        throw new Error('Not authorized to view this loan');
      }

      return loan;
    },

    async getLoanOffers(_, { loanRequestId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      const offers = await LoanOffer.find({ loanRequestId })
        .populate('lenderId')
        .populate('loanRequestId')
        .sort({ createdAt: -1 });

      return offers;
    },

    async getMyActiveLoans(_, __, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        const activeLoans = await Loan.find({
          borrower: context.user.userId,
          status: { $in: ['ACTIVE', 'LOAN_RECEIVED_PENDING', 'COMPLETED', 'DEFAULTED'] }
        })
          .populate('borrower')
          .populate('lender')
          .populate('loanRequest')
          .sort({ createdAt: -1 });

        return activeLoans;
      } catch (error) {
        console.error("Error fetching active loans:", error);
        throw new Error("Failed to fetch active loans");
      }
    },

    async getMyLentLoans(_, __, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        const lentLoans = await Loan.find({
          lender: context.user.userId,
          status: { $in: ['ACTIVE', 'LOAN_RECEIVED_PENDING', 'COMPLETED', 'DEFAULTED'] }
        })
          .populate('borrower')
          .populate('lender')
          .populate('loanRequest')
          .sort({ createdAt: -1 });

        return lentLoans;
      } catch (error) {
        console.error("Error fetching lent loans:", error);
        throw new Error("Failed to fetch lent loans");
      }
    }
  },

  Mutation: {

    async createLoanRequest(_, { input }, context) {
      if (!context.user) throw new Error('Authentication required');
      console.log("Debug Input", input);

      try {
        const {
          amount, purpose, durationMonths, creditScore,
          securityType, collateralType, collateralValue, description,
          location
        } = input;

        // Check if user has an active loan
        const activeLoan = await Loan.findOne({
          borrower: context.user.userId,
          status: { $in: ['LOAN_RECEIVED_PENDING', 'ACTIVE'] }
        });

        if (activeLoan) {
          throw new Error('You already have an active loan. Please complete or close your existing loan before requesting a new one.');
        }

        // Check if user has a pending loan request
        const pendingLoanRequest = await LoanRequest.findOne({
          borrower: context.user.userId,
          status: 'PENDING'
        });

        if (pendingLoanRequest) {
          throw new Error('You already have a pending loan request. Please cancel your existing request or wait for it to be processed before creating a new one.');
        }

        // Fetch user to get profile location as fallback
        const user = await User.findById(context.user.userId);
        const userLocation = user?.location || (user?.profile?.location);

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
            location: location ? {
              type: 'Point',
              coordinates: location.coordinates,
              formattedAddress: location.formattedAddress,
              city: location.city
            } : userLocation,
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
    },

    async markLoanAsReceived(_, { loanRequestId, lenderId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check if user is the borrower
      if (loanRequest.borrower.toString() !== context.user.userId) {
        throw new Error('Not authorized. Only the borrower can mark loan as received');
      }

      // Check if lender expressed interest
      const lenderInterest = loanRequest.interestedLenders.find(
        interest => interest.lender.toString() === lenderId
      );

      if (!lenderInterest) {
        throw new Error('This lender has not expressed interest in your loan request');
      }

      // Create new Loan record
      const loan = new Loan({
        loanRequest: loanRequestId,
        borrower: context.user.userId,
        lender: lenderId,
        amount: loanRequest.amount,
        interestRate: lenderInterest.interestRate,
        durationMonths: loanRequest.durationMonths,
        status: 'LOAN_RECEIVED_PENDING',
        borrowerConfirmed: true,
        lenderConfirmed: false,
        selectedLenderByBorrower: lenderId,
        disbursementDate: new Date(),
        remainingAmount: loanRequest.amount,
        repayments: []
      });

      await loan.save();

      // Update loan request
      loanRequest.status = 'LOAN_RECEIVED_PENDING';
      loanRequest.linkedLoan = loan._id;
      await loanRequest.save();

      // Populate and return
      const populatedLoanRequest = await LoanRequest.findById(loanRequestId)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender')
        .populate('linkedLoan');

      return populatedLoanRequest;
    },

    async confirmLoanDisbursement(_, { loanId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loan = await Loan.findById(loanId);
      if (!loan) throw new Error('Loan not found');

      // Check if user is the lender
      if (loan.lender.toString() !== context.user.userId) {
        throw new Error('Not authorized. Only the lender can confirm disbursement');
      }

      // Check if loan is in pending state
      if (loan.status !== 'LOAN_RECEIVED_PENDING') {
        throw new Error('Loan is not in pending confirmation state');
      }

      // Set lender confirmed
      loan.lenderConfirmed = true;
      loan.confirmedDate = new Date();

      // If both confirmed and lender matches borrower's selection, activate loan
      if (loan.borrowerConfirmed &&
        loan.selectedLenderByBorrower.toString() === context.user.userId) {
        loan.status = 'ACTIVE';
      }

      await loan.save();

      // Populate and return
      const populatedLoan = await Loan.findById(loanId)
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower');

      return populatedLoan;
    },

    async recordRepayment(_, { input }, context) {
      if (!context.user) throw new Error('Authentication required');

      const { loanId, amount, note } = input;

      const loan = await Loan.findById(loanId);
      if (!loan) throw new Error('Loan not found');

      // Check if user is the lender
      if (loan.lender.toString() !== context.user.userId) {
        throw new Error('Not authorized. Only the lender can record repayments');
      }

      // Add repayment
      loan.repayments.push({
        amount,
        paidDate: new Date(),
        note
      });

      // Update totals
      loan.totalRepaid += amount;
      loan.remainingAmount = Math.max(0, loan.amount - loan.totalRepaid);

      // Auto-complete if fully repaid
      if (loan.remainingAmount === 0) {
        loan.status = 'COMPLETED';
      }

      await loan.save();

      // Populate and return
      const populatedLoan = await Loan.findById(loanId)
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower');

      return populatedLoan;
    },

    async markLoanAsCompleted(_, { loanId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loan = await Loan.findById(loanId);
      if (!loan) throw new Error('Loan not found');

      // Check authorization (both borrower and lender can mark as completed)
      const isBorrower = loan.borrower.toString() === context.user.userId;
      const isLender = loan.lender.toString() === context.user.userId;

      if (!isBorrower && !isLender) {
        throw new Error('Not authorized to complete this loan');
      }

      loan.status = 'COMPLETED';
      await loan.save();

      // Populate and return
      const populatedLoan = await Loan.findById(loanId)
        .populate('borrower')
        .populate('lender')
        .populate('loanRequest')
        .populate('selectedLenderByBorrower');

      return populatedLoan;
    },

    async editLoanReceived(_, { loanRequestId, lenderId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(loanRequestId)
        .populate('linkedLoan');

      if (!loanRequest) throw new Error('Loan request not found');

      // Check if user is the borrower
      if (loanRequest.borrower.toString() !== context.user.userId) {
        throw new Error('Not authorized. Only the borrower can edit loan details');
      }

      // Check if loan is in pending state
      if (!loanRequest.linkedLoan || loanRequest.linkedLoan.status !== 'LOAN_RECEIVED_PENDING') {
        throw new Error('Loan is not in editable state');
      }

      // Check if new lender expressed interest
      const lenderInterest = loanRequest.interestedLenders.find(
        interest => interest.lender.toString() === lenderId
      );

      if (!lenderInterest) {
        throw new Error('This lender has not expressed interest in your loan request');
      }

      // Update linked loan
      const loan = await Loan.findById(loanRequest.linkedLoan._id);
      loan.lender = lenderId;
      loan.selectedLenderByBorrower = lenderId;
      loan.interestRate = lenderInterest.interestRate;
      loan.lenderConfirmed = false; // Reset lender confirmation
      loan.confirmedDate = null;
      await loan.save();

      // Populate and return
      const populatedLoanRequest = await LoanRequest.findById(loanRequestId)
        .populate('borrower')
        .populate('selectedLender')
        .populate('interestedLenders.lender')
        .populate('linkedLoan');

      return populatedLoanRequest;
    },

    async deleteLoanRequest(_, { loanRequestId }, context) {
      if (!context.user) throw new Error('Authentication required');

      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check if user is the borrower (owner)
      if (loanRequest.borrower.toString() !== context.user.userId) {
        throw new Error('Not authorized. Only the borrower can delete their loan request');
      }

      // Only allow deletion of pending requests
      if (loanRequest.status !== 'PENDING') {
        throw new Error('Can only delete pending loan requests. This request has already been processed.');
      }

      // Delete the loan request
      await LoanRequest.findByIdAndDelete(loanRequestId);

      return {
        success: true,
        message: 'Loan request deleted successfully'
      };
    },

    async offerLoan(_, { input }, context) {
      if (!context.user) throw new Error('Authentication required');

      const { loanRequestId, interestRate, message } = input;

      // Get user to check role
      const user = await User.findById(context.user.userId);
      if (!user) throw new Error('User not found');

      // Check if user is a lender
      if (user.role !== 'lender' && user.role !== 'both') {
        throw new Error('Only lenders can make loan offers');
      }

      // Get loan request
      const loanRequest = await LoanRequest.findById(loanRequestId);
      if (!loanRequest) throw new Error('Loan request not found');

      // Check if loan request is still pending
      if (loanRequest.status !== 'PENDING') {
        throw new Error('This loan request is no longer accepting offers');
      }

      // Check if lender is trying to offer on their own request
      if (loanRequest.borrower.toString() === context.user.userId) {
        throw new Error('You cannot offer a loan on your own request');
      }

      // Validate interest rate
      if (interestRate < 0 || interestRate > 100) {
        throw new Error('Interest rate must be between 0 and 100');
      }

      // Check if lender already made an offer
      const existingOffer = await LoanOffer.findOne({
        loanRequestId,
        lenderId: context.user.userId
      });

      if (existingOffer) {
        // Update existing offer
        existingOffer.interestRate = interestRate;
        existingOffer.message = message;
        existingOffer.status = 'PENDING';
        await existingOffer.save();

        const updatedOffer = await LoanOffer.findById(existingOffer._id)
          .populate('lenderId');

        return updatedOffer;
      }

      // Create new offer
      const offer = new LoanOffer({
        loanRequestId,
        lenderId: context.user.userId,
        interestRate,
        amount: loanRequest.amount,
        message,
        status: 'PENDING'
      });

      await offer.save();

      const populatedOffer = await LoanOffer.findById(offer._id)
        .populate('lenderId');

      return populatedOffer;
    },

    async acceptLoanOffer(_, { offerId }, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        // Get the offer
        const offer = await LoanOffer.findById(offerId).populate('loanRequestId');
        if (!offer) throw new Error("Offer not found");

        // Get the loan request
        const loanRequest = await LoanRequest.findById(offer.loanRequestId);
        if (!loanRequest) throw new Error("Loan request not found");

        // Verify user is the borrower
        if (loanRequest.borrower.toString() !== context.user.userId) {
          throw new Error("Only the borrower can accept offers");
        }

        // Check if already accepted
        if (loanRequest.status === 'ACCEPTED') {
          throw new Error("This loan request has already been accepted");
        }

        // Update offer status
        offer.status = 'ACCEPTED';
        await offer.save();

        // Reject all other offers for this loan request
        await LoanOffer.updateMany(
          {
            loanRequestId: offer.loanRequestId,
            _id: { $ne: offerId }
          },
          { status: 'REJECTED' }
        );

        // Update loan request
        loanRequest.status = 'ACCEPTED';
        loanRequest.acceptedOfferId = offerId;
        loanRequest.acceptedAt = new Date();
        await loanRequest.save();

        // Calculate loan details
        // Calculate loan details
        const principal = loanRequest.amount;
        const rate = offer.interestRate / 100;
        const time = loanRequest.durationMonths / 12;
        const totalInterest = principal * rate * time;
        const totalRepayment = principal + totalInterest;

        // Create loan document
        const loan = new Loan({
          loanRequest: loanRequest._id,
          borrower: loanRequest.borrower,
          lender: offer.lenderId,
          amount: loanRequest.amount,
          interestRate: offer.interestRate,
          durationMonths: loanRequest.durationMonths,
          status: 'ACTIVE',
          disbursementDate: new Date(),
          dueDate: new Date(new Date().setMonth(new Date().getMonth() + loanRequest.durationMonths)),
          totalRepaid: 0,
          remainingAmount: totalRepayment,
          selectedLenderByBorrower: offer.lenderId,
          repayments: []
        });

        await loan.save();

        // Also update the linkedLoan in LoanRequest
        loanRequest.linkedLoan = loan._id;
        await loanRequest.save();

        // Populate the loan
        await loan.populate([
          { path: 'borrower' },
          { path: 'lender' },
          { path: 'loanRequest' }
        ]);

        return loan;
      } catch (error) {
        console.error("Error accepting loan offer:", error);
        throw error;
      }
    },

    async rejectLoanOffer(_, { offerId }, context) {
      if (!context.user) throw new Error("Authentication required");

      try {
        // Get the offer
        const offer = await LoanOffer.findById(offerId).populate('loanRequestId');
        if (!offer) throw new Error("Offer not found");

        // Get the loan request
        const loanRequest = await LoanRequest.findById(offer.loanRequestId);
        if (!loanRequest) throw new Error("Loan request not found");

        // Verify user is the borrower
        if (loanRequest.borrower.toString() !== context.user.userId) {
          throw new Error("Only the borrower can reject offers");
        }

        // Update offer status
        offer.status = 'REJECTED';
        await offer.save();

        // Re-populate before returning
        await offer.populate('lenderId');

        return offer;
      } catch (error) {
        console.error("Error rejecting loan offer:", error);
        throw error;
      }
    }
  },

  LoanOffer: {
    lender: (offer) => offer.lenderId || offer.lender,
    loanRequest: (offer) => offer.loanRequestId || offer.loanRequest,

    // Improved scalar ID extraction
    lenderId: (offer) => {
      const val = offer.lenderId || offer.lender;
      if (!val) return null;
      if (val._id) return val._id.toString();
      if (val.id) return val.id.toString();
      return val.toString();
    },
    loanRequestId: (offer) => {
      const val = offer.loanRequestId || offer.loanRequest;
      if (!val) return null;
      if (val._id) return val._id.toString();
      if (val.id) return val.id.toString();
      return val.toString();
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