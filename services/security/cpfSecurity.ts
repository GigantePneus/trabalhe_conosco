import crypto from 'crypto';

/**
 * Validação oficial de CPF de acordo com o algoritmo de módulo 11 da Receita Federal
 */
export function validateCpf(rawCpf?: string | null): { valid: boolean; error?: string; cleanCpf: string } {
  if (!rawCpf) {
    return { valid: false, error: 'CPF é obrigatório.', cleanCpf: '' };
  }

  const clean = rawCpf.replace(/\D/g, '');

  if (clean.length !== 11) {
    return { valid: false, error: 'CPF deve conter exatamente 11 dígitos numéricos.', cleanCpf: clean };
  }

  // Rejeita sequências com todos os dígitos repetidos (ex: 000.000.000-00, 111.111.111-11, etc.)
  if (/^(\d)\1{10}$/.test(clean)) {
    return { valid: false, error: 'CPF inválido (sequência repetida).', cleanCpf: clean };
  }

  // Validação do 1º dígito verificador
  let soma = 0;
  for (let i = 0; i < 9; i++) {
    soma += parseInt(clean.charAt(i), 10) * (10 - i);
  }
  let resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(clean.charAt(9), 10)) {
    return { valid: false, error: 'Dígito verificador do CPF inválido.', cleanCpf: clean };
  }

  // Validação do 2º dígito verificador
  soma = 0;
  for (let i = 0; i < 10; i++) {
    soma += parseInt(clean.charAt(i), 10) * (11 - i);
  }
  resto = (soma * 10) % 11;
  if (resto === 10 || resto === 11) resto = 0;
  if (resto !== parseInt(clean.charAt(10), 10)) {
    return { valid: false, error: 'Dígito verificador do CPF inválido.', cleanCpf: clean };
  }

  return { valid: true, cleanCpf: clean };
}

/**
 * Mascara o CPF para visualização operacional segura conforme a LGPD
 * Formato retornado: ***.***.789-**
 */
export function maskCpf(cleanCpf: string): string {
  if (!cleanCpf || cleanCpf.length !== 11) return '***.***.***-**';
  const trecho = cleanCpf.slice(6, 9);
  return `***.***.${trecho}-**`;
}

/**
 * Gera o hash HMAC-SHA256 do CPF utilizando segredo de alta entropia do servidor
 * Garante unicidade e indexação O(1) sem expor o CPF em texto puro
 */
export function generateCpfHash(cleanCpf: string, secretOverride?: string): string {
  const secret = secretOverride || process.env.CPF_HMAC_SECRET;
  if (!secret) {
    throw new Error('CONFIG_ERROR: CPF_HMAC_SECRET não está configurado nas variáveis de ambiente do servidor.');
  }
  return crypto.createHmac('sha256', secret).update(cleanCpf).digest('hex');
}

/**
 * Criptografa o CPF com AES-256-GCM (criptografia simétrica autenticada)
 * Retorna no formato: iv_hex:auth_tag_hex:ciphertext_hex
 */
export function encryptCpf(cleanCpf: string, keyHexOverride?: string): string {
  const keyHex = keyHexOverride || process.env.CPF_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('CONFIG_ERROR: CPF_ENCRYPTION_KEY inválida (deve ser 32 bytes em hexadecimal).');
  }
  const key = Buffer.from(keyHex, 'hex');
  const iv = crypto.randomBytes(12); // 96 bits recomendado para AES-GCM
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  
  let encrypted = cipher.update(cleanCpf, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag().toString('hex');

  return `${iv.toString('hex')}:${authTag}:${encrypted}`;
}

/**
 * Decriptografa o CPF criptografado com verificação de integridade
 */
export function decryptCpf(encryptedData: string, keyHexOverride?: string): string {
  const keyHex = keyHexOverride || process.env.CPF_ENCRYPTION_KEY;
  if (!keyHex || keyHex.length !== 64) {
    throw new Error('CONFIG_ERROR: CPF_ENCRYPTION_KEY inválida.');
  }
  const parts = encryptedData.split(':');
  if (parts.length !== 3) {
    throw new Error('DADO_CORROMPIDO: Formato do CPF criptografado inválido.');
  }
  const [ivHex, authTagHex, cipherHex] = parts;
  const key = Buffer.from(keyHex, 'hex');
  const iv = Buffer.from(ivHex, 'hex');
  const authTag = Buffer.from(authTagHex, 'hex');
  
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(authTag);
  
  let decrypted = decipher.update(cipherHex, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

