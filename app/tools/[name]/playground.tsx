"use client";

import Link from "next/link";
import { useState } from "react";
import { CopyButton } from "@/components/copy-button";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { IoSchemaJson } from "@/lib/json-schema-zod";
import { cn } from "@/lib/utils";

type PropertySchema = IoSchemaJson["properties"][string];
type ScalarSchema = Exclude<PropertySchema, { type: "array" } | { type: "object" }>;

// Native select/textarea styled to match components/ui/input.tsx.
const FIELD_CLASSES =
  "w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:bg-input/50 disabled:opacity-50 md:text-sm dark:bg-input/30 dark:disabled:bg-input/80";

type Values = Record<string, string | boolean>;

function initialValues(schema: IoSchemaJson): Values {
  const values: Values = {};
  const set = (key: string, fallback: string | number | boolean | undefined) => {
    if (fallback === undefined) return;
    values[key] = typeof fallback === "boolean" ? fallback : String(fallback);
  };
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.type === "object") {
      for (const [sub, scalar] of Object.entries(prop.properties)) {
        set(`${key}.${sub}`, scalar.default);
      }
    } else if (prop.type !== "array") {
      set(key, prop.default);
    }
  }
  return values;
}

function scalarValue(
  scalar: ScalarSchema,
  raw: string | boolean | undefined,
): unknown {
  if (scalar.type === "boolean") return raw === true;
  const text = typeof raw === "string" ? raw.trim() : "";
  if (!text) return undefined;
  if (scalar.type === "number" || scalar.type === "integer") {
    const n = Number(text);
    return Number.isNaN(n) ? undefined : n;
  }
  return text;
}

function buildInput(schema: IoSchemaJson, values: Values): Record<string, unknown> {
  const input: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.type === "array") {
      const lines = (typeof values[key] === "string" ? (values[key] as string) : "")
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
      if (lines.length === 0) continue;
      input[key] =
        prop.items.type === "number" || prop.items.type === "integer"
          ? lines.map(Number).filter((n) => !Number.isNaN(n))
          : prop.items.type === "boolean"
            ? lines.map((line) => line === "true")
            : lines;
    } else if (prop.type === "object") {
      const nested: Record<string, unknown> = {};
      for (const [sub, scalar] of Object.entries(prop.properties)) {
        const value = scalarValue(scalar, values[`${key}.${sub}`]);
        if (value !== undefined) nested[sub] = value;
      }
      if (Object.keys(nested).length > 0) input[key] = nested;
    } else {
      const value = scalarValue(prop, values[key]);
      if (value !== undefined) input[key] = value;
    }
  }
  return input;
}

export function Playground({
  name,
  schema,
  credits,
  signedIn,
}: {
  name: string;
  schema: IoSchemaJson;
  credits: number;
  signedIn: boolean;
}) {
  const [values, setValues] = useState<Values>(() => initialValues(schema));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  const required = new Set(schema.required ?? []);
  const setValue = (key: string, value: string | boolean) =>
    setValues((prev) => ({ ...prev, [key]: value }));

  async function run(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch(`/api/tools/${name}/run`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: buildInput(schema, values) }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setError(
          body?.message ?? body?.error ?? `Run failed (${res.status})`,
        );
        return;
      }
      setResult(JSON.stringify(body, null, 2));
    } catch {
      setError("Run failed — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  function renderScalar(
    key: string,
    label: string,
    scalar: ScalarSchema,
    isRequired: boolean,
  ) {
    const disabled = !signedIn || busy;
    const labelEl = (
      <Label htmlFor={key} className="font-mono text-xs">
        {label}
        {isRequired ? <span className="text-destructive">*</span> : null}
      </Label>
    );

    if (scalar.type === "boolean") {
      return (
        <div key={key} className="space-y-1">
          <div className="flex items-center gap-2">
            <input
              id={key}
              type="checkbox"
              className="size-4 accent-primary disabled:cursor-not-allowed disabled:opacity-50"
              checked={values[key] === true}
              disabled={disabled}
              onChange={(e) => setValue(key, e.target.checked)}
            />
            {labelEl}
          </div>
          {scalar.description ? (
            <p className="text-xs text-muted-foreground">{scalar.description}</p>
          ) : null}
        </div>
      );
    }

    const text = typeof values[key] === "string" ? (values[key] as string) : "";
    let field: React.ReactNode;
    if (scalar.type === "string" && scalar.enum?.length) {
      field = (
        <select
          id={key}
          className={cn(FIELD_CLASSES, "h-8")}
          value={text}
          disabled={disabled}
          onChange={(e) => setValue(key, e.target.value)}
        >
          {isRequired && text ? null : <option value="">—</option>}
          {scalar.enum.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      );
    } else if (scalar.type === "string" && (scalar.maxLength ?? 0) > 200) {
      field = (
        <textarea
          id={key}
          rows={4}
          className={cn(FIELD_CLASSES, "font-mono text-xs")}
          value={text}
          disabled={disabled}
          onChange={(e) => setValue(key, e.target.value)}
        />
      );
    } else {
      field = (
        <Input
          id={key}
          type={scalar.type === "string" ? "text" : "number"}
          placeholder={
            scalar.type === "string" && scalar.format === "uri"
              ? "https://…"
              : undefined
          }
          value={text}
          disabled={disabled}
          onChange={(e) => setValue(key, e.target.value)}
        />
      );
    }

    return (
      <div key={key} className="space-y-1">
        {labelEl}
        {field}
        {scalar.description ? (
          <p className="text-xs text-muted-foreground">{scalar.description}</p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <form onSubmit={run} className="space-y-4">
        {Object.entries(schema.properties).map(([key, prop]) => {
          if (prop.type === "array") {
            return (
              <div key={key} className="space-y-1">
                <Label htmlFor={key} className="font-mono text-xs">
                  {key}
                  {required.has(key) ? (
                    <span className="text-destructive">*</span>
                  ) : null}
                </Label>
                <textarea
                  id={key}
                  rows={4}
                  placeholder="One item per line"
                  className={cn(FIELD_CLASSES, "font-mono text-xs")}
                  value={typeof values[key] === "string" ? (values[key] as string) : ""}
                  disabled={!signedIn || busy}
                  onChange={(e) => setValue(key, e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {prop.description ? `${prop.description} ` : ""}One item per
                  line.
                </p>
              </div>
            );
          }
          if (prop.type === "object") {
            const nestedRequired = new Set(prop.required ?? []);
            return (
              <fieldset key={key} className="space-y-3 rounded-lg border p-3">
                <legend className="px-1 font-mono text-xs font-medium">
                  {key}
                  {required.has(key) ? (
                    <span className="text-destructive">*</span>
                  ) : null}
                </legend>
                {prop.description ? (
                  <p className="text-xs text-muted-foreground">
                    {prop.description}
                  </p>
                ) : null}
                {Object.entries(prop.properties).map(([sub, scalar]) =>
                  renderScalar(
                    `${key}.${sub}`,
                    sub,
                    scalar,
                    nestedRequired.has(sub),
                  ),
                )}
              </fieldset>
            );
          }
          return renderScalar(key, key, prop, required.has(key));
        })}

        {signedIn ? (
          <Button type="submit" disabled={busy}>
            {busy ? "Running…" : "Run tool"}
          </Button>
        ) : (
          <Button asChild>
            <Link href="/login">Sign in to run this tool</Link>
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          ~{credits} credit{credits === 1 ? "" : "s"} per run · runs against
          your account
        </p>
      </form>

      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {result !== null ? (
        <div className="relative">
          <pre className="max-h-80 overflow-auto rounded-lg border bg-muted/50 p-4 pr-12 font-mono text-xs leading-relaxed">
            {result}
          </pre>
          <div className="absolute right-2 top-2">
            <CopyButton value={result} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
