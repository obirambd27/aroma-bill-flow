import { useState } from "react";
import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Plus,
  Package,
  Users,
  ReceiptText,
  FileSpreadsheet,
  Settings as SettingsIcon,
  PanelLeftClose,
  PanelLeft,
  LogOut,
  Warehouse,
  Landmark,
  ScrollText,
  BookOpen,
  Wallet,
  ClipboardList,
  Truck,
  RotateCcw,
  Ticket,
  Factory,
  ShoppingCart,
  FileText,
  BarChart3,
  Banknote,
  Receipt,
  Tags,

  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, group: "" },
  { to: "/new-bill", label: "New Bill", icon: Plus, group: "Sales" },
  { to: "/bills", label: "Bill History", icon: ReceiptText, group: "Sales" },
  { to: "/price-list-orders", label: "Online Orders", icon: ShoppingBag, group: "Sales" },
  { to: "/sales-orders", label: "Sales Orders", icon: ClipboardList, group: "Sales" },
  { to: "/delivery-notes", label: "Delivery Notes", icon: Truck, group: "Sales" },
  { to: "/sales-returns", label: "Returns", icon: RotateCcw, group: "Sales" },
  { to: "/credit-notes", label: "Credits", icon: Ticket, group: "Sales" },
  { to: "/vendors", label: "Vendors", icon: Factory, group: "Purchases" },
  { to: "/purchase-orders", label: "Purchase Orders", icon: ShoppingCart, group: "Purchases" },
  { to: "/purchase-bills", label: "Purchase Bills", icon: FileText, group: "Purchases" },
  { to: "/purchase-returns", label: "Purchase Returns", icon: RotateCcw, group: "Purchases" },
  { to: "/payments-out", label: "Payments Out", icon: Banknote, group: "Purchases" },
  { to: "/price-lists", label: "Price Lists", icon: Tags, group: "Inventory" },
  { to: "/products", label: "Products", icon: Package, group: "Inventory" },
  { to: "/warehouses", label: "Warehouses", icon: Warehouse, group: "Inventory" },
  { to: "/customers", label: "Customers", icon: Users, group: "Inventory" },
  { to: "/payments", label: "Payments", icon: Wallet, group: "Finance" },
  { to: "/expenses", label: "Expenses", icon: Receipt, group: "Finance" },
  { to: "/cash-bank", label: "Cash & Bank", icon: Landmark, group: "Finance" },
  { to: "/cheques", label: "Cheques", icon: ScrollText, group: "Finance" },
  { to: "/accounts", label: "Accounts", icon: BookOpen, group: "Finance" },

  { to: "/reports", label: "Reports", icon: BarChart3, group: "Reports" },
  { to: "/import-export", label: "Import / Export", icon: FileSpreadsheet, group: "" },
  { to: "/settings", label: "Settings", icon: SettingsIcon, group: "" },
] as const;

import { PwaBanners } from "@/components/PwaBanners";
import { useUnreadOrderCount } from "@/hooks/useUnreadOrders";

function UnreadBadge({ count, className }: { count: number; className?: string }) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "grid min-w-[1.15rem] place-items-center rounded-full bg-destructive px-1.5 py-0.5 text-[10px] font-bold leading-none text-destructive-foreground",
        className,
      )}
    >
      {count > 99 ? "99+" : count}
    </span>
  );
}

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const unreadOrders = useUnreadOrderCount();

  const signOut = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  };

  return (
    <div className="min-h-screen w-full bg-background">
      {/* Desktop sidebar */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-30 hidden flex-col border-r border-sidebar-border bg-sidebar transition-all duration-200 md:flex",
          collapsed ? "w-16" : "w-60",
        )}
      >
        <div className="flex h-16 items-center gap-3 px-4">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-primary text-sm font-bold text-primary-foreground">
            F
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-sidebar-foreground">
                Fragrance
              </p>
              <p className="truncate text-xs text-muted-foreground">Billing</p>
            </div>
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
          {NAV.map((item, index) => {
            const active = pathname.startsWith(item.to);
            const showGroup = item.group !== "" && item.group !== NAV[index - 1]?.group;
            return (
              <div key={item.to}>
                {showGroup && !collapsed && (
                  <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
                    {item.group}
                  </p>
                )}
                {showGroup && collapsed && <div className="my-2 border-t border-sidebar-border" />}
                <Link
                  to={item.to}
                  aria-label={
                    item.to === "/price-list-orders" && unreadOrders > 0
                      ? `${item.label} (${unreadOrders} unread)`
                      : item.label
                  }
                  className={cn(
                    "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                    active
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4 shrink-0" />
                  {!collapsed && <span className="truncate">{item.label}</span>}
                  {item.to === "/price-list-orders" &&
                    (collapsed ? (
                      <UnreadBadge
                        count={unreadOrders}
                        className="absolute right-1 top-1"
                      />
                    ) : (
                      <UnreadBadge count={unreadOrders} className="ml-auto" />
                    ))}
                </Link>
              </div>
            );
          })}
        </nav>


        <div className="space-y-1 border-t border-sidebar-border p-2">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            {collapsed ? (
              <PanelLeft className="h-4 w-4 shrink-0" />
            ) : (
              <PanelLeftClose className="h-4 w-4 shrink-0" />
            )}
            {!collapsed && <span>Collapse</span>}
          </button>
          <button
            onClick={signOut}
            aria-label="Sign out"
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign out</span>}
          </button>
        </div>
      </aside>

      {/* Mobile top bar */}
      <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-border bg-card px-4 md:hidden">
        <div className="flex min-w-0 items-center gap-2">
          <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary text-xs font-bold text-primary-foreground">
            F
          </div>
          <span className="truncate text-sm font-semibold">Fragrance Billing</span>
        </div>
        <Button variant="ghost" size="icon" onClick={signOut} aria-label="Sign out">
          <LogOut className="h-4 w-4" />
        </Button>
      </header>

      <main
        className={cn(
          "min-h-screen px-4 pb-24 pt-6 transition-all duration-200 sm:px-6 md:pb-10",
          collapsed ? "md:pl-22" : "md:pl-66",
        )}
      >
        <div className="mx-auto w-full max-w-6xl space-y-6">
          <PwaBanners />
          {children}
        </div>
      </main>

      {/* Mobile bottom tabs */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex snap-x overflow-x-auto border-t border-border bg-card md:hidden">
        {NAV.map((item) => {
          const active = pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "relative flex min-w-[4.5rem] shrink-0 snap-start flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-4.5 w-4.5" />
              <span className="truncate px-0.5">{item.label.split(" ")[0]}</span>
              {item.to === "/price-list-orders" && (
                <UnreadBadge count={unreadOrders} className="absolute right-3 top-1" />
              )}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
