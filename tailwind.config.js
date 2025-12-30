/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
        "./components/**/*.{js,ts,jsx,tsx}", // Added components dir since structure is flat
        "./*.{js,ts,jsx,tsx}" // Added root files like App.tsx
    ],
    theme: {
        extend: {},
    },
    plugins: [],
}
