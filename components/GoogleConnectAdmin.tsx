import React, { useState } from 'react';
import { ShieldCheck, Cloud, AlertCircle, ArrowRight, Loader2, Lock } from 'lucide-react';

const GoogleConnectAdmin: React.FC = () => {
  const [tokenInput, setTokenInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [authenticated, setAuthenticated] = useState(false);

  // Não exibe em produção
  if (import.meta.env.PROD) {
    return (
      <div className="max-w-md mx-auto my-16 p-8 text-center bg-white dark:bg-gray-900 rounded-3xl shadow-xl">
        <AlertCircle className="w-12 h-12 text-red-600 mx-auto mb-4" />
        <h2 className="text-xl font-bold text-gray-800 dark:text-white">Acesso Indisponível</h2>
        <p className="text-sm text-gray-500 mt-2">Esta interface é restrita ao ambiente de desenvolvimento local.</p>
      </div>
    );
  }

  const handleAuthenticate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/integracoes/google/autorizar', {
        method: 'GET',
        headers: {
          'x-admin-token': tokenInput.trim(),
          'Accept': 'application/json'
        }
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.mensagem || 'Falha na autenticação administrativa.');
      }

      setAuthenticated(true);
      // Limpa o token do estado da memória do componente imediatamente após a emissão do cookie HttpOnly
      setTokenInput('');
    } catch (err: any) {
      setError(err.message || 'Erro ao autenticar.');
    } finally {
      setLoading(false);
    }
  };

  const handleConnectGoogleDrive = () => {
    setLoading(true);
    setError(null);
    // Redireciona o navegador diretamente. O cookie HttpOnly enviado automaticamente valida a sessão
    window.location.href = '/api/integracoes/google/autorizar';
  };

  return (
    <div className="max-w-lg mx-auto my-16 px-4">
      <div className="bg-white dark:bg-gray-900 rounded-3xl p-8 border border-gray-100 dark:border-gray-800 shadow-2xl relative overflow-hidden">
        <div className="w-16 h-16 bg-red-100 dark:bg-red-900/30 rounded-2xl flex items-center justify-center mb-6">
          <Cloud className="w-8 h-8 text-red-600" />
        </div>

        <h1 className="text-2xl font-black text-gray-900 dark:text-white uppercase tracking-tight mb-2">
          Integração Google Drive
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400 font-bold uppercase tracking-wider mb-8">
          Autorização OAuth 2.0 • Gigante Pneus RH
        </p>

        {error && (
          <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border-l-4 border-red-600 rounded-r-xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-red-700 dark:text-red-300 uppercase">{error}</p>
          </div>
        )}

        {!authenticated ? (
          <form onSubmit={handleAuthenticate} className="space-y-6">
            <div className="space-y-2">
              <label className="block text-[10px] font-black text-gray-400 dark:text-gray-500 uppercase tracking-widest">
                Token Administrativo de Setup (Local)
              </label>
              <div className="relative">
                <Lock className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="password"
                  required
                  placeholder="Cole o GOOGLE_ADMIN_SETUP_TOKEN do .env.local"
                  value={tokenInput}
                  onChange={e => setTokenInput(e.target.value)}
                  className="w-full pl-12 pr-4 py-4 rounded-2xl border border-gray-200 dark:border-gray-800 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 transition-all outline-none font-mono text-sm text-gray-800 dark:text-white"
                />
              </div>
              <p className="text-[11px] text-gray-500 dark:text-gray-400 leading-relaxed">
                Este token valida a criação de uma sessão administrativa protegida por cookie <span className="font-mono font-bold">HttpOnly</span>.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || !tokenInput.trim()}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-2xl font-bold uppercase tracking-wider shadow-lg hover:shadow-red-600/25 transition-all flex items-center justify-center gap-2 disabled:opacity-50 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <>
                  Validar Sessão Administrativa <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </form>
        ) : (
          <div className="space-y-6 animate-in fade-in zoom-in duration-300">
            <div className="p-4 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800/40 rounded-2xl flex items-center gap-3">
              <ShieldCheck className="w-6 h-6 text-green-600 shrink-0" />
              <div>
                <p className="text-xs font-black uppercase text-green-800 dark:text-green-300">
                  Sessão Administrativa Ativa
                </p>
                <p className="text-[11px] text-green-700 dark:text-green-400">
                  Cookie de segurança HttpOnly emitido com sucesso.
                </p>
              </div>
            </div>

            <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-2xl border border-gray-200 dark:border-gray-700/60 text-xs text-gray-600 dark:text-gray-300 space-y-2">
              <p>
                <span className="font-bold text-gray-900 dark:text-white">Conta autorizadora:</span>{' '}
                <span className="font-mono text-red-600 dark:text-red-400 font-bold">mktgigantepneus@gmail.com</span>
              </p>
              <p>
                <span className="font-bold text-gray-900 dark:text-white">Escopo:</span>{' '}
                <span className="font-mono">https://www.googleapis.com/auth/drive.file</span>
              </p>
              <p>
                <span className="font-bold text-gray-900 dark:text-white">Callback:</span>{' '}
                <span className="font-mono text-[10px]">http://localhost:3000/api/integracoes/google/callback</span>
              </p>
            </div>

            <button
              onClick={handleConnectGoogleDrive}
              disabled={loading}
              className="w-full bg-red-600 hover:bg-red-700 text-white py-5 rounded-2xl font-black uppercase tracking-wider text-sm shadow-xl hover:shadow-red-600/30 transition-all flex items-center justify-center gap-3 active:scale-[0.98]"
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : (
                <>
                  <Cloud className="w-5 h-5" />
                  Conectar Google Drive
                </>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default GoogleConnectAdmin;

