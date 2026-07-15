import { MomentDetailScreen } from '@/components/screens/collections-screen';
export default async function MomentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return <MomentDetailScreen id={(await params).id} />;
}
