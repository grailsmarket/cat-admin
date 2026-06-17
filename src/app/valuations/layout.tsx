import DashboardLayout from '@/components/DashboardLayout'
import AdminGate from '@/components/AdminGate'

export default function ValuationsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <AdminGate>
      <DashboardLayout>{children}</DashboardLayout>
    </AdminGate>
  )
}
