/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#F4F4FC",
        panel: "#FFFFFF",
        ink: "#181A2A",
        fade: "#6B7280",
        line: "#E5E7EB",
        ledger: { DEFAULT: "#4F46E5", dark: "#4338CA", light: "#EEF2FF" },
        stamp: { DEFAULT: "#DC2626", light: "#FEF2F2" },
        seal: { DEFAULT: "#D97706", light: "#FFFBEB" },
        approved: { DEFAULT: "#059669", light: "#ECFDF5" },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
