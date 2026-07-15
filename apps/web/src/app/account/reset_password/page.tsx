import { Suspense } from 'react';
import { ResetPasswordScreen } from '@/components/auth/auth-ui';
export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
