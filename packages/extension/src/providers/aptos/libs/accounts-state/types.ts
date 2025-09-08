export enum StorageKeys {
  accountsState = 'aptos-accounts-state',
}

export interface IState {
  approvedAccounts: string[];
}