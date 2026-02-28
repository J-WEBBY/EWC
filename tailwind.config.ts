import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
        // EWC Design Tokens — Light Theme
        sidebar:    "#080517",   // sidebar background (dark)
        card:       "#FFFFFF",   // card backgrounds
        border:     "#EBE5FF",   // subtle violet-tinted border
        "border-strong": "#D5CCFF",
        accent:     "#8A6CFF",   // Pulse Violet — primary
        "accent-light":  "#A98DFF",
        "accent-dark":   "#6B4FE0",
        "accent-bg":     "#F0ECFF",
        "scale-cyan":    "#4B7BFF",
        ink:        "#1A1035",   // primary text
        "ink-secondary": "#6B6490",
        "ink-muted":     "#9E99B5",
      },
    },
  },
  plugins: [],
};
export default config;
