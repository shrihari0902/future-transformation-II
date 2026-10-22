import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Wallet, ShieldCheck, UserCheck, ArrowUpRight, Smartphone, Lock,
  Eye, EyeOff, Fingerprint, Radio, ChevronDown, X, CheckCircle2
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [username, setUsername] = useState('customer1');
  const [password, setPassword] = useState('DemoPass123!');
  const [isRegister, setIsRegister] = useState(false);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('DemoPass123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [showPassword, setShowPassword] = useState(false);
  const [showDemoAccounts, setShowDemoAccounts] = useState(false);

  const demoAccounts = [
    { id: 'customer1', title: 'Customer One', role: 'PAYER', description: 'Personal wallet · ₹10,000 demo balance', icon: Wallet },
    { id: 'customer2', title: 'Customer Two', role: 'PAYER', description: 'Second payer for peer-to-peer scenarios', icon: UserCheck },
    { id: 'merchant', title: 'Merchant Terminal', role: 'MERCHANT', description: 'Receive tokens and issue receipts', icon: Smartphone },
    { id: 'analyst', title: 'Bank Analyst', role: 'ANALYST', description: 'Review risk flags and disputed payments', icon: ShieldCheck },
  ];

  // Keep the existing backend authentication flow unchanged.
  const handleQuickLogin = async (account) => {
    setError(null);
    setLoading(true);
    try {
      await login(account, 'DemoPass123!');
      navigate('/wallet');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Login failed');
    } finally {
      setLoading(false);
      setShowDemoAccounts(false);
    }
  };

  // Keep the existing registration endpoint and payload unchanged.
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (isRegister) {
        await api.post('/auth/register', {
          full_name: fullName || username,
          username,
          email: email || `${username}@offlinepay.local`,
          password,
          confirm_password: confirmPassword,
        });
      }
      await login(username, password);
      navigate('/wallet');
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Authentication error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="op-auth-page">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&display=swap');
        .op-auth-page, .op-auth-page * { box-sizing: border-box; }
        .op-auth-page { min-height: 100vh; width: 100%; padding: 24px; display: grid; place-items: center; color: #f4f7ff; background: #090d18; font-family: 'DM Sans', sans-serif; overflow: hidden; position: relative; }
        .op-auth-page:before { content: ''; position: fixed; width: 560px; height: 560px; left: -240px; top: -250px; border-radius: 50%; background: radial-gradient(circle, rgba(30,103,255,.22), transparent 68%); pointer-events: none; }
        .op-auth-page:after { content: ''; position: fixed; width: 600px; height: 600px; right: -280px; bottom: -330px; border-radius: 50%; background: radial-gradient(circle, rgba(0,216,190,.12), transparent 68%); pointer-events: none; }
        .op-auth-shell { width: min(1160px, 100%); min-height: min(720px, calc(100vh - 48px)); display: grid; grid-template-columns: minmax(0, 1.04fr) minmax(400px, .96fr); border: 1px solid rgba(148,163,184,.16); border-radius: 28px; overflow: hidden; background: rgba(14,20,34,.88); box-shadow: 0 32px 100px rgba(0,0,0,.42); position: relative; z-index: 1; }
        .op-auth-visual { position: relative; isolation: isolate; padding: 42px 46px; display: flex; flex-direction: column; justify-content: space-between; overflow: hidden; background: linear-gradient(145deg, #122b59 0%, #101e3a 44%, #0c1426 100%); }
        .op-auth-visual:before { content: ''; position: absolute; z-index: -1; width: 470px; height: 470px; right: -190px; top: 130px; border-radius: 50%; border: 1px solid rgba(116,163,255,.22); box-shadow: 0 0 0 38px rgba(116,163,255,.035), 0 0 0 82px rgba(116,163,255,.025), 0 0 0 130px rgba(116,163,255,.018); }
        .op-auth-visual:after { content: ''; position: absolute; z-index: -1; width: 280px; height: 280px; right: -90px; top: 220px; border-radius: 50%; background: radial-gradient(circle, rgba(26,110,255,.30), transparent 70%); filter: blur(10px); }
        .op-brand { display: inline-flex; align-items: center; gap: 12px; color: #fff; font-family: 'Manrope', sans-serif; font-size: 19px; font-weight: 800; letter-spacing: -.5px; }
        .op-brand-mark { position: relative; width: 42px; height: 42px; display: grid; place-items: center; border-radius: 13px; background: linear-gradient(145deg,#48a0ff,#2463eb); color: white; box-shadow: 0 8px 25px rgba(36,99,235,.35); }
        .op-brand-mark img { width: 26px; height: 26px; object-fit: contain; }
        .op-visual-copy { max-width: 490px; margin: 54px 0 34px; }
        .op-eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border: 1px solid rgba(139,181,255,.23); border-radius: 99px; color: #b7d2ff; background: rgba(61,119,224,.10); text-transform: uppercase; letter-spacing: 1.6px; font-size: 10px; font-weight: 700; }
        .op-live-dot { width: 7px; height: 7px; background: #4ce0b1; border-radius: 50%; box-shadow: 0 0 0 4px rgba(76,224,177,.12); }
        .op-visual-copy h1 { margin: 24px 0 17px; max-width: 470px; color: #fff; font-family: 'Manrope', sans-serif; font-size: clamp(38px, 4.1vw, 56px); line-height: 1.08; font-weight: 800; letter-spacing: -2.7px; }
        .op-visual-copy h1 span { color: #72aaff; }
        .op-visual-copy p { max-width: 390px; color: #aebbd2; font-size: 14px; line-height: 1.8; margin: 0; }
        .op-visual-art { width: 100%; max-width: 430px; margin: 8px 0 34px; }
        .op-payment-card { position: relative; max-width: 350px; margin-left: 20px; padding: 21px; border-radius: 20px; border: 1px solid rgba(173,202,255,.23); background: linear-gradient(135deg, rgba(255,255,255,.12), rgba(255,255,255,.035)); box-shadow: 0 24px 55px rgba(0,0,0,.18); transform: rotate(-3deg); backdrop-filter: blur(12px); }
        .op-payment-card-top { display: flex; align-items: center; justify-content: space-between; color: #c6d7f2; font-size: 11px; }
        .op-chip { width: 30px; height: 23px; border: 1px solid rgba(255,255,255,.38); border-radius: 6px; background: linear-gradient(135deg, rgba(255,255,255,.25), rgba(255,255,255,.04)); }
        .op-payment-amount { margin: 24px 0 4px; font-family: 'Manrope', sans-serif; font-size: 30px; font-weight: 800; letter-spacing: -1px; color: white; }
        .op-payment-sub { color: #9eafd0; font-size: 11px; }
        .op-payment-bottom { display: flex; align-items: center; justify-content: space-between; margin-top: 25px; padding-top: 15px; border-top: 1px solid rgba(255,255,255,.12); color: #dce8ff; font-size: 11px; }
        .op-mini-check { display: inline-flex; align-items: center; gap: 6px; color: #6de4c0; }
        .op-feature-row { display: flex; flex-wrap: wrap; gap: 10px; }
        .op-feature { display: inline-flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; color: #c3d0e6; background: rgba(255,255,255,.045); border: 1px solid rgba(255,255,255,.075); font-size: 11px; }
        .op-feature svg { color: #78adff; }
        .op-visual-foot { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-top: 32px; color: #7386a7; font-size: 10px; letter-spacing: .4px; }
        .op-auth-formside { padding: 46px clamp(28px, 5vw, 66px); display: flex; flex-direction: column; justify-content: center; background: #f8faff; color: #101828; }
        .op-mobile-brand { display: none; }
        .op-form-kicker { margin: 0 0 10px; color: #2d6eea; text-transform: uppercase; letter-spacing: 1.8px; font-size: 10px; font-weight: 800; }
        .op-form-heading { margin: 0; color: #111b2e; font-family: 'Manrope', sans-serif; font-size: 31px; line-height: 1.2; letter-spacing: -1.2px; font-weight: 800; }
        .op-form-intro { margin: 10px 0 27px; color: #738096; font-size: 13px; line-height: 1.7; }
        .op-mode-switch { display: grid; grid-template-columns: 1fr 1fr; gap: 5px; padding: 5px; margin-bottom: 23px; border-radius: 12px; background: #eaf0fa; }
        .op-mode-button { min-height: 40px; border: 0; border-radius: 9px; color: #6c7890; background: transparent; cursor: pointer; font: inherit; font-size: 12px; font-weight: 700; transition: .18s ease; }
        .op-mode-button.active { background: white; color: #1d58c8; box-shadow: 0 2px 8px rgba(30,55,90,.09); }
        .op-demo-toggle { display: flex; align-items: center; justify-content: space-between; width: 100%; gap: 10px; padding: 13px 14px; margin-bottom: 19px; border: 1px solid #dce5f2; border-radius: 12px; color: #24334c; background: #fff; cursor: pointer; text-align: left; transition: .18s ease; }
        .op-demo-toggle:hover { border-color: #9bbcf5; background: #f5f8ff; }
        .op-demo-left { display: flex; align-items: center; gap: 11px; }
        .op-demo-icon { width: 34px; height: 34px; display: grid; place-items: center; border-radius: 10px; background: #eaf2ff; color: #2769dd; }
        .op-demo-title { display: block; font-size: 12px; font-weight: 800; }
        .op-demo-caption { display: block; margin-top: 3px; color: #8490a4; font-size: 10px; }
        .op-demo-list { display: grid; grid-template-columns: 1fr 1fr; gap: 9px; margin: -8px 0 20px; padding: 11px; border: 1px solid #e0e8f4; border-radius: 14px; background: #eef3fb; }
        .op-demo-account { display: flex; align-items: flex-start; gap: 9px; min-width: 0; padding: 12px 10px; border: 1px solid #e0e7f1; border-radius: 11px; color: #1b2b43; background: #fff; cursor: pointer; text-align: left; transition: .18s ease; }
        .op-demo-account:hover:not(:disabled) { border-color: #8fb4f7; transform: translateY(-1px); box-shadow: 0 5px 14px rgba(42,93,173,.08); }
        .op-demo-account:disabled { opacity: .55; cursor: not-allowed; }
        .op-demo-account svg { flex: 0 0 auto; margin-top: 1px; color: #3775dc; }
        .op-demo-account strong { display: block; font-size: 10px; line-height: 1.35; }
        .op-demo-account small { display: block; margin-top: 4px; color: #8591a5; font-size: 9px; line-height: 1.4; }
        .op-error { display: flex; align-items: flex-start; gap: 8px; padding: 11px 12px; margin: 0 0 16px; border: 1px solid #fecaca; border-radius: 10px; background: #fff1f2; color: #b42332; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
        .op-field { margin-bottom: 16px; }
        .op-field label { display: block; margin-bottom: 7px; color: #29374d; font-size: 11px; font-weight: 800; }
        .op-input-wrap { position: relative; }
        .op-input-icon { position: absolute; left: 14px; top: 50%; transform: translateY(-50%); color: #8b98ad; pointer-events: none; }
        .op-input { display: block; width: 100%; height: 47px; padding: 0 42px; outline: none; border: 1px solid #dbe3ef; border-radius: 11px; background: white; color: #152238; font: inherit; font-size: 12px; transition: border-color .18s ease, box-shadow .18s ease; }
        .op-input::placeholder { color: #a5afbf; }
        .op-input:focus { border-color: #4b85ee; box-shadow: 0 0 0 3px rgba(55,117,220,.12); }
        .op-password-toggle { position: absolute; top: 50%; right: 12px; transform: translateY(-50%); display: grid; place-items: center; width: 28px; height: 28px; border: 0; border-radius: 7px; background: transparent; color: #8190a7; cursor: pointer; }
        .op-password-toggle:hover { color: #245fc5; background: #edf3ff; }
        .op-form-meta { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin: -2px 0 19px; color: #7f8ca0; font-size: 10px; }
        .op-secure-note { display: inline-flex; align-items: center; gap: 5px; }
        .op-submit { display: flex; align-items: center; justify-content: center; gap: 9px; width: 100%; min-height: 49px; border: 0; border-radius: 11px; background: linear-gradient(100deg, #2769df, #3989f6); color: white; box-shadow: 0 9px 18px rgba(42,107,221,.20); font: inherit; font-size: 12px; font-weight: 800; cursor: pointer; transition: transform .18s ease, box-shadow .18s ease, opacity .18s ease; }
        .op-submit:hover:not(:disabled) { transform: translateY(-1px); box-shadow: 0 12px 22px rgba(42,107,221,.26); }
        .op-submit:disabled { opacity: .65; cursor: wait; }
        .op-switch-copy { margin: 20px 0 0; color: #7a879a; text-align: center; font-size: 11px; }
        .op-inline-link { padding: 0; border: 0; background: none; color: #2366d8; font: inherit; font-weight: 800; text-decoration: none; cursor: pointer; }
        .op-inline-link:hover { text-decoration: underline; }
        .op-form-foot { display: flex; align-items: center; justify-content: center; gap: 7px; margin-top: 28px; color: #a0aaba; font-size: 9px; }
        .op-form-foot svg { color: #4f9b81; }
        .op-auth-page button:focus-visible { outline: 3px solid rgba(68,133,241,.55); outline-offset: 3px; }
        @media (max-width: 850px) { .op-auth-page { padding: 16px; overflow: auto; } .op-auth-shell { grid-template-columns: 1fr; max-width: 560px; min-height: auto; border-radius: 22px; } .op-auth-visual { display: none; } .op-auth-formside { padding: 34px clamp(22px, 6vw, 48px); } .op-mobile-brand { display: flex; align-items: center; gap: 10px; margin-bottom: 34px; color: #14213a; font-family: 'Manrope', sans-serif; font-weight: 800; font-size: 17px; } .op-mobile-brand .op-brand-mark { width: 36px; height: 36px; border-radius: 11px; } }
        @media (max-width: 430px) { .op-auth-page { padding: 0; background: #f8faff; } .op-auth-shell { width: 100%; min-height: 100vh; border: 0; border-radius: 0; box-shadow: none; } .op-auth-formside { padding: 26px 20px 30px; } .op-form-heading { font-size: 28px; } .op-demo-list { grid-template-columns: 1fr; } .op-form-foot { margin-top: 22px; } }
        @media (prefers-reduced-motion: reduce) { .op-auth-page *, .op-auth-page *:before, .op-auth-page *:after { transition: none !important; animation: none !important; scroll-behavior: auto !important; } }
      `}</style>

      <div className="op-auth-shell">
        <section className="op-auth-visual" aria-label="OfflinePay security information">
          <div className="op-brand">
            <span className="op-brand-mark">
              <img
                src="https://cdn-icons-png.flaticon.com/512/2830/2830284.png"
                alt=""
                onError={(e) => { e.currentTarget.style.display = 'none'; if (e.currentTarget.nextElementSibling) e.currentTarget.nextElementSibling.style.opacity = '1'; }}
              />
              <Wallet size={24} style={{ position: 'absolute', opacity: 0, pointerEvents: 'none' }} />
            </span>
            <span>OfflinePay</span>
          </div>

          <div>
            <div className="op-visual-copy">
              <div className="op-eyebrow"><span className="op-live-dot" /> Offline-first payment infrastructure</div>
              <h1>Money moves.<br /><span>Even offline.</span></h1>
              <p>Reliable digital payments built for the moments your connection isn't. Secure local transactions, signed payment tokens, and risk-aware settlement in one wallet.</p>
            </div>

            <div className="op-visual-art" aria-hidden="true">
              <div className="op-payment-card">
                <div className="op-payment-card-top"><span>OFFLINEPAY · DIGITAL WALLET</span><span className="op-chip" /></div>
                <div className="op-payment-amount">₹ 10,000.00</div>
                <div className="op-payment-sub">Available demo balance</div>
                <div className="op-payment-bottom"><span>LOCAL WALLET</span><span className="op-mini-check"><CheckCircle2 size={13} /> Secure ledger</span></div>
              </div>
            </div>

            <div className="op-feature-row">
              <div className="op-feature"><Fingerprint size={15} /> Device-bound security</div>
              <div className="op-feature"><ShieldCheck size={15} /> Signed transactions</div>
              <div className="op-feature"><Radio size={15} /> Offline-ready</div>
            </div>
          </div>

          <div className="op-visual-foot"><span>BUILT FOR SECURE DIGITAL COMMERCE</span><span>© OfflinePay</span></div>
        </section>

        <section className="op-auth-formside">
          <div className="op-mobile-brand">
            <span className="op-brand-mark"><Wallet size={21} /></span>
            <span>OfflinePay</span>
          </div>

          <p className="op-form-kicker">Your wallet, your control</p>
          <h2 className="op-form-heading">{isRegister ? 'Create your account' : 'Welcome back.'}</h2>
          <p className="op-form-intro">{isRegister ? 'Set up your account to get started with secure offline payments.' : 'Sign in to continue to your secure payment workspace.'}</p>

          <div className="op-mode-switch" role="tablist" aria-label="Authentication mode">
            <button type="button" role="tab" aria-selected={!isRegister} className={`op-mode-button ${!isRegister ? 'active' : ''}`} onClick={() => { setIsRegister(false); setError(null); }}>Sign in</button>
            <button type="button" role="tab" aria-selected={isRegister} className={`op-mode-button ${isRegister ? 'active' : ''}`} onClick={() => { setIsRegister(true); setError(null); }}>Create account</button>
          </div>

          <button type="button" className="op-demo-toggle" onClick={() => setShowDemoAccounts((open) => !open)} aria-expanded={showDemoAccounts}>
            <span className="op-demo-left">
              <span className="op-demo-icon"><UserCheck size={17} /></span>
              <span><span className="op-demo-title">Explore demo accounts</span><span className="op-demo-caption">Test the payer, merchant, or analyst experience</span></span>
            </span>
            {showDemoAccounts ? <X size={17} /> : <ChevronDown size={17} />}
          </button>

          {showDemoAccounts && (
            <div className="op-demo-list">
              {demoAccounts.map((acc) => {
                const AccountIcon = acc.icon;
                return (
                  <button key={acc.id} type="button" className="op-demo-account" disabled={loading} onClick={() => handleQuickLogin(acc.id)}>
                    <AccountIcon size={16} />
                    <span><strong>{acc.title}</strong><small>{acc.description}</small></span>
                  </button>
                );
              })}
            </div>
          )}

          {error && <div className="op-error" role="alert"><ShieldCheck size={16} /> <span>{error}</span></div>}

          <form onSubmit={handleSubmit}>
            {isRegister && (
              <>
                <div className="op-field">
                  <label htmlFor="op-fullname">Full name</label>
                  <div className="op-input-wrap"><UserCheck className="op-input-icon" size={16} /><input id="op-fullname" type="text" className="op-input" value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your full name" autoComplete="name" required /></div>
                </div>
                <div className="op-field">
                  <label htmlFor="op-email">Email address</label>
                  <div className="op-input-wrap"><Smartphone className="op-input-icon" size={16} /><input id="op-email" type="email" className="op-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email" required /></div>
                </div>
              </>
            )}

            <div className="op-field">
              <label htmlFor="op-username">Username</label>
              <div className="op-input-wrap"><UserCheck className="op-input-icon" size={16} /><input id="op-username" type="text" className="op-input" value={username} onChange={(e) => setUsername(e.target.value)} placeholder="Enter your username" autoComplete="username" required /></div>
            </div>

            <div className="op-field">
              <label htmlFor="op-password">Password</label>
              <div className="op-input-wrap">
                <Lock className="op-input-icon" size={16} />
                <input id="op-password" type={showPassword ? 'text' : 'password'} className="op-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Enter your password" autoComplete={isRegister ? 'new-password' : 'current-password'} required />
                <button type="button" className="op-password-toggle" onClick={() => setShowPassword((visible) => !visible)} aria-label={showPassword ? 'Hide password' : 'Show password'}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button>
              </div>
            </div>

            {isRegister && (
              <div className="op-field">
                <label htmlFor="op-confirm-password">Confirm password</label>
                <div className="op-input-wrap"><Lock className="op-input-icon" size={16} /><input id="op-confirm-password" type={showPassword ? 'text' : 'password'} className="op-input" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Re-enter your password" autoComplete="new-password" required /></div>
              </div>
            )}

            {!isRegister && <div className="op-form-meta"><span>Demo password: <strong>DemoPass123!</strong></span><span className="op-secure-note"><ShieldCheck size={13} /> Protected session</span></div>}

            <button type="submit" className="op-submit" disabled={loading}>
              {loading ? 'Authenticating…' : isRegister ? 'Create account & continue' : 'Sign in securely'}
              {!loading && <ArrowUpRight size={17} />}
            </button>
          </form>

          <p className="op-switch-copy">
            {isRegister ? 'Already have an account? ' : 'New to OfflinePay? '}
            <button type="button" className="op-inline-link" onClick={() => { setIsRegister((value) => !value); setError(null); }}>{isRegister ? 'Sign in instead' : 'Create an account'}</button>
          </p>
          <div className="op-form-foot"><ShieldCheck size={13} /> Your authentication is handled securely by OfflinePay.</div>
        </section>
      </div>
    </main>
  );
}
