import { useState, useEffect } from 'react'
import { UAL } from 'universal-authenticator-library'
import { HyphaAuthenticator } from '@hypha-dao/ual-hypha'

const HyphaWallet = () => {
  const [status, setStatus] = useState({ message: 'Initializing...', type: 'info' })
  const [isLoading, setIsLoading] = useState(false)
  const [currentUser, setCurrentUser] = useState(null)
  const [migrationData, setMigrationData] = useState(null)
  const [isConnected, setIsConnected] = useState(false)
  const [ual, setUal] = useState(null)
  const [authenticator, setAuthenticator] = useState(null)
  const [migrationJustCompleted, setMigrationJustCompleted] = useState(false)

  // Extract Ethereum address from URL path
  const getEthAddressFromUrl = () => {
    const path = window.location.pathname
    const address = path.startsWith('/') ? path.slice(1) : path
    return address || ''
  }

  const ethAddress = getEthAddressFromUrl()

  // Validate Ethereum address format
  const isValidEthAddress = (address) => {
    return address && 
           address.length === 42 && 
           address.startsWith('0x') &&
           /^0x[a-fA-F0-9]{40}$/.test(address)
  }

  // Telos Mainnet configuration
  const config = {
    chainId: '4667b205c6838ef70ff7988f6e8257e8be0e1284a2f59699054a018f743b1d11',
    rpcEndpoint: 'https://mainnet.telos.net',
    appName: 'HyphaWalletDemo',
    migrationContract: 'migratehypha' // Actual contract account where migration contract is deployed
  }

  useEffect(() => {
    // Apply dark mode by default
    document.documentElement.classList.add('dark')
    initializeUAL()
    
    // Validate Ethereum address from URL on component mount
    if (!isValidEthAddress(ethAddress)) {
      setStatus({ 
        message: 'Invalid Ethereum address in URL. Please use format: /0x...', 
        type: 'error' 
      })
    }
  }, [])

  const initializeUAL = async () => {
    const maxRetries = 2;
    let attempt = 0;
    
    const attemptInitialization = async () => {
      try {
        setStatus({ message: attempt > 0 ? `Retrying initialization (${attempt + 1}/${maxRetries})...` : 'Loading Hypha authenticator...', type: 'info' })
        
        // Add delay for retries
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1500))
        }
        
        const mainChain = {
          chainId: config.chainId,
          rpcEndpoints: [{
            protocol: 'https',
            host: 'mainnet.telos.net',
            port: 443
          }]
        }

        const hyphaAuth = new HyphaAuthenticator([mainChain], {
          appName: config.appName,
          translation: {
            login: {
              title: 'Login',
              text: 'Scan the QR-code with Hypha Wallet on your mobile device in order to sign this transaction request',
              actionText: 'Launch On Desktop'
            },
            signTransaction: {
              title: 'Sign Transaction', 
              text: 'Scan the QR-code with Hypha Wallet on your mobile device in order to sign this transaction request',
              actionText: 'Launch On Desktop'
            }
          }
        })

        const ualInstance = new UAL([mainChain], config.appName, [hyphaAuth])
        
        // Set ualName like other implementations
        hyphaAuth.ualName = 'hypha'
        
        setUal(ualInstance)
        setAuthenticator(hyphaAuth)
        setStatus({ message: 'Ready to connect', type: 'success' })
        
        return true // Success
        
      } catch (error) {
        console.error(`UAL initialization attempt ${attempt + 1} error:`, error)
        
        if (attempt < maxRetries - 1) {
          attempt++
          console.log(`Retrying UAL initialization due to: ${error.message}`)
          return attemptInitialization() // Recursive retry
        } else {
          console.error('UAL initialization error:', error)
          setStatus({ message: `Initialization failed: ${error.message}`, type: 'error' })
          throw error
        }
      }
    }
    
    try {
      await attemptInitialization()
    } catch (error) {
      console.error('Final UAL initialization error:', error)
    }
  }

  const loginWithHypha = async () => {
    const maxRetries = 3;
    let attempt = 0;
    
    const attemptLogin = async () => {
      try {
        setIsLoading(true)
        setStatus({ message: attempt > 0 ? `Retrying connection (${attempt + 1}/${maxRetries})...` : 'Connecting to wallet...', type: 'info' })
        
        if (!authenticator) {
          throw new Error('Authenticator not initialized')
        }

        // Add small delay before each attempt to avoid race conditions
        if (attempt > 0) {
          await new Promise(resolve => setTimeout(resolve, 1000))
        }

        // Re-initialize the authenticator on retry attempts
        if (attempt > 0) {
          console.log('Re-initializing authenticator for retry...')
          await authenticator.init()
        } else {
          await authenticator.init()
        }
        
        const users = await authenticator.login()
        
        if (!users || users.length === 0) {
          throw new Error('No users returned')
        }

        const user = users[0]
        setCurrentUser(user)
        setIsConnected(true)
        
        setStatus({ message: `Connected: ${user.accountName}`, type: 'success' })
        await checkMigrationEligibility(user.accountName)
        
        return true // Success
        
      } catch (error) {
        console.error(`Login attempt ${attempt + 1} error:`, error)
        
        // Check if this is the unauthorized error that can be retried
        const isRetryableError = error.message.includes('unauthorized') || 
                                error.message.includes('UALHyphaWalletError') ||
                                error.message.includes('not initialized') ||
                                error.message.includes('connection')
        
        if (isRetryableError && attempt < maxRetries - 1) {
          attempt++
          console.log(`Retrying login due to: ${error.message}`)
          return attemptLogin() // Recursive retry
        } else {
          // Final error - not retryable or max retries reached
          let errorMessage = error.message
          
          if (error.message.includes('unauthorized')) {
            errorMessage = 'Authentication failed. Please ensure your Hypha wallet is unlocked and try again.'
          } else if (error.message.includes('User denied') || error.message.includes('rejected')) {
            errorMessage = 'Connection rejected by user'
          } else if (error.message.includes('not found') || error.message.includes('unavailable')) {
            errorMessage = 'Hypha wallet not found. Please install Hypha wallet.'
          }
          
          setStatus({ message: `Connection failed: ${errorMessage}`, type: 'error' })
          throw error
        }
      }
    }

    try {
      await attemptLogin()
    } catch (error) {
      // Final error handling
      console.error('Final login error after all retries:', error)
    } finally {
      setIsLoading(false)
    }
  }

  const checkMigrationEligibility = async (accountName = null) => {
    if (!accountName && !currentUser) return

    const account = accountName || currentUser.accountName

    try {
      setStatus({ message: 'Checking migration eligibility...', type: 'info' })
      
      // Query the migration contract table
      const tableResponse = await fetch(`${config.rpcEndpoint}/v1/chain/get_table_rows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: config.migrationContract,
          scope: config.migrationContract,
          table: 'migrations',
          lower_bound: account,
          upper_bound: account,
          limit: 1,
          key_type: 'name',
          json: true
        })
      })
      
      const tableData = await tableResponse.json()
      console.log('Migration table response:', tableData)
      
      if (tableData.rows && tableData.rows.length > 0) {
        const migrationEntry = tableData.rows[0]
        console.log('Migration entry found:', migrationEntry)
        console.log('Migration entry keys:', Object.keys(migrationEntry))
        console.log('Migration entry JSON:', JSON.stringify(migrationEntry))
        console.log('Amount field:', migrationEntry.amount)
        console.log('Amount type:', typeof migrationEntry.amount)
        
        // Try to extract data based on the table structure from your contract:
        // struct migrationentry {
        //   name account;        // index 0
        //   asset amount;        // index 1  
        //   std::string eth_address; // index 2
        //   bool migrated;       // index 3
        //   uint64_t timestamp;  // index 4
        // }
        
        let accountName, amountValue, ethAddress, migrated, timestamp;
        
        if (Array.isArray(migrationEntry) || (typeof migrationEntry === 'object' && Object.keys(migrationEntry)[0] === '0')) {
          // Data is in array format
          console.log('Data is in array format')
          accountName = migrationEntry[0] || migrationEntry['0'];
          amountValue = migrationEntry[1] || migrationEntry['1'];
          ethAddress = migrationEntry[2] || migrationEntry['2'];
          migrated = migrationEntry[3] || migrationEntry['3'];
          timestamp = migrationEntry[4] || migrationEntry['4'];
        } else {
          // Data is in object format
          console.log('Data is in object format')
          accountName = migrationEntry.account;
          amountValue = migrationEntry.amount;
          ethAddress = migrationEntry.eth_address;
          migrated = migrationEntry.migrated;
          timestamp = migrationEntry.timestamp;
        }
        
        console.log('Extracted values:', {
          account: accountName,
          amount: amountValue,
          eth_address: ethAddress,
          migrated: migrated,
          timestamp: timestamp
        });
        
        // Handle asset type - it could be a string like "100.0000 HYPHA" or an object
        let amountDisplay = amountValue;
        if (typeof amountValue === 'object' && amountValue !== null) {
          console.log('Amount is object:', amountValue)
          // If amount is an object, try to extract the string representation
          amountDisplay = amountValue.quantity || amountValue.toString() || JSON.stringify(amountValue);
        } else if (typeof amountValue === 'string') {
          console.log('Amount is string:', amountValue)
          amountDisplay = amountValue;
        } else if (amountValue === undefined || amountValue === null) {
          console.log('Amount is undefined/null, setting to 0.0000 HYPHA')
          amountDisplay = '0.0000 HYPHA';
        } else {
          console.log('Amount is other type:', typeof amountValue, amountValue)
          amountDisplay = `${amountValue} HYPHA`;
        }
        
        console.log('Final amount display:', amountDisplay)
        
        setMigrationData({
          account: accountName || account,
          amount: amountDisplay,
          ethAddress: ethAddress || '',
          migrated: migrated || false,
          timestamp: timestamp || 0,
          eligible: true
        })
        
        if (migrated) {
          setStatus({ message: 'Account has already migrated', type: 'success' })
        } else {
          setStatus({ message: `Eligible to migrate ${amountDisplay}`, type: 'success' })
        }
      } else {
        console.log('No migration entry found for account:', account)
        setMigrationData({
          account: account,
          amount: '0.0000 HYPHA',
          ethAddress: '',
          migrated: false,
          timestamp: 0,
          eligible: false
        })
        setStatus({ message: 'Account not eligible for migration', type: 'error' })
      }
      
    } catch (error) {
      console.error('Error checking migration eligibility:', error)
      setStatus({ message: `Failed to check eligibility: ${error.message}`, type: 'error' })
    }
  }

  const logout = async () => {
    try {
      if (authenticator && typeof authenticator.logout === 'function') {
        await authenticator.logout()
      }
      
      // Reset all state
      setCurrentUser(null)
      setIsConnected(false)
      setMigrationData(null)
      setMigrationJustCompleted(false)
      
      // Clear any cached authentication state
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('autoLogin')
        localStorage.removeItem('known-user')
      }
      
      setStatus({ message: 'Disconnected', type: 'info' })
      
      // Re-initialize UAL to ensure clean state
      setTimeout(() => {
        initializeUAL()
      }, 500)
      
    } catch (error) {
      console.error('Logout error:', error)
      // Force reset even if logout fails
      setCurrentUser(null)
      setIsConnected(false)
      setMigrationData(null)
      setMigrationJustCompleted(false)
      setStatus({ message: 'Disconnected (forced)', type: 'info' })
    }
  }

  const retryConnection = () => {
    console.log('Manual retry requested by user')
    setStatus({ message: 'Retrying connection...', type: 'info' })
    
    // Reset authenticator state
    setCurrentUser(null)
    setIsConnected(false)
    setMigrationData(null)
    
    // Small delay then try login again
    setTimeout(() => {
      loginWithHypha()
    }, 500)
  }

  const migrateHypha = async () => {
    if (!currentUser) {
      setStatus({ message: 'No account connected', type: 'error' })
      return
    }

    if (!migrationData || !migrationData.eligible) {
      setStatus({ message: 'Account not eligible for migration', type: 'error' })
      return
    }

    if (migrationData.migrated) {
      setStatus({ message: 'Account has already migrated', type: 'error' })
      return
    }

    if (!ethAddress || !isValidEthAddress(ethAddress)) {
      setStatus({ message: 'Invalid Ethereum address in URL. Please navigate to /0x...', type: 'error' })
      return
    }

    try {
      setIsLoading(true)
      setStatus({ message: 'Preparing migration...', type: 'info' })

      const accountName = currentUser.accountName

      const actions = [{
        account: config.migrationContract,
        name: 'migrate',
        authorization: [{
          actor: accountName,
          permission: 'active'
        }],
        data: {
          user: accountName,
          eth_address: ethAddress
        }
      }]

      const result = await currentUser.signTransaction(
        {
          actions
        },
        {
          blocksBehind: 3,
          expireSeconds: 300
        }
      )

      console.log('Migration transaction result:', result)
      console.log('Result keys:', result ? Object.keys(result) : 'null result')
      
      // Check for various possible transaction ID fields
      const txId = result?.transactionId || 
                   result?.transaction_id || 
                   result?.processed?.id ||
                   result?.processed?.transaction_id ||
                   result?.id ||
                   result?.txid

      console.log('Extracted transaction ID:', txId)

      if (result && txId) {
        setStatus({ message: `Migration successful: ${txId}`, type: 'success' })
        
        // Call the migration API to trigger USDC transfer on Base
        try {
          setStatus({ message: 'Processing: give it few seconds', type: 'info' })
          
          const apiResponse = await fetch('https://hypha-migration-suite.vercel.app/api/transfer-hybrid', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              telosAccount: accountName,
              ethAddress: ethAddress
            })
          })
          
          const apiResult = await apiResponse.json()
          
          if (apiResponse.ok) {
            setStatus({ 
              message: `Migration finalized!`, 
              type: 'success' 
            })
            setMigrationJustCompleted(true)
          } else {
            console.error('API Error:', apiResult)
            setStatus({ 
              message: `Migration recorded but transfer failed: ${apiResult.error || 'Unknown error'}`, 
              type: 'error' 
            })
          }
        } catch (apiError) {
          console.error('API call failed:', apiError)
          setStatus({ 
            message: `Migration successful but API call failed: ${apiError.message}`, 
            type: 'error' 
          })
        }
        
        // Removed automatic refresh - let user manually refresh if needed
        // setTimeout(() => checkMigrationEligibility(), 3000)
      } else if (result) {
        // Transaction might have succeeded even without clear ID
        console.log('Transaction may have succeeded, checking migration status...')
        setStatus({ message: 'Transaction submitted successfully! Please refresh the page to see updated status.', type: 'success' })
        
        // Removed automatic status check - let user manually refresh page
        // setTimeout(async () => {
        //   await checkMigrationEligibility()
        //   if (migrationData?.migrated) {
        //     setStatus({ message: 'Migration completed successfully!', type: 'success' })
        //   } else {
        //     setStatus({ message: 'Transaction submitted but status unclear. Please refresh to check.', type: 'info' })
        //   }
        // }, 2000)
      } else {
        throw new Error('Transaction failed - no result returned')
      }
      
    } catch (error) {
      console.error('Migration error:', error)
      setStatus({ message: `Migration failed: ${error.message}`, type: 'error' })
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div style={{ 
      minHeight: '100vh',
      background: '#0a0a0a',
      color: '#ffffff',
      fontFamily: 'var(--font-text)'
    }}>
      {/* Header Navigation */}
      <nav style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '1rem 2rem',
        background: '#1a1a1a',
        borderBottom: '1px solid #333'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          {/* Hypha Logo */}
          <svg width="112" height="35" viewBox="0 0 112 35" fill="none" xmlns="http://www.w3.org/2000/svg">
            <g clipPath="url(#clip0_158_2147)">
              <path d="M0.77832 12.2962C1.20526 10.8837 1.80866 9.53366 2.57352 8.27966C1.80367 9.5309 1.19996 10.8816 0.77832 12.2962Z" fill="#E8ECD7"/>
              <path d="M0.748047 12.4022C0.754466 12.3666 0.764845 12.3319 0.77898 12.2987C0.766609 12.3325 0.756279 12.3671 0.748047 12.4022Z" fill="#E8ECD7"/>
              <path d="M0.697438 12.58C0.551965 13.0504 0.434183 13.5294 0.344727 14.0144C0.409082 13.7273 0.468104 13.4407 0.543482 13.1708C0.588282 12.9759 0.641615 12.7723 0.697438 12.58Z" fill="#E8ECD7"/>
              <path d="M3.86171 24.7323C6.04589 24.5888 8.23042 24.411 10.4146 24.2446C12.8761 24.0581 15.3348 23.8657 17.7991 23.6982C18.0108 23.7172 18.2233 23.6732 18.4111 23.5714C18.5989 23.4697 18.7539 23.3145 18.8576 23.1245C18.947 22.9329 18.9853 22.7205 18.9686 22.5089C18.9519 22.2972 18.8807 22.0939 18.7623 21.9196L18.6055 21.6988C17.0036 19.3463 15.3897 16.9996 13.7636 14.6587C13.0944 13.7004 12.2094 13.798 11.6409 14.8252C11.344 15.3759 11.1286 15.9725 10.8484 16.5466C10.4619 17.3527 9.86527 17.6481 9.22989 17.3756C8.59451 17.1032 8.41496 16.4606 8.80322 15.6342C9.36322 14.3717 9.94313 13.1154 10.5536 11.8788C10.7476 11.5574 10.8372 11.1814 10.8095 10.8046C10.7819 10.4279 10.6384 10.0698 10.3997 9.78181C9.27967 8.23851 8.24038 6.62599 7.15664 5.06556C6.92127 4.70423 6.64713 4.36548 6.3698 4.00415C6.11487 4.19064 5.94704 4.29118 5.77602 4.44125C4.53862 5.5571 3.46024 6.84538 2.57247 8.26837C1.80867 9.52263 1.20579 10.8725 0.778688 12.2845C0.770964 12.3198 0.760623 12.3544 0.747754 12.388L0.694421 12.5701C0.638243 12.7679 0.585265 12.9631 0.537621 13.1638C0.46651 13.4509 0.406065 13.7375 0.338865 14.0074C0.111733 15.1734 -0.00177233 16.3596 2.09187e-05 17.5486C-0.00296375 19.7412 0.398009 21.9147 1.18189 23.955C1.29453 24.2507 1.4265 24.5382 1.57691 24.8157C2.38224 24.8011 3.13104 24.8011 3.86171 24.7323Z" fill="#4A90E2"/>
              <path d="M18.264 0.49609C16.847 3.51423 15.4468 6.52946 14.0635 9.54177C13.9059 9.84818 13.8409 10.1957 13.8768 10.5401C13.9127 10.8845 14.0479 11.2101 14.2651 11.4755C16.2701 14.3443 18.2978 17.2131 20.2132 20.1446C21.1849 21.6336 22.2267 21.5218 22.9435 19.9009C24.6238 16.1397 26.4187 12.4419 28.141 8.69817C28.6388 7.63676 29.1099 6.56078 29.6169 5.45639C28.0847 3.80686 26.2551 2.47703 24.2292 1.54038C22.4425 0.729065 20.5382 0.223222 18.5918 0.0429688C18.4715 0.185247 18.3619 0.336727 18.264 0.49609Z" fill="#2C5AA0"/>
              <path d="M16.0299 34.7647C17.1499 32.3807 18.2699 30.0226 19.3512 27.5927C19.4467 27.4097 19.4909 27.2031 19.479 26.996C19.467 26.7888 19.3993 26.589 19.2833 26.4188C19.1674 26.2487 19.0077 26.1147 18.822 26.0317C18.6363 25.9488 18.4318 25.9201 18.2312 25.9488C17.4386 25.9488 16.6312 26.0607 15.834 26.1182C12.7871 26.321 9.74025 26.5274 6.69338 26.7374C5.41907 26.8234 4.17285 26.9498 2.82031 27.0674C3.0733 27.5206 3.35392 27.957 3.66049 28.374C4.38463 29.3261 5.20087 30.2007 6.09676 30.9845C7.80285 32.442 9.75924 33.5609 11.8656 34.2839L12.0139 34.3298L12.1707 34.3815L12.3485 34.4332C13.4889 34.7875 14.6717 34.9786 15.8632 35.0011C15.9037 34.8998 15.9908 34.8481 16.0299 34.7647Z" fill="#2C5AA0"/>
              <path d="M25.9092 23.1088C28.2203 22.9882 30.5271 22.8218 32.8318 22.6717C33.0606 22.6509 33.277 22.5564 33.45 22.4018C33.6231 22.2471 33.7439 22.0403 33.795 21.811C34.8218 17.5784 34.2817 13.1062 32.2789 9.25762C32.181 9.07653 32.0366 8.92637 31.8613 8.82345C31.6859 8.72052 31.4864 8.66877 31.2844 8.6738C31.0824 8.67883 30.8856 8.74045 30.7154 8.85198C30.5451 8.96351 30.408 9.12068 30.3188 9.30643L24.6434 21.5163C24.5785 21.6642 24.5449 21.8246 24.5449 21.9867C24.5449 22.1489 24.5785 22.3092 24.6434 22.4572C24.9236 23.06 25.1323 23.1489 25.9092 23.1088Z" fill="#4A90E2"/>
              <path d="M10.9414 6.61834C11.0451 6.83508 11.2102 7.01472 11.4151 7.13376C11.6201 7.2528 11.8554 7.30571 12.0901 7.28556C12.3249 7.26541 12.5483 7.17315 12.7311 7.02083C12.9138 6.86851 13.0475 6.66324 13.1145 6.43185C13.6411 5.37335 14.0745 4.38916 14.5456 3.3853C15.0168 2.38144 15.506 1.27486 16.0941 0H15.9277C14.7412 0.0999565 13.5665 0.313238 12.4187 0.637066C11.2375 0.986111 10.0974 1.46713 9.01889 2.07147C8.73895 2.23222 8.45889 2.40147 8.17871 2.57922C9.13231 4.01654 10.0201 5.32163 10.9414 6.61834Z" fill="#1E3A8A"/>
              <path d="M21.2359 28.8963C20.3623 30.7324 19.5079 32.5828 18.6539 34.4273C18.5884 34.6145 18.536 34.8062 18.4971 35.001C21.1717 34.8022 23.7626 33.9585 26.0583 32.5387C25.1452 31.1961 24.3193 29.9566 23.4539 28.7316C22.65 27.5894 21.8155 27.6527 21.2359 28.8963Z" fill="#3B82F6"/>
              <path d="M32.3056 24.9589C30.211 25.0936 28.1051 25.2113 26.0301 25.396C25.8184 25.3928 25.6102 25.4511 25.4295 25.5642C25.2489 25.6773 25.1032 25.8405 25.0094 26.0349C24.9157 26.2294 24.8776 26.447 24.8996 26.6627C24.9217 26.8784 25.003 27.0833 25.1341 27.2536C25.6941 28.189 26.3636 29.0697 26.9829 29.9705L27.8932 31.2701C29.9291 29.5936 31.5649 27.4634 32.6761 25.0415C32.556 25.0009 32.432 24.9731 32.3063 24.9585L32.3056 24.9589Z" fill="#1E3A8A"/>
              <path d="M55.6414 5.66036C55.495 5.65618 55.3493 5.68192 55.2127 5.73608C55.0761 5.79024 54.9515 5.87173 54.846 5.9758C54.7389 6.08398 54.6549 6.21381 54.5995 6.35704C54.544 6.50027 54.5183 6.65376 54.5239 6.80774V15.5496H46.2067V10.3278C46.2182 10.1839 46.2019 10.039 46.1587 9.90153C46.1155 9.76405 46.0462 9.63664 45.9549 9.52659C45.8636 9.41655 45.752 9.32602 45.6265 9.26018C45.5011 9.19435 45.3641 9.1545 45.2236 9.14292C45.1763 9.13866 45.1287 9.13866 45.0814 9.14292C44.933 9.13848 44.7853 9.16492 44.6472 9.22064C44.5091 9.27636 44.3834 9.3602 44.2778 9.4671C44.1737 9.57462 44.0923 9.70299 44.0388 9.84419C43.9852 9.98539 43.9607 10.1364 43.9667 10.2877V24.1702C43.9642 24.3998 44.0289 24.6248 44.1525 24.8163C44.2761 25.0077 44.4529 25.1568 44.66 25.2442C44.8672 25.3316 45.0952 25.3534 45.3146 25.3067C45.534 25.26 45.7346 25.1469 45.8906 24.9821C45.9934 24.8752 46.0743 24.7482 46.1287 24.6088C46.183 24.4694 46.2096 24.3203 46.2071 24.1702V17.5716H54.5409V24.1702C54.5386 24.3187 54.5648 24.4662 54.6182 24.6043C54.6716 24.7423 54.751 24.8682 54.8519 24.9748C54.9528 25.0814 55.0733 25.1665 55.2064 25.2253C55.3395 25.2842 55.4826 25.3155 55.6275 25.3176H55.6613C55.809 25.3225 55.9561 25.2957 56.0931 25.2389C56.2301 25.182 56.3539 25.0965 56.4567 24.9876C56.6534 24.7647 56.7596 24.4732 56.7536 24.1728V6.79062C56.7649 6.48502 56.6583 6.18714 56.4567 5.9616C56.3495 5.85503 56.2214 5.77306 56.0808 5.72112C55.9403 5.66919 55.7903 5.64848 55.6414 5.66036Z" fill="white"/>
              <path d="M69.8339 13.3543C69.7273 13.2912 69.6096 13.2502 69.4874 13.2337C69.3653 13.2173 69.2413 13.2257 69.1223 13.2585C69.0034 13.2913 68.892 13.3478 68.7944 13.4248C68.6969 13.5018 68.6151 13.5978 68.5539 13.7073C68.5221 13.7638 68.4958 13.8233 68.4753 13.885L65.0783 22.1101L61.0204 13.8417C60.9191 13.593 60.7259 13.3955 60.4829 13.2924C60.2399 13.1892 59.967 13.1887 59.7237 13.291L59.6817 13.311C59.5554 13.3629 59.4407 13.4405 59.3444 13.5391C59.2482 13.6377 59.1724 13.7553 59.1217 13.8847C59.0681 14.0132 59.0448 14.1529 59.0536 14.2924C59.0623 14.4319 59.103 14.5674 59.1722 14.6878L64.1294 24.3014C64.1413 24.3256 64.1554 24.3486 64.1713 24.3702L62.6844 27.9103C62.6283 28.0299 62.5958 28.1596 62.5887 28.2921C62.5815 28.4245 62.6 28.5571 62.6429 28.6823C62.6858 28.8075 62.7524 28.9227 62.8388 29.0215C62.9253 29.1203 63.0298 29.2007 63.1466 29.258L63.211 29.2839C63.4632 29.3892 63.7458 29.3879 63.9972 29.2804C64.2485 29.1729 64.4482 28.9679 64.5525 28.7102L70.3576 14.7417C70.4889 14.5401 70.5366 14.2933 70.4904 14.0556C70.4442 13.8178 70.3079 13.6086 70.1112 13.4738C70.0264 13.414 69.9314 13.3712 69.8311 13.3474L69.8339 13.3543Z" fill="white"/>
              <path d="M80.8618 13.9455C79.9339 13.4177 78.8901 13.1407 77.8289 13.1407C76.7676 13.1407 75.7238 13.4177 74.796 13.9455C73.9108 14.4735 73.1782 15.2328 72.6733 16.1459C72.1521 17.1059 71.8784 18.1861 71.8779 19.2846V28.284C71.8809 28.5086 71.9483 28.7274 72.0715 28.9132C72.1948 29.099 72.3687 29.2437 72.5715 29.3292C72.7742 29.4147 72.9971 29.4374 73.2123 29.3944C73.4276 29.3513 73.6258 29.2445 73.7823 29.0871C73.881 28.9799 73.958 28.8537 74.0089 28.7159C74.0599 28.5781 74.0838 28.4313 74.0792 28.284V23.4071C74.9061 24.4419 76.0714 25.1343 77.3588 25.3559C78.6462 25.5775 79.9684 25.3132 81.0801 24.612C81.9069 24.0741 82.5826 23.3246 83.0402 22.4375C83.5333 21.4725 83.7826 20.3965 83.7656 19.3075C83.7818 18.2073 83.508 17.123 82.973 16.1688C82.4719 15.2507 81.7438 14.4839 80.8618 13.9455ZM81.1419 21.4045C80.8217 22.0127 80.3502 22.5234 79.7752 22.8848C79.1809 23.2424 78.5041 23.431 77.8148 23.431C77.1255 23.431 76.4488 23.2424 75.8545 22.8848C75.2742 22.5284 74.7998 22.0166 74.4824 21.4045C74.1442 20.7564 73.9729 20.0306 73.9846 19.2959C73.9723 18.547 74.1468 17.8073 74.4916 17.1468C74.808 16.5324 75.2825 16.0184 75.8637 15.6607C76.459 15.3059 77.1354 15.119 77.8241 15.119C78.5127 15.119 79.1891 15.3059 79.7844 15.6607C80.3602 16.0224 80.8318 16.5342 81.1512 17.1439C81.4985 17.7982 81.674 18.5337 81.6607 19.2784C81.6731 20.016 81.4975 20.7442 81.1512 21.391L81.1419 21.4045Z" fill="white"/>
              <path d="M95.0349 13.7703C94.216 13.3298 93.3023 13.1069 92.3775 13.1219C91.487 13.1105 90.6085 13.3338 89.8264 13.7703C89.4114 13.9651 89.0426 14.2499 88.7455 14.6051V10.3019C88.7538 10.1596 88.7347 10.0169 88.6891 9.8822C88.6436 9.74746 88.5725 9.62325 88.48 9.51668C88.3876 9.4101 88.2755 9.32326 88.1502 9.26112C88.0249 9.19897 87.8889 9.16275 87.75 9.15453H87.6155C87.2906 9.14594 86.9728 9.25347 86.7167 9.45868C86.5966 9.55891 86.4971 9.68252 86.4238 9.82237C86.3506 9.96222 86.3051 10.1155 86.29 10.2735V24.1942C86.3231 24.5092 86.4765 24.7979 86.7167 24.9974C86.9452 25.2129 87.2464 25.3291 87.5569 25.3216C87.711 25.3281 87.8648 25.3028 88.0092 25.2471C88.1535 25.1914 88.2855 25.1065 88.3971 24.9974C88.6112 24.787 88.7351 24.4981 88.7416 24.1942V17.9875C88.7305 17.4711 88.8784 16.9643 89.1644 16.5389C89.4616 16.1101 89.8593 15.7647 90.321 15.5347C90.8309 15.2802 91.3922 15.1524 91.9594 15.1617C92.566 15.1498 93.167 15.2824 93.7151 15.5489C94.2135 15.8108 94.6211 16.2235 94.8828 16.7308C95.1867 17.3687 95.3237 18.0764 95.2803 18.7848V24.2361C95.2961 24.544 95.4277 24.8337 95.6476 25.0442C95.8674 25.2548 96.1584 25.3699 96.4593 25.3653C96.6022 25.3689 96.7442 25.3419 96.8763 25.2861C97.0084 25.2302 97.1277 25.1468 97.2266 25.0411C97.3279 24.9356 97.4068 24.8098 97.4584 24.6716C97.51 24.5334 97.5331 24.3858 97.5263 24.2379V18.7852C97.5652 17.7063 97.3326 16.6354 96.8508 15.6753C96.4385 14.8743 95.8087 14.2126 95.0374 13.7703H95.0349Z" fill="white"/>
              <path d="M111.209 16.1459C110.694 15.2176 109.944 14.4488 109.038 13.9202C108.132 13.3917 107.104 13.1229 106.062 13.1423C104.999 13.1287 103.952 13.406 103.029 13.9455C102.145 14.4763 101.413 15.2362 100.907 16.1488C100.372 17.1021 100.097 18.1852 100.111 19.2846C100.094 20.3732 100.343 21.4489 100.834 22.4146C101.296 23.3033 101.976 24.0529 102.808 24.5891C103.661 25.1154 104.639 25.3935 105.635 25.3935C106.631 25.3935 107.608 25.1154 108.461 24.5891C108.969 24.2578 109.422 23.8441 109.8 23.3642V24.2045C109.821 24.4887 109.945 24.7544 110.149 24.9484C110.353 25.1423 110.621 25.2501 110.899 25.2501C111.177 25.2501 111.445 25.1423 111.649 24.9484C111.853 24.7544 111.978 24.4887 111.998 24.2045V19.2842C112.012 18.1844 111.738 17.1008 111.206 16.1455L111.209 16.1459ZM109.386 21.3929C109.072 22.0024 108.602 22.5138 108.028 22.8732C107.433 23.2297 106.757 23.4176 106.068 23.4176C105.379 23.4176 104.702 23.2297 104.107 22.8732C103.527 22.5139 103.051 22.003 102.727 21.3929C102.394 20.7382 102.22 20.0109 102.22 19.2728C102.22 18.5346 102.394 17.8074 102.727 17.1527C103.049 16.5388 103.525 16.0246 104.107 15.6636C104.703 15.3111 105.379 15.1255 106.068 15.1255C106.756 15.1255 107.432 15.3111 108.028 15.6636C108.601 16.0257 109.07 16.5377 109.386 17.1469C109.725 17.805 109.895 18.5403 109.882 19.2842C109.893 20.0187 109.722 20.7441 109.386 21.3929Z" fill="white"/>
            </g>
            <defs>
              <clipPath id="clip0_158_2147">
                <rect width="112" height="35" fill="white"/>
              </clipPath>
            </defs>
          </svg>
        </div>
        
        {/* Empty space for future nav items - removed Network, My Spaces, V */}
        <div></div>
      </nav>

      {/* Hero Section */}
      <div style={{
        position: 'relative',
        height: '400px',
        background: 'linear-gradient(135deg, #1e3a8a 0%, #3b82f6 50%, #1e40af 100%)',
        backgroundImage: `
          radial-gradient(circle at 20% 30%, rgba(255,255,255,0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 70%, rgba(255,255,255,0.08) 0%, transparent 50%),
          radial-gradient(circle at 50% 50%, rgba(59,130,246,0.3) 0%, transparent 70%)
        `,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
        width: '100%'
      }}>
        {/* Organic flowing elements */}
        <svg style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          opacity: 0.3
        }} viewBox="0 0 1200 400" preserveAspectRatio="xMidYMid slice">
          <path
            d="M0,200 Q200,100 400,200 T800,200 Q1000,150 1200,200 L1200,0 L0,0 Z"
            fill="rgba(255,255,255,0.1)"
          />
          <path
            d="M0,300 Q300,200 600,300 T1200,300 L1200,400 L0,400 Z"
            fill="rgba(255,255,255,0.05)"
          />
          <path
            d="M0,150 Q150,80 300,150 T600,150 Q800,120 1000,150 T1200,150 L1200,400 L0,400 Z"
            fill="rgba(59,130,246,0.1)"
          />
        </svg>
        
        {/* Title */}
        <div style={{ textAlign: 'center', zIndex: 2 }}>
          <h1 style={{
            fontSize: '4rem',
            fontWeight: '300',
            margin: '0 0 1rem 0',
            letterSpacing: '0.2em',
            textShadow: '0 2px 10px rgba(0,0,0,0.3)'
          }}>
            HYPHA
          </h1>
          <div style={{
            fontSize: '1.5rem',
            fontWeight: '300',
            opacity: 0.9,
            letterSpacing: '0.1em'
          }}>
            Token Migration: Telos → Base
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div style={{
        maxWidth: '1200px',
        margin: '0 auto',
        padding: '3rem 2rem'
      }}>
        {/* Status Card */}
        <div style={{
          background: '#1e1e1e',
          border: '1px solid #333',
          borderRadius: '12px',
          padding: '1.5rem',
          marginBottom: '2rem'
        }}>
          <div style={{
            padding: '1rem 1.5rem',
            borderRadius: '8px',
            backgroundColor: status.type === 'error' ? '#2d1b1b' : 
                             status.type === 'success' ? '#1b2d1b' :
                             '#1b1b2d',
            border: `1px solid ${status.type === 'error' ? '#b91c1c' : 
                                  status.type === 'success' ? '#16a34a' :
                                  '#3b82f6'}`,
            color: status.type === 'error' ? '#fca5a5' : 
                   status.type === 'success' ? '#86efac' :
                   '#93c5fd',
            fontSize: '1.5rem'
          }}>
            {status.message}
          </div>
          
          {/* Retry button for connection errors */}
          {status.type === 'error' && !isConnected && status.message.includes('Connection failed') && (
            <div style={{ marginTop: '1rem', textAlign: 'center' }}>
              <button
                onClick={retryConnection}
                disabled={isLoading}
                style={{
                  height: '3.2rem',
                  padding: '0 1.6rem',
                  background: '#4A90E2',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '0.4rem',
                  fontSize: '1.4rem',
                  fontWeight: '500',
                  cursor: isLoading ? 'not-allowed' : 'pointer',
                  opacity: isLoading ? 0.5 : 1,
                  transition: 'all 0.2s ease'
                }}
                onMouseEnter={(e) => {
                  if (!isLoading) {
                    e.target.style.background = '#3B82F6'
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isLoading) {
                    e.target.style.background = '#4A90E2'
                  }
                }}
              >
                {isLoading ? 'Retrying...' : 'Retry Connection'}
              </button>
              
              {/* Troubleshooting tips */}
              <div style={{
                marginTop: '1.5rem',
                padding: '1rem',
                background: '#2a2a2a',
                borderRadius: '8px',
                fontSize: '1.3rem',
                color: '#ccc',
                textAlign: 'left'
              }}>
                <div style={{ fontWeight: '500', marginBottom: '0.5rem', color: '#fff' }}>
                  Troubleshooting Tips:
                </div>
                <ul style={{ margin: 0, paddingLeft: '1.5rem' }}>
                  <li>Make sure your Hypha wallet is unlocked</li>
                  <li>Check your internet connection</li>
                  <li>Close and reopen your Hypha wallet app</li>
                  <li>Refresh this page and try again</li>
                  <li>If using mobile wallet, ensure QR code scanner is working</li>
                </ul>
              </div>
            </div>
          )}
        </div>

        {/* Main Content */}
        {!isConnected ? (
          /* Connection Card */
          <div style={{
            background: '#1e1e1e',
            border: '1px solid #333',
            borderRadius: '12px',
            padding: '2rem',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '200px',
            textAlign: 'center'
          }}>
            <p style={{
              color: '#fff',
              marginBottom: '2rem',
              fontSize: '1.7rem',
              lineHeight: 1.5,
              fontWeight: '400',
              margin: '0 0 2rem 0'
            }}>
              Connect your Hypha wallet to begin the token migration process
            </p>
            
            <button
              onClick={loginWithHypha}
              disabled={!authenticator || isLoading}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.8rem',
                height: '4.8rem',
                padding: '0 3.2rem',
                background: '#3F65EF',
                color: '#FAFBFC',
                border: 'none',
                borderRadius: '0.4rem',
                fontSize: '1.6rem',
                fontWeight: '500',
                fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                cursor: authenticator && !isLoading ? 'pointer' : 'not-allowed',
                opacity: authenticator && !isLoading ? 1 : 0.5,
                transition: 'all 0.2s ease',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                whiteSpace: 'nowrap'
              }}
              onMouseEnter={(e) => {
                if (authenticator && !isLoading) {
                  e.target.style.background = '#315BEB'
                  e.target.style.transform = 'translateY(-1px)'
                  e.target.style.boxShadow = '0 4px 12px rgba(63, 101, 239, 0.2)'
                }
              }}
              onMouseLeave={(e) => {
                if (authenticator && !isLoading) {
                  e.target.style.background = '#3F65EF'
                  e.target.style.transform = 'translateY(0)'
                  e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)'
                }
              }}
            >
              {isLoading && (
                <div style={{
                  width: '20px',
                  height: '20px',
                  border: '2px solid #FAFBFC',
                  borderTop: '2px solid transparent',
                  borderRadius: '50%',
                  animation: 'spin 1s linear infinite'
                }} />
              )}
              <span>Connect Hypha Wallet</span>
            </button>
          </div>
        ) : (
          /* Connected Dashboard */
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr',
            gap: '2rem'
          }}>
            {migrationJustCompleted ? (
              /* Thank You Message */
              <div style={{
                textAlign: 'center',
                padding: '3rem 2rem',
                background: '#1b2d1b',
                border: '1px solid #16a34a',
                borderRadius: '12px',
                color: '#86efac'
              }}>
                <h3 style={{ 
                  margin: '0 0 2rem 0', 
                  fontSize: '2.4rem', 
                  fontWeight: '500',
                  textAlign: 'center'
                }}>
                  Thank You!
                </h3>
                <p style={{ 
                  margin: 0, 
                  fontSize: '1.7rem', 
                  lineHeight: 1.6,
                  maxWidth: '600px',
                  marginLeft: 'auto',
                  marginRight: 'auto',
                  textAlign: 'center'
                }}>
                  You have successfully migrated your tokens. Tokens are now visible under your profile in the Hypha platform.
                  <br /><br />
                  You can use the tokens to access the Hypha platform's functionalities.
                  <br /><br />
                  Also, overtime you might notice increase in your HYPHA balance this is due to the rewards that are issued to all the token holders!
                </p>
              </div>
            ) : (
              /* Migration Card */
              <div style={{
                background: '#1e1e1e',
                border: '1px solid #333',
                borderRadius: '12px',
                padding: '2rem'
              }}>
                <h3 style={{
                  fontSize: '2rem',
                  fontWeight: '500',
                  margin: '0 0 1.5rem 0',
                  color: '#4A90E2'
                }}>
                  HYPHA Token Migration
                </h3>
                
                {migrationData && migrationData.eligible && !migrationData.migrated ? (
                  <div style={{ 
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '2rem'
                  }}>
                    <div style={{
                      display: 'grid',
                      gridTemplateColumns: 'repeat(2, 1fr)',
                      gap: '2rem'
                    }}>
                      <div>
                        <span style={{ color: '#999', display: 'block', marginBottom: '0.5rem', fontSize: '1.5rem' }}>From Account</span>
                        <span style={{ fontSize: '1.5rem' }}>{currentUser.accountName}</span>
                      </div>
                      <div>
                        <span style={{ color: '#999', display: 'block', marginBottom: '0.5rem', fontSize: '1.5rem' }}>Amount</span>
                        <span style={{ fontSize: '1.5rem' }}>{migrationData.amount}</span>
                      </div>
                    </div>
                    
                    <div>
                      <label style={{ color: '#999', display: 'block', marginBottom: '0.5rem', fontSize: '1.5rem' }}>
                        To Address (Base Network)
                      </label>
                      <div style={{
                        padding: '1rem',
                        background: '#333',
                        border: '1px solid #555',
                        borderRadius: '0.4rem',
                        fontFamily: 'monospace',
                        fontSize: '1.4rem',
                        color: '#fff',
                        wordBreak: 'break-all'
                      }}>
                        {ethAddress || 'No address provided in URL'}
                      </div>
                    </div>
                    
                    <div style={{ 
                      display: 'flex', 
                      justifyContent: 'center',
                      alignItems: 'center' 
                    }}>
                      <button 
                        onClick={migrateHypha}
                        disabled={isLoading || !isValidEthAddress(ethAddress)}
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          height: '4.8rem',
                          padding: '0 3.2rem',
                          background: (!isValidEthAddress(ethAddress) || isLoading) ? '#666' : '#3F65EF',
                          color: '#FAFBFC',
                          border: 'none',
                          borderRadius: '0.4rem',
                          fontSize: '1.6rem',
                          fontWeight: '500',
                          fontFamily: "'SF Pro', -apple-system, BlinkMacSystemFont, sans-serif",
                          cursor: (!isValidEthAddress(ethAddress) || isLoading) ? 'not-allowed' : 'pointer',
                          opacity: (!isValidEthAddress(ethAddress) || isLoading) ? 0.5 : 1,
                          transition: 'all 0.2s ease',
                          boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={(e) => {
                          if (isValidEthAddress(ethAddress) && !isLoading) {
                            e.target.style.background = '#315BEB'
                            e.target.style.transform = 'translateY(-1px)'
                            e.target.style.boxShadow = '0 4px 12px rgba(63, 101, 239, 0.2)'
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (isValidEthAddress(ethAddress) && !isLoading) {
                            e.target.style.background = '#3F65EF'
                            e.target.style.transform = 'translateY(0)'
                            e.target.style.boxShadow = '0 1px 2px rgba(0, 0, 0, 0.05)'
                          }
                        }}
                      >
                        {isLoading ? 'Processing...' : 'Migrate HYPHA'}
                      </button>
                    </div>
                  </div>
                ) : migrationData && migrationData.migrated ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    background: '#1b2d1b',
                    border: '1px solid #16a34a',
                    borderRadius: '8px',
                    color: '#86efac'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.8rem' }}>Migration Complete</h4>
                    <p style={{ margin: 0, fontSize: '1.5rem' }}>
                      Your {migrationData.amount} has been successfully migrated to the Base network.
                    </p>
                  </div>
                ) : migrationData && !migrationData.eligible ? (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    background: '#2d1b1b',
                    border: '1px solid #b91c1c',
                    borderRadius: '8px',
                    color: '#fca5a5'
                  }}>
                    <h4 style={{ margin: '0 0 1rem 0', fontSize: '1.8rem' }}>Not Eligible</h4>
                    <p style={{ margin: 0, fontSize: '1.5rem' }}>
                      This account is not eligible for HYPHA migration.
                    </p>
                  </div>
                ) : (
                  <div style={{
                    textAlign: 'center',
                    padding: '2rem',
                    color: '#666',
                    fontSize: '1.5rem'
                  }}>
                    Loading migration data...
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Disconnect Button */}
        {isConnected && (
          <div style={{
            marginTop: '2rem',
            textAlign: 'center'
          }}>
            <button 
              onClick={logout}
              style={{
                height: '3.2rem',
                padding: '0 1.6rem',
                background: 'transparent',
                color: '#999',
                border: '1px solid #333',
                borderRadius: '0.4rem',
                fontSize: '1.4rem',
                fontWeight: '500',
                cursor: 'pointer'
              }}
            >
              Disconnect Wallet
            </button>
          </div>
        )}
      </div>

      {/* CSS Animation */}
      <style>{`
        @keyframes spin {
          0% { transform: rotate(0deg); }
          100% { transform: rotate(360deg); }
        }
      `}</style>
    </div>
  )
}

export default HyphaWallet 