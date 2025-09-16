import { CoingeckoPlatform, NetworkNames } from '@enkryptcom/types';
import { AptosNetwork, AptosNetworkOptions } from '../types/aptos-network';
import wrapActivityHandler from '@/libs/activity-state/wrap-activity-handler';
import assetsInfoHandler from '@/providers/ethereum/libs/assets-handlers/assetinfo-mew';

// Note: You'll need to create an Aptos icon file or use a placeholder
// import icon from './icons/apt.webp';

const aptosOptions: AptosNetworkOptions = {
  name: NetworkNames.Aptos,
  name_long: 'Aptos',
  homePage: 'https://aptoslabs.com/',
  blockExplorerTX: 'https://explorer.aptoslabs.com/txn/[[txHash]]',
  blockExplorerAddr: 'https://explorer.aptoslabs.com/account/[[address]]',
  isTestNetwork: false,
  currencyName: 'APT',
  currencyNameLong: 'Aptos',
  icon: '', // You'll need to add an actual icon here
  decimals: 8,
  node: 'https://api.testnet.aptoslabs.com',
  coingeckoID: 'aptos',
  activityHandler: wrapActivityHandler(() => Promise.resolve([])),
  basePath: "m/44'/637'",
  assetsInfoHandler,
  coingeckoPlatform: CoingeckoPlatform.Aptos,
};

const aptos = new AptosNetwork(aptosOptions);

export default aptos;