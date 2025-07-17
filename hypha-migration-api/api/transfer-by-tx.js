const BlockchainService = require('./utils/blockchain');

// Initialize blockchain service
const blockchainService = new BlockchainService();

// CORS headers
const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

module.exports = async (req, res) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return res.status(200).json({});
  }

  // Set CORS headers
  Object.keys(corsHeaders).forEach(key => {
    res.setHeader(key, corsHeaders[key]);
  });

  try {
    if (req.method !== 'POST') {
      return res.status(405).json({
        error: 'Method not allowed',
        message: 'Only POST requests are supported'
      });
    }

    const { telosAccount, ethAddress, transactionId, amount } = req.body;

    // Validate required fields
    if (!telosAccount || !ethAddress || !transactionId) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'telosAccount, ethAddress, and transactionId are required'
      });
    }

    // Validate Ethereum address format
    if (!blockchainService.isValidAddress(ethAddress)) {
      return res.status(400).json({
        error: 'Invalid address',
        message: 'Invalid Ethereum address format'
      });
    }

    console.log(`Mint request by TX: ${telosAccount} -> ${ethAddress}, TX: ${transactionId}`);

    // Step 1: Verify migration transaction
    console.log('Step 1: Verifying migration transaction...');
    let transactionStatus;
    try {
      transactionStatus = await blockchainService.verifyTransactionSuccess(transactionId, telosAccount, ethAddress);
      console.log('Transaction verified:', transactionStatus);
    } catch (error) {
      console.error('Transaction verification failed:', error);
      return res.status(400).json({
        error: 'Transaction verification failed',
        message: error.message,
        code: 'TRANSACTION_NOT_VERIFIED'
      });
    }

    // Step 2: Check if wallet is configured
    if (!process.env.PRIVATE_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Wallet not configured for minting'
      });
    }

    // Step 3: Execute mint
    console.log('Step 3: Executing HYPHA mint...');
    let mintResult;
    try {
      mintResult = await blockchainService.mintHypha(telosAccount, ethAddress);
      console.log('Mint completed:', mintResult);
    } catch (error) {
      console.error('Mint failed:', error);
      return res.status(500).json({
        error: 'Mint failed',
        message: error.message,
        code: 'MINT_FAILED'
      });
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: 'Mint completed successfully',
      data: {
        migration: {
          verificationMethod: 'transaction',
          ...transactionStatus
        },
        mint: mintResult
      }
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({
      error: 'Internal server error',
      message: error.message
    });
  }
}; 