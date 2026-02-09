import { SidebarProvider, SidebarInset } from "@/components/ui/sidebar";
import { AppSidebar } from "./AppSidebar";
import { Header } from "./Header";

interface LayoutProps {
  children: React.ReactNode;
  user?: {
    name: string;
    email: string;
    role: string;
    avatar?: string;
  };
  onLogout: () => void;
}

export function Layout({ children, user, onLogout }: LayoutProps) {
  return (
    <SidebarProvider>
      <div className="flex h-svh w-full overflow-hidden">
        <AppSidebar />
        <SidebarInset className="flex min-h-0 flex-col">
          <Header user={user} onLogout={onLogout} />
          <main className="mt-16 flex-1 overflow-y-auto bg-muted/30 px-3 py-3">
            {children}
          </main>
        </SidebarInset>
      </div>
    </SidebarProvider>
  );
}
