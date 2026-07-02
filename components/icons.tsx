"use client";

import { Icon } from "@iconify/react";
import checkCircle from "@iconify-icons/solar/check-circle-bold-duotone";
import copy from "@iconify-icons/solar/copy-bold-duotone";
import plugCircle from "@iconify-icons/solar/plug-circle-bold-duotone";
import widgetAdd from "@iconify-icons/solar/widget-add-bold-duotone";

// UI icons come from Solar Bold Duotone (iconify), wrapped so server
// components can use them; brand/language logos stay in code-tabs.
type IconProps = { className?: string };

export function CopyIcon({ className }: IconProps) {
  return <Icon icon={copy} className={className} aria-hidden />;
}

export function CheckIcon({ className }: IconProps) {
  return <Icon icon={checkCircle} className={className} aria-hidden />;
}

export function McpIcon({ className }: IconProps) {
  return <Icon icon={plugCircle} className={className} aria-hidden />;
}

export function PluginIcon({ className }: IconProps) {
  return <Icon icon={widgetAdd} className={className} aria-hidden />;
}
