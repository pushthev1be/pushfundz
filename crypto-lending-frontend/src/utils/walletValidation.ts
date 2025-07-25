export const isValidEthereumAddress = (address: string): boolean => {
  return /^0x[a-fA-F0-9]{40}$/.test(address);
};

export const isValidBitcoinAddress = (address: string): boolean => {
  const p2pkh = /^[1][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  const p2sh = /^[3][a-km-zA-HJ-NP-Z1-9]{25,34}$/;
  const bech32 = /^bc1[a-z0-9]{39,59}$/;
  
  return p2pkh.test(address) || p2sh.test(address) || bech32.test(address);
};

export const isValidSolanaAddress = (address: string): boolean => {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(address);
};

export const isValidWalletAddress = (address: string): boolean => {
  return isValidEthereumAddress(address) || 
         isValidBitcoinAddress(address) || 
         isValidSolanaAddress(address);
};

export const getAddressType = (address: string): string => {
  if (isValidEthereumAddress(address)) return 'Ethereum';
  if (isValidBitcoinAddress(address)) return 'Bitcoin';
  if (isValidSolanaAddress(address)) return 'Solana';
  return 'Invalid';
};
