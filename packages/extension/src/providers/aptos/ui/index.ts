import { ProviderName, UIExportOptions } from '@/types/provider';
import getRoutes from './routes';

const uiExport: UIExportOptions = {
  providerName: ProviderName.aptos,
  routes: getRoutes(ProviderName.aptos),
};

export default uiExport;