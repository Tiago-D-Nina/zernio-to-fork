import type { Config } from "tailwindcss";
import tailwindcssAnimate from "tailwindcss-animate";

export default {
  darkMode: ["class"],
  content: [
    "./pages/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./app/**/*.{ts,tsx}",
    "./src/**/*.{ts,tsx}",
  ],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: "2rem",
      screens: {
        "2xl": "1400px",
      },
    },
    extend: {
      fontFamily: {
        sans: ['"Geist Variable"', "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ['"Geist Mono Variable"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        success: {
          DEFAULT: "hsl(var(--success))",
          foreground: "hsl(var(--success-foreground))",
        },
        chart: {
          "1": "hsl(var(--chart-1))",
          "2": "hsl(var(--chart-2))",
          "3": "hsl(var(--chart-3))",
          "4": "hsl(var(--chart-4))",
          "5": "hsl(var(--chart-5))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        // Quarto degrau de texto do DS · use em vez de opacity para de-ênfase
        faint: "hsl(var(--faint))",
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      // Escala de raio do DS (xs 6 · sm 10 · md 14 · lg 20 · xl 28 · 2xl 40).
      // O mapeamento desloca um degrau de propósito: o código já usa
      // `rounded-lg` em botão/input e `rounded-xl` em card, que é exatamente
      // a intenção de md e lg no DS. Trocar 1:1 arredondaria demais os campos.
      borderRadius: {
        sm: "var(--via-radius-xs)",
        md: "var(--via-radius-sm)",
        lg: "var(--via-radius-md)",
        xl: "var(--via-radius-lg)",
        "2xl": "var(--via-radius-xl)",
        "3xl": "var(--via-radius-2xl)",
        full: "var(--via-radius-pill)",
      },
      boxShadow: {
        xs: "var(--via-shadow-xs)",
        sm: "var(--via-shadow-sm)",
        DEFAULT: "var(--via-shadow-sm)",
        md: "var(--via-shadow-md)",
        lg: "var(--via-shadow-lg)",
        xl: "var(--via-shadow-xl)",
        glass: "var(--via-glass-shadow)",
        "glass-lift": "var(--via-glass-shadow-lift)",
      },
      transitionTimingFunction: {
        via: "var(--via-ease)",
        "via-out": "var(--via-ease-out)",
        "via-snap": "var(--via-ease-snap)",
        "via-spring": "var(--via-ease-spring)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.2s ease-out",
        "accordion-up": "accordion-up 0.2s ease-out",
      },
    },
  },
  plugins: [tailwindcssAnimate],
} satisfies Config;