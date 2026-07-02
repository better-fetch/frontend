"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

export type NavItem = {
  id: string;
  title: string;
  children?: { id: string; title: string }[];
};

export function DocsSidebar({ items }: { items: NavItem[] }) {
  const [active, setActive] = useState<string>(items[0]?.id ?? "");

  useEffect(() => {
    const ids = items.flatMap((item) => [
      item.id,
      ...(item.children?.map((c) => c.id) ?? []),
    ]);
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible[0]) setActive(visible[0].target.id);
      },
      // Treat the band just below the sticky header as "current".
      { rootMargin: "-80px 0px -70% 0px" },
    );
    for (const id of ids) {
      const el = document.getElementById(id);
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="space-y-1 text-sm">
      {items.map((item) => (
        <div key={item.id}>
          <a
            href={`#${item.id}`}
            className={cn(
              "block rounded-md px-2 py-1.5 transition-colors hover:text-foreground",
              active === item.id ||
                item.children?.some((c) => c.id === active)
                ? "bg-muted font-medium text-foreground"
                : "text-muted-foreground",
            )}
          >
            {item.title}
          </a>
          {item.children ? (
            <div className="ml-2 border-l pl-2">
              {item.children.map((child) => (
                <a
                  key={child.id}
                  href={`#${child.id}`}
                  className={cn(
                    "block rounded-md px-2 py-1 transition-colors hover:text-foreground",
                    active === child.id
                      ? "font-medium text-foreground"
                      : "text-muted-foreground",
                  )}
                >
                  {child.title}
                </a>
              ))}
            </div>
          ) : null}
        </div>
      ))}
    </nav>
  );
}
