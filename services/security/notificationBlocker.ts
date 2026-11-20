/**
 * Sistema Trabalhe Conosco — Gigante Pneus RH
 * Módulo de Segurança e Bloqueio de Notificações / Automações
 * 
 * Regra Institucional: Candidatos históricos sem e-mail declarado no documento
 * recebem exatamente 'naotem@naotem.com'. Este e-mail NÃO é notificável e qualquer
 * tentativa de envio de mensagem, notificação ou automação deve ser descartada de imediato.
 */

export const BLOCKED_NOTIFICATION_EMAILS = Object.freeze([
  'naotem@naotem.com',
  'nao.tem@naotem.com'
]);

export const BLOCKED_NOTIFICATION_DOMAINS = Object.freeze([
  'naotem.com'
]);

/**
 * Avalia se um endereço de e-mail pode receber mensagens, notificações ou disparos automáticos.
 * 
 * @param email Endereço de e-mail do candidato ou usuário
 * @returns true se o envio for permitido; false se estiver bloqueado ou for inválido.
 */
export function isEmailNotificavel(email?: string | null): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const cleanEmail = email.trim().toLowerCase();

  // Verifica endereço explícito
  if (BLOCKED_NOTIFICATION_EMAILS.includes(cleanEmail)) {
    return false;
  }

  // Verifica domínio bloqueado
  const domain = cleanEmail.split('@')[1];
  if (domain && BLOCKED_NOTIFICATION_DOMAINS.includes(domain)) {
    return false;
  }

  // Validação básica de formato
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(cleanEmail);
}

/**
 * Filtra uma lista de destinatários, removendo qualquer e-mail bloqueado por regra institucional.
 */
export function filterNotificableRecipients(emails: string[]): string[] {
  if (!Array.isArray(emails)) return [];
  return emails.filter(isEmailNotificavel);
}
