import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { Pool } from 'pg';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

dotenv.config({ path: '../.env.local' });

const app = express();
app.use(cors());
app.use(express.json());

const JWT_SECRET = process.env.JWT_SECRET || 'secret-gigante-pneus-key-12345';

// Configuração do pool de conexões do PostgreSQL
const pool = new Pool({
  host: 'localhost',
  port: 5432,
  user: 'gigante_admin',
  password: 'admin_password_gigante',
  database: 'gigante_trabalhe_conosco',
});

// Middleware de Autenticação
const authenticateToken = (req: any, res: any, next: any) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Acesso negado. Token não fornecido.' });

  jwt.verify(token, JWT_SECRET, (err: any, user: any) => {
    if (err) return res.status(403).json({ error: 'Token inválido ou expirado.' });
    req.user = user;
    next();
  });
};

// Seed inicial do Administrador Master se não existir
const seedAdminMaster = async () => {
  try {
    const res = await pool.query('SELECT * FROM public.usuarios WHERE email = $1', ['rh@gigantepneus.com.br']);
    if (res.rows.length === 0) {
      const hash = await bcrypt.hash('123456', 10);
      await pool.query(
        'INSERT INTO public.usuarios (nome, email, senha_hash, role) VALUES ($1, $2, $3, $4)',
        ['Admin Master Gigante', 'rh@gigantepneus.com.br', hash, 'admin_master']
      );
      console.log('Seed: Administrador Master criado com sucesso.');
    }
  } catch (err) {
    console.error('Erro no seed admin master:', err);
  }
};
seedAdminMaster();

// --- ROTAS DE AUTENTICAÇÃO ---

app.post('/api/auth/login', async (req: any, res: any) => {
  const { email, password } = req.body;
  try {
    const userRes = await pool.query('SELECT * FROM public.usuarios WHERE email = $1 AND ativo = true', [email]);
    if (userRes.rows.length === 0) {
      return res.status(400).json({ error: 'Usuário não cadastrado ou inativo.' });
    }
    const user = userRes.rows[0];
    const validPass = await bcrypt.compare(password, user.senha_hash);
    if (!validPass) {
      return res.status(400).json({ error: 'Senha incorreta.' });
    }

    // Buscar lojas associadas
    const lojasRes = await pool.query(
      'SELECT l.id, l.nome_loja FROM public.lojas l JOIN public.usuario_lojas ul ON l.id = ul.loja_id WHERE ul.usuario_id = $1',
      [user.id]
    );

    const token = jwt.sign(
      { id: user.id, nome: user.nome, email: user.email, role: user.role, lojas: lojasRes.rows },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    res.json({
      token,
      user: {
        id: user.id,
        nome: user.nome,
        email: user.email,
        role: user.role,
        lojas: lojasRes.rows
      }
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- ROTAS DO PAINEL ADMIN (Protegidas) ---

// Listar Lojas
app.get('/api/lojas', authenticateToken, async (req: any, res: any) => {
  try {
    let query = 'SELECT * FROM public.lojas';
    let params: any[] = [];
    if (req.user.role !== 'admin_master') {
      query = 'SELECT l.* FROM public.lojas l JOIN public.usuario_lojas ul ON l.id = ul.loja_id WHERE ul.usuario_id = $1';
      params = [req.user.id];
    }
    const data = await pool.query(query, params);
    res.json(data.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar Loja (Somente Admin Master)
app.post('/api/lojas', authenticateToken, async (req: any, res: any) => {
  if (req.user.role !== 'admin_master') return res.status(403).json({ error: 'Acesso negado.' });
  const { nome_loja, cidade_id, estado } = req.body;
  try {
    const newLoja = await pool.query(
      'INSERT INTO public.lojas (nome_loja, cidade_id, estado) VALUES ($1, $2, $3) RETURNING *',
      [nome_loja, cidade_id, estado]
    );
    res.json(newLoja.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar Usuário (Franqueado/Recrutador)
app.post('/api/usuarios', authenticateToken, async (req: any, res: any) => {
  const { nome, email, password, role, loja_ids } = req.body;
  try {
    const hash = await bcrypt.hash(password, 10);
    const newUser = await pool.query(
      'INSERT INTO public.usuarios (nome, email, senha_hash, role) VALUES ($1, $2, $3, $4) RETURNING id, nome, email, role',
      [nome, email, hash, role]
    );
    const userId = newUser.rows[0].id;

    if (loja_ids && Array.isArray(loja_ids)) {
      for (const lid of loja_ids) {
        await pool.query('INSERT INTO public.usuario_lojas (usuario_id, loja_id) VALUES ($1, $2)', [userId, lid]);
      }
    }
    res.json(newUser.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Listar Cidades
app.get('/api/cidades', async (req: any, res: any) => {
  try {
    const data = await pool.query('SELECT * FROM public.cidades ORDER BY nome ASC');
    res.json(data.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar Cidade
app.post('/api/cidades', authenticateToken, async (req: any, res: any) => {
  const { nome } = req.body;
  try {
    const newCity = await pool.query('INSERT INTO public.cidades (nome) VALUES ($1) RETURNING *', [nome]);
    res.json(newCity.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Listar Candidatos (Com filtros de permissão)
app.get('/api/candidatos', authenticateToken, async (req: any, res: any) => {
  try {
    let query = 'SELECT * FROM public.candidatos';
    let params: any[] = [];

    if (req.user.role !== 'admin_master') {
      query = `
        SELECT c.* FROM public.candidatos c 
        JOIN public.usuario_lojas ul ON c.loja_id = ul.loja_id 
        WHERE ul.usuario_id = $1
      `;
      params = [req.user.id];
    }
    const data = await pool.query(query, params);
    res.json(data.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Cadastrar Candidato (Fluxo Público)
app.post('/api/public/candidatos', async (req: any, res: any) => {
  const { nome, email, telefone, cidade, vaga_interesse, cargo_id, loja_id, resumo, curriculo_url } = req.body;
  try {
    const newCandidato = await pool.query(
      `INSERT INTO public.candidatos (nome, email, telefone, cidade, vaga_interesse, cargo_id, loja_id, resumo, curriculo_url) 
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nome, email, telefone, cidade, vaga_interesse, cargo_id, loja_id, resumo, curriculo_url]
    );
    res.json(newCandidato.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Listar Cargos (Vagas)
app.get('/api/cargos', async (req: any, res: any) => {
  try {
    const data = await pool.query('SELECT * FROM public.cargos WHERE ativo = true ORDER BY created_at DESC');
    res.json(data.rows);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Criar/Salvar Cargo
app.post('/api/cargos', authenticateToken, async (req: any, res: any) => {
  const { nome, requisitos } = req.body;
  try {
    const newCargo = await pool.query(
      'INSERT INTO public.cargos (nome, requisitos) VALUES ($1, $2) RETURNING *',
      [nome, requisitos]
    );
    res.json(newCargo.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Atualizar Cargo
app.put('/api/cargos/:id', authenticateToken, async (req: any, res: any) => {
  const { id } = req.params;
  const { nome, requisitos } = req.body;
  try {
    const updated = await pool.query(
      'UPDATE public.cargos SET nome = $1, requisitos = $2 WHERE id = $3 RETURNING *',
      [nome, requisitos, id]
    );
    res.json(updated.rows[0]);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Excluir Cargo
app.delete('/api/cargos/:id', authenticateToken, async (req: any, res: any) => {
  const { id } = req.params;
  try {
    await pool.query('DELETE FROM public.cargos WHERE id = $1', [id]);
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// --- PORTA DE EXECUÇÃO ---
const PORT = 3001;
app.listen(PORT, () => {
  console.log(`Servidor API Gigante Pneus rodando na porta ${PORT}`);
});
