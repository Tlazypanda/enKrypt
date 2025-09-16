import { BaseNetwork, BaseNetworkOptions } from '@/types/base-network';
import AptosAPI from '@/providers/aptos/libs/api';
import { AssetsType } from '@/types/provider';
import { BaseToken } from '@/types/base-token';
import { ProviderName } from '@/types/provider';
import { CoingeckoPlatform, NetworkNames, SignerType } from '@enkryptcom/types';
import createIcon from '../libs/blockies';
import { Activity } from '@/types/activity';
import { formatFloatingPointValue } from '@/libs/utils/number-formatter';
import MarketData from '@/libs/market-data';
import BigNumber from 'bignumber.js';
import { CoinGeckoTokenMarket } from '@/libs/market-data/types';
import Sparkline from '@/libs/sparkline';
import { AptosToken, AptosTokenOptions } from './aptos-token';
import { NFTCollection } from '@/types/nft';
import { fromBase, hexToBuffer } from '@enkryptcom/utils';
import { isAddress as isAptosAddress } from '../libs/utils';

export interface AptosNetworkOptions {
  name: NetworkNames;
  name_long: string;
  homePage: string;
  blockExplorerTX: string;
  blockExplorerAddr: string;
  isTestNetwork: boolean;
  currencyName: string;
  currencyNameLong: string;
  icon: string;
  decimals: number;
  node: string;
  coingeckoID?: string;
  coingeckoPlatform: CoingeckoPlatform;
  basePath: string;
  NFTHandler?: (
    network: BaseNetwork,
    address: string,
  ) => Promise<NFTCollection[]>;
  activityHandler: (
    network: BaseNetwork,
    address: string,
  ) => Promise<Activity[]>;
  assetsInfoHandler?: (
    network: BaseNetwork,
    address: string,
  ) => Promise<AssetsType[]>;
}

export const getAddress = (pubkey: string) => {
  if (pubkey.length <= 66) return pubkey;
  // Convert hex pubkey to Aptos address format
  return `0x${hexToBuffer(pubkey).toString('hex').slice(0, 64)}`;
};

export class AptosNetwork extends BaseNetwork {
  public assets: BaseToken[] = [];
  private activityHandler: (
    network: BaseNetwork,
    address: string,
  ) => Promise<Activity[]>;
  NFTHandler?: (
    network: BaseNetwork,
    address: string,
  ) => Promise<NFTCollection[]>;
  assetsInfoHandler?: (
    network: BaseNetwork,
    address: string,
  ) => Promise<AssetsType[]>;

  constructor(options: AptosNetworkOptions) {
    const api = async () => {
      const api = new AptosAPI(options.node);
      await api.init();
      return api as AptosAPI;
    };

    const baseOptions: BaseNetworkOptions = {
      identicon: createIcon,
      signer: [SignerType.ed25519],
      provider: ProviderName.aptos,
      displayAddress: getAddress,
      api,
      ...options,
    };
    super(baseOptions);
    this.activityHandler = options.activityHandler;
    this.NFTHandler = options.NFTHandler;
    this.assetsInfoHandler = options.assetsInfoHandler;
  }

  public async getAllTokens(pubkey: string): Promise<BaseToken[]> {
    const assets = await this.getAllTokenInfo(pubkey);
    return assets.map(token => {
      const bTokenOptions: AptosTokenOptions = {
        decimals: token.decimals,
        icon: token.icon,
        name: token.name,
        symbol: token.symbol,
        balance: token.balance,
        price: token.value,
        coingeckoID: this.coingeckoID,
        contract: token.contract!,
      };
      return new AptosToken(bTokenOptions);
    });
  }

  public async getAllTokenInfo(pubkey: string): Promise<AssetsType[]> {
    if (this.assetsInfoHandler) {
      return this.assetsInfoHandler(this, getAddress(pubkey));
    } else {
      const balance = await (await this.api()).getBalance(pubkey);
      let marketData: (CoinGeckoTokenMarket | null)[] = [];
      if (this.coingeckoID) {
        const market = new MarketData();
        marketData = await market.getMarketData([this.coingeckoID]);
      }
      const currentPrice = marketData.length
        ? marketData[0]!.current_price || 0
        : 0;
      const userBalance = fromBase(balance, this.decimals);
      const usdBalance = new BigNumber(userBalance).times(currentPrice);
      const nativeAsset: AssetsType = {
        balance: balance,
        balancef: formatFloatingPointValue(userBalance).value,
        balanceUSD: usdBalance.toNumber(),
        balanceUSDf: usdBalance.toString(),
        icon: this.icon,
        name: this.name_long,
        symbol: this.currencyName,
        value: marketData.length ? currentPrice.toString() : '0',
        valuef: marketData.length ? currentPrice.toString() : '0',
        contract: '',
        decimals: this.decimals,
        sparkline: marketData.length
          ? new Sparkline(marketData[0]!.sparkline_in_24h.price, 25).dataValues
          : '',
        priceChangePercentage: marketData.length
          ? marketData[0]!.price_change_percentage_24h_in_currency
          : 0,
      };
      return [nativeAsset];
    }
  }

  public getAllActivity(address: string): Promise<Activity[]> {
    return this.activityHandler(this, address);
  }

  public isAddress = isAptosAddress;
}