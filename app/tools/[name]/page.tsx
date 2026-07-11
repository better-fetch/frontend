import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CodeBlock } from "@/components/code-block";
import { ToolLogo } from "@/components/tool-logo";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { IoSchemaJson } from "@/lib/json-schema-zod";
import { getClaims } from "@/lib/supabase/server";
import {
  categoryLabel,
  toolMetaDescription,
  toolPageTitle,
} from "@/lib/tool-display";
import { getLiveTool, type RegistryTool } from "@/lib/tools-registry";
import { Playground } from "./playground";

export const revalidate = 300;

type Props = { params: Promise<{ name: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { name } = await params;
  const tool = await getLiveTool(name);
  if (!tool) return {};
  const title = toolPageTitle(tool);
  const description = toolMetaDescription(tool);
  return {
    title,
    description,
    keywords: tool.seo?.keywords,
    alternates: { canonical: `/tools/${tool.name}` },
    openGraph: {
      title,
      description,
      url: `/tools/${tool.name}`,
      type: "website",
    },
  };
}

type SchemaField = {
  name: string;
  type: string;
  required: boolean;
  default?: string;
  description?: string;
};

type PropertySchema = IoSchemaJson["properties"][string];
type ScalarSchema = Exclude<PropertySchema, { type: "array" } | { type: "object" }>;

function scalarType(scalar: ScalarSchema): string {
  if (scalar.type === "string" && scalar.enum?.length) {
    return scalar.enum.map((v) => `"${v}"`).join(" | ");
  }
  if (scalar.type === "string" && scalar.format) {
    return `string (${scalar.format})`;
  }
  return scalar.type;
}

function scalarDefault(scalar: ScalarSchema): string | undefined {
  return scalar.default === undefined ? undefined : JSON.stringify(scalar.default);
}

function schemaToFields(schema: IoSchemaJson): SchemaField[] {
  const required = new Set(schema.required ?? []);
  const fields: SchemaField[] = [];
  for (const [key, prop] of Object.entries(schema.properties)) {
    if (prop.type === "array") {
      fields.push({
        name: key,
        type: `${prop.items.type}[]`,
        required: required.has(key),
        description: prop.description,
      });
    } else if (prop.type === "object") {
      fields.push({
        name: key,
        type: "object",
        required: required.has(key),
        description: prop.description,
      });
      const nestedRequired = new Set(prop.required ?? []);
      for (const [sub, scalar] of Object.entries(prop.properties)) {
        fields.push({
          name: `${key}.${sub}`,
          type: scalarType(scalar),
          required: required.has(key) && nestedRequired.has(sub),
          default: scalarDefault(scalar),
          description: scalar.description,
        });
      }
    } else {
      fields.push({
        name: key,
        type: scalarType(prop),
        required: required.has(key),
        default: scalarDefault(prop),
        description: prop.description,
      });
    }
  }
  return fields;
}

// Same visual style as the FieldList on /docs.
function FieldList({ fields }: { fields: SchemaField[] }) {
  return (
    <div className="divide-y rounded-lg border">
      {fields.map((field) => (
        <div key={field.name} className="space-y-1 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="font-mono text-sm font-medium">{field.name}</code>
            <Badge variant="outline" className="font-mono text-[11px]">
              {field.type}
            </Badge>
            {field.required ? (
              <span className="text-xs text-destructive">required</span>
            ) : null}
            {field.default ? (
              <span className="text-xs text-muted-foreground">
                default: <code className="font-mono">{field.default}</code>
              </span>
            ) : null}
          </div>
          {field.description ? (
            <p className="text-sm text-muted-foreground">{field.description}</p>
          ) : null}
        </div>
      ))}
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <h2 className="text-xl font-semibold tracking-tight">{title}</h2>
      {children}
    </section>
  );
}

function snippets(tool: RegistryTool) {
  const firstInput = JSON.stringify(tool.examples[0]?.input ?? {});
  const repoDir = tool.repo_url.split("/").pop() ?? tool.name;
  return {
    mcp: `# After connecting https://betterfetch.co/api/mcp, ask your AI to:
1. Call search_tools for "${tool.title}"
2. Call run_tool with:
   name: "${tool.name}"
   input: ${firstInput}`,
    curl: `curl -sS -X POST "https://betterfetch.co/api/tools/${tool.name}/run" \\
  -H "Authorization: Bearer bf_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"input": ${firstInput}}'`,
    local: `git clone ${tool.repo_url} && cd ${repoDir} && npm i
BETTER_FETCH_API_KEY=bf_your_key_here npx bf-tool run --input '${firstInput}'`,
  };
}

export default async function ToolPage({ params }: Props) {
  const { name } = await params;
  const tool = await getLiveTool(name);
  if (!tool) notFound();

  const signedIn = Boolean(await getClaims());
  const code = snippets(tool);
  const seo = tool.seo;
  const structuredData = [
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: tool.title,
      applicationCategory: categoryLabel(tool.category),
      operatingSystem: "Web",
      description: toolMetaDescription(tool),
      url: `https://betterfetch.co/tools/${tool.name}`,
      offers: {
        "@type": "Offer",
        price: "0",
        priceCurrency: "USD",
      },
    },
    ...(seo?.faqs.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: seo.faqs.map((faq) => ({
              "@type": "Question",
              name: faq.question,
              acceptedAnswer: {
                "@type": "Answer",
                text: faq.answer,
              },
            })),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-10">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
      />

      <header className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <ToolLogo tool={tool} className="size-14" />
        <div className="space-y-3">
          <h1 className="text-3xl font-semibold tracking-tight">{tool.title}</h1>
          <p className="text-muted-foreground">{tool.description}</p>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" asChild>
              <Link href={`/tools?category=${encodeURIComponent(tool.category)}`}>
                {categoryLabel(tool.category)}
              </Link>
            </Badge>
            <Badge variant="outline" className="font-mono">
              v{tool.version}
            </Badge>
            <Badge variant="outline">
              ~{tool.credits_estimate} credit
              {tool.credits_estimate === 1 ? "" : "s"}/run
            </Badge>
            <a
              href={tool.repo_url}
              className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
              rel="noopener"
            >
              Source on GitHub
            </a>
          </div>
        </div>
      </header>

      {seo ? (
        <Section title="Overview">
          <div className="space-y-4 text-sm leading-6 text-muted-foreground">
            <p>{seo.intro}</p>
            {tool.validated_at ? (
              <p>
                Last validated:{" "}
                {new Intl.DateTimeFormat("en", {
                  day: "numeric",
                  month: "short",
                  year: "numeric",
                }).format(new Date(tool.validated_at))}
              </p>
            ) : null}
          </div>
        </Section>
      ) : null}

      <Section title="Playground">
        <Card>
          <CardContent>
            <Playground
              name={tool.name}
              schema={tool.input_schema}
              credits={tool.credits_estimate}
              signedIn={signedIn}
            />
          </CardContent>
        </Card>
      </Section>

      <Section title="Input">
        <FieldList fields={schemaToFields(tool.input_schema)} />
      </Section>

      {tool.output_schema ? (
        <Section title="Output">
          <FieldList fields={schemaToFields(tool.output_schema)} />
        </Section>
      ) : null}

      {tool.examples.length > 0 ? (
        <Section title="Examples">
          <div className="space-y-6">
            {tool.examples.map((example) => (
              <div key={example.name} className="space-y-2">
                <h3 className="font-medium">{example.name}</h3>
                <CodeBlock>
                  {JSON.stringify(example.input ?? {}, null, 2)}
                </CodeBlock>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      {seo?.useCases.length ? (
        <Section title="Use cases">
          <div className="grid gap-4 sm:grid-cols-2">
            {seo.useCases.map((useCase) => (
              <Card key={useCase.title}>
                <CardContent className="space-y-2">
                  <h3 className="font-medium">{useCase.title}</h3>
                  <p className="text-sm text-muted-foreground">{useCase.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </Section>
      ) : null}

      {seo?.faqs.length ? (
        <Section title="FAQ">
          <div className="divide-y rounded-lg border">
            {seo.faqs.map((faq) => (
              <div key={faq.question} className="space-y-2 p-4">
                <h3 className="font-medium">{faq.question}</h3>
                <p className="text-sm leading-6 text-muted-foreground">{faq.answer}</p>
              </div>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Use it anywhere">
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">MCP (Claude, ChatGPT, Codex)</p>
            <CodeBlock>{code.mcp}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">REST</p>
            <CodeBlock>{code.curl}</CodeBlock>
          </div>
          <div className="space-y-2">
            <p className="text-sm font-medium">Run locally</p>
            <CodeBlock>{code.local}</CodeBlock>
          </div>
        </div>
      </Section>
    </div>
  );
}
