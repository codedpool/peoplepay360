/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx}", "./components/**/*.{js,jsx}", "./lib/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        paper: "#EEEFE7",
        panel: "#F6F6F1",
        ink: "#1B2420",
        fade: "#5B6660",
        line: "#D6D2C4",
        ledger: { DEFAULT: "#2C4570", dark: "#1F3252", light: "#EAEFF6" },
        stamp: { DEFAULT: "#A63D3D", light: "#F5E7E5" },
        seal: { DEFAULT: "#A9782E", light: "#F4EDDD" },
        approved: { DEFAULT: "#3C6B49", light: "#E4EEE6" },
      },
      fontFamily: {
        sans: ["var(--font-plex-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono)", "ui-monospace", "monospace"],
      },
    },
  },
  plugins: [],
};
