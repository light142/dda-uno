/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ['-apple-system', 'BlinkMacSystemFont', '"SF Pro Display"', '"SF Pro Text"', '"Helvetica Neue"', 'Arial', 'sans-serif'],
      },
      colors: {
        apple: {
          bg: '#f5f5f7',
          card: '#ffffff',
          sidebar: 'rgba(22, 22, 23, 0.92)',
          blue: '#0071e3',
          'blue-hover': '#0077ed',
          gray: {
            50: '#fbfbfd',
            100: '#f5f5f7',
            200: '#e8e8ed',
            300: '#d2d2d7',
            400: '#86868b',
            500: '#6e6e73',
            600: '#424245',
            700: '#333336',
            800: '#1d1d1f',
            900: '#0a0a0b',
          },
          green: '#34c759',
          red: '#ff3b30',
          orange: '#ff9500',
          yellow: '#ffcc00',
          purple: '#af52de',
          indigo: '#5856d6',
        },
      },
      borderRadius: {
        'xl': '12px',
        '2xl': '16px',
        '3xl': '20px',
      },
      boxShadow: {
        'apple': '0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.06)',
        'apple-md': '0 4px 12px rgba(0,0,0,0.08)',
        'apple-lg': '0 8px 30px rgba(0,0,0,0.12)',
        'apple-inset': 'inset 0 1px 0 rgba(255,255,255,0.05)',
      },
      backdropBlur: {
        'apple': '20px',
      },
    },
  },
  plugins: [],
}
