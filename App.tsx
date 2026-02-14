import React, { useState, useEffect, Suspense, lazy } from 'react';
import { auth, db } from './firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import { UserProfile } from './types';
import { ErrorBoundary } from './components/ErrorBoundary';
import Login from './views/Login';
import { Loader2 } from 'lucide-react';

const Dashboard = lazy(() => import('./views/Dashboard.tsx'));

const App: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [dynamicLogo, setDynamicLogo] = useState<string | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);

  useEffect(() => {
    const checkAdmin = () => {
      const isHardcodedAdmin = localStorage.getItem("isAdmin") === "true";
      setIsAdminMode(isHardcodedAdmin);
    };
    checkAdmin();
    window.addEventListener('storage', checkAdmin);

    const logoRef = doc(db, 'settings', 'appConfig');
    const unsubLogo = onSnapshot(logoRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setDynamicLogo(data.logoUrl || null);
      } else {
        setDynamicLogo(null);
      }
    }, (err) => {
      console.warn("Logo fetch failed:", err);
      setDynamicLogo(null);
    });

    let unsubscribeProfile: (() => void) | null = null;

    const unsubscribeAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      if (unsubscribeProfile) {
        unsubscribeProfile();
        unsubscribeProfile = null;
      }

      if (firebaseUser) {
        setUser(firebaseUser);
        const userRef = doc(db, 'users', firebaseUser.uid);
        
        try {
          const docSnap = await getDoc(userRef).catch(() => null);

          if (docSnap && !docSnap.exists()) {
            const displayName = firebaseUser.displayName || firebaseUser.email?.split('@')[0] || 'Guest';
            
            const newProfile: UserProfile = {
              uid: firebaseUser.uid,
              name: displayName,
              email: firebaseUser.email || '',
              photoURL: firebaseUser.photoURL || '',
              friends: [],
              online: true,
              lastSeen: serverTimestamp()
            };
            
            await setDoc(userRef, newProfile).catch(err => {
              console.error("Database sync error:", err);
            });
          }

          unsubscribeProfile = onSnapshot(userRef, {
            next: (snapshot) => {
              if (snapshot.exists()) {
                setUserProfile(snapshot.data() as UserProfile);
                setLoading(false);
              }
            },
            error: (error) => {
              console.error("Sync error:", error);
              setLoading(false);
            }
          });
        } catch (err) {
          console.error("Auth process error:", err);
          setLoading(false);
        }

      } else {
        setUser(null);
        setUserProfile(null);
        setLoading(false);
      }
    });

    return () => {
      unsubLogo();
      unsubscribeAuth();
      window.removeEventListener('storage', checkAdmin);
      if (unsubscribeProfile) unsubscribeProfile();
    };
  }, []);

  const effectiveProfile = userProfile || (isAdminMode ? ({
    uid: 'hardcoded-admin',
    name: 'System Administrator',
    email: 'shivanshsonkar034@gmail.com',
    friends: [],
    photoURL: ''
  } as UserProfile) : null);

  if (loading && !isAdminMode && !user) {
    return (
      <div className="flex flex-col h-screen w-screen items-center justify-center bg-slate-950 text-white">
        <div className="flex items-center justify-center mb-8 animate-pulse">
           {dynamicLogo ? (
             <img src={dynamicLogo} className="h-24 md:h-32 w-auto object-contain" alt="InviteX" />
           ) : (
             <div className="logo-box scale-150">I</div>
           )}
        </div>
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-4" />
        <p className="text-slate-400 font-bold uppercase tracking-[0.3em] text-[10px] animate-pulse">Initializing InviteX Pro</p>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-indigo-500/30">
        {(user || isAdminMode) && effectiveProfile ? (
          <Suspense fallback={
            <div className="flex h-screen w-screen items-center justify-center bg-slate-950">
              <Loader2 className="w-10 h-10 animate-spin text-indigo-500" />
            </div>
          }>
            <Dashboard user={user as User} profile={effectiveProfile} logoUrl={dynamicLogo} />
          </Suspense>
        ) : (
          <Login logoUrl={dynamicLogo} />
        )}
      </div>
    </ErrorBoundary>
  );
};

export default App;