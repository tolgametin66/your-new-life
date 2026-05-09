import React from 'react';
import { Loader2 } from 'lucide-react';
import { AuthProvider, useAuth } from './AuthContext';
import AuthScreen from './AuthScreen';
import MainApp from './your_new_life_os.jsx';

/* Root application: wraps everything in AuthProvider, then routes between
   the login screen and the main app based on session presence. */

function Router() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 text-neutral-500 flex items-center justify-center">
        <Loader2 className="animate-spin text-rose-500" size={28} />
      </div>
    );
  }

  return user ? <MainApp /> : <AuthScreen />;
}

export default function App() {
  return (
    <AuthProvider>
      <Router />
    </AuthProvider>
  );
}
