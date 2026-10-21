import React, { createContext, useContext, useState, useEffect } from 'react';

const NetworkContext = createContext();

export function NetworkProvider({ children }) {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [isSimulatedOffline, setIsSimulatedOffline] = useState(
    localStorage.getItem('simulated_offline') === 'true'
  );

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const toggleSimulatedOffline = () => {
    const nextVal = !isSimulatedOffline;
    setIsSimulatedOffline(nextVal);
    localStorage.setItem('simulated_offline', nextVal.toString());
  };

  const setSimulated = (val) => {
    setIsSimulatedOffline(val);
    localStorage.setItem('simulated_offline', val.toString());
  };

  // Effective status: only truly online if both real network is connected AND simulated offline is FALSE
  const effectiveOnline = isOnline && !isSimulatedOffline;

  return (
    <NetworkContext.Provider
      value={{
        isOnline: effectiveOnline,
        realOnline: isOnline,
        isSimulatedOffline,
        toggleSimulatedOffline,
        setSimulated,
      }}
    >
      {children}
    </NetworkContext.Provider>
  );
}

export function useNetwork() {
  return useContext(NetworkContext);
}
