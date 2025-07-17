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
    if (!telosAccount || !ethAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'telosAccount and ethAddress are required. transactionId is optional for fallback verification.'
      });
    }

    // Validate Ethereum address format
    if (!blockchainService.isValidAddress(ethAddress)) {
      return res.status(400).json({
        error: 'Invalid address',
        message: 'Invalid Ethereum address format'
      });
    }

    console.log(`Hybrid mint request: ${telosAccount} -> ${ethAddress}, TX: ${transactionId || 'none'}`);

    let migrationStatus;
    let verificationMethod;

    // Step 1: Try migration table verification first
    console.log('Step 1a: Trying migration table verification...');
    try {
      migrationStatus = await blockchainService.verifyMigrationStatus(telosAccount, ethAddress);
      verificationMethod = 'migration-table';
      console.log('Migration table verification successful:', migrationStatus);
    } catch (tableError) {
      console.log('Migration table verification failed:', tableError.message);
      
      // Step 1b: Fall back to transaction verification if transactionId provided
      if (transactionId) {
        console.log('Step 1b: Trying transaction verification fallback...');
        try {
          migrationStatus = await blockchainService.verifyTransactionSuccess(transactionId, telosAccount, ethAddress);
          verificationMethod = 'transaction-fallback';
          console.log('Transaction verification successful:', migrationStatus);
        } catch (txError) {
          console.log('Transaction verification also failed:', txError.message);
          return res.status(400).json({
            error: 'Migration verification failed',
            message: `Both table verification (${tableError.message}) and transaction verification (${txError.message}) failed`,
            code: 'MIGRATION_NOT_VERIFIED'
          });
        }
      } else {
        return res.status(400).json({
          error: 'Migration verification failed',
          message: tableError.message + '. No transaction ID provided for fallback verification.',
          code: 'MIGRATION_NOT_VERIFIED'
        });
      }
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
          verificationMethod,
          ...migrationStatus
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