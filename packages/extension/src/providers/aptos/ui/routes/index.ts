import aptosSign from '../aptos-sign-message.vue';
import aptosSendTransaction from '../aptos-verify-transaction.vue';
import aptosConnectDApp from '../aptos-connect-dapp.vue';
// Note: Create the HW verify component at the expected path
// import aptosHWVerify from '../send-transaction/verify-transaction/index.vue';
import { RouteRecordRaw } from 'vue-router';
import RouteNames from './names';

const routes = Object.assign({}, RouteNames);
routes.aptosSign.component = aptosSign;
routes.aptosSendTransaction.component = aptosSendTransaction;
routes.aptosConnectDApp.component = aptosConnectDApp;
// Temporarily comment out until HW verify component is needed
// routes.aptosHWVerify.component = aptosHWVerify;

export default (namespace: string): RouteRecordRaw[] => {
  return Object.values(routes).map(route => {
    route.path = `/${namespace}/${route.path}`;
    route.name = `${namespace}-${String(route.name)}`;
    return route;
  });
};