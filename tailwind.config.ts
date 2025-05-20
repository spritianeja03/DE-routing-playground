import type { Config } from "tailwindcss";
const { fontFamily } = require("tailwindcss/defaultTheme");

export default {
    darkMode: ["class"],
    content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
  	extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", ...fontFamily.sans],
        mono: ["var(--font-geist-mono)", ...fontFamily.mono],
      },
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
        'input-border': 'hsl(var(--input-border))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			}
  		},
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
      boxShadow: {
        // Neumorphic convex shadows
        'sm': '3px 3px 6px hsl(var(--shadow-dark-color-hsl)), -3px -3px 6px hsl(var(--shadow-light-color-hsl))',
        'DEFAULT': '5px 5px 10px hsl(var(--shadow-dark-color-hsl)), -5px -5px 10px hsl(var(--shadow-light-color-hsl))', // 'shadow' or 'shadow-md'
        'md': '5px 5px 10px hsl(var(--shadow-dark-color-hsl)), -5px -5px 10px hsl(var(--shadow-light-color-hsl))',
        'lg': '8px 8px 15px hsl(var(--shadow-dark-color-hsl)), -8px -8px 15px hsl(var(--shadow-light-color-hsl))',
        'xl': '12px 12px 24px hsl(var(--shadow-dark-color-hsl)), -12px -12px 24px hsl(var(--shadow-light-color-hsl))',
        '2xl': '16px 16px 30px hsl(var(--shadow-dark-color-hsl)), -16px -16px 30px hsl(var(--shadow-light-color-hsl))',
        // Neumorphic concave (inset) shadows
        'inner-sm': 'inset 3px 3px 6px hsl(var(--shadow-dark-color-hsl)), inset -3px -3px 6px hsl(var(--shadow-light-color-hsl))',
        'inner': 'inset 5px 5px 10px hsl(var(--shadow-dark-color-hsl)), inset -5px -5px 10px hsl(var(--shadow-light-color-hsl))',
        'inner-md': 'inset 5px 5px 10px hsl(var(--shadow-dark-color-hsl)), inset -5px -5px 10px hsl(var(--shadow-light-color-hsl))',
        'inner-lg': 'inset 8px 8px 15px hsl(var(--shadow-dark-color-hsl)), inset -8px -8px 15px hsl(var(--shadow-light-color-hsl))',
      },
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
