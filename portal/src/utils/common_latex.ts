export const exps: [RegExp, string][] = [
  [
    /\\frac/,
    "Detected fraction in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\begin/,
    "Detected LaTeX begin in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\end/,
    "Detected LaTeX end in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\sum/,
    "Detected sum in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\int/,
    "Detected integral in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\prod/,
    "Detected product in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\lim/,
    "Detected limit in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\sqrt/,
    "Detected square root in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\alpha/,
    "Detected alpha in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\beta/,
    "Detected beta in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\gamma/,
    "Detected gamma in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\delta/,
    "Detected delta in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\theta/,
    "Detected theta in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\lambda/,
    "Detected lambda in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mu/,
    "Detected mu in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\pi/,
    "Detected pi in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\sigma/,
    "Detected sigma in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\phi/,
    "Detected phi in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\psi/,
    "Detected psi in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\omega/,
    "Detected omega in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\infty/,
    "Detected infinity in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\partial/,
    "Detected partial derivative in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\nabla/,
    "Detected nabla in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\cdot/,
    "Detected dot product in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\times/,
    "Detected cross product in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\div/,
    "Detected division in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\pm/,
    "Detected plus-minus in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mp/,
    "Detected minus-plus in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\leq/,
    "Detected less than or equal in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\geq/,
    "Detected greater than or equal in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\neq/,
    "Detected not equal in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\approx/,
    "Detected approximately equal in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\equiv/,
    "Detected equivalent in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\subset/,
    "Detected subset in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\supset/,
    "Detected superset in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\in/,
    "Detected element of in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\notin/,
    "Detected not element of in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\cup/,
    "Detected union in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\cap/,
    "Detected intersection in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\emptyset/,
    "Detected empty set in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mathbb/,
    "Detected blackboard bold in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mathbf/,
    "Detected bold in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mathit/,
    "Detected italic in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mathrm/,
    "Detected roman in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mathcal/,
    "Detected calligraphic in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mathfrak/,
    "Detected fraktur in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\text/,
    "Detected text in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\left/,
    "Detected left delimiter in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\right/,
    "Detected right delimiter in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\over/,
    "Detected fraction over in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\atop/,
    "Detected fraction atop in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\choose/,
    "Detected binomial in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\bmod/,
    "Detected binary modulo in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\pmod/,
    "Detected parenthesized modulo in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\mod/,
    "Detected modulo in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\gcd/,
    "Detected greatest common divisor in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\lcm/,
    "Detected least common multiple in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
  [
    /\\log/,
    "Detected logarithm in text. Make sure to wrap all LaTeX in $...$ or $$...$$",
  ],
];
