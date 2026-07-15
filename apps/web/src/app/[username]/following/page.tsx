import { PeopleListScreen } from '@/components/screens/profile-screen';
export default async function FollowingPage({ params }: { params: Promise<{ username: string }> }) {
  return <PeopleListScreen handle={(await params).username} kind="following" />;
}
