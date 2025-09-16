// providers/ethereum/libs/assets-handlers/aptoschain.ts
import { TokenBalance } from './types/tokenbalance-mew';
import { NATIVE_TOKEN_ADDRESS } from '../common';
import { numberToHex } from '@enkryptcom/utils';
import { BaseNetwork } from '@/types/base-network';


const APTOS_COIN_TYPE = '0x1::aptos_coin::AptosCoin';

// Known popular tokens on Aptos - can be expanded as ecosystem grows
const KNOWN_TOKENS = [
  APTOS_COIN_TYPE,
  // Add other popular tokens here as they become available
  // '0x1::test_coin::TestCoin',
  // '0xf22bede237a07e121b56d91a491eb7bcdfd1f5907926a9e58338f964a01b17fa::asset::USDC',
];

const getBalanceForAsset = async (network: BaseNetwork, address: string, assetType: string): Promise<string> => {
  try {
    const response = await fetch(`${network.node}/v1/accounts/${address}/balance/${encodeURIComponent(assetType)}`);
    
    if (!response.ok) {
      if (response.status === 404) {
        // Account doesn't exist or no balance for this asset
        return '0';
      }
      throw new Error(`Failed to fetch balance for ${assetType}: ${response.statusText}`);
    }

    const data = await response.json();
    return data || '0';
  } catch (error) {
    console.error(`Error fetching balance for ${assetType}:`, error);
    return '0';
  }
};

const getBalances = async (network: BaseNetwork, address: string): Promise<TokenBalance[]> => {
  try {
    const balances: TokenBalance[] = [];

    // Get native APT balance first - always include it
    const nativeBalance = await getBalanceForAsset(network, address, APTOS_COIN_TYPE);
    balances.push({
      balance: numberToHex(nativeBalance || '0'),
      contract: NATIVE_TOKEN_ADDRESS,
    });

    // Check balances for other known tokens
    for (const assetType of KNOWN_TOKENS) {
      if (assetType === APTOS_COIN_TYPE) continue; // Skip native APT as we already handled it
      
      const balance = await getBalanceForAsset(network, address, assetType);
      
      if (balance && balance !== '0') {
        balances.push({
          balance: numberToHex(balance),
          contract: assetType,
        });
      }
    }

    return balances;
  } catch (error) {
    console.error('Error fetching Aptos balances:', error);
    
    // Return at least native balance as zero on error - exactly like Solana
    return [{
      balance: '0x0',
      contract: NATIVE_TOKEN_ADDRESS,
    }];
  }
};

export default getBalances;