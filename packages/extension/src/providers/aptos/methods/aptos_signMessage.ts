import { getCustomError } from '@/libs/error';
import { MiddlewareFunction } from '@enkryptcom/types';
import AptosProvider from '..';
import { WindowPromise } from '@/libs/window-promise';
import { ProviderRPCRequest } from '@/types/provider';

const method: MiddlewareFunction = function (
  this: AptosProvider,
  payload: ProviderRPCRequest,
  res,
  next,
): void {
  if (payload.method !== 'aptos_signMessage') return next();
  else {
    if (!payload.params || payload.params.length < 1) {
      return res(getCustomError('aptos_signMessage: invalid params'));
    }
    
    const windowPromise = new WindowPromise();
    windowPromise
      .getResponse(
        this.getUIPath(this.UIRoutes.aptosSign.path),
        JSON.stringify({
          ...payload,
          params: [payload.method, payload.params[0], this.network.name],
        }),
        true,
      )
      .then(({ error, result }) => {
        if (error) return res(error);
        res(null, JSON.parse(result as string));
      });
  }
};

export default method;