const { ethers } = require('ethers');
const axios = require('axios');

// Base Mainnet configuration
const BASE_RPC_URL = 'https://mainnet.base.org';
const BASE_CHAIN_ID = 8453;

// USDC contract on Base Mainnet
const USDC_CONTRACT_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const USDC_ABI = [
  {
    "constant": false,
    "inputs": [
      {"name": "_to", "type": "address"},
      {"name": "_value", "type": "uint256"}
    ],
    "name": "transfer",
    "outputs": [{"name": "", "type": "bool"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [{"name": "_owner", "type": "address"}],
    "name": "balanceOf",
    "outputs": [{"name": "balance", "type": "uint256"}],
    "type": "function"
  },
  {
    "constant": true,
    "inputs": [],
    "name": "decimals",
    "outputs": [{"name": "", "type": "uint8"}],
    "type": "function"
  }
];

// Telos configuration for migration verification
const TELOS_RPC_URL = 'https://mainnet.telos.net';
const MIGRATION_CONTRACT = 'migratehypha';

class BlockchainService {
  constructor() {
    this.baseProvider = new ethers.JsonRpcProvider(BASE_RPC_URL);
    this.wallet = null;
    this.usdcContract = null;
    
    if (process.env.PRIVATE_KEY) {
      this.wallet = new ethers.Wallet(process.env.PRIVATE_KEY, this.baseProvider);
      this.usdcContract = new ethers.Contract(USDC_CONTRACT_ADDRESS, USDC_ABI, this.wallet);
    }
  }

  // Verify migration status on Telos blockchain
  async verifyMigrationStatus(telosAccount, ethAddress) {
    try {
      console.log(`Verifying migration for ${telosAccount} -> ${ethAddress}`);
      
      const response = await axios.post(`${TELOS_RPC_URL}/v1/chain/get_table_rows`, {
        code: MIGRATION_CONTRACT,
        scope: MIGRATION_CONTRACT,
        table: 'migrations',
        lower_bound: telosAccount,
        upper_bound: telosAccount,
        limit: 1,
        key_type: 'name',
        json: true
      });

      if (!response.data.rows || response.data.rows.length === 0) {
        throw new Error('Account not found in migration table');
      }

      const migrationEntry = response.data.rows[0];
      console.log('Migration entry:', migrationEntry);

      // Extract data based on structure
      let accountName, ethAddr, migrated;
      
      if (Array.isArray(migrationEntry) || (typeof migrationEntry === 'object' && Object.keys(migrationEntry)[0] === '0')) {
        accountName = migrationEntry[0] || migrationEntry['0'];
        ethAddr = migrationEntry[2] || migrationEntry['2'];
        migrated = migrationEntry[3] || migrationEntry['3'];
      } else {
        accountName = migrationEntry.account;
        ethAddr = migrationEntry.eth_address;
        migrated = migrationEntry.migrated;
      }

      console.log('Extracted data:', { accountName, ethAddr, migrated });

      // Verify the account matches
      if (accountName !== telosAccount) {
        throw new Error('Account name mismatch');
      }

      // Verify the migration is completed
      if (!migrated) {
        throw new Error('Migration not completed yet');
      }

      // Verify the Ethereum address matches (case insensitive)
      if (ethAddr.toLowerCase() !== ethAddress.toLowerCase()) {
        throw new Error('Ethereum address mismatch');
      }

      return {
        verified: true,
        account: accountName,
        ethAddress: ethAddr,
        migrated: migrated
      };

    } catch (error) {
      console.error('Migration verification error:', error);
      throw error;
    }
  }

  // Verify transaction success by transaction ID
  async verifyTransactionSuccess(transactionId, expectedAccount, expectedEthAddress) {
    try {
      console.log(`Verifying transaction: ${transactionId}`);
      
      const response = await axios.post(`${TELOS_RPC_URL}/v1/history/get_transaction`, {
        id: transactionId
      });

      if (!response.data || !response.data.trx) {
        throw new Error('Transaction not found');
      }

      const transaction = response.data.trx;
      
      // Check if transaction was successful
      if (!transaction.receipt || transaction.receipt.status !== 'executed') {
        throw new Error('Transaction was not executed successfully');
      }

      // Check if this is a migration transaction
      const actions = transaction.trx.actions || [];
      const migrationAction = actions.find(action => 
        action.account === MIGRATION_CONTRACT && 
        action.name === 'migrate'
      );

      if (!migrationAction) {
        throw new Error('No migration action found in transaction');
      }

      // Verify the action data matches expected values
      const actionData = migrationAction.data;
      if (actionData.user !== expectedAccount) {
        throw new Error('Transaction account mismatch');
      }

      if (actionData.eth_address.toLowerCase() !== expectedEthAddress.toLowerCase()) {
        throw new Error('Transaction Ethereum address mismatch');
      }

      return {
        verified: true,
        transactionId: transactionId,
        account: actionData.user,
        ethAddress: actionData.eth_address,
        blockNumber: transaction.block_num,
        blockTime: transaction.block_time
      };

    } catch (error) {
      console.error('Transaction verification error:', error);
      throw error;
    }
  }

  // Get USDC balance
  async getUSDCBalance(address) {
    try {
      if (!this.usdcContract) {
        throw new Error('USDC contract not initialized');
      }

      const balance = await this.usdcContract.balanceOf(address);
      const decimals = await this.usdcContract.decimals();
      
      return {
        balance: balance.toString(),
        formatted: ethers.formatUnits(balance, decimals),
        decimals: decimals
      };
    } catch (error) {
      console.error('Error getting USDC balance:', error);
      throw error;
    }
  }

  // Transfer USDC
  async transferUSDC(toAddress, amount) {
    try {
      if (!this.wallet || !this.usdcContract) {
        throw new Error('Wallet or USDC contract not initialized');
      }

      console.log(`Transferring ${amount} USDC to ${toAddress}`);

      // Convert amount to proper units (USDC has 6 decimals)
      const decimals = await this.usdcContract.decimals();
      const amountInUnits = ethers.parseUnits(amount.toString(), decimals);

      console.log(`Amount in units: ${amountInUnits.toString()}`);

      // Check balance before transfer
      const senderBalance = await this.usdcContract.balanceOf(this.wallet.address);
      console.log(`Sender balance: ${ethers.formatUnits(senderBalance, decimals)} USDC`);

      if (senderBalance < amountInUnits) {
        throw new Error('Insufficient USDC balance');
      }

      // Estimate gas
      const gasEstimate = await this.usdcContract.transfer.estimateGas(toAddress, amountInUnits);
      console.log(`Gas estimate: ${gasEstimate.toString()}`);

      // Execute transfer
      const tx = await this.usdcContract.transfer(toAddress, amountInUnits, {
        gasLimit: gasEstimate + BigInt(10000) // Add some buffer
      });

      console.log(`Transaction hash: ${tx.hash}`);

      // Wait for confirmation
      const receipt = await tx.wait();
      console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

      return {
        txHash: tx.hash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        amount: amount,
        to: toAddress,
        from: this.wallet.address
      };

    } catch (error) {
      console.error('Error transferring USDC:', error);
      throw error;
    }
  }

  // Get a random Base address for testing
  getRandomAddress() {
    return ethers.Wallet.createRandom().address;
  }

  // Validate Ethereum address
  isValidAddress(address) {
    return ethers.isAddress(address);
  }
}

module.exports = BlockchainService; 