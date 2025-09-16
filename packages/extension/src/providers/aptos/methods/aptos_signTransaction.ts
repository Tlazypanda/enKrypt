import { getCustomError } from '@/libs/error';
import { MiddlewareFunction } from '@enkryptcom/types';
import AptosProvider from '..';
import { WindowPromise } from '@/libs/window-promise';
import { bufferToHex, hexToBuffer } from '@enkryptcom/utils';
import { AptosSignTransactionRequest } from '../ui/types';

const method: MiddlewareFunction = function (
  this: AptosProvider,
  payload,
  res,
  next,
): void {
  if (
    payload.method !== 'aptos_signTransaction' &&
    payload.method !== 'aptos_signAndSendTransaction'
  )
    return next();
  else {
    if (!payload.params || payload.params.length < 1) {
      return res(
        getCustomError(
          'aptos_signTransaction: invalid request not enough params',
        ),
      );
    }
    const txMessage = JSON.parse(
      payload.params[0],
    ) as AptosSignTransactionRequest;
    
    // Convert address to pubkey format for account lookup
    const addressBuffer = hexToBuffer(txMessage.address);
    this.KeyRing.getAccount(bufferToHex(addressBuffer)).then(
      account => {
        const windowPromise = new WindowPromise();
        windowPromise
          .getResponse(
            this.getUIPath(this.UIRoutes.aptosSendTransaction.path),
            JSON.stringify({
              ...payload,
              params: [
                payload.method,
                payload.params![0],
                payload.params![1] || '{}', // Options
                account,
                this.network.name,
              ],
            }),
            true,
          )
          .then(({ error, result }) => {
            if (error) return res(error);
            res(null, JSON.parse(result as string));
          });
      },
    );
  }
};

export default method;