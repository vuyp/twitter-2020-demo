import { ListDetailScreen } from '@/components/screens/collections-screen';
export default async function ListPage({ params }: { params: Promise<{ id: string }> }) {
  return <ListDetailScreen id={(await params).id} />;
}
