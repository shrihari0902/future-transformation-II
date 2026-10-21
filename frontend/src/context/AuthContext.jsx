import React, { createContext, useContext, useState, useEffect } from 'react';
import api from '../utils/api';
import { generateDeviceKeypair } from '../utils/crypto';
import {
  saveDeviceKey,
  getDeviceKey,
  cacheBankPublicKey,
  getCachedBankPublicKey
} from '../utils/storage';

const AuthContext = createContext();

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('offlinepay_user');
    return saved ? JSON.parse(saved) : null;
  });
  const [token, setToken] = useState(() => localStorage.getItem('offlinepay_token'));
  const [deviceKey, setDeviceKey] = useState(null);
  const [bankPublicKey, setBankPublicKey] = useState(null);
  const [loading, setLoading] = useState(true);

  // Load device key from IndexedDB and bank public key
  useEffect(() => {
    async function initAuth() {
      try {
        const storedKey = await getDeviceKey();
        if (storedKey) {
          setDeviceKey(storedKey);
        }

        const cachedBankKey = await getCachedBankPublicKey();
        if (cachedBankKey) {
          setBankPublicKey(cachedBankKey);
        }

        // If online, fetch fresh bank public key to keep cache updated
        if (navigator.onLine && localStorage.getItem('simulated_offline') !== 'true') {
          fetchBankPublicKey();
        }
      } catch (err) {
        console.warn('Init auth storage warning:', err);
      } finally {
        setLoading(false);
      }
    }
    initAuth();
  }, []);

  const fetchBankPublicKey = async () => {
    try {
      const resp = await api.get('/certificates/public-key');
      if (resp.data?.spki_b64) {
        setBankPublicKey(resp.data.spki_b64);
        await cacheBankPublicKey(resp.data.spki_b64);
      }
    } catch (err) {
      console.warn('Could not fetch bank public key online:', err);
    }
  };

  const login = async (username, password) => {
    const resp = await api.post('/auth/login', { username, password });
    const { access_token, user: userData } = resp.data;

    localStorage.setItem('offlinepay_token', access_token);
    localStorage.setItem('offlinepay_user', JSON.stringify(userData));

    setToken(access_token);
    setUser(userData);

    // Fetch and cache bank key immediately
    fetchBankPublicKey();

    // Ensure this browser has a registered device key for this user
    await ensureDeviceRegistered(access_token, userData);

    return userData;
  };

  const ensureDeviceRegistered = async (authToken, userData) => {
    let currentKey = await getDeviceKey();
    if (!currentKey || currentKey.userId !== userData.id) {
      // Generate new keypair
      const { keypair, public_key_spki } = await generateDeviceKeypair();
      const deviceId = 'dev_' + crypto.randomUUID().slice(0, 8);

      const deviceRecord = {
        deviceId,
        userId: userData.id,
        username: userData.username,
        publicKeySpki: public_key_spki,
        keypair,
        registeredAt: new Date().toISOString()
      };

      try {
        // Register public key on bank server
        await api.post('/devices/register', {
          device_id: deviceId,
          public_key_spki,
          device_name: `${userData.username}'s Device (${navigator.userAgent.includes('Mobile') ? 'Mobile' : 'Desktop'})`
        }, {
          headers: { Authorization: `Bearer ${authToken}` }
        });

        await saveDeviceKey(deviceRecord);
        setDeviceKey(deviceRecord);
      } catch (err) {
        console.warn('Device auto-registration warning:', err);
        // Even if offline, save locally
        await saveDeviceKey(deviceRecord);
        setDeviceKey(deviceRecord);
      }
    }
  };

  const registerNewDevice = async () => {
    if (!user) return;
    const { keypair, public_key_spki } = await generateDeviceKeypair();
    const deviceId = 'dev_' + crypto.randomUUID().slice(0, 8);

    const deviceRecord = {
      deviceId,
      userId: user.id,
      username: user.username,
      publicKeySpki: public_key_spki,
      keypair,
      registeredAt: new Date().toISOString()
    };

    await api.post('/devices/register', {
      device_id: deviceId,
      public_key_spki,
      device_name: `${user.username}'s Device`
    });

    await saveDeviceKey(deviceRecord);
    setDeviceKey(deviceRecord);
    return deviceRecord;
  };

  const logout = () => {
    localStorage.removeItem('offlinepay_token');
    localStorage.removeItem('offlinepay_user');
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        deviceKey,
        bankPublicKey,
        loading,
        login,
        logout,
        registerNewDevice,
        fetchBankPublicKey
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
