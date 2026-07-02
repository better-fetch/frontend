"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";

export function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="size-8 shrink-0"
      aria-label={copied ? "Copied" : "Copy to clipboard"}
      onClick={() => {
        navigator.clipboard.writeText(value);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? (
        <CheckIcon className="size-4 text-primary" />
      ) : (
        <CopyIcon className="size-4" />
      )}
    </Button>
  );
}

export function CopyField({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-1 rounded-lg border bg-muted/50 py-1 pl-3 pr-1">
      <code className="min-w-0 flex-1 break-all font-mono text-xs">{value}</code>
      <CopyButton value={value} />
    </div>
  );
}
