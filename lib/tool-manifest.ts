import "server-only";
import { z } from "zod";
import { MCP_TOOLS } from "@/lib/mcp-tools";

// Meta-schema for betterfetch.tool.json — the platform-side mirror of
// src/manifest.ts in better-fetch/tools-sdk (CI validates with the SDK copy;
// ingest revalidates independently here). Change both together.
//
// The constrained JSON-Schema subset is the contract that lets one manifest
// drive MCP registration (zod conversion), the playground form, and docs:
// flat objects of scalars, arrays of scalars, one level of nested object.

const scalarSchema = z.union([
  z.object({
    type: z.literal("string"),
    description: z.string().optional(),
    enum: z.array(z.string()).min(1).optional(),
    format: z.enum(["uri", "email", "date", "date-time"]).optional(),
    minLength: z.number().int().min(0).optional(),
    maxLength: z.number().int().min(1).optional(),
    default: z.string().optional(),
  }),
  z.object({
    type: z.enum(["number", "integer"]),
    description: z.string().optional(),
    minimum: z.number().optional(),
    maximum: z.number().optional(),
    default: z.number().optional(),
  }),
  z.object({
    type: z.literal("boolean"),
    description: z.string().optional(),
    default: z.boolean().optional(),
  }),
]);

const propertySchema = z.union([
  scalarSchema,
  z.object({
    type: z.literal("array"),
    description: z.string().optional(),
    items: scalarSchema,
    minItems: z.number().int().min(0).optional(),
    maxItems: z.number().int().min(1).optional(),
  }),
  z.object({
    type: z.literal("object"),
    description: z.string().optional(),
    properties: z.record(z.string(), scalarSchema),
    required: z.array(z.string()).optional(),
    additionalProperties: z.literal(false),
  }),
]);

export const ioSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), propertySchema),
  required: z.array(z.string()).optional(),
  additionalProperties: z.literal(false),
});

// Output schemas are display- and assertion-only (never form-rendered or
// zod-converted for MCP), so they additionally allow arrays of
// object-of-scalars — the natural shape of results lists.
const objectOfScalars = z.object({
  type: z.literal("object"),
  description: z.string().optional(),
  properties: z.record(z.string(), scalarSchema),
  required: z.array(z.string()).optional(),
  additionalProperties: z.literal(false),
});

const outputPropertySchema = z.union([
  propertySchema,
  z.object({
    type: z.literal("array"),
    description: z.string().optional(),
    items: z.union([scalarSchema, objectOfScalars]),
    minItems: z.number().int().min(0).optional(),
    maxItems: z.number().int().min(1).optional(),
  }),
]);

export const outputIoSchema = z.object({
  type: z.literal("object"),
  properties: z.record(z.string(), outputPropertySchema),
  required: z.array(z.string()).optional(),
  additionalProperties: z.literal(false),
});

function safeInlineSvg(svg: string): boolean {
  const trimmed = svg.trim();
  if (!/^<svg[\s>]/i.test(trimmed) || !/<\/svg>$/i.test(trimmed)) return false;
  if (/<\s*(script|foreignObject|iframe|object|embed|link|style)\b/i.test(trimmed)) return false;
  if (/\son[a-z]+\s*=/i.test(trimmed)) return false;
  if (/\b(?:href|xlink:href|src)\s*=/i.test(trimmed)) return false;
  if (/url\(\s*['"]?(?!#)/i.test(trimmed)) return false;
  return true;
}

const toolLogoSchema = z.object({
  label: z.string().min(2).max(80),
  svg: z
    .string()
    .min(20)
    .max(20_000)
    .refine(safeInlineSvg, "logo.svg must be a safe inline <svg> without scripts, event handlers, href/src, or external references"),
  sourceUrl: z.string().url().optional(),
});

const seoSchema = z.object({
  title: z.string().min(20).max(90),
  description: z.string().min(80).max(320),
  intro: z.string().min(160).max(1200),
  useCases: z
    .array(
      z.object({
        title: z.string().min(3).max(80),
        description: z.string().min(40).max(320),
      }),
    )
    .min(2)
    .max(6),
  faqs: z
    .array(
      z.object({
        question: z.string().min(10).max(140),
        answer: z.string().min(40).max(500),
      }),
    )
    .min(2)
    .max(6),
  keywords: z.array(z.string().min(2).max(60)).min(3).max(16),
});

const popularitySchema = z
  .object({
    rank: z.number().int().min(1).max(10_000).optional(),
    score: z.number().min(0).max(1_000_000_000).optional(),
  })
  .refine((value) => value.rank !== undefined || value.score !== undefined, {
    message: "popularity must include rank or score",
  });

export const manifestSchema = z.object({
  name: z.string().regex(/^[a-z][a-z0-9_]{2,63}$/),
  version: z.string().regex(/^\d+\.\d+\.\d+$/),
  title: z.string().min(3).max(80),
  description: z.string().min(20).max(500),
  category: z.string().regex(/^[a-z][a-z0-9-]{1,31}$/),
  logo: toolLogoSchema,
  seo: seoSchema,
  popularity: popularitySchema.optional(),
  creditsEstimate: z.number().int().min(1).max(50),
  maxEngineCalls: z.number().int().min(1).max(50).optional(),
  inputSchema: ioSchema,
  outputSchema: outputIoSchema.optional(),
  examples: z
    .array(
      z.object({
        name: z.string().min(1),
        input: z.unknown(),
        expect: z
          .object({ outputMatches: z.record(z.string(), z.unknown()).optional() })
          .optional(),
      }),
    )
    .min(1),
  entry: z.string().regex(/^src\/.+\.(ts|js)$/),
});

export type ToolManifest = z.infer<typeof manifestSchema>;
export type ToolIoSchema = z.infer<typeof ioSchema>;

// Names the static MCP server already owns, plus names we may want later.
export const RESERVED_TOOL_NAMES = new Set([
  ...MCP_TOOLS.map((t) => t.name),
  "run_tool",
  "list_tools",
  "tool_template",
]);

/** "better-fetch/extract-article" → "extract_article" */
export function toolNameFromRepo(repo: string): string {
  return (repo.split("/")[1] ?? "").replace(/-/g, "_");
}

/** "tools/extract-article" → "extract_article" (monorepo publishes) */
export function toolNameFromDir(dir: string): string {
  return (dir.split("/").pop() ?? "").replace(/-/g, "_");
}

export function compareSemver(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < 3; i++) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
}
