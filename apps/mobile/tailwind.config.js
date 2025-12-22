/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./App.{js,jsx,ts,tsx}",
    "./src/**/*.{js,jsx,ts,tsx}",
    "./app/**/*.{js,jsx,ts,tsx}",
    "./components/**/*.{js,jsx,ts,tsx}",
  ],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ================== F&B OPS COLOR PALETTE ==================
        // From .UXUIrules - "Organic Tech" theme

        // Brand & Action Colors
        primary: {
          DEFAULT: "#E07A2F", // Burnt Orange - CTAs, revenue data
          light: "#F59E0B",
          dark: "#C2410C",
        },
        brand: {
          DEFAULT: "#6B8E23", // Olive Green - Branding, stable state
          light: "#84CC16",
          dark: "#4D7C0F",
        },

        // Semantic Status Colors
        success: "#55A630", // Fresh Green - Confirmed, high confidence
        warning: "#FFC857", // Mustard Yellow - Low stock, medium conf
        error: "#E63946", // Tomato Red - Out of stock, low conf, danger

        // Dark Mode Surfaces (Mobile Priority)
        surface: {
          base: "#121212", // Charcoal - Main background
          raised: "#1A1A1A", // Dark Coffee - Cards, list items
          elevated: "#1E293B", // Slate - Elevated elements
          border: "#2A2A2A", // Subtle borders
        },

        // Light Mode Surfaces (Desktop & Landing)
        light: {
          base: "#FAF9F7", // Off-white paper
          raised: "#FFFFFF", // Pure white cards
          border: "#E0DCD5", // Subtle dividers
        },

        // Text Colors - Dark Mode
        dark: {
          primary: "#F5F3EF", // Cream White - Headings
          secondary: "#B8B3A8", // Warm Gray - Subtitles
          muted: "#64748B", // Slate - Labels
        },

        // Text Colors - Light Mode
        light: {
          primary: "#1E1E1E", // Near Black
          secondary: "#6F6B63", // Gray Brown
        },
      },

      // Custom spacing for one-handed operation
      spacing: {
        "safe-bottom": "34px", // iPhone safe area
      },

      // Squircle-style rounded corners
      borderRadius: {
        squircle: "16px",
        card: "12px",
        button: "12px",
      },

      // Smooth animations
      animation: {
        "pulse-soft": "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
        "slide-up": "slideUp 0.3s ease-out",
        "fade-in": "fadeIn 0.2s ease-out",
      },
      keyframes: {
        slideUp: {
          "0%": { transform: "translateY(10px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};
