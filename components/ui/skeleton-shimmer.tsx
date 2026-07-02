import { cn } from "@/lib/utils";

interface SkeletonShimmerProps {
  className?: string;
  children?: React.ReactNode;
}

export function SkeletonShimmer({ className, children }: SkeletonShimmerProps) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-md bg-muted/60",
        "after:absolute after:inset-0 after:translate-x-[-100%]",
        "after:bg-gradient-to-r after:from-transparent after:via-(--shimmer-color)/20 after:to-transparent",
        "after:animate-[shimmer_1.6s_ease-in-out_infinite]",
        className,
      )}
    >
      {children && children}
    </div>
  );
}
