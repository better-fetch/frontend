import { NextResponse, type NextRequest } from "next/server";
import { categoryLabel, toolMetaDescription } from "@/lib/tool-display";
import { getLiveTool } from "@/lib/tools-registry";

export const dynamic = "force-static";
export const revalidate = 3600;

type Props = { params: Promise<{ name: string }> };

function body(tool: NonNullable<Awaited<ReturnType<typeof getLiveTool>>>) {
  const example = JSON.stringify(tool.examples[0]?.input ?? {});
  const fields = Object.entries(tool.input_schema.properties)
    .map(([name, schema]) => {
      const type = typeof schema === "object" && schema && "type" in schema ? schema.type : "unknown";
      const description =
        typeof schema === "object" && schema && "description" in schema
          ? `: ${String(schema.description)}`
          : "";
      return `- \`${name}\` (${type})${description}`;
    })
    .join("\n");

  return `# ${tool.title}

> ${toolMetaDescription(tool)}

- Tool name: \`${tool.name}\`
- Category: ${categoryLabel(tool.category)}
- Version: ${tool.version}
- Credits: ${tool.credits_estimate} credit${tool.credits_estimate === 1 ? "" : "s"} per run
- MCP connector: https://betterfetch.co/api/mcp
- REST endpoint: POST https://betterfetch.co/api/tools/${tool.name}/run
- Tool page: https://betterfetch.co/tools/${tool.name}
- Source: ${tool.repo_url}

## Input

${fields || "- No input fields"}

## Example

\`\`\`json
${example}
\`\`\`

## MCP

Call the Better Fetch MCP connector with tool name \`${tool.name}\`.

## REST

\`\`\`sh
curl -sS -X POST "https://betterfetch.co/api/tools/${tool.name}/run" \\
  -H "Authorization: Bearer bf_your_key_here" \\
  -H "Content-Type: application/json" \\
  -d '{"input": ${example}}'
\`\`\`
`;
}

export async function GET(_request: NextRequest, { params }: Props) {
  const { name } = await params;
  const tool = await getLiveTool(name);
  if (!tool) {
    return NextResponse.json({ error: "tool_not_found" }, { status: 404 });
  }
  return new Response(body(tool), {
    headers: { "content-type": "text/plain; charset=utf-8" },
  });
}
