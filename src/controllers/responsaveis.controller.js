import { query } from "../config/db.js";
import { badRequest } from "../middlewares/validate.js";

/* =========================================================
 * Helpers
 * =======================================================*/

function normalizeDigits(v) {
  return (v || "").replace(/\D/g, "");
}

function isUUID(v) {
  // aceita UUID v1-v5
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    String(v || "")
  );
}

function parseIntStrict(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isInteger(n) ? n : NaN;
}

function normalizeEmail(v) {
  const s = String(v || "").trim().toLowerCase();
  return s || null;
}

function normalizeText(v) {
  const s = String(v ?? "").trim();
  return s || null;
}

function sanitizeResponsavelPayload(d = {}) {
  return {
    nome: normalizeText(d.nome),
    cpf: normalizeDigits(d.cpf) || null,
    telefone: normalizeDigits(d.telefone) || null,
    email: normalizeEmail(d.email),
    logradouro: normalizeText(d.logradouro),
    numero: normalizeText(d.numero),
    bairro: normalizeText(d.bairro),
    complemento: normalizeText(d.complemento),
    cep: normalizeDigits(d.cep) || null,
    observacoes: d.observacoes ?? null,
    uf_id: parseIntStrict(d.uf_id),
    cidade_id: parseIntStrict(d.cidade_id),
  };
}

function validateRequiredForCreate(s) {
  if (!s.nome) throw badRequest("Nome é obrigatório.");
  if (s.uf_id === null || Number.isNaN(s.uf_id))
    throw badRequest("UF é obrigatória e deve ser numérica.");
  if (s.cidade_id === null || Number.isNaN(s.cidade_id))
    throw badRequest("Cidade é obrigatória e deve ser numérica.");

  if (!isUUIDLikeUserIdGuarded) {
    // noop: apenas para manter clareza de leitura no bloco de create/update
  }
}

/**
 * Verifica:
 * 1) uf existe
 * 2) cidade existe
 * 3) cidade pertence à uf
 */
async function validateUfCidade(ufId, cidadeId) {
  const sql = `
    SELECT
      u.id   AS uf_id,
      c.id   AS cidade_id,
      c.uf_id AS cidade_uf_id
    FROM vet.uf u
    JOIN vet.cidade c ON c.id = $2
    WHERE u.id = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [ufId, cidadeId]);

  if (!rows.length) return false;
  return Number(rows[0].cidade_uf_id) === Number(ufId);
}

/**
 * Retorna responsável já com joins de UF e Cidade
 */
async function fetchResponsavelById(id) {
  const sql = `
    SELECT
      r.id, r.nome, r.cpf, r.telefone, r.email,
      r.cep, r.logradouro, r.numero, r.bairro, r.complemento, r.observacoes,
      r.uf_id, u.sigla AS uf_sigla, u.nome AS uf_nome,
      r.cidade_id, c.nome AS cidade_nome,
      r.created_at, r.updated_at, r.created_by, r.updated_by
    FROM vet.responsavel r
    JOIN vet.uf u ON u.id = r.uf_id
    JOIN vet.cidade c ON c.id = r.cidade_id
    WHERE r.id = $1
    LIMIT 1
  `;
  const { rows } = await query(sql, [id]);
  return rows[0] || null;
}

/* =========================================================
 * Debug util (opcional, mas muito útil para seu caso)
 * =======================================================*/

export async function dbFingerprint(_req, res) {
  const sql = `
    SELECT
      current_database() AS db,
      current_user AS usr,
      inet_server_addr()::text AS host,
      inet_server_port() AS port,
      current_schema() AS schema,
      now() AS ts
  `;
  const { rows } = await query(sql);
  return res.json(rows[0]);
}

/* =========================================================
 * Handlers
 * =======================================================*/

export async function listResponsaveis(req, res) {
  const q = String(req.query.q || "").trim();

  const sql = `
    SELECT
      r.id, r.nome, r.cpf, r.telefone, r.email,
      r.cep, r.logradouro, r.numero, r.bairro, r.complemento, r.observacoes,
      r.uf_id, u.sigla AS uf_sigla, u.nome AS uf_nome,
      r.cidade_id, c.nome AS cidade_nome,
      r.created_at, r.updated_at
    FROM vet.responsavel r
    JOIN vet.uf u ON u.id = r.uf_id
    JOIN vet.cidade c ON c.id = r.cidade_id
    WHERE (
      $1::text = ''
      OR r.nome ILIKE '%' || $1 || '%'
      OR r.cpf ILIKE '%' || $1 || '%'
      OR r.email ILIKE '%' || $1 || '%'
    )
    ORDER BY r.created_at DESC
  `;

  const { rows } = await query(sql, [q]);
  return res.json(rows);
}

export async function getResponsavel(req, res) {
  const { id } = req.params;
  if (!isUUID(id)) throw badRequest("ID inválido.");

  const row = await fetchResponsavelById(id);
  if (!row) return res.status(404).json({ error: "Responsável não encontrado." });

  return res.json(row);
}

export async function createResponsavel(req, res) {
  const d = req.body || {};
  const s = sanitizeResponsavelPayload(d);

  console.log("[CREATE /responsaveis] body:", d);
  console.log("[CREATE /responsaveis] sanitized:", s);
  console.log("[CREATE /responsaveis] user:", req.user);

  // usuário autenticado
  if (!req.user?.id || !isUUID(req.user.id)) {
    return res.status(401).json({ error: "Usuário autenticado inválido." });
  }

  // validações obrigatórias
  if (!s.nome) throw badRequest("Nome é obrigatório.");
  if (s.uf_id === null || Number.isNaN(s.uf_id))
    throw badRequest("UF é obrigatória e deve ser numérica.");
  if (s.cidade_id === null || Number.isNaN(s.cidade_id))
    throw badRequest("Cidade é obrigatória e deve ser numérica.");

  // valida relação cidade x uf
  const cidadeOk = await validateUfCidade(s.uf_id, s.cidade_id);
  if (!cidadeOk) throw badRequest("Cidade não pertence à UF informada.");

  await query("BEGIN");
  try {
    const insertSql = `
      INSERT INTO vet.responsavel
        (nome, cpf, telefone, email, logradouro, numero, bairro, complemento, cep, observacoes, uf_id, cidade_id, created_by, updated_by)
      VALUES
        ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      RETURNING id
    `;

    const ins = await query(insertSql, [
      s.nome,
      s.cpf,
      s.telefone,
      s.email,
      s.logradouro,
      s.numero,
      s.bairro,
      s.complemento,
      s.cep,
      s.observacoes,
      s.uf_id,
      s.cidade_id,
      req.user.id,
    ]);

    const createdId = ins.rows[0]?.id;

    const created = await fetchResponsavelById(createdId);

    await query("COMMIT");

    console.log("[CREATE /responsaveis] createdId:", createdId);
    console.log("[CREATE /responsaveis] createdRow:", created);

    return res.status(201).json(created);
  } catch (err) {
    await query("ROLLBACK");
    console.error("[CREATE /responsaveis] error:", err);

    // CPF único
    if (String(err?.code) === "23505") {
      return res.status(409).json({ error: "CPF já cadastrado." });
    }

    // FK/constraint
    if (String(err?.code) === "23503") {
      return res.status(400).json({ error: "UF/Cidade inválidos (FK)." });
    }

    throw err;
  }
}

export async function updateResponsavel(req, res) {
  const { id } = req.params;
  const d = req.body || {};

  if (!isUUID(id)) throw badRequest("ID inválido.");
  if (!req.user?.id || !isUUID(req.user.id)) {
    return res.status(401).json({ error: "Usuário autenticado inválido." });
  }

  console.log("[UPDATE /responsaveis/:id] id:", id);
  console.log("[UPDATE /responsaveis/:id] body:", d);
  console.log("[UPDATE /responsaveis/:id] user:", req.user);

  const old = await fetchResponsavelById(id);
  if (!old) return res.status(404).json({ error: "Responsável não encontrado." });

  const s = sanitizeResponsavelPayload(d);

  // merge com antigo
  const merged = {
    nome: s.nome ?? old.nome,
    cpf: s.cpf !== null ? s.cpf : old.cpf,
    telefone: s.telefone !== null ? s.telefone : old.telefone,
    email: s.email !== null ? s.email : old.email,
    logradouro: s.logradouro !== null ? s.logradouro : old.logradouro,
    numero: s.numero !== null ? s.numero : old.numero,
    bairro: s.bairro !== null ? s.bairro : old.bairro,
    complemento: s.complemento !== null ? s.complemento : old.complemento,
    cep: s.cep !== null ? s.cep : old.cep,
    observacoes: d.observacoes !== undefined ? d.observacoes : old.observacoes,
    uf_id:
      d.uf_id !== undefined
        ? parseIntStrict(d.uf_id)
        : Number(old.uf_id),
    cidade_id:
      d.cidade_id !== undefined
        ? parseIntStrict(d.cidade_id)
        : Number(old.cidade_id),
  };

  if (!merged.nome) throw badRequest("Nome é obrigatório.");
  if (merged.uf_id === null || Number.isNaN(merged.uf_id))
    throw badRequest("UF inválida.");
  if (merged.cidade_id === null || Number.isNaN(merged.cidade_id))
    throw badRequest("Cidade inválida.");

  const cidadeOk = await validateUfCidade(merged.uf_id, merged.cidade_id);
  if (!cidadeOk) throw badRequest("Cidade não pertence à UF informada.");

  await query("BEGIN");
  try {
    const updateSql = `
      UPDATE vet.responsavel
      SET
        nome = $1,
        cpf = $2,
        telefone = $3,
        email = $4,
        logradouro = $5,
        numero = $6,
        bairro = $7,
        complemento = $8,
        cep = $9,
        observacoes = $10,
        uf_id = $11,
        cidade_id = $12,
        updated_by = $13,
        updated_at = now()
      WHERE id = $14
      RETURNING id
    `;

    const upd = await query(updateSql, [
      merged.nome,
      merged.cpf,
      merged.telefone,
      merged.email,
      merged.logradouro,
      merged.numero,
      merged.bairro,
      merged.complemento,
      merged.cep,
      merged.observacoes,
      merged.uf_id,
      merged.cidade_id,
      req.user.id,
      id,
    ]);

    if (!upd.rows.length) {
      await query("ROLLBACK");
      return res.status(404).json({ error: "Responsável não encontrado para atualização." });
    }

    const updated = await fetchResponsavelById(id);

    await query("COMMIT");

    console.log("[UPDATE /responsaveis/:id] updatedRow:", updated);

    return res.json(updated);
  } catch (err) {
    await query("ROLLBACK");
    console.error("[UPDATE /responsaveis/:id] error:", err);

    if (String(err?.code) === "23505") {
      return res.status(409).json({ error: "CPF já cadastrado." });
    }
    if (String(err?.code) === "23503") {
      return res.status(400).json({ error: "UF/Cidade inválidos (FK)." });
    }

    throw err;
  }
}

export async function deleteResponsavel(req, res) {
  const { id } = req.params;

  try {
    const { rowCount } = await query(`DELETE FROM vet.responsavel WHERE id = $1`, [id]);

    if (!rowCount) {
      return res.status(404).json({ error: "Responsável não encontrado." });
    }

    return res.json({ ok: true });
  } catch (e) {
    // FK violation: existe animal apontando pra esse responsável
    if (e?.code === "23503") {
      return res.status(409).json({
        error: "Não foi possível excluir: existe animal vinculado a este responsável."
      });
    }

    // log e erro genérico
    console.error(e);
    return res.status(500).json({ error: "Erro ao excluir responsável." });
  }
}

/* dummy var para evitar warning em alguns linters da função exemplo acima */
const isUUIDLikeUserIdGuarded = true;