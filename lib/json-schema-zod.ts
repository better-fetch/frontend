import { z } from "zod";

// Converts the constrained manifest schema subset (lib/tool-manifest.ts) to
// a ZodRawShape for MCP registerTool, which requires zod schemas (raw JSON
// Schema is not supported by the MCP SDK). Hand-rolled because runtime
// converter libraries target zod v3 and this repo is on v4; the subset is
// small enough that ~100 lines covers it losslessly.

type ScalarSchema = {
  type: "string" | "number" | "integer" | "boolean";
  description?: string;
  enum?: string[];
  format?: "uri" | "email" | "date" | "date-time";
  minLength?: number;
  maxLength?: number;
  minimum?: number;
  maximum?: number;
  default?: string | number | boolean;
};

type PropertySchema =
  | ScalarSchema
  | {
      type: "array";
      description?: string;
      items: ScalarSchema;
      minItems?: number;
      maxItems?: number;
    }
  | {
      type: "object";
      description?: string;
      properties: Record<string, ScalarSchema>;
      required?: string[];
      additionalProperties: false;
    };

export type IoSchemaJson = {
  type: "object";
  properties: Record<string, PropertySchema>;
  required?: string[];
  additionalProperties: false;
};

function scalarToZod(prop: ScalarSchema): z.ZodType {
  let schema: z.ZodType;
  switch (prop.type) {
    case "string": {
      if (prop.enum?.length) {
        schema = z.enum(prop.enum as [string, ...string[]]);
      } else if (prop.format === "uri") {
        schema = z.url();
      } else if (prop.format === "email") {
        schema = z.email();
      } else {
        let s = z.string();
        if (prop.minLength != null) s = s.min(prop.minLength);
        if (prop.maxLength != null) s = s.max(prop.maxLength);
        schema = s;
      }
      break;
    }
    case "number":
    case "integer": {
      let n = prop.type === "integer" ? z.number().int() : z.number();
      if (prop.minimum != null) n = n.min(prop.minimum);
      if (prop.maximum != null) n = n.max(prop.maximum);
      schema = n;
      break;
    }
    case "boolean":
      schema = z.boolean();
      break;
  }
  if (prop.description) schema = schema.describe(prop.description);
  return schema;
}

function propertyToZod(prop: PropertySchema): z.ZodType {
  if (prop.type === "array") {
    let a = z.array(scalarToZod(prop.items));
    if (prop.minItems != null) a = a.min(prop.minItems);
    if (prop.maxItems != null) a = a.max(prop.maxItems);
    return prop.description ? a.describe(prop.description) : a;
  }
  if (prop.type === "object") {
    const shape: Record<string, z.ZodType> = {};
    const required = new Set(prop.required ?? []);
    for (const [key, value] of Object.entries(prop.properties)) {
      const s = scalarToZod(value);
      shape[key] = required.has(key) ? s : s.optional();
    }
    const o = z.strictObject(shape);
    return prop.description ? o.describe(prop.description) : o;
  }
  return scalarToZod(prop);
}

/**
 * Returns the plain shape object registerTool expects ({name: zodSchema}).
 * Non-required properties become .optional(); manifest defaults are applied
 * so omitted args reach handlers filled in.
 */
export function jsonSchemaToZodShape(schema: IoSchemaJson): Record<string, z.ZodType> {
  const shape: Record<string, z.ZodType> = {};
  const required = new Set(schema.required ?? []);
  for (const [key, prop] of Object.entries(schema.properties)) {
    let s = propertyToZod(prop);
    const fallback = (prop as ScalarSchema).default;
    if (fallback !== undefined) {
      s = s.default(fallback);
    } else if (!required.has(key)) {
      s = s.optional();
    }
    shape[key] = s;
  }
  return shape;
}
