import { AuthFlowPage } from '@/components/auth/auth-ui';

export const metadata = { title: 'Sign up' };
export default function SignupPage() {
  return <AuthFlowPage mode="signup" />;
}
