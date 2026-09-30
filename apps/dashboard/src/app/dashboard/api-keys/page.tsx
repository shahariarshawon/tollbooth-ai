import type { Metadata } from 'next';
import { ApiKeysPage } from '@/features/api-keys/api-keys-page';

export const metadata: Metadata = { title: 'API Keys' };

export default function Page() {
  return <ApiKeysPage />;
}
