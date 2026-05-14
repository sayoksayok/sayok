import { Suspense } from 'react';
import AuthCallbackClient from './AuthCallbackClient';

// Server Component page - wraps client component in Suspense
export default function AuthCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-orange-50 to-pink-50 px-4">
          <p className="text-gray-600">Completing sign-in…</p>
        </div>
      }
    >
      <AuthCallbackClient />
    </Suspense>
  );
}
