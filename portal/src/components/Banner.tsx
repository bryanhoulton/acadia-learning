import { cn } from "slate-ui";

import { Logo } from "./Logo";

interface BannerProps extends React.HTMLAttributes<HTMLDivElement> {
  logo?: boolean;
}

export function Banner({ className, logo = true, ...props }: BannerProps) {
  return (
    <div
      className={cn("flex items-center justify-center gap-2", className)}
      {...props}
    >
      {logo && <Logo />}
      <h1 className="text-2xl font-medium">Acadia</h1>
    </div>
  );
}
