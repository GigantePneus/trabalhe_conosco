import React, { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { Lock, Eye, EyeOff, Loader2, CheckCircle2, AlertCircle, ShieldCheck, ArrowRight } from 'lucide-react';

interface ResetPasswordProps {
  onSuccess?: () => void;
}

const ResetPassword: React.FC<ResetPasswordProps> = ({ onSuccess }) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [isRecoveryFlow, setIsRecoveryFlow] = useState(false);
  const [userEmail, setUserEmail] = useState('');
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' | '' }>({ text: '', type: '' });
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    let mounted = true;

    const parseAndEstablishRecovery = async () => {
      try {
        // 1. Verifica se a flag de recuperação foi sinalizada pelo App.tsx
        const hasSessionFlag = sessionStorage.getItem('gigante_recovery_mode') === 'true';

        // 2. Verifica se a URL contém tokens de recuperação (hash ou search)
        const fullUrl = window.location.href;
        const searchParams = new URLSearchParams(window.location.search);
        const hash = window.location.hash || '';
        
        let hashParams = new URLSearchParams();
        if (hash.includes('#')) {
          const parts = hash.split('#');
          for (const p of parts) {
            if (p.includes('=')) {
              const sp = new URLSearchParams(p);
              sp.forEach((v, k) => hashParams.set(k, v));
            }
          }
        }

        const isRecoveryExplicit = 
          searchParams.get('type') === 'recovery' ||
          hashParams.get('type') === 'recovery' ||
          fullUrl.includes('type=recovery') ||
          hasSessionFlag;

        // Se houver access_token e refresh_token no hash, garante que o Supabase registre a sessão
        const accessToken = hashParams.get('access_token');
        const refreshToken = hashParams.get('refresh_token');

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken
          });
          sessionStorage.setItem('gigante_recovery_mode', 'true');
        }

        // Se houver código PKCE (?code=...) na URL de callback
        const code = searchParams.get('code');
        if (code) {
          const { error: codeErr } = await supabase.auth.exchangeCodeForSession(code);
          if (!codeErr) {
            sessionStorage.setItem('gigante_recovery_mode', 'true');
          }
        }

        // 3. Valida a sessão no Supabase Auth
        const { data: { session } } = await supabase.auth.getSession();
        if (!mounted) return;

        // Requisito de Segurança: Apenas autoriza se for fluxo legítimo de recuperação
        if (session && session.user && (isRecoveryExplicit || sessionStorage.getItem('gigante_recovery_mode') === 'true')) {
          setIsRecoveryFlow(true);
          setUserEmail(session.user.email || '');
        } else {
          setIsRecoveryFlow(false);
        }
      } catch (err) {
        if (mounted) setIsRecoveryFlow(false);
      } finally {
        if (mounted) setCheckingSession(false);
      }
    };

    parseAndEstablishRecovery();

    // 4. Listener para o evento nativo PASSWORD_RECOVERY do Supabase
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === 'PASSWORD_RECOVERY') {
        sessionStorage.setItem('gigante_recovery_mode', 'true');
        setIsRecoveryFlow(true);
        setUserEmail(session?.user?.email || '');
        setCheckingSession(false);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const validateStrongPassword = (pass: string): { valid: boolean; message: string } => {
    if (pass.length < 8) {
      return { valid: false, message: 'A nova senha deve ter no mínimo 8 caracteres.' };
    }
    if (!/[A-Z]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos uma letra maiúscula.' };
    }
    if (!/[a-z]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos uma letra minúscula.' };
    }
    if (!/[0-9]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos um número.' };
    }
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(pass)) {
      return { valid: false, message: 'A nova senha deve conter pelo menos um caractere especial (!@#$%...).' };
    }
    return { valid: true, message: '' };
  };

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatusMsg({ text: '', type: '' });

    if (newPassword !== confirmPassword) {
      setStatusMsg({ text: 'A confirmação de senha não confere com a nova senha digitada.', type: 'error' });
      return;
    }

    const validation = validateStrongPassword(newPassword);
    if (!validation.valid) {
      setStatusMsg({ text: validation.message, type: 'error' });
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword
      });

      if (error) {
        throw error;
      }

      // Limpa os marcadores de recuperação
      sessionStorage.removeItem('gigante_recovery_mode');

      setCompleted(true);
      setStatusMsg({
        text: 'Sua senha foi redefinida com sucesso! Você já pode acessar o Painel RH.',
        type: 'success'
      });
      setNewPassword('');
      setConfirmPassword('');

      if (onSuccess) {
        setTimeout(() => onSuccess(), 1500);
      }
    } catch (err: any) {
      setStatusMsg({
        text: err?.message || 'Falha ao redefinir a senha. O link pode ter expirado.',
        type: 'error'
      });
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
        <div className="bg-white dark:bg-gray-900 p-10 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 text-center max-w-md w-full">
          <Loader2 className="h-10 w-10 animate-spin text-red-600 mx-auto mb-4" />
          <h2 className="text-lg font-black uppercase text-gray-900 dark:text-white">Validando link de recuperação...</h2>
          <p className="text-xs text-gray-400 font-bold uppercase mt-2">Aguarde um instante</p>
        </div>
      </div>
    );
  }

  // Segurança estrita: Sem fluxo comprovado de recuperação, bloqueia redefinição
  if (!isRecoveryFlow) {
    return (
      <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
        <div className="bg-white dark:bg-gray-900 p-10 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 text-center max-w-md w-full space-y-6">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-950/30 rounded-2xl flex items-center justify-center mx-auto text-red-600">
            <AlertCircle className="h-8 w-8" />
          </div>
          <div>
            <h2 className="text-2xl font-black uppercase text-gray-900 dark:text-white tracking-tight">Link Expirado ou Inválido</h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 font-medium mt-2 leading-relaxed">
              Não identificamos uma solicitação ativa de recuperação de senha. O link recebido por e-mail pode ter expirado ou já ter sido utilizado.
            </p>
          </div>
          <a
            href="#/login"
            className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-xl text-sm transition-all shadow-lg"
          >
            Voltar ao Login e Solicitar Novo Link
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[calc(100vh-160px)] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full">
        <div className="bg-white dark:bg-gray-900 p-10 rounded-3xl shadow-2xl border border-gray-100 dark:border-gray-800 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-32 h-32 bg-red-600/5 rounded-full -mr-16 -mt-16"></div>

          <div className="text-center mb-8 relative">
            <div className="bg-red-600 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-xl rotate-3">
              <ShieldCheck className="h-10 w-10 text-white" />
            </div>
            <h1 className="text-3xl font-extrabold text-gray-900 dark:text-white uppercase tracking-tighter">Nova Senha</h1>
            <p className="text-gray-500 dark:text-gray-400 font-bold text-xs mt-2 uppercase tracking-widest">
              Defina a nova credencial de acesso
            </p>
            {userEmail && (
              <div className="mt-3 inline-block bg-gray-100 dark:bg-gray-800 px-3 py-1 rounded-full text-xs font-mono font-bold text-gray-700 dark:text-gray-300">
                {userEmail}
              </div>
            )}
          </div>

          {completed ? (
            <div className="space-y-6 text-center animate-in zoom-in-95">
              <div className="w-16 h-16 bg-green-50 dark:bg-green-950/30 rounded-2xl flex items-center justify-center mx-auto text-green-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h3 className="text-lg font-black uppercase text-gray-900 dark:text-white">Senha Redefinida!</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 font-medium">
                  {statusMsg.text}
                </p>
              </div>
              <a
                href="#/admin"
                className="w-full inline-flex items-center justify-center gap-2 bg-red-600 hover:bg-red-700 text-white font-black uppercase py-4 rounded-xl text-sm transition-all shadow-lg"
              >
                Acessar o Painel RH <ArrowRight className="h-4 w-4" />
              </a>
            </div>
          ) : (
            <form onSubmit={handleReset} className="space-y-6">
              {statusMsg.text && (
                <div className={`p-4 rounded-2xl text-xs font-bold ${statusMsg.type === 'error' ? 'bg-red-50 text-red-700 dark:bg-red-950/30 dark:text-red-300 border border-red-200 dark:border-red-900/30' : 'bg-green-50 text-green-700 dark:bg-green-950/30 dark:text-green-300 border border-green-200 dark:border-green-900/30'}`}>
                  {statusMsg.text}
                </div>
              )}

              {/* Nova Senha */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-gray-700 dark:text-gray-400 uppercase italic tracking-widest">
                  Nova Senha *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type={showNewPassword ? 'text' : 'password'}
                    className="w-full pl-12 pr-12 py-4 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none transition-all font-medium text-sm"
                    placeholder="Mínimo 8 caracteres"
                    value={newPassword}
                    onChange={e => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors p-1"
                  >
                    {showNewPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Confirmar Nova Senha */}
              <div className="space-y-2">
                <label className="block text-xs font-black text-gray-700 dark:text-gray-400 uppercase italic tracking-widest">
                  Confirmar Nova Senha *
                </label>
                <div className="relative">
                  <Lock className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
                  <input
                    required
                    type={showConfirmPassword ? 'text' : 'password'}
                    className="w-full pl-12 pr-12 py-4 rounded-xl border border-gray-300 dark:border-gray-700 dark:bg-gray-800 focus:ring-4 focus:ring-red-600/10 focus:border-red-600 outline-none transition-all font-medium text-sm"
                    placeholder="Repita a nova senha"
                    value={confirmPassword}
                    onChange={e => setConfirmPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-red-600 transition-colors p-1"
                  >
                    {showConfirmPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                  </button>
                </div>
              </div>

              {/* Requisitos de Senha Forte */}
              <div className="p-4 bg-gray-50 dark:bg-gray-800/60 rounded-2xl border border-gray-100 dark:border-gray-800 text-[11px] text-gray-500 dark:text-gray-400 space-y-1">
                <div className="font-black uppercase tracking-wider text-gray-700 dark:text-gray-300">Requisitos da senha:</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 font-medium">
                  <span className={newPassword.length >= 8 ? 'text-green-600 font-bold' : ''}>• 8+ caracteres</span>
                  <span className={/[A-Z]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• 1 maiúscula</span>
                  <span className={/[a-z]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• 1 minúscula</span>
                  <span className={/[0-9]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• 1 número</span>
                  <span className={/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(newPassword) ? 'text-green-600 font-bold' : ''}>• 1 símbolo</span>
                </div>
              </div>

              <button
                disabled={loading || !newPassword || !confirmPassword}
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white py-4 rounded-xl font-bold uppercase text-lg shadow-xl hover:shadow-red-600/20 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-6 w-6 animate-spin" /> : 'Salvar Nova Senha'}
              </button>
            </form>
          )}

          <div className="mt-8 pt-6 border-t border-gray-100 dark:border-gray-800 text-center">
            <a
              href="#/login"
              className="text-xs font-bold text-gray-500 hover:text-red-600 uppercase tracking-wider transition-colors"
            >
              Voltar para o Login
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
