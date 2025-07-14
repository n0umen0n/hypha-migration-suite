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

    const { telosAccount, ethAddress, amount } = req.body;

    // Validate required fields
    if (!telosAccount || !ethAddress) {
      return res.status(400).json({
        error: 'Missing required fields',
        message: 'telosAccount and ethAddress are required'
      });
    }

    // Validate Ethereum address format
    if (!blockchainService.isValidAddress(ethAddress)) {
      return res.status(400).json({
        error: 'Invalid address',
        message: 'Invalid Ethereum address format'
      });
    }

    // Set default amount for testing (0.000001 USDC)
    const transferAmount = amount || '0.000001';

    console.log(`Transfer request: ${telosAccount} -> ${ethAddress}, amount: ${transferAmount} USDC`);

    // Step 1: Verify migration status
    console.log('Step 1: Verifying migration status...');
    let migrationStatus;
    try {
      migrationStatus = await blockchainService.verifyMigrationStatus(telosAccount, ethAddress);
      console.log('Migration verified:', migrationStatus);
    } catch (error) {
      console.error('Migration verification failed:', error);
      return res.status(400).json({
        error: 'Migration verification failed',
        message: error.message,
        code: 'MIGRATION_NOT_VERIFIED'
      });
    }

    // Step 2: Check if wallet is configured
    if (!process.env.PRIVATE_KEY) {
      return res.status(500).json({
        error: 'Server configuration error',
        message: 'Wallet not configured for transfers'
      });
    }

    // Step 3: For testing, use random address or the provided ethAddress
    const targetAddress = req.body.useRandomAddress ? 
      blockchainService.getRandomAddress() : 
      ethAddress;

    console.log(`Target address for transfer: ${targetAddress}`);

    // Step 4: Get current USDC balance
    console.log('Step 4: Checking USDC balance...');
    let senderBalance;
    try {
      senderBalance = await blockchainService.getUSDCBalance(process.env.WALLET_ADDRESS || 
        new (require('ethers')).Wallet(process.env.PRIVATE_KEY).address);
      console.log('Sender balance:', senderBalance);
    } catch (error) {
      console.error('Balance check failed:', error);
      return res.status(500).json({
        error: 'Balance check failed',
        message: error.message
      });
    }

    // Check if we have enough balance
    if (parseFloat(senderBalance.formatted) < parseFloat(transferAmount)) {
      return res.status(400).json({
        error: 'Insufficient balance',
        message: `Sender balance: ${senderBalance.formatted} USDC, required: ${transferAmount} USDC`
      });
    }

    // Step 5: Execute transfer
    console.log('Step 5: Executing USDC transfer...');
    let transferResult;
    try {
      transferResult = await blockchainService.transferUSDC(targetAddress, transferAmount);
      console.log('Transfer completed:', transferResult);
    } catch (error) {
      console.error('Transfer failed:', error);
      return res.status(500).json({
        error: 'Transfer failed',
        message: error.message,
        code: 'TRANSFER_FAILED'
      });
    }

    // Success response
    return res.status(200).json({
      success: true,
      message: 'Transfer completed successfully',
      data: {
        migration: migrationStatus,
        transfer: transferResult,
        targetAddress: targetAddress,
        senderBalance: senderBalance
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