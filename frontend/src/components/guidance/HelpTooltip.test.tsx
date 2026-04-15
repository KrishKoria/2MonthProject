import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";

test("renders a single tooltip trigger button", async () => {
  const mod = await import("./HelpTooltip");

  const html = renderToStaticMarkup(
    <TooltipProvider>
      <mod.HelpTooltip label="Helpful term">Short explanation</mod.HelpTooltip>
    </TooltipProvider>,
  );

  expect(html.match(/<button/g)?.length ?? 0).toBe(1);
  expect(html).toContain('data-slot="tooltip-trigger"');
});
