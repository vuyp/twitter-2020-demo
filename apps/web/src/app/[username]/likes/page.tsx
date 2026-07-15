import { ProfileScreen } from '@/components/screens/profile-screen';
export default async function LikesPage({ params }: { params: Promise<{ username: string }> }) {
  return <ProfileScreen handle={(await params).username} tab="likes" />;
}
