
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { LogIn, Lock, Mail, AlertCircle, Loader2 } from 'lucide-react';
import { AdminUser } from '../types';
import { supabaseService } from '../services/supabase';

interface AdminLoginProps {
  onLogin: (user: AdminUser) => void;
}

const AdminLogin: React.FC<AdminLoginProps> = ({ onLogin }) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      // Login Real via Supabase
      const user = await supabaseService.login(email, password);
      onLogin(user);
      navigate('/admin/dashboard');
    } catch (err: any) {
      console.error(err);
      setError('Falha no login. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-black p-4">
      <div className="max-w-md w-full">
        <div className="text-center mb-10">
          <Link to="/" className="inline-block mb-8">
            <img
              src="/logo-dark.png"
              alt="Gigante Pneus"
              className="h-16 w-auto"
            />
          </Link>
          <h2 className="text-gray-500 font-black text-xs uppercase tracking-[0.4em] italic">Administrativo</h2>
        </div>

        <div className="bg-gigante-dark rounded-sm shadow-2xl border border-white/5 overflow-hidden">
          <div className="p-10">
            <form onSubmit={handleSubmit} className="space-y-6">
              {error && (
                <div className="bg-gigante-red/10 text-gigante-red p-4 rounded-sm flex items-center gap-3 text-xs border border-gigante-red/20 animate-shake font-black uppercase">
                  <AlertCircle size={18} />
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block ml-1">Usuário</label>
                <div className="relative">
                  <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                  <input
                    required
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full pl-12 pr-5 py-4 bg-black border border-white/10 rounded-sm text-white focus:border-gigante-red outline-none transition-all"
                    placeholder="email@gmail.com"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest block ml-1">Senha</label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={18} />
                  <input
                    required
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="w-full pl-12 pr-5 py-4 bg-black border border-white/10 rounded-sm text-white focus:border-gigante-red outline-none transition-all"
                    placeholder="••••••"
                  />
                </div>
              </div>

              <button
                disabled={loading}
                className="w-full bg-gigante-red text-white py-5 rounded-sm font-black text-lg hover:bg-white hover:text-black transition-all shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 uppercase italic"
              >
                {loading ? <Loader2 className="animate-spin" /> : <LogIn size={20} />}
                Acessar Painel
              </button>
            </form>
          </div>
          <div className="bg-black/40 p-6 text-center border-t border-white/5">
            <Link to="/" className="text-[10px] font-black text-gray-600 hover:text-gigante-red transition-colors uppercase tracking-widest">
              &larr; Sair para o Site
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default AdminLogin;
