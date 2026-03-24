---
globs: src/pages/Bobby*.tsx
---

# Bobby Page Rules

- Every Bobby page wraps in `<KineticShell activeTab="tabname">` with optional `showSidebar`
- Use `<Helmet>` for page title: `PageName | Bobby Agent Trader`
- Data fetching: `useState` + `useEffect` with loading/error states
- Charts: Recharts in `<ResponsiveContainer width="100%" height={N}>`
- Animations: Framer Motion `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>`
- Styling: Stitch design tokens — dark bg, green primary, amber warning, red error
- Glass cards: `bg-white/[0.02] border border-white/[0.04] rounded-xl p-4`
- When adding a new page: also add lazy import + route in App.tsx and tab in KineticShell.tsx
