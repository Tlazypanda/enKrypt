<template>
  <div class="container">
    <div v-if="!!selected" class="send-transaction">
      <send-header
        :is-send-token="isSendToken"
        :is-nft-available="!!network.NFTHandler"
        @close="close"
        @toggle-type="toggleSelector"
      />

      <send-address-input
        ref="addressInputFrom"
        :from="true"
        :value="addressFrom"
        :network="network"
        :disable-direct-input="true"
        @click="toggleSelectContactFrom(true)"
        @update:input-address="inputAddressFrom"
        @toggle:show-contacts="toggleSelectContactFrom"
      />

      <send-from-contacts-list
        :show-accounts="isOpenSelectContactFrom"
        :account-info="accountInfo"
        :address="addressFrom"
        :network="network"
        @selected:account="selectAccountFrom"
        @close="toggleSelectContactFrom"
      />

      <send-address-input
        ref="addressInputTo"
        :value="addressTo"
        :network="network"
        @update:input-address="inputAddressTo"
        @toggle:show-contacts="toggleSelectContactTo"
      />

      <send-contacts-list
        :show-accounts="isOpenSelectContactTo"
        :account-info="accountInfo"
        :address="addressTo"
        :network="network"
        @selected:account="selectAccountTo"
        @update:paste-from-clipboard="addressInputTo.pasteFromClipboard()"
        @close="toggleSelectContactTo"
      />

      <send-token-select
        v-if="isSendToken"
        :token="selectedAsset"
        @update:toggle-token-select="toggleSelectToken"
      />

      <assets-select-list
        v-model="isOpenSelectToken"
        :is-send="true"
        :assets="accountAssets"
        :is-loading="isLoadingAssets"
        @update:select-asset="selectToken"
      />

      <send-nft-select
        v-if="!isSendToken"
        :item="selectedNft"
        :is-sending-disabled="false"
        @toggle-select="toggleSelectNft"
      />

      <nft-select-list
        v-if="!isSendToken"
        v-model="isOpenSelectNft"
        :address="addressFrom"
        :network="network"
        @select-nft="selectNFT"
      />

      <send-input-amount
        v-if="isSendToken"
        :amount="amount"
        :show-max="true"
        :fiat-value="selectedAsset.price"
        :has-enough-balance="hasEnoughBalance"
        @update:input-amount="inputAmount"
        @update:input-set-max="setMaxValue"
      />

      <send-fee-select
        style="width: 394px"
        :selected="selectedFee"
        :fee="gasCostValues[selectedFee]"
      />

      <send-alert v-show="errorMsg" :error-msg="errorMsg" />

      <div class="send-transaction__buttons">
        <div class="send-transaction__buttons-cancel">
          <base-button title="Cancel" :click="close" :no-background="true" />
        </div>
        <div class="send-transaction__buttons-send">
          <base-button
            :title="sendButtonTitle"
            :click="sendAction"
            :disabled="!isValidSend"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, PropType, computed, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import SendHeader from '@/providers/common/ui/send-transaction/send-header.vue';
import SendAddressInput from '@/providers/aptos/ui/send-transaction/components/send-address-input.vue';
import SendFromContactsList from '@/providers/common/ui/send-transaction/send-from-contacts-list.vue';
import SendContactsList from '@/providers/common/ui/send-transaction/send-contacts-list.vue';
import AssetsSelectList from '@action/views/assets-select-list/index.vue';
import NftSelectList from '@/providers/common/ui/send-transaction/nft-select-list/index.vue';
import SendTokenSelect from '@/providers/aptos/ui/send-transaction/components/send-token-select.vue';
import SendAlert from '@/providers/aptos/ui/send-transaction/components/send-alert.vue';
import SendNftSelect from '@/providers/common/ui/send-transaction/send-nft-select.vue';
import SendInputAmount from '@/providers/common/ui/send-transaction/send-input-amount.vue';
import SendFeeSelect from '@/providers/common/ui/send-transaction/send-fee-select.vue';
import BaseButton from '@action/components/base-button/index.vue';
import { NFTItemWithCollectionName, NFTItem, NFTType } from '@/types/nft';
import { AccountsHeaderData } from '@action/types/account';
import { numberToHex, toBN } from 'web3-utils';
import { GasPriceTypes, GasFeeType } from '@/providers/common/types';
import { AptosNetwork, getAddress } from '../../types/aptos-network';
import { AptosToken } from '../../types/aptos-token';
import BigNumber from 'bignumber.js';
import { defaultGasCostVals } from '@/providers/common/libs/default-vals';
import { fromBase, toBase, isValidDecimals } from '@enkryptcom/utils';
import getAccountSequenceNumber from '@/providers/aptos/libs/api';
import {
  formatFloatingPointValue,
  isNumericPositive,
} from '@/libs/utils/number-formatter';
import { trackSendEvents } from '@/libs/metrics';
import { SendEventType } from '@/libs/metrics/types';
import aptosAPI from '@/providers/aptos/libs/api';

const props = defineProps({
  network: {
    type: Object as PropType<AptosNetwork>,
    default: () => ({}),
  },
  accountInfo: {
    type: Object as PropType<AccountsHeaderData>,
    default: () => ({}),
  },
});

const loadingAsset = new AptosToken({
  icon: props.network.icon,
  symbol: 'Loading',
  balance: '0',
  price: '0',
  name: 'loading',
  contract: '0x0',
  decimals: props.network.decimals,
});

const route = useRoute();
const router = useRouter();
const aptConnection = ref<AptosAPI>();
const addressInputTo = ref();
const selected: string = route.params.id as string;
const isSendToken = ref<boolean>(true);
const accountAssets = ref<AptosToken[]>([]);
const selectedAsset = ref<AptosToken>(loadingAsset);
const amount = ref<string>('');
const isLoadingAssets = ref(true);
const AptTx = ref<AptTransaction>();

const selectedNft = ref<NFTItemWithCollectionName>({
  id: '',
  contract: '',
  image: '',
  name: 'Loading',
  url: '',
  collectionName: '',
  type: NFTType.ERC721,
});

const sendAmount = computed(() => {
  if (amount.value && amount.value !== '') return amount.value;
  return '0';
});

const isMaxSelected = ref<boolean>(false);
const selectedFee = ref<GasPriceTypes>(GasPriceTypes.ECONOMY);
const gasCostValues = ref<GasFeeType>(defaultGasCostVals);
const addressFrom = ref<string>(
  props.accountInfo.selectedAccount?.address ?? '',
);
const addressTo = ref<string>('');

const hasEnoughBalance = computed((): boolean => {
  if (!isValidDecimals(sendAmount.value, selectedAsset.value.decimals!)) {
    return false;
  }
  if (!isNumericPositive(sendAmount.value)) {
    return false;
  }

  return toBN(selectedAsset.value.balance ?? '0').gte(
    toBN(toBase(sendAmount.value ?? '0', selectedAsset.value.decimals!)),
  );
});

const isInputsValid = computed<boolean>(() => {
  if (!props.network.isAddress(getAddress(addressTo.value))) return false;
  if (
    isSendToken.value &&
    !isValidDecimals(sendAmount.value, selectedAsset.value.decimals!)
  ) {
    return false;
  }
  if (!isSendToken.value && !selectedNft.value.id) {
    return false;
  }
  const sendAmountBigNumber = new BigNumber(sendAmount.value);
  if (sendAmountBigNumber.isNaN()) return false;
  if (sendAmountBigNumber.gt(assetMaxValue.value)) return false;
  return true;
});

const errorMsg = computed(() => {
  if (!hasEnoughBalance.value) {
    return 'Not enough balance';
  }
  if (!props.network.isAddress(addressTo.value) && addressTo.value !== '') {
    return 'Invalid to address';
  }
  return '';
});

const sendButtonTitle = computed(() => {
  let title = 'Send';
  if (parseInt(sendAmount.value) > 0)
    title =
      'Send ' +
      formatFloatingPointValue(sendAmount.value).value +
      ' ' +
      selectedAsset.value?.symbol!.toUpperCase();
  if (!isSendToken.value) {
    title = 'Send NFT';
  }
  return title;
});

const isValidSend = computed<boolean>(() => {
  if (!props.network.isAddress(addressTo.value)) return false;
  if (
    isSendToken.value &&
    !isValidDecimals(sendAmount.value, selectedAsset.value.decimals!)
  ) {
    return false;
  }
  if (!isSendToken.value && !selectedNft.value.id) {
    return false;
  }
  const sendAmountBigNumber = new BigNumber(sendAmount.value);
  if (sendAmountBigNumber.isNaN()) return false;
  return true;
});

onMounted(async () => {
  trackSendEvents(SendEventType.SendOpen, { network: props.network.name });
  aptConnection.value = (await props.network.api()).api as AptosAPI;
  fetchAssets().then(setBaseCosts)
});

const TxInfo = computed<SendTransactionDataType>(() => {
  const value = sendAmount.value
    ? numberToHex(toBase(sendAmount.value, selectedAsset.value.decimals))
    : '0x0';
  const contract = isSendToken.value
    ? selectedAsset.value.contract
    : selectedNft.value.contract;
  return {
    from: addressFrom.value,
    value: isSendToken.value ? value : '0x1',
    to: addressTo.value,
    contract,
  };
});

const setBaseCosts = async () => {
  updateTransactionFees();
};

const fetchAssets = () => {
  accountAssets.value = [];
  selectedAsset.value = loadingAsset;
  isLoadingAssets.value = true;
  return props.network.getAllTokens(addressFrom.value).then(allAssets => {
    accountAssets.value = allAssets as AptosToken[];
    selectedAsset.value = allAssets[0] as AptosToken;
    isLoadingAssets.value = false;
  });
};

const isOpenSelectContactFrom = ref<boolean>(false);
const isOpenSelectContactTo = ref<boolean>(false);
const isOpenSelectToken = ref<boolean>(false);
const isOpenSelectNft = ref(false);

watch(
  [isInputsValid, addressTo, selectedAsset, selectedNft, isSendToken],
  () => {
    if (isInputsValid.value) {
      updateTransactionFees();
    }
  },
);

watch([isSendToken], () => {
  inputAmount('0');
});


const close = () => {
  trackSendEvents(SendEventType.SendDecline, {
    network: props.network.name,
  });
  router.go(-1);
};

const assetMaxValue = computed(() => {
  return fromBase(
    selectedAsset.value.balance!,
    selectedAsset.value.decimals!,
  );
});

const setMaxValue = () => {
  isMaxSelected.value = true;
   if (isInputsValid.value) {
    updateTransactionFees();
  }
  
};

const inputAddressFrom = (text: string) => {
  addressFrom.value = text;
};

const inputAddressTo = (text: string) => {
  addressTo.value = text;
};

const toggleSelectContactFrom = (open: boolean) => {
  isOpenSelectContactFrom.value = open;
};

const toggleSelectContactTo = (open: boolean) => {
  isOpenSelectContactTo.value = open;
};

const toggleSelectToken = () => {
  isOpenSelectToken.value = !isOpenSelectToken.value;
};

const selectAccountFrom = (account: string) => {
  addressFrom.value = account;
  isOpenSelectContactFrom.value = false;
  fetchAssets();
};

const selectAccountTo = (account: string) => {
  addressTo.value = account;
  isOpenSelectContactTo.value = false;
};

const selectToken = (token: AptosToken) => {
  selectedAsset.value = token;
  isOpenSelectToken.value = false;
};



const inputAmount = (inputAmount: string) => {
  if (inputAmount === '') {
    inputAmount = '0';
  }
  const inputAmountBn = new BigNumber(inputAmount);
  isMaxSelected.value = false;
  amount.value = inputAmountBn.lt(0) ? '0' : inputAmount;
  if (isInputsValid.value) {
    updateTransactionFees();
  }
};

const updateTransactionFees = async () => {
  // Build Aptos transaction based on TxInfo.value
  const transaction = {
    sender: TxInfo.value.from,
    sequence_number: await new getAccountSequenceNumber(TxInfo.value.from),
    max_gas_amount: "100000",
    gas_unit_price: "100",
    expiration_timestamp_secs: Math.floor(Date.now() / 1000) + 600,
    payload: {
      type: "entry_function_payload",
      function: isSendToken.value 
        ? "0x1::aptos_coin::transfer" 
        : "0x1::nft::transfer", // Different functions for tokens vs NFTs
      type_arguments: [],
      arguments: [
        TxInfo.value.to,
        TxInfo.value.value
      ]
    }
  };
  
  AptTx.value = transaction;
  
  // Simulate transaction to get gas costs
  const gasEstimate = await simulateAptosTransaction(transaction);
  // Update gasCostValues.value based on estimate
};

const sendAction = async () => {
  await recentlySentAddresses.addRecentlySentAddress(
    props.network,
    addressTo.value,
  );

  const keyring = new PublicKeyRing();
  const fromAccountInfo = await keyring.getAccount(
    addressFrom.value.toLowerCase(),
  );
  
  const txVerifyInfo: VerifyTransactionParams = {
    TransactionData: TxInfo.value,
    isNFT: !isSendToken.value,
    NFTData: !isSendToken.value ? selectedNft.value : undefined,
    toToken: {
      amount: toBase(sendAmount.value, selectedAsset.value.decimals!),
      decimals: selectedAsset.value.decimals!,
      icon: selectedAsset.value.icon as string,
      symbol: selectedAsset.value.symbol || 'unknown',
      valueUSD: new BigNumber(selectedAsset.value.price || '0')
        .times(sendAmount.value)
        .toString(),
      name: selectedAsset.value.name || '',
      price: selectedAsset.value.price || '0',
    },
    fromAddress: fromAccountInfo.address,
    fromAddressName: fromAccountInfo.name,
    gasFee: gasCostValues.value[selectedFee.value],
    gasPriceType: selectedFee.value,
    toAddress: addressTo.value,
    encodedTx: Buffer.from(
      JSON.stringify(AptTx.value), // Aptos transactions are typically JSON
      'utf8'
    ).toString('base64'), // Encode as base64 instead of bs58
  };
  
  const routedRoute = router.resolve({
    name: RouterNames.verify.name,
    query: {
      id: selected,
      txData: Buffer.from(JSON.stringify(txVerifyInfo), 'utf8').toString(
        'base64',
      ),
    },
  });
  
  if (fromAccountInfo.isHardware) {
    await Browser.windows.create({
      url: Browser.runtime.getURL(
        getUiPath(
          `apt-hw-verify?id=${routedRoute.query.id}&txData=${routedRoute.query.txData}`,
          ProviderName.aptos, // Use Aptos provider instead of Solana
        ),
      ),
      type: 'popup',
      focused: true,
      height: 600,
      width: 460,
    });
    window.close();
  } else {
    router.push(routedRoute);
  }
};

const toggleSelector = (isTokenSend: boolean) => {
  isSendToken.value = isTokenSend;
};

const toggleSelectNft = (open: boolean) => {
  isOpenSelectNft.value = open;
};

const selectNFT = (item: NFTItemWithCollectionName) => {
  selectedNft.value = item;
  isOpenSelectNft.value = false;
};
</script>

<style lang="less" scoped>
@import '@action/styles/theme.less';
@import '@action/styles/custom-scroll.less';

.container {
  width: 100%;
  height: 600px;
  background-color: @white;
  box-shadow: 0px 0px 3px rgba(0, 0, 0, 0.16);
  margin: 0;
  box-sizing: border-box;
  position: relative;
}

.send-transaction {
  width: 100%;
  height: 100%;
  box-sizing: border-box;
  position: relative;

  &__buttons {
    position: absolute;
    left: 0;
    bottom: 0;
    padding: 0 32px 32px 32px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    flex-direction: row;
    width: 100%;
    box-sizing: border-box;

    &-cancel {
      width: 170px;
    }

    &-send {
      width: 218px;
    }
  }
}
</style>