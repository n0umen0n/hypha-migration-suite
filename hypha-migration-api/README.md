# Hypha Migration API

A backend API service for verifying HYPHA token migrations and executing test USDC transfers on Base mainnet. This API verifies that a migration has been completed on the Telos blockchain before allowing USDC transfers on Base.

## Features

- ✅ Verify HYPHA migration status on Telos blockchain
- ✅ Execute USDC transfers on Base mainnet (only after verified migration)
- ✅ Multiple verification methods: migration table, transaction ID, or hybrid
- ✅ Built for Vercel serverless deployment
- ✅ CORS enabled for frontend integration
- ✅ Comprehensive error handling and logging
- ✅ Health checks and status endpoints

## Migration Verification Methods

### 1. Migration Table Verification (Recommended)
**Endpoint**: `/api/transfer`
- ✅ **Most Secure**: Verifies migration is recorded in the blockchain table
- ✅ **Complete Data**: Access to migration amount, status, timestamps
- ❌ **Timing Issues**: May fail if table hasn't updated after successful transaction

### 2. Transaction ID Verification (Fast)
**Endpoint**: `/api/transfer-by-tx`
- ✅ **Immediate**: Works right after transaction submission
- ✅ **Transaction Proof**: Verifies the exact transaction succeeded
- ❌ **Limited Data**: Only confirms transaction success, not table state

### 3. Hybrid Verification (Best of Both)
**Endpoint**: `/api/transfer-hybrid`
- ✅ **Reliable**: Tries table first, falls back to transaction
- ✅ **User Friendly**: Works in all scenarios
- ✅ **Transparent**: Shows which verification method was used

## API Endpoints

### `GET /api/health`
Health check endpoint to verify API status and configuration.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "api": "operational",
    "baseNetwork": "connected (chainId: 8453)",
    "telosNetwork": "connected (head_block: 123456)"
  },
  "configuration": {
    "walletConfigured": true,
    "walletAddress": "0x1234...5678"
  }
}
```

### `GET/POST /api/status`
Check migration status without executing any transfers.

**Parameters:**
- `telosAccount` (string): Telos account name
- `ethAddress` (string): Ethereum address for migration verification

**Example Request:**
```bash
curl "https://your-api.vercel.app/api/status?telosAccount=myaccount&ethAddress=0x1234567890123456789012345678901234567890"
```

**Response:**
```json
{
  "success": true,
  "migrationVerified": true,
  "message": "Migration verified successfully",
  "data": {
    "migration": {
      "verified": true,
      "account": "myaccount",
      "ethAddress": "0x1234567890123456789012345678901234567890",
      "migrated": true
    },
    "eligibleForTransfer": true
  }
}
```

### `POST /api/transfer`
Execute USDC transfer using **migration table verification**.

**Request Body:**
```json
{
  "telosAccount": "myaccount",
  "ethAddress": "0x1234567890123456789012345678901234567890",
  "amount": "0.000001",
  "useRandomAddress": false
}
```

### `POST /api/transfer-by-tx`
Execute USDC transfer using **transaction ID verification**.

**Request Body:**
```json
{
  "telosAccount": "myaccount",
  "ethAddress": "0x1234567890123456789012345678901234567890",
  "transactionId": "abc123def456...",
  "amount": "0.000001",
  "useRandomAddress": false
}
```

### `POST /api/transfer-hybrid` (Recommended)
Execute USDC transfer using **hybrid verification** (table first, transaction fallback).

**Request Body:**
```json
{
  "telosAccount": "myaccount",
  "ethAddress": "0x1234567890123456789012345678901234567890",
  "transactionId": "abc123def456...",
  "amount": "0.000001",
  "useRandomAddress": false
}
```

**Note**: `transactionId` is optional but recommended for fallback verification.

**Response (All Transfer Endpoints):**
```json
{
  "success": true,
  "message": "Transfer completed successfully",
  "data": {
    "migration": {
      "verificationMethod": "migration-table|transaction|transaction-fallback",
      "verified": true,
      "account": "myaccount",
      "ethAddress": "0x1234567890123456789012345678901234567890",
      "migrated": true
    },
    "transfer": {
      "txHash": "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      "blockNumber": 654321,
      "gasUsed": "21000",
      "amount": "0.000001",
      "to": "0x1234567890123456789012345678901234567890",
      "from": "0x9876543210987654321098765432109876543210"
    }
  }
}
```

## Step-by-Step Deployment to Vercel

### Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **GitHub Account**: For code repository (recommended)
3. **Base Wallet**: Create a wallet with USDC and ETH for gas
4. **Vercel CLI** (optional): `npm i -g vercel`

### Step 1: Prepare Your Wallet

1. **Create a new wallet** specifically for this API (security best practice)
2. **Fund with ETH** on Base mainnet for gas fees (~0.01 ETH should be sufficient)
3. **Fund with USDC** on Base mainnet for test transfers (~1 USDC for testing)
4. **Export the private key** (you'll need this for environment variables)

### Step 2: Clone and Prepare the Code

```bash
# Navigate to your project
cd /path/to/your/project

# Verify the API structure
ls hypha-migration-api/
# Should show: api/, package.json, vercel.json, README.md, ENVIRONMENT.md
```

### Step 3: Install Dependencies Locally (Optional Testing)

```bash
cd hypha-migration-api
npm install
```

### Step 4: Create Local Environment File (Optional Testing)

```bash
# Create .env file in hypha-migration-api directory
cd hypha-migration-api
touch .env

# Add your configuration (edit with your preferred editor)
echo "PRIVATE_KEY=0xYOUR_PRIVATE_KEY_HERE" >> .env
echo "NODE_ENV=development" >> .env
```

**⚠️ IMPORTANT**: Never commit the `.env` file to version control!

### Step 5: Test Locally (Optional)

```bash
# Install Vercel CLI if not installed
npm i -g vercel

# Run local development server
vercel dev

# Test the endpoints
curl http://localhost:3000/api/health
```

### Step 6: Deploy to Vercel

#### Option A: Deploy with Vercel CLI

```bash
# Navigate to the API directory
cd hypha-migration-api

# Login to Vercel (if not already logged in)
vercel login

# Deploy
vercel

# Follow the prompts:
# - Set up and deploy? Yes
# - Which scope? Choose your account
# - Link to existing project? No (unless you have one)
# - What's your project's name? hypha-migration-api
# - In which directory is your code located? ./
```

#### Option B: Deploy via Vercel Dashboard

1. **Push to GitHub**:
   ```bash
   git add .
   git commit -m "Add Hypha migration API"
   git push origin main
   ```

2. **Import in Vercel**:
   - Go to [vercel.com/dashboard](https://vercel.com/dashboard)
   - Click "Add New..." → "Project"
   - Import your GitHub repository
   - Set the **Root Directory** to `hypha-migration-api`
   - Click "Deploy"

### Step 7: Configure Environment Variables

1. **Access Project Settings**:
   - Go to your Vercel dashboard
   - Select your project
   - Click "Settings" tab
   - Click "Environment Variables"

2. **Add Required Variables**:
   ```
   Name: PRIVATE_KEY
   Value: 0xYOUR_ACTUAL_PRIVATE_KEY_HERE
   Environment: Production, Preview, Development (select all)
   ```

   ```
   Name: NODE_ENV
   Value: production
   Environment: Production
   ```

3. **Redeploy** (environment variables require a redeploy):
   - Go to "Deployments" tab
   - Click the three dots next to latest deployment
   - Click "Redeploy"

### Step 8: Test Your Deployment

1. **Check Health Endpoint**:
   ```bash
   curl https://your-project-name.vercel.app/api/health
   ```

2. **Test Status Check** (replace with real values):
   ```bash
   curl "https://your-project-name.vercel.app/api/status?telosAccount=myaccount&ethAddress=0x1234567890123456789012345678901234567890"
   ```

3. **Test Transfer** (only if migration is verified):
   ```bash
   curl -X POST https://your-project-name.vercel.app/api/transfer \
     -H "Content-Type: application/json" \
     -d '{
       "telosAccount": "myaccount",
       "ethAddress": "0x1234567890123456789012345678901234567890",
       "amount": "0.000001",
       "useRandomAddress": true
     }'
   ```

### Step 9: Frontend Integration

Update your frontend to use the deployed API:

```javascript
// In your React component
const API_BASE_URL = 'https://your-project-name.vercel.app/api';

const checkMigrationStatus = async (telosAccount, ethAddress) => {
  const response = await fetch(`${API_BASE_URL}/status`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      telosAccount,
      ethAddress
    })
  });
  return response.json();
};

const executeTransfer = async (telosAccount, ethAddress) => {
  const response = await fetch(`${API_BASE_URL}/transfer`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      telosAccount,
      ethAddress,
      amount: '0.000001',
      useRandomAddress: true // For testing
    })
  });
  return response.json();
};
```

### Step 10: Production Considerations

1. **Security Enhancements**:
   - Implement API key authentication
   - Add rate limiting
   - Set up request logging
   - Use a dedicated wallet with minimal funds

2. **Monitoring**:
   - Set up Vercel monitoring
   - Configure alerts for failures
   - Monitor wallet balance

3. **Error Handling**:
   - Implement retry mechanisms
   - Add circuit breakers for external services
   - Set up proper logging

## Troubleshooting

### Common Issues

1. **"Wallet not configured"**:
   - Ensure `PRIVATE_KEY` environment variable is set
   - Redeploy after adding environment variables

2. **"Insufficient balance"**:
   - Fund your wallet with USDC and ETH
   - Check balance using `/api/health` endpoint

3. **"Migration not verified"**:
   - Ensure the migration was completed on Telos
   - Check the Telos account name and Ethereum address match

4. **CORS errors**:
   - API includes CORS headers for all origins
   - Ensure you're using HTTPS in production

### Getting Help

- Check Vercel deployment logs in the dashboard
- Use `/api/health` endpoint to diagnose configuration issues
- Verify environment variables are set correctly

## Security Notes

- **Never commit private keys** to version control
- **Use a dedicated wallet** with minimal funds for this API
- **Implement authentication** in production environments
- **Monitor API usage** and set up rate limiting
- **Regular security audits** of wallet and API access

## Development

```bash
# Install dependencies
npm install

# Run local development
vercel dev

# Test endpoints
npm test  # (if tests are added)
```

For detailed environment configuration, see [ENVIRONMENT.md](./ENVIRONMENT.md).
