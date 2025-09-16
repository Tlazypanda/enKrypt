<template>
  <common-popup>
    <template #header>
      <sign-logo class="common-popup__logo" />
    </template>

    <template #content>
      <h2>Sign message</h2>
      <hardware-wallet-msg :wallet-type="account.walletType" />
      <div class="common-popup__block">
        <div class="common-popup__account">
          <img :src="identicon" />
          <div class="common-popup__account-info">
            <h4>{{ account.name }}</h4>
            <p>
              {{
                $filters.replaceWithEllipsis(
                  account.address
                    ? network.displayAddress(account.address)
                    : '',
                  6,
                  4,
                )
              }}
            </p>
          </div>
        </div>
      </div>
      <div class="common-popup__block">
        <div class="common-popup__info">
          <img :src="Options.faviconURL || network.icon" />
          <div class="common-popup__info-info">
            <h4>{{ Options.title }}</h4>
            <p>{{ Options.domain }}</p>
          </div>
        </div>

        <p class="common-popup__message">
          {{ message }}
        </p>
      </div>
    </template>

    <template #button-left>
      <base-button title="Cancel" :click="deny" :no-background="true" />
    </template>

    <template #button-right>
      <base-button title="Sign" :click="approve" :disabled="isProcessing" />
    </template>
  </common-popup>
</template>

<script setup lang="ts">
import SignLogo from '@action/icons/common/sign-logo.vue';
import BaseButton from '@action/components/base-button/index.vue';
import CommonPopup from '@action/views/common-popup/index.vue';
import HardwareWalletMsg from '@/providers/common/ui/verify-transaction/hardware-wallet-msg.vue';
import { getError } from '@/libs/error';
import { ErrorCodes } from '@/providers/ethereum/types';
import { WindowPromiseHandler } from '@/libs/window-promise';
import { onBeforeMount, ref } from 'vue';
import { getNetworkByName } from '@/libs/utils/networks';
import { ProviderRequestOptions } from '@/types/provider';
import { AptosNetwork } from '../types/aptos-network';
import { EnkryptAccount, SignerType } from '@enkryptcom/types';
import { bufferToHex, hexToBuffer, utf8ToHex } from '@enkryptcom/utils';
import PublicKeyRing from '@/libs/keyring/public-keyring';
import { AptosSignMessageResponse } from '../ui/types';
import { isUtf8 } from '@polkadot/util';
import { hexToUtf8 } from 'web3-utils';
import { MessageSigner } from '../libs/signer';
import { getRTLOLTLOSafeString } from '@/libs/utils/unicode-detection';

const windowPromise = WindowPromiseHandler(3);
const keyring = new PublicKeyRing();
const network = ref<AptosNetwork>();
const account = ref<EnkryptAccount>({
  name: '',
  address: '',
} as EnkryptAccount);
const identicon = ref<string>('');
const Options = ref<ProviderRequestOptions>({
  domain: '',
  faviconURL: '',
  title: '',
  url: '',
  tabId: 0,
});

const signMessage = ref<{ address: string; message: string }>();
const message = ref<string>('');
const isProcessing = ref(false);

onBeforeMount(async () => {
  const { Request, Resolve, options } = await windowPromise;
  network.value = (await getNetworkByName(
    Request.value.params![2],
  )) as AptosNetwork;
  
  signMessage.value = JSON.parse(Request.value.params![1]);
  message.value = isUtf8(signMessage.value!.message)
    ? getRTLOLTLOSafeString(hexToUtf8(signMessage.value!.message))
    : signMessage.value!.message;
    
  try {
    // Convert Aptos address to internal pubkey format
    const addressBuffer = hexToBuffer(signMessage.value!.address);
    account.value = await keyring.getAccount(bufferToHex(addressBuffer));
    identicon.value = network.value!.identicon(
      network.value!.displayAddress(account.value.address),
    );
  } catch (e) {
    console.log(e);
    Resolve.value({
      error: getError(ErrorCodes.unauthorized),
    });
  }
  
  Options.value = options;
});

const approve = async () => {
  const { Resolve } = await windowPromise;
  isProcessing.value = true;
  
  MessageSigner({
    account: account.value,
    network: network.value!,
    payload: utf8ToHex(message.value),
  })
    .then(res => {
      const resData = JSON.parse(res.result!);
      const response: AptosSignMessageResponse = {
        address: network.value!.displayAddress(account.value.address),
        pubkey: account.value.address,
        signature: resData.signature,
        signedMessage: utf8ToHex(message.value),
        signatureType: 'ed25519',
      };
      Resolve.value({
        result: JSON.stringify(response),
      });
    })
    .catch(Resolve.value);
};

const deny = async () => {
  const { Resolve } = await windowPromise;
  Resolve.value({
    error: getError(ErrorCodes.userRejected),
  });
};
</script>

<style lang="less" scoped>
@import '@/providers/ethereum/ui/styles/common-popup.less';
</style>