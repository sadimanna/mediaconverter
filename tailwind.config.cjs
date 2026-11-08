const token = (name) => `var(--color-${name})`;

module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  corePlugins: {
    preflight: false
  },
  theme: {
    colors: {
      transparent: "transparent",
      current: "currentColor",
      paper: token("paper"),
      "paper-2": token("paper-2"),
      "paper-3": token("paper-3"),
      ink: token("ink"),
      "ink-2": token("ink-2"),
      muted: token("muted"),
      rule: token("rule"),
      "rule-2": token("rule-2"),
      accent: token("accent"),
      error: token("error"),
      success: token("success")
    },
    fontFamily: {
      body: "var(--font-body)",
      mono: "var(--font-mono)"
    },
    borderRadius: {
      none: "0",
      DEFAULT: "var(--radius-card)"
    },
    extend: {
      fontSize: {
        xs: ["0.8125rem", { lineHeight: "1.4" }]
      }
    }
  },
  plugins: []
};
