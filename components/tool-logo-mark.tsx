import Image from "next/image";
import { cn } from "@/lib/utils";

export function ToolLogoMark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "flex size-8 shrink-0 items-center justify-center rounded-md bg-primary",
        className,
      )}
      aria-label="Better Fetch"
      role="img"
    >
      <Image src="/logo-white.svg" alt="" width={20} height={20} className="size-5" />
    </span>
  );
}
