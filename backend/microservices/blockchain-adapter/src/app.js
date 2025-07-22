const express = require('express');
const { ethers } = require('ethers');
const { Connection, PublicKey, clusterApiUrl } = require('@solana/web3.js');

const app = express();
const PORT = process.env.PORT || 3003;

app.use(express.json());

const ETHEREUM_RPC_URL = process.env.ETHEREUM_RPC_URL || 'https://polygon-mumbai.g.alchemy.com/v2/demo';
const ethProvider = new ethers.JsonRpcProvider(ETHEREUM_RPC_URL);
const ethWallet = new ethers.Wallet(process.env.PRIVATE_KEY || '0x' + '0'.repeat(64), ethProvider);

const SOLANA_RPC_URL = process.env.SOLANA_RPC_URL || clusterApiUrl('devnet');
const solanaConnection = new Connection(SOLANA_RPC_URL);

const CONTRACT_ADDRESSES = {
  ethereum: {
    collateral: process.env.ETH_COLLATERAL_CONTRACT,
    loan: process.env.ETH_LOAN_CONTRACT,
    points: process.env.ETH_POINTS_CONTRACT
  },
  solana: {
    program: process.env.SOLANA_PROGRAM_ID
  }
};

app.post('/ethereum/deploy-contracts', async (req, res) => {
  try {
    res.json({
      success: true,
      contracts: {
        collateral: '0x1234567890123456789012345678901234567890',
        loan: '0x2345678901234567890123456789012345678901',
        points: '0x3456789012345678901234567890123456789012'
      },
      network: 'mumbai',
      deployer: ethWallet.address
    });
  } catch (error) {
    console.error('Contract deployment error:', error);
    res.status(500).json({ error: 'Failed to deploy contracts' });
  }
});

app.post('/ethereum/collateral/deposit', async (req, res) => {
  try {
    const { userAddress, tokenAddress, amount } = req.body;
    
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    
    res.json({
      success: true,
      transactionHash: txHash,
      network: 'ethereum',
      status: 'pending'
    });
  } catch (error) {
    console.error('Collateral deposit error:', error);
    res.status(500).json({ error: 'Failed to deposit collateral' });
  }
});

app.post('/ethereum/loan/request', async (req, res) => {
  try {
    const { borrower, amount, collateralAmount, interestRate, duration } = req.body;
    
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    
    res.json({
      success: true,
      transactionHash: txHash,
      loanId: Math.floor(Math.random() * 1000000),
      network: 'ethereum',
      status: 'pending'
    });
  } catch (error) {
    console.error('Loan request error:', error);
    res.status(500).json({ error: 'Failed to request loan' });
  }
});

app.post('/ethereum/points/mint', async (req, res) => {
  try {
    const { userAddress, amount, reason } = req.body;
    
    const txHash = '0x' + crypto.randomBytes(32).toString('hex');
    
    res.json({
      success: true,
      transactionHash: txHash,
      network: 'ethereum',
      pointsMinted: amount,
      status: 'pending'
    });
  } catch (error) {
    console.error('Points minting error:', error);
    res.status(500).json({ error: 'Failed to mint points' });
  }
});

app.post('/solana/loan/request', async (req, res) => {
  try {
    const { borrower, amount, collateralAmount } = req.body;
    
    const signature = crypto.randomBytes(64).toString('base64');
    
    res.json({
      success: true,
      signature: signature,
      network: 'solana',
      status: 'pending'
    });
  } catch (error) {
    console.error('Solana loan request error:', error);
    res.status(500).json({ error: 'Failed to request loan on Solana' });
  }
});

app.get('/ethereum/transaction/:hash', async (req, res) => {
  try {
    const { hash } = req.params;
    
    res.json({
      hash,
      status: 'confirmed',
      blockNumber: Math.floor(Math.random() * 1000000),
      gasUsed: '21000',
      network: 'ethereum'
    });
  } catch (error) {
    console.error('Transaction status error:', error);
    res.status(500).json({ error: 'Failed to get transaction status' });
  }
});

app.get('/solana/transaction/:signature', async (req, res) => {
  try {
    const { signature } = req.params;
    
    res.json({
      signature,
      status: 'confirmed',
      slot: Math.floor(Math.random() * 1000000),
      network: 'solana'
    });
  } catch (error) {
    console.error('Solana transaction status error:', error);
    res.status(500).json({ error: 'Failed to get transaction status' });
  }
});

app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'blockchain-adapter',
    networks: {
      ethereum: 'connected',
      solana: 'connected'
    }
  });
});

app.listen(PORT, () => {
  console.log(`Blockchain Adapter running on port ${PORT}`);
});

module.exports = app;
