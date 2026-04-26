"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { Search, SendHorizontal, Settings } from "lucide-react";

const navItems = [
  { href: "/", label: "Search", icon: Search },
  { href: "/sent", label: "Sent", icon: SendHorizontal },
];

const settingsItem = { href: "/settings", label: "Settings", icon: Settings };

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="flex flex-1 flex-col gap-1 p-2">
      <div className="flex flex-col gap-1">
        {navItems.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
              pathname === href
                ? "bg-white text-gray-900 shadow-sm"
                : "text-gray-600 hover:bg-white hover:text-gray-900",
            )}
          >
            <Icon className="h-4 w-4" />
            {label}
          </Link>
        ))}
      </div>
      <div className="mt-auto">
        <Link
          href={settingsItem.href}
          className={cn(
            "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors",
            pathname === settingsItem.href
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-500 hover:bg-white hover:text-gray-700",
          )}
        >
          <settingsItem.icon className="h-4 w-4" />
          {settingsItem.label}
        </Link>
      </div>
    </nav>
  );
}
