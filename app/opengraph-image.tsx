import { ImageResponse } from "next/og";

export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const alt = "Better Fetch — the web data layer for AI";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          background: "#1e1e2e",
          padding: "80px",
          fontFamily: "monospace",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "28px" }}>
          {/* Logo glyph from public/logo.svg, scaled to the 1024 viewBox */}
          <svg width="96" height="96" viewBox="0 0 1024 1024">
            <g transform="matrix(0,4.96218,-1.99073,0,1520.71,-1276.92)">
              <path
                fill="#ffffff"
                d="M463.691,281.163C349.797,281.163 257.33,382.224 257.33,506.701C257.33,631.179 349.797,732.239 463.691,732.239C429.523,679.614 401.783,596.67 401.783,506.701C401.783,416.732 429.523,333.789 463.691,281.163Z"
              />
            </g>
          </svg>
          <div style={{ fontSize: 64, fontWeight: 700, color: "#cdd6f4" }}>
            better fetch
          </div>
        </div>
        <div
          style={{
            marginTop: "40px",
            fontSize: 40,
            lineHeight: 1.3,
            color: "#a6adc8",
            maxWidth: "900px",
          }}
        >
          Give Claude and ChatGPT reliable access to live web data.
        </div>
        <div style={{ marginTop: "48px", fontSize: 28, color: "#94e2d5" }}>
          One hosted MCP connector · betterfetch.co
        </div>
      </div>
    ),
    size,
  );
}
