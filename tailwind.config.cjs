module.exports = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0b0f14",
        stone: "#111723",
        sea: "#1c2a3a",
        mint: "#46e3b7",
        sky: "#7dd3fc",
        coral: "#ff8066"
      },
      fontFamily: {
        display: ["Space Grotesk", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"]
      },
      boxShadow: {
        glow: "0 0 30px rgba(70, 227, 183, 0.25)"
      }
    }
  },
  plugins: []
};
