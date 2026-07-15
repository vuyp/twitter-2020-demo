import { Suspense } from 'react';
import { VerificationResultScreen } from '@/components/auth/auth-ui';
export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerificationResultScreen />
    </Suspense>
  );
}
