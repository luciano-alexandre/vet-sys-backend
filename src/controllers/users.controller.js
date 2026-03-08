import { query } from "../config/db.js";
import { hashPassword } from "../utils/password.js";
import { badRequest } from "../middlewares/validate.js";

const ASSINATURA_MAX_BYTES = 2 * 1024 * 1024; // 2MB
const ASSINATURA_MIME_PERMITIDOS = new Set([
  "image/png",
  "image/jpeg",
  "image/webp"
]);

function parseAssinaturaBase64(input) {
  const raw = String(input ?? "").trim();
  if (!raw) return null;

  const commaIdx = raw.indexOf(",");
  const base64Part = commaIdx >= 0 ? raw.slice(commaIdx + 1) : raw;
  const normalized = base64Part.replace(/\s+/g, "");
  if (!normalized) return null;

  try {
    return Buffer.from(normalized, "base64");
  } catch {
    throw badRequest("Assinatura inválida.");
  }
}

/** ADMIN */
export async function listUsers(req, res) {
  const { rows } = await query(
    `SELECT id, nome, email, perfil, ativo, crmv, telefone, created_at, updated_at
     FROM vet.usuario
     ORDER BY created_at DESC`
  );
  return res.json(rows);
}

export async function getUser(req, res) {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT id, nome, email, perfil, ativo, crmv, telefone, created_at, updated_at
     FROM vet.usuario WHERE id = $1`,
    [id]
  );
  if (!rows.length) return res.status(404).json({ error: "Usuário não encontrado." });
  return res.json(rows[0]);
}

export async function createUser(req, res) {
  const { nome, email, senha, perfil, ativo = true, crmv = null, telefone = null } = req.body || {};

  if (!nome?.trim()) throw badRequest("Nome é obrigatório.");
  if (!email?.trim()) throw badRequest("Email é obrigatório.");
  if (!senha?.trim() || senha.length < 6) throw badRequest("Senha deve ter pelo menos 6 caracteres.");
  if (!["ADMIN", "VETERINARIO"].includes(perfil)) throw badRequest("Perfil inválido.");
  if (perfil === "VETERINARIO" && !crmv?.trim()) throw badRequest("CRMV é obrigatório para veterinário.");

  const passHash = await hashPassword(senha);

  const sql = `
    INSERT INTO vet.usuario
      (nome, email, senha_hash, perfil, ativo, crmv, telefone, created_by, updated_by)
    VALUES
      ($1, $2, $3, $4, $5, $6, $7, $8, $8)
    RETURNING id, nome, email, perfil, ativo, crmv, telefone, created_at, updated_at
  `;

  const { rows } = await query(sql, [
    nome.trim(),
    email.trim().toLowerCase(),
    passHash,
    perfil,
    Boolean(ativo),
    crmv?.trim() || null,
    telefone?.trim() || null,
    req.user.id
  ]);

  return res.status(201).json(rows[0]);
}

export async function updateUser(req, res) {
  const { id } = req.params;
  const { nome, email, perfil, ativo, crmv, telefone } = req.body || {};

  const { rows: currentRows } = await query(`SELECT * FROM vet.usuario WHERE id = $1`, [id]);
  if (!currentRows.length) return res.status(404).json({ error: "Usuário não encontrado." });
  const current = currentRows[0];

  const newPerfil = perfil ?? current.perfil;
  const newCrmv = crmv ?? current.crmv;

  if (newPerfil === "VETERINARIO" && !String(newCrmv || "").trim()) {
    throw badRequest("CRMV é obrigatório para veterinário.");
  }

  const sql = `
    UPDATE vet.usuario
    SET nome = $1,
        email = $2,
        perfil = $3,
        ativo = $4,
        crmv = $5,
        telefone = $6,
        updated_by = $7
    WHERE id = $8
    RETURNING id, nome, email, perfil, ativo, crmv, telefone, created_at, updated_at
  `;
  const { rows } = await query(sql, [
    (nome ?? current.nome).trim(),
    (email ?? current.email).trim().toLowerCase(),
    newPerfil,
    ativo ?? current.ativo,
    String(newCrmv || "").trim() || null,
    (telefone ?? current.telefone)?.trim() || null,
    req.user.id,
    id
  ]);

  return res.json(rows[0]);
}

export async function updateUserPassword(req, res) {
  const { id } = req.params;
  const { senha } = req.body || {};
  if (!senha?.trim() || senha.length < 6) throw badRequest("Senha deve ter no mínimo 6 caracteres.");

  const hash = await hashPassword(senha);
  const { rowCount } = await query(
    `UPDATE vet.usuario
     SET senha_hash = $1, updated_by = $2
     WHERE id = $3`,
    [hash, req.user.id, id]
  );

  if (!rowCount) return res.status(404).json({ error: "Usuário não encontrado." });
  return res.json({ ok: true });
}

export async function deleteUser(req, res) {
  const { id } = req.params;
  if (id === req.user.id) throw badRequest("Você não pode excluir seu próprio usuário.");

  const { rowCount } = await query(`DELETE FROM vet.usuario WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Usuário não encontrado." });

  return res.json({ ok: true });
}

/** ✅ NOVO: VETERINARIO (ou qualquer autenticado) atualiza o PRÓPRIO perfil */
export async function updateMe(req, res) {
  const id = req.user.id;
  const {
    nome,
    email,
    crmv,
    telefone,
    assinatura_base64,
    assinatura_nome,
    assinatura_mime,
    remover_assinatura
  } = req.body || {};

  const { rows: currentRows } = await query(
    `SELECT id, nome, email, perfil, ativo, crmv, telefone,
            assinatura, assinatura_nome, assinatura_mime,
            created_at, updated_at
     FROM vet.usuario WHERE id = $1`,
    [id]
  );
  if (!currentRows.length) return res.status(404).json({ error: "Usuário não encontrado." });
  const current = currentRows[0];

  // ⚠️ Veterinário NÃO pode mudar perfil/ativo por aqui
  // Só permite atualizar nome/email/telefone e (se for veterinário) crmv
  const nextNome = (nome ?? current.nome).trim();
  const nextEmail = (email ?? current.email).trim().toLowerCase();
  const nextTelefone = telefone === undefined ? current.telefone : (telefone?.trim() || null);

  let nextCrmv = current.crmv;
  if (current.perfil === "VETERINARIO") {
    nextCrmv = crmv === undefined ? current.crmv : (String(crmv || "").trim() || null);
    if (!String(nextCrmv || "").trim()) {
      throw badRequest("CRMV é obrigatório para veterinário.");
    }
  }

  let nextAssinatura = current.assinatura;
  let nextAssinaturaNome = current.assinatura_nome;
  let nextAssinaturaMime = current.assinatura_mime;

  if (remover_assinatura === true) {
    nextAssinatura = null;
    nextAssinaturaNome = null;
    nextAssinaturaMime = null;
  } else if (assinatura_base64 !== undefined) {
    const buffer = parseAssinaturaBase64(assinatura_base64);
    if (!buffer || !buffer.length) throw badRequest("Assinatura inválida.");
    if (buffer.length > ASSINATURA_MAX_BYTES) {
      throw badRequest("A assinatura deve ter no máximo 2MB.");
    }

    const mime = String(assinatura_mime || "").trim().toLowerCase();
    if (!ASSINATURA_MIME_PERMITIDOS.has(mime)) {
      throw badRequest("Formato de assinatura inválido. Use PNG, JPG/JPEG ou WEBP.");
    }

    nextAssinatura = buffer;
    nextAssinaturaNome = String(assinatura_nome || "assinatura").trim().slice(0, 255) || "assinatura";
    nextAssinaturaMime = mime;
  }

  const { rows } = await query(
    `UPDATE vet.usuario
     SET nome = $1,
         email = $2,
         telefone = $3,
         crmv = $4,
         assinatura = $5,
         assinatura_nome = $6,
         assinatura_mime = $7,
         updated_by = $8
     WHERE id = $9
     RETURNING id, nome, email, perfil, ativo, crmv, telefone,
               assinatura_nome, assinatura_mime,
               (assinatura IS NOT NULL) AS tem_assinatura,
               created_at, updated_at`,
    [
      nextNome,
      nextEmail,
      nextTelefone,
      nextCrmv,
      nextAssinatura,
      nextAssinaturaNome,
      nextAssinaturaMime,
      id,
      id
    ]
  );

  return res.json(rows[0]);
}

/** ✅ NOVO: VETERINARIO (ou qualquer autenticado) atualiza a PRÓPRIA senha */
export async function updateMyPassword(req, res) {
  const id = req.user.id;
  const { senha } = req.body || {};
  if (!senha?.trim() || senha.length < 6) throw badRequest("Senha deve ter no mínimo 6 caracteres.");

  const hash = await hashPassword(senha);

  await query(
    `UPDATE vet.usuario
     SET senha_hash = $1, updated_by = $2
     WHERE id = $2`,
    [hash, id]
  );

  // pode ser 204 ou {ok:true}. Vou manter padrão mais “API”:
  return res.status(204).send();
}
