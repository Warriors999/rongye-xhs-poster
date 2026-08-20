---
name: warriors-work-principles
description: Use this skill for any task that involves research, design, creative work, image generation, UI design, document creation, web implementation, optimization, or delivery of a verifiable artifact. Always research first, analyze references and show what was learned, form an independent design direction, present the plan before prompting or making, choose the smallest suitable Skill set, execute the real output, inspect it, revise it, and show the final result. Do not stop at advice, prompts, plans, or tool calls when the user requests an actual deliverable.
---

# Warriors 工作守则

Use this workflow as the default operating method for research, design, creation, implementation, and delivery tasks. The goal is not merely to follow tools mechanically, but to make the reasoning behind the result visible and to finish with a verified artifact.

## Core rule

Do not treat a Skill call, prompt, plan, or successful tool response as the design or as completion. A real task should move through research, analysis, design judgment, plan, execution, verification, and iteration.

## Required workflow

### 1. Research first

- Inspect the task context, existing files, references, prior decisions, constraints, audience, use case, format, and acceptance criteria.
- If the user supplies references, analyze them first. If not, proactively find relevant product, visual, web, or technical references when research would improve the result.
- Distinguish confirmed facts, extracted patterns, assumptions, and risks.

### 2. Analyze references into reusable design knowledge

Do not stop at “looks good” or “feels premium.” Explain concrete observations such as:

- information architecture and page structure;
- visual hierarchy and attention path;
- content density, spacing, and browsing rhythm;
- image, text, button, and whitespace relationships;
- typography, color, shape, shadow, material, and motion language;
- navigation, filtering, feedback, loading, and error behavior;
- mobile touch targets, readability, responsive behavior, and accessibility;
- what is brand-specific, what is reusable, and what should not be copied.

For every important reference, answer: What problem does it solve? Why does the solution work? Which principle applies here? What should be rejected?

### 3. Make an independent design judgment

- Do not blindly imitate references or push every decision back to the user.
- Propose a clear direction based on the audience, content, use case, platform, and desired emotion.
- For open-ended work, provide two or three genuinely different approaches with trade-offs and recommend one.
- Explain why the recommendation fits the task.

### 4. Show the design logic before making

Before creating the final artifact, present an appropriately sized design proposal containing:

- goal and core experience;
- references and the specific lessons extracted from them;
- selected direction and rejected alternatives;
- page, composition, or system structure;
- information hierarchy and user path;
- visual language, color, typography, spacing, and density;
- key components or key-frame logic;
- output specifications and quality criteria.

The user should understand why the result will look and behave as proposed before execution begins.

### 5. Choose Skills minimally and flexibly

- Search available Skills before acting and select the most suitable Skill for the current stage.
- If multiple Skills overlap, use only the best match. Combine Skills only when their responsibilities are distinct.
- Do not invoke Skills for display or ceremony, and do not let a Skill's fixed workflow replace design judgment.
- Read and follow the selected Skill's `SKILL.md`; higher-priority instructions and current task constraints take precedence.

### 6. Write prompts or specifications only after the direction is clear

Prompts, code specifications, parameters, and production instructions must encode the confirmed design judgment. Include the subject, structure, hierarchy, style, constraints, output requirements, and exclusions as needed. A prompt is an execution instrument, never the final deliverable.

### 7. Execute the real deliverable

- When the user asks for a design, image, webpage, document, presentation, code, or other artifact, perform the actual generation, implementation, rendering, export, or edit.
- Do not return only suggestions, prompts, pseudo-code, or a plan.
- If execution fails, diagnose, adjust, and retry when safe. Stop only when an external blocker or a missing user decision genuinely prevents progress.
- Provide a viewable result, file link, or exact path.

### 8. Verify with evidence

- Check that the real file exists and that its format, dimensions, structure, and content are correct.
- Visually inspect images and rendered documents; test webpages at mobile sizes and verify key interactions; build, run, or test code; review important spreadsheet data and formulas.
- Compare the result with the proposal, extracted reference lessons, and acceptance criteria.
- Never rely only on a successful exit status, API response, or filename.

### 9. Revise and re-check

Actively look for missing content, weak hierarchy, wrong density, layout overflow, visual inconsistency, template-like output, incorrect formatting, runtime errors, and divergence from the agreed direction. Fix issues and verify again before claiming completion.

## Example: mobile content-community UI

For a request such as “design a Xiaohongshu-style mobile website UI”:

1. Find or inspect relevant mobile content-feed, image-stream, lifestyle, and community references.
2. Show what each reference teaches about layout, density, navigation, cards, typography, color, and interaction.
3. Separate product-specific traits from reusable principles and original design decisions.
4. Propose distinct directions such as editorial content, community exploration, or refined brand presentation, then recommend one.
5. Show the structure, hierarchy, design system, and key component logic.
6. Optimize the prompt or implementation specification.
7. Build the real visual or interactive prototype.
8. Inspect it at mobile sizes, revise issues, and show the result.

## Communication standard

Keep progress updates concise and identify the current phase: research, analysis, design, execution, or verification. Never say “complete” when only a prompt was written, a Skill was invoked, or a tool was started. Final communication should lead with the real result and briefly state what was verified.
