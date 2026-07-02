"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckIcon, CopyIcon } from "@/components/icons";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";

export function KeyActions() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function createKey(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/keys", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: name || "default" }),
    });
    setBusy(false);
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setError(body?.error ?? `Failed (${res.status})`);
      return;
    }
    const body = await res.json();
    setNewKey(body.token);
    setName("");
    setCopied(false);
    router.refresh();
  }

  return (
    <>
      <form onSubmit={createKey} className="flex gap-2">
        <Input
          type="text"
          placeholder="Key name (optional)"
          value={name}
          maxLength={64}
          onChange={(e) => setName(e.target.value)}
          className="max-w-xs"
        />
        <Button type="submit" disabled={busy}>
          {busy ? "Creating…" : "Create key"}
        </Button>
      </form>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}

      <Dialog
        open={newKey !== null}
        onOpenChange={(open) => {
          if (!open) setNewKey(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Your new API key</DialogTitle>
            <DialogDescription>
              Copy it now — it won&apos;t be shown again.
            </DialogDescription>
          </DialogHeader>
          <div className="break-all rounded-lg border bg-muted/50 p-3 font-mono text-sm">
            {newKey}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                if (newKey) navigator.clipboard.writeText(newKey);
                setCopied(true);
              }}
            >
              {copied ? (
                <>
                  <CheckIcon className="size-4 text-primary" /> Copied
                </>
              ) : (
                <>
                  <CopyIcon className="size-4" /> Copy
                </>
              )}
            </Button>
            <Button onClick={() => setNewKey(null)}>Done</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function RevokeButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function revoke() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to revoke (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Failed to revoke — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Revoke
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Revoke this key?</AlertDialogTitle>
          <AlertDialogDescription>
            Requests using it will fail immediately. This cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              revoke();
            }}
          >
            {busy ? "Revoking…" : "Revoke key"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

export function ClearSessionButton({ id }: { id: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function clear() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/sessions/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        setError(body?.error ?? `Failed to clear session (${res.status})`);
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Failed to clear session — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setError(null);
      }}
    >
      <AlertDialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Clear
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Clear this browser session?</AlertDialogTitle>
          <AlertDialogDescription>
            Better Fetch will revoke the stored browser session, delete its
            portable snapshot, and make later requests using the same session
            name start from fresh browser state.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={busy}
            onClick={(e) => {
              e.preventDefault();
              clear();
            }}
          >
            {busy ? "Clearing…" : "Clear session"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
