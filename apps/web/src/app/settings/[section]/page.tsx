import { SettingsSectionScreen } from '@/components/screens/settings-screen';
export default async function SettingsSectionPage({
  params,
}: {
  params: Promise<{ section: string }>;
}) {
  return <SettingsSectionScreen section={(await params).section} />;
}
