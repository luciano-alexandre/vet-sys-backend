import { query } from "../config/db.js";
import { comparePassword } from "../utils/password.js";
import { signToken } from "../utils/jwt.js";
import { badRequest } from "../middlewares/validate.js";

export async function login(req, res) {
  const { email, senha } = req.body || {};
  if (!email || !senha) throw badRequest("Email e senha são obrigatórios.");

  const sql = `
    SELECT id, nome, email, senha_hash, perfil, ativo, crmv
    FROM vet.usuario
    WHERE email = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [email.toLowerCase().trim()]);
  if (!rows.length) throw badRequest("Credenciais inválidas.");

  const user = rows[0];
  if (!user.ativo) throw badRequest("Usuário inativo.");

  const ok = await comparePassword(senha, user.senha_hash);
  if (!ok) throw badRequest("Credenciais inválidas.");

  const token = signToken({
    id: user.id,
    nome: user.nome,
    perfil: user.perfil
  });

  return res.json({
    token,
    usuario: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      perfil: user.perfil,
      crmv: user.crmv
    }
  });
}

export async function me(req, res) {
  const { rows } = await query(
    `SELECT id, nome, email, perfil, ativo, crmv, telefone,
            assinatura, assinatura_nome, assinatura_mime,
            created_at, updated_at
     FROM vet.usuario WHERE id = $1`,
    [req.user.id]
  );
  if (!rows.length) return res.status(404).json({ error: "Usuário não encontrado." });
  const user = rows[0];
  const assinaturaBase64 = user.assinatura ? user.assinatura.toString("base64") : null;
  const { assinatura, ...safeUser } = user;

  return res.json({
    ...safeUser,
    tem_assinatura: Boolean(assinaturaBase64),
    assinatura_base64: assinaturaBase64
  });
}
