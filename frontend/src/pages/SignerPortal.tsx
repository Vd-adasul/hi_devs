import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../lib/api.js';
import { FileSignature, FileText, CheckCircle, ShieldCheck, Mail, AlertTriangle, Key } from 'lucide-react';

export default function SignerPortal() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [data, setData] = useState<any>(null);
  const [otp, setOtp] = useState('');
  const [signing, setSigning] = useState(false);
  const [signed, setSigned] = useState(false);

  const loadPortal = async () => {
    try {
      const res = await api.get(`/portal/${token}`);
      if (res.data.type !== 'signature') {
        setError('This portal link is not for e-signature requests.');
      } else {
        setData(res.data);
        if (res.data.signer?.status === 'signed') {
          setSigned(true);
        }
      }
    } catch (err: any) {
      setError(err.response?.data?.error || 'Invalid or expired signature link.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (token) {
      loadPortal();
    }
  }, [token]);

  const handleSign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!otp) return;
    setSigning(true);
    try {
      await api.post(`/portal/${token}/sign`, { otp });
      setSigned(true);
      alert('Document signed successfully!');
    } catch (err: any) {
      alert(`Signing failed: ${err.response?.data?.error || err.message}`);
    } finally {
      setSigning(false);
    }
  };

  if (loading) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-screen w-screen flex items-center justify-center bg-slate-50 p-4">
        <div className="max-w-md w-full bg-white border border-slate-200 shadow-xl rounded-2xl p-6 text-center">
          <AlertTriangle className="text-red-500 mx-auto mb-4" size={48} />
          <h2 className="text-lg font-bold text-slate-800">Link Error</h2>
          <p className="text-sm text-slate-500 mt-2">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans">
      {/* Top Banner */}
      <header className="bg-white border-b border-slate-200 h-16 flex items-center justify-between px-6 shadow-sm">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-emerald-600 flex items-center justify-center text-white font-bold">
            S
          </div>
          <span className="font-semibold text-slate-800 tracking-wide">LawyerOS Secure Signer Portal</span>
        </div>
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <ShieldCheck size={14} className="text-emerald-500" />
          <span>AES-256 Encrypted Session</span>
        </div>
      </header>

      {/* Main Body Grid */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Document Text Viewer */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden flex flex-col h-[70vh]">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <FileText size={16} className="text-slate-500" />
              {data?.contract?.name || 'Contract Document'}
            </h2>
          </div>
          <div className="flex-1 p-6 overflow-y-auto font-serif text-slate-700 leading-relaxed whitespace-pre-wrap select-none">
            {data?.contract?.rawText || 'No contract text available.'}
          </div>
        </div>

        {/* Action Panel */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6 flex flex-col gap-6 h-fit">
          <div>
            <span className="text-[10px] uppercase font-bold tracking-wider text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
              Signer Invitation
            </span>
            <h3 className="text-xl font-bold text-slate-800 mt-3">{data?.signer?.name}</h3>
            <p className="text-xs text-slate-500 flex items-center gap-1 mt-1">
              <Mail size={12} /> {data?.signer?.email}
            </p>
          </div>

          <hr className="border-slate-100" />

          {signed ? (
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-5 text-center flex flex-col gap-2 items-center">
              <CheckCircle size={36} className="text-emerald-600 animate-bounce" />
              <h4 className="font-bold text-emerald-800 text-sm">Signature Completed</h4>
              <p className="text-xs text-emerald-600">You successfully signed this document via LawyerOS Secure OTP. The matter host has been notified.</p>
            </div>
          ) : (
            <form onSubmit={handleSign} className="flex flex-col gap-4">
              <div className="bg-amber-50 border border-amber-100 text-amber-800 p-4 rounded-xl text-xs leading-relaxed">
                <strong>OTP Sign-off required:</strong> A secure 6-digit verification code has been dispatched. Enter it below to bind your cryptographic signature to this contract.
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-500 mb-1.5 block">Enter 6-Digit OTP</label>
                <div className="relative">
                  <Key size={16} className="text-slate-400 absolute left-3 top-3" />
                  <input
                    type="text"
                    maxLength={6}
                    value={otp}
                    onChange={e => setOtp(e.target.value.replace(/\D/g, ''))}
                    className="w-full border border-slate-200 rounded-lg pl-10 pr-3 py-2.5 text-sm font-mono tracking-[0.3em] font-semibold text-center focus:outline-none focus:ring-2 focus:ring-emerald-400"
                    placeholder="000000"
                    required
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={signing || otp.length < 6}
                className="w-full bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 shadow"
              >
                <FileSignature size={16} />
                {signing ? 'Signing Contract...' : 'Sign Document'}
              </button>
            </form>
          )}

          <div className="text-[10px] text-slate-400 text-center leading-relaxed">
            By signing, you agree that this electronic signature is as legally binding as a handwritten signature under applicable statutory law.
          </div>
        </div>
      </main>
    </div>
  );
}
