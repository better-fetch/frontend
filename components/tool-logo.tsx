import type { CSSProperties } from "react";
import { Wrench } from "lucide-react";
import type { RegistryTool } from "@/lib/tools-registry";
import { cn } from "@/lib/utils";

type Props = {
  tool: Pick<RegistryTool, "logo_svg" | "logo_label" | "title">;
  /** Tile edge size. sm = compact rows, md = cards. */
  size?: "sm" | "md";
  className?: string;
};

function svgBackground(svg: string): CSSProperties {
  const encoded = encodeURIComponent(svg);
  return {
    backgroundImage: `url("data:image/svg+xml,${encoded}")`,
    backgroundPosition: "center",
    backgroundRepeat: "no-repeat",
    backgroundSize: "contain",
  };
}

const TILE = {
  sm: "size-9 rounded-lg",
  md: "size-11 rounded-xl",
} as const;

const LOGO = {
  sm: "h-5 w-6",
  md: "h-7 w-8",
} as const;

// App-icon tile: a white rounded square with the real source SVG rendered in
// full color. Rendering the SVG as an image preserves official cut-outs and
// multi-part marks that collapse when treated as a CSS mask.
export function ToolLogo({ tool, size = "md", className }: Props) {
  const label = tool.logo_label ?? `${tool.title} logo`;
  return (
    <span
      aria-label={label}
      role="img"
      className={cn(
        "inline-flex shrink-0 items-center justify-center border border-border bg-white shadow-sm",
        TILE[size],
        className,
      )}
    >
      {tool.logo_svg ? (
        <span
          aria-hidden="true"
          className={cn("object-contain", LOGO[size])}
          style={svgBackground(tool.logo_svg)}
        />
      ) : (
        <Wrench className={cn("text-muted-foreground", LOGO[size])} />
      )}
    </span>
  );
}
