import { cn } from "@/lib/utils"

interface LoadingSpinnerProps {
  className?: string
  size?: "sm" | "md" | "lg"
}

const LoadingSpinner = ({ className, size = "md" }: LoadingSpinnerProps) => {
  const sizeClasses = {
    sm: "w-4 h-4",
    md: "w-6 h-6", 
    lg: "w-8 h-8"
  }

  return (
    <div className={cn("flex items-center justify-center", className)}>
      <div
        className={cn(
          "animate-spin rounded-full border-2 border-muted border-t-accent",
          sizeClasses[size]
        )}
      />
    </div>
  )
}

const LoadingText = ({ children = "Cargando..." }: { children?: string }) => (
  <div className="flex items-center justify-center gap-2 py-8">
    <LoadingSpinner size="sm" />
    <span className="text-muted-foreground">{children}</span>
  </div>
)

export { LoadingSpinner, LoadingText }