export default function RecipesLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      {children}
    </div>
  )
}
