import { AuthFlowPage } from '@/components/auth/auth-ui';

export const metadata = { title: 'Log in' };
export default function LoginPage() {
  return <AuthFlowPage mode="login" />;
}
