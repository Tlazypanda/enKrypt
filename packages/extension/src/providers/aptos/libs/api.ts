import { APTRawInfo } from '@/types/activity';
import { ProviderAPIInterface } from '@/types/provider';
import { getAddress as getAptosAddress } from '../types/aptos-network';
import { hexToBuffer, numberToHex } from '@enkryptcom/utils';

/** Aptos API wrapper */
class API implements ProviderAPIInterface {
  node: string;

  constructor(node: string) {
    this.node = node;
  }

  public get api() {
    return this;
  }
  
  private getAddress(pubkey: string) {
    return getAptosAddress(pubkey);
  }

  async init(): Promise<void> {}

  /**
   * Returns null if the transaction hasn't been received by the node
   * or has been dropped
   */
  async getTransactionStatus(hash: string): Promise<APTRawInfo | null> {
    try {
      const response = await fetch(`${this.node}/v1/transactions/by_hash/${hash}`);
      if (!response.ok) {
        return null;
      }
      
      const tx = await response.json();
      
      if (!tx) {
        return null;
      }

      const retVal: APTRawInfo = {
        blockNumber: parseInt(tx.version),
        timestamp: parseInt(tx.timestamp),
        transactionHash: hash,
        status: tx.success === true,
      };

      return retVal;
    } catch (error) {
      return null;
    }
  }

  async getBalance(address: string): Promise<string> {
    try {
      const aptosAddress = this.getAddress(address);
      const assetType = `0x1::aptos_coin::AptosCoin`;
      const response = await fetch(
        `${this.node}/v1/accounts/${aptosAddress}/balance/${encodeURIComponent(assetType)}`
      );
      
      if (!response.ok) {
        return '0x0';
      }
      
      const data = await response.json();
      console.log(data);
      const balance = data || '0';
      return numberToHex(balance);
    } catch (error) {
      return '0x0';
    }
  }

  async broadcastTx(rawtx: string): Promise<boolean> {
    try {
      const response = await fetch(`${this.node}/v1/transactions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sender: '', // Will be filled by the transaction data
          sequence_number: '', // Will be filled by the transaction data
          max_gas_amount: '', // Will be filled by the transaction data
          gas_unit_price: '', // Will be filled by the transaction data
          expiration_timestamp_secs: '', // Will be filled by the transaction data
          payload: '', // Will be filled by the transaction data
          signature: rawtx,
        }),
      });

      return response.ok;
    } catch (error) {
      return false;
    }
  }

  async getAccountSequenceNumber(address: string): Promise<string> {
    try {
      const response = await fetch(`${this.node}/v1/accounts/${address}`);
      if (!response.ok) {
        return '0';
      }
      
      const data = await response.json();
      return data.sequence_number || '0';
    } catch (error) {
      return '0';
    }
  }

  async estimateGasPrice(): Promise<string> {
    try {
      const response = await fetch(`${this.node}/v1/estimate_gas_price`);
      if (!response.ok) {
        return '100'; // Default gas price
      }
      
      const data = await response.json();
      return data.gas_estimate?.toString() || '100';
    } catch (error) {
      return '100';
    }
  }
}

export default API;