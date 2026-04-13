import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

test("uses the shared chart container sizing wrapper", { timeout: 20000 }, async () => {
  const mod = await import("./PrecisionRecallChart");

  const html = renderToStaticMarkup(
    <mod.PrecisionRecallChart
      curve={[
        { threshold: 0.2, precision: 0.31, recall: 0.88 },
        { threshold: 0.5, precision: 0.74, recall: 0.62 },
        { threshold: 0.8, precision: 0.91, recall: 0.27 },
      ]}
    />,
  );

  expect(html).toContain('data-slot="chart"');
  expect(html).toContain("min-w-0");
});
