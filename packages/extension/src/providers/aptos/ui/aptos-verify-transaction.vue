<template>
  <common-popup>
    <template #header>
      <sign-logo class="common-popup__logo" />
      <div class="common-popup__network">
        <img :src="network.icon" />
        <p>{{ network.name_long }}</p>
      </div>
    </template>

    <template #content>
      <h2>Verify transaction</h2>
      <hardware-wallet-msg :wallet-type="account.walletType" />
      <div class="provider-verify-transaction__block">
        <div class="provider-verify-transaction__account">
          <img :src="identicon" />
          <div class="provider-verify-transaction__account-info">
            <h4>{{ account.name }}</h4>
            <div>
              <p>
                {{
                  TokenBalance == '~'
                    ? '~'
                    : $filters.formatFloatingPointValue(TokenBalance).value
                }}
                <span>{{ network.currencyName }}</span>
              </p>
              <p>
                {{
                  $filters.replaceWithEllipsis(
                    network.displayAddress(account.address),
                    6,
                    4,
                  )
                }}
              </p>
            </div>
          </div>
        </div>
      </div>
      <div class="provider-verify-transaction__block">
        <div class="provider-verify-transaction__info">
          <img :src="Options.faviconURL || network.icon" />
          <div class="provider-verify-transaction__info-info">
            <h4>{{ Options.domain }}</h4>
          </div>
        </div>
        
        <swap-looking-animation
          v-if="isLoadingTx && !errorMsg"
          style="height: 100px; margin-left: 100px"
        />
        
        <div v-if="transactionData && !isLoadingTx">
          <div class="provider-verify-transaction__amount">
            <img :src="network.icon" />
            <div class="provider-verify-transaction__amount-info">
              <h4>
                {{ 
                  $filters.formatFloatingPointValue(
                    fromBase(transactionData.amount, network.decimals)
                  ).value 
                }}
                <span>{{ network.currencyName }}</span>
              </h4>
              <p>
                {{ $filters.parseCurrency(parseFloat(transactionData.valueUSD)) }}
              </p>
            </div>
          </div>
        </div>

        <div v-if="errorMsg" class="provider-verify-transaction__error">
          <alert-icon />
          <p>{{ errorMsg }}</p>
        </div>
      </div>

      <send-fee-select
        style="margin-left: 0px"
        :in-swap="false"
        :selected="selectedFee"
        :fee="gasCostValues[selectedFee]"
      />
    </template>

    <template #button-left>
      <base-button
        title="Decline"
        :click="deny"
        :no-background="true"
        :disabled="isProcessing"
      />
    </template>

    <template #button-right>
      <base-button
        title="Send"
        :click="approve"
        :disabled="isProcessing || !!errorMsg"
      />
    </template>
  </common-popup>
</template>

<script setup lang="ts">
import { ref, onBeforeMount } from 'vue';
import SignLogo from '@action/icons/common/sign-logo.vue';
import BaseButton from '@action/components/base-button/index.vue';
import CommonPopup from '@action/views/common-popup/index.vue';
import SendFeeSelect from '@/providers/common/ui/send-transaction/send-fee-select.vue';
import HardwareWalletMsg from '@/providers/common/ui/verify-transaction/hardware-wallet-msg.vue';
import SwapLookingAnimation from '@action/icons/swap/swap-looking-animation.vue';
import { getError } from '@/libs/error';
import { ErrorCodes } from '@/providers/ethereum/types';
import { WindowPromiseHandler } from '@/libs/window-promise';
import { getNetworkByName } from '@/libs/utils/networks';
import { ProviderRequestOptions } from '@/types/provider';
import BigNumber from 'bignumber.js';
import { GasFeeType, GasPriceTypes } from '@/providers/common/types';
import MarketData from '@/libs/market-data';
import { defaultGasCostVals } from '@/providers/common/libs/default-vals';
import { EnkryptAccount } from '@enkryptcom/types';
import { Activity, ActivityStatus, ActivityType } from '@/types/activity';
import ActivityState from '@/libs/activity-state';
import { fromBase, bufferToHex, hexToBuffer } from '@enkryptcom/utils';
import AlertIcon from '@action/icons/send/alert-icon.vue';
import { trackSendEvents } from '@/libs/metrics';
import { SendEventType } from '@/libs/metrics/types';
import { AptosNetwork } from '../types/aptos-network';
import AptosAPI from '../libs/api';
import { AptosSignTransactionRequest } from '../ui/types';
import { TransactionSigner } from '../libs/signer';

const isProcessing = ref(false);
const isLoadingTx = ref(true);
const TokenBalance = ref<string>('~');
const network = ref<AptosNetwork>();
const marketdata = new MarketData();
const activityState = new ActivityState();
const gasCostValues = ref<GasFeeType>(defaultGasCostVals);
const errorMsg = ref('');
const account = ref<EnkryptAccount>({
  name: '',
  address: '',
} as EnkryptAccount);
const identicon = ref<string>('');
const windowPromise = WindowPromiseHandler(5);
const Options = ref<ProviderRequestOptions>({
  domain: '',
  faviconURL: '',
  title: '',
  url: '',
  tabId: 0,
});
const selectedFee = ref<GasPriceTypes>(GasPriceTypes.ECONOMY);
const aptosConnection = ref<AptosAPI>();
const transactionData = ref<{
  amount: string;
  valueUSD: string;
  to: string;
} | null>(null);
const rawTransaction = ref<string>('');

onBeforeMount(async () => {
  isProcessing.value = true;
  const { Request, options } = await windowPromise;
  network.value = (await getNetworkByName(
    Request.value.params![4],
  )) as AptosNetwork;
  
  selectedFee.value = GasPriceTypes.ECONOMY;
  account.value = Request.value.params![3] as EnkryptAccount;
  identicon.value = network.value!.identicon(
    network.value!.displayAddress(account.value.address),
  );
  Options.value = options;
  
  if (network.value!.api) {
    const api = await network.value!.api();
    const balance = await api.getBalance(account.value.address);
    TokenBalance.value = fromBase(balance, network.value!.decimals);
  }
  
  aptosConnection.value = (await network.value!.api()) as AptosAPI;
  
  const txMessage = JSON.parse(
    Request.value.params![1],
  ) as AptosSignTransactionRequest;
  rawTransaction.value = txMessage.hex;
  
  // Parse transaction to extract relevant data
  try {
    const txData = JSON.parse(Buffer.from(txMessage.hex, 'hex').toString());
    transactionData.value = {
      amount: txData.payload?.arguments?.[1] || '0',
      valueUSD: '0',
      to: txData.payload?.arguments?.[0] || '',
    };
    
    // Calculate USD value if possible
    if (network.value!.coingeckoID && transactionData.value.amount !== '0') {
      const tokenPrice = await marketdata.getTokenValue(
        '1',
        network.value!.coingeckoID,
        'USD'
      );
      const amountInTokens = fromBase(transactionData.value.amount, network.value!.decimals);
      transactionData.value.valueUSD = new BigNumber(amountInTokens)
        .times(tokenPrice || '0')
        .toString();
    }
  } catch (e) {
    console.error('Error parsing transaction:', e);
    transactionData.value = null;
  }
  
  // Estimate gas costs
  try {
    const gasPrice = await aptosConnection.value!.estimateGasPrice();
    const getConvertedVal = () => fromBase(gasPrice, network.value!.decimals);
    const nativeVal = await marketdata.getTokenValue(
      '1',
      network.value!.coingeckoID!,
      'USD'
    );
    
    gasCostValues.value[GasPriceTypes.ECONOMY] = {
      nativeValue: getConvertedVal(),
      fiatValue: new BigNumber(getConvertedVal())
        .times(nativeVal || '0')
        .toString(),
      nativeSymbol: network.value!.currencyName,
      fiatSymbol: 'USD',
    };
  } catch (e) {
    console.error('Error estimating gas:', e);
  }
  
  isLoadingTx.value = false;
  isProcessing.value = false;
});

const approve = async () => {
  const { Resolve } = await windowPromise;
  isProcessing.value = true;
  trackSendEvents(SendEventType.SendAPIApprove, {
    network: network.value!.name,
  });
  
  try {
    const signature = await TransactionSigner({
      account: account.value,
      network: network.value!,
      transaction: hexToBuffer(rawTransaction.value),
    });
    
    const txActivity: Activity = {
      from: network.value!.displayAddress(account.value.address),
      to: transactionData.value?.to || network.value!.displayAddress(account.value.address),
      isIncoming: false,
      network: network.value!.name,
      status: ActivityStatus.pending,
      timestamp: new Date().getTime(),
      token: {
        decimals: network.value!.decimals,
        icon: network.value!.icon,
        name: network.value!.currencyNameLong,
        symbol: network.value!.currencyName,
        price: '0',
      },
      type: ActivityType.transaction,
      value: transactionData.value?.amount || '0',
      transactionHash: '',
    };
    
    // For now, just return the signature - broadcasting would happen in a real implementation
    trackSendEvents(SendEventType.SendAPIComplete, {
      network: network.value!.name,
    });
    
    activityState.addActivities([txActivity], {
      address: network.value!.displayAddress(account.value.address),
      network: network.value!.name,
    });
    
    Resolve.value({
      result: JSON.stringify(bufferToHex(signature)),
    });
  } catch (err) {
    trackSendEvents(SendEventType.SendAPIFailed, {
      network: network.value!.name,
    });
    Resolve.value(err);
  }
};

const deny = async () => {
  trackSendEvents(SendEventType.SendAPIDecline, {
    network: network.value!.name,
  });
  const { Resolve } = await windowPromise;
  Resolve.value({
    error: getError(ErrorCodes.userRejected),
  });
};
</script>

<style lang="less">
@import '@action/styles/theme.less';
@import '@/providers/common/ui/styles/verify-transaction.less';
</style>