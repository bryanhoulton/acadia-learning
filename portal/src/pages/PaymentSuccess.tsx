import { CheckCircle } from 'lucide-react';

export default function PaymentSuccess() {
  return (
    <div className="min-h-dvh w-full flex items-center justify-center bg-primary-900">
      <div className="max-w-md w-full mx-4 p-8 bg-primary-800 rounded-lg shadow-lg text-center">
        <div className="flex justify-center mb-6">
          <CheckCircle className="w-16 h-16 text-success-500" />
        </div>
        <h1 className="text-2xl font-bold mb-4">Subscription Successful!</h1>
        <p className="text-primary-300 mb-6">
          Thank you for your subscription! You can now continue with your
          lessons.
        </p>
      </div>
    </div>
  );
}
