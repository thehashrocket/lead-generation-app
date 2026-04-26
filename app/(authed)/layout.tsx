import { SidebarNav } from "@/components/sidebar-nav";
import { WeekCapIndicator } from "@/components/week-cap-indicator";

export default function AuthedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-full min-h-screen">
      <aside className="flex w-48 shrink-0 flex-col border-r bg-gray-50">
        <div className="flex h-14 items-center border-b px-4">
          <span className="text-sm font-semibold tracking-tight">LeadGen</span>
        </div>
        <SidebarNav />
        <div className="mt-auto border-t px-4 py-3">
          <WeekCapIndicator />
        </div>
      </aside>
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
