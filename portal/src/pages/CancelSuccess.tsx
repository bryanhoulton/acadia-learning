import { XCircle } from 'lucide-react';

export default function CancelSuccess() {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-primary-900">
      <div className="max-w-md w-full mx-4 p-8 bg-primary-800 rounded-lg shadow-lg text-center">
        <div className="flex justify-center mb-6">
          <XCircle className="w-16 h-16 text-error-500" />
        </div>
        <h1 className="text-2xl font-bold mb-4">Subscription Canceled!</h1>
        <p className="text-primary-300 mb-6">
          Your subscription has been canceled.
        </p>
      </div>
    </div>
  );
}
