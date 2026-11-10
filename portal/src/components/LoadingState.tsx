import { RefreshCw } from 'lucide-react';
import { cn } from 'slate-ui';

interface LoadingStateProps {
  message?: string;
  className?: string;
}

function LoadingState({
  message = "Loading...",
  className,
}: LoadingStateProps) {
  return (
    <div className={cn("flex items-center justify-center h-full", className)}>
      <div className="text-center">
        <RefreshCw className="w-8 h-8 animate-spin text-primary-600 mx-auto mb-4" />
        <p>{message}</p>
      </div>
    </div>
  );
}

export default LoadingState;
