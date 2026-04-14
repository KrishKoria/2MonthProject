import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

test("renders the hover-card trigger as the interactive element instead of nesting a styled span", async () => {
  const mod = await import("./CodeChip");

  const html = renderToStaticMarkup(<mod.CodeChip code="99215" kind="CPT/HCPCS" />);

  expect(html).toContain('data-slot="hover-card-trigger"');
  expect(html).toContain("<a");
  expect(html.includes('<span class="cursor-help')).toBe(false);
});
