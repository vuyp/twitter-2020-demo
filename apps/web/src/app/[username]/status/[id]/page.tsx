import { TweetDetailScreen } from '@/components/screens/profile-screen';
export default async function TweetPage({
  params,
}: {
  params: Promise<{ username: string; id: string }>;
}) {
  const { id } = await params;
  return <TweetDetailScreen id={id} />;
}
