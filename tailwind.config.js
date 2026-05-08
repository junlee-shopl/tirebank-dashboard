/** @type {import('tailwindcss').Config} */
// Shopl Design Tokens — sourced from
// G:/내 드라이브/.../0_jarvis/design tokens studio JSON
// Mirrors shopl-asset/tailwind.config.ts (Round 1 mapping).
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        bg: "#f6f6f6",
        brand: "#3299fe",
        brandHover: "#2d89e4",
        border: "#eaeaea",
        rowHover: "#f9f9f9",
        activeMenu: "#eaf5ff",
        tableHeader: "#f9f9f9",
        shopl: {
          100: "#eaf5ff",
          150: "#d6e9fb",
          200: "#84c2fc",
          300: "#3299fe",
          400: "#2d89e4",
        },
        coolgray: {
          50: "#f1f4f6",
          100: "#dce3ee",
          200: "#cdd6e4",
          300: "#8092aa",
        },
        navy: { 300: "#406588", 400: "#35485b" },
        neutral: {
          0: "#ffffff",
          100: "#f9f9f9",
          150: "#f4f4f4",
          200: "#eaeaea",
          300: "#dddddd",
          350: "#cccccc",
          400: "#999999",
          500: "#777777",
          600: "#555555",
          700: "#333333",
        },
      },
      fontFamily: {
        sans: [
          "Pretendard",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "Roboto",
          "sans-serif",
        ],
      },
      borderRadius: {
        card: "12px",
        // shopl borderRadius scale (px)
        "shopl-04": "4px",
        "shopl-06": "6px",
        "shopl-08": "8px",
        "shopl-12": "12px",
        "shopl-16": "16px",
        "shopl-20": "20px",
      },
      boxShadow: {
        // single dropShadow token from Token Studio
        dropShadow: "0 8px 16px 0 rgba(0,0,0,0.12)",
        // light elevation for cards/inputs
        elevation1: "0 1px 2px 0 rgba(0,0,0,0.04)",
      },
      fontSize: {
        // Shopl typography tokens (size / line-height)
        heading1: ["28px", { lineHeight: "34px" }],
        heading2: ["24px", { lineHeight: "28px" }],
        heading3: ["20px", { lineHeight: "24px" }],
        title1: ["18px", { lineHeight: "22px" }],
        title2: ["16px", { lineHeight: "20px" }],
        body1: ["14px", { lineHeight: "18px" }],
        body2: ["13px", { lineHeight: "16px" }],
        body3: ["12px", { lineHeight: "16px" }],
        caption: ["12px", { lineHeight: "16px" }],
      },
    },
  },
  plugins: [],
};
