import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_CORS_HEADERS, OAUTH_SCOPE } from "@/lib/oauth";
import { absoluteUrl } from "@/lib/site";

// RFC 8414 authorization server metadata. MCP clients (Claude, Cowork,
// Claude Desktop) discover the authorize/token/register endpoints here.
export async function GET(request: NextRequest) {
  const issuer = absoluteUrl("/", request).origin;
  return NextResponse.json(
    {
      issuer,
      authorization_endpoint: `${issuer}/oauth/authorize`,
      token_endpoint: `${issuer}/api/oauth/token`,
      registration_endpoint: `${issuer}/api/oauth/register`,
      scopes_supported: [OAUTH_SCOPE],
      response_types_supported: ["code"],
      response_modes_supported: ["query"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      token_endpoint_auth_methods_supported: ["none"],
      code_challenge_methods_supported: ["S256"],
      service_documentation: `${issuer}/mcp`,
    },
    { headers: OAUTH_CORS_HEADERS },
  );
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}
