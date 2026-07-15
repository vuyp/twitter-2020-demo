import { Suspense } from 'react';
import { SearchScreen } from '@/components/screens/explore-screen';
export const metadata = { title: 'Search' };
export default function SearchPage() {
  return (
    <Suspense>
      <SearchScreen />
    </Suspense>
  );
}
