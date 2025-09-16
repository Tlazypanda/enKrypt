import { BaseToken, BaseTokenOptions } from '@/types/base-token';
import AptosAPI from '@/providers/aptos/libs/api';

export interface AptosTokenOptions extends BaseTokenOptions {
  contract: string;
}

export class AptosToken extends BaseToken {
  contract: string;
  
  constructor(options: AptosTokenOptions) {
    super(options);
    this.contract = options.contract;
  }

  public async getLatestUserBalance(
    api: AptosAPI,
    address: string,
  ): Promise<string> {
    return api.getBalance(address);
  }

  public async send(): Promise<any> {
    throw new Error('aptos-send is not implemented here');
  }
}