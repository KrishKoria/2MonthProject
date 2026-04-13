# Rationale Evaluation Rubric

This rubric is used for `T075a` to rate 50 AI-generated investigation rationales against `SC-003`.

## Rating Scale

### `useful`

A rationale is `useful` when all of the following are true:

- The primary anomaly type is correct for the claim being evaluated.
- At least one policy citation is present and it matches evidence retrieved during the investigation run.
- The recommended action is concrete and actionable for an investigator.

### `partially_useful`

A rationale is `partially_useful` when:

- The primary anomaly type is correct, but citations are weak, missing, or too generic, or
- The action is present but not specific enough to guide next steps.

### `not_useful`

A rationale is `not_useful` when any of the following are true:

- The primary anomaly type is wrong.
- Policy citations are hallucinated or do not match retrieved evidence.
- The output lacks a meaningful recommended action.

## Gate

- `SC-003` / `T075a` passes when at least `85%` of the 50-claim sample is rated `useful`.
