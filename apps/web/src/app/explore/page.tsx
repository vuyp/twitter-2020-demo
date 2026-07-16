import { Suspense } from 'react';
import { ExploreScreen } from '@/components/screens/explore-screen';
export const metadata = { title: 'Explore' };
export default function ExplorePage() {
  return (
    <Suspense>
      <ExploreScreen />
    </Suspense>
  );
}
