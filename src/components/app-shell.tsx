import { useState, type ReactNode } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { LayoutDashboard, ArrowLeftRight, Wallet, Landmark, LogOut, Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { ThemeToggle } from "./theme-toggle";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/accounts", label: "Contas", icon: Landmark },
  { to: "/transactions", label: "Transações", icon: ArrowLeftRight },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return (
    <nav className="flex flex-col gap-1">
      {NAV.map((item) => {
        const Icon = item.icon;
        const active = pathname.startsWith(item.to);
        return (
          <Link
            key={item.to}
            to={item.to}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
              active
                ? "bg-sidebar-primary text-sidebar-primary-foreground"
                : "text-sidebar-foreground hover:bg-sidebar-accent",
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBranding() {
  return (
    <Link to="/dashboard" className="flex items-center gap-2 px-1 py-2">
      <div className="h-9 w-9 rounded-xl bg-primary text-primary-foreground inline-flex items-center justify-center shadow">
        <Wallet className="h-5 w-5" />
      </div>
      <div className="leading-tight">
        <p className="text-sm font-bold">Meu Gestor</p>
        <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Financeiro</p>
      </div>
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);

  async function handleSignOut() {
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  return (
    <div className="min-h-screen w-full flex bg-background">
      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-4 gap-6">
        <SidebarBranding />
        <NavLinks />
        <div className="mt-auto">
          <Button variant="ghost" className="w-full justify-start gap-3" onClick={handleSignOut}>
            <LogOut className="h-4 w-4" /> Sair
          </Button>
        </div>
      </aside>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <header className="h-14 border-b border-border bg-card/60 backdrop-blur flex items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menu">
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="p-4 w-64 bg-sidebar">
                <div className="flex flex-col gap-6 h-full">
                  <SidebarBranding />
                  <NavLinks onNavigate={() => setMobileOpen(false)} />
                  <div className="mt-auto">
                    <Button
                      variant="ghost"
                      className="w-full justify-start gap-3"
                      onClick={handleSignOut}
                    >
                      <LogOut className="h-4 w-4" /> Sair
                    </Button>
                  </div>
                </div>
              </SheetContent>
            </Sheet>
            <span className="md:hidden font-semibold">Meu Gestor</span>
          </div>
          <ThemeToggle />
        </header>

        <main className="flex-1 p-4 md:p-6 lg:p-8 overflow-x-hidden">{children}</main>
      </div>
    </div>
  );
}
