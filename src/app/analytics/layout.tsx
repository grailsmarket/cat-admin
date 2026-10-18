import DashboardLayout from '@/components/DashboardLayout'

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return <DashboardLayout section='analytics'>{children}</DashboardLayout>
}
