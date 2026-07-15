import { MessagesScreen } from '@/components/screens/messages-screen';
export default async function ConversationPage({
  params,
}: {
  params: Promise<{ conversationId: string }>;
}) {
  const { conversationId } = await params;
  return <MessagesScreen conversationId={conversationId} />;
}
