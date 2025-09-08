/**
 * Validate if a string is a valid Aptos address
 */
const isAddress = (address: string): boolean => {
  try {
    // Aptos addresses are 32-byte hex strings, optionally prefixed with 0x
    const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
    
    // Check if it's a valid hex string
    if (!/^[0-9a-fA-F]+$/.test(cleanAddress)) {
      return false;
    }
    
    // Aptos addresses can be 1-64 characters (1-32 bytes)
    if (cleanAddress.length === 0 || cleanAddress.length > 64) {
      return false;
    }
    
    return true;
  } catch {
    return false;
  }
};

/**
 * Normalize an Aptos address to standard format
 */
const normalizeAddress = (address: string): string => {
  if (!isAddress(address)) {
    throw new Error('Invalid Aptos address');
  }
  
  const cleanAddress = address.startsWith('0x') ? address.slice(2) : address;
  // Pad with leading zeros to make it 64 characters (32 bytes)
  return '0x' + cleanAddress.padStart(64, '0');
};

/**
 * Get short address format for display
 */
const getShortAddress = (address: string): string => {
  if (!isAddress(address)) {
    return address;
  }
  
  const normalized = normalizeAddress(address);
  // Remove leading zeros for display, but keep at least 1 character
  const withoutLeadingZeros = normalized.replace(/^0x0+/, '0x') || '0x0';
  return withoutLeadingZeros;
};

export { isAddress, normalizeAddress, getShortAddress };