export const markdown_exps: [RegExp, string][] = [
  [
    /# \d+/,
    "Detected markdown in code block. Markdown cannot be in code blocks.",
  ],
  [
    /```md/,
    "Detected markdown in code block. Markdown cannot be in code blocks.",
  ],
  [
    /```markdown/,
    "Detected markdown in code block. Markdown cannot be in code blocks.",
  ],
];
