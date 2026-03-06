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
        // EWC Brand Design Tokens
        sidebar:         "#181D23",   // EWC dark navy — nav/sidebar
        card:            "#FFFFFF",
        border:          "#D4E2FF",   // blue-tinted border
        "border-strong": "#A8C4FF",   // stronger blue border
        // Brand Blue — primary
        accent:          "#0058E6",
        "accent-hover":  "#0048BD",
        "accent-light":  "#80B1FF",
        "accent-bg":     "#EBF2FF",
        // Brand Gold — premium accent
        gold:            "#D8A600",
        "gold-light":    "#FFF8D6",
        // Text hierarchy
        ink:             "#181D23",   // primary text
        "ink-secondary": "#3D4451",
        "ink-tertiary":  "#5A6475",
        "ink-muted":     "#96989B",
      },
    },
  },
  plugins: [],
};
export default config;
