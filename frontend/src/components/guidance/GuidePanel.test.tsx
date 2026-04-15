import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

test("renders a start-here onboarding panel with numbered steps", async () => {
  const mod = await import("./GuidePanel");

  const html = renderToStaticMarkup(
    <mod.GuidePanel
      eyebrow="Start here"
      title="You are not on your own."
      description="This workspace explains each step as you move."
      steps={[
        {
          value: "find",
          title: "Find a claim",
          summary: "Start with the review queue.",
          detail: "Use filters only if you need to narrow the list.",
          hint: "High-priority claims appear first.",
          ctaLabel: "Open queue",
          ctaHref: "/claims",
        },
        {
          value: "decide",
          title: "Choose the next step",
          summary: "Open a case and read the short summary.",
          detail: "You stay in control of the final decision.",
        },
      ]}
    />,
  );

  expect(html).toContain("Start here");
  expect(html).toContain("Find a claim");
  expect(html).toContain("Choose the next step");
  expect(html).toContain("Open queue");
});
