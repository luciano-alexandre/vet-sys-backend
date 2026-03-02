import { query } from "../config/db.js";
import { badRequest } from "../middlewares/validate.js";

function normalizeTempoPrenhez(v) {
  if (v === undefined || v === null || v === "") return null;
  const n = Number(v);
  if (Number.isNaN(n)) return NaN;
  if (n < 0 || n > 11) return NaN; // aceita 0..11 (o CHECK do banco permite >=0 e <=11)
  return n;
}

function normalizeRg(v) {
  if (v === undefined) return undefined; // não enviado -> não altera
  if (v === null) return null; // null explícito -> limpa
  const rg = String(v).trim();
  if (!rg) throw badRequest("rg não pode ser vazio.");
  return rg;
}

function mustBePrenheForTempo(status, tempo) {
  if (tempo == null) return;
  if (status !== "PRENHE") {
    throw badRequest("tempo_prenhez_meses só pode ser informado quando status_reprodutivo = PRENHE.");
  }
}

export async function listAnimais(req, res) {
  const { responsavel_id, q } = req.query;
  const sql = `
    SELECT
      a.*,
      r.nome AS responsavel_nome,
      r.telefone AS responsavel_telefone
    FROM vet.animal a
    JOIN vet.responsavel r ON r.id = a.responsavel_id
    WHERE ($1::uuid IS NULL OR a.responsavel_id = $1)
      AND (
        $2::text IS NULL
        OR a.nome ILIKE '%' || $2 || '%'
        OR a.especie ILIKE '%' || $2 || '%'
        OR a.raca ILIKE '%' || $2 || '%'
        OR a.rg ILIKE '%' || $2 || '%'
      )
    ORDER BY a.created_at DESC
  `;
  const { rows } = await query(sql, [responsavel_id || null, q || null]);
  return res.json(rows);
}

export async function getAnimal(req, res) {
  const { id } = req.params;
  const { rows } = await query(
    `
    SELECT
      a.*,
      r.nome AS responsavel_nome,
      r.telefone AS responsavel_telefone
    FROM vet.animal a
    JOIN vet.responsavel r ON r.id = a.responsavel_id
    WHERE a.id = $1
    `,
    [id]
  );

  if (!rows.length) return res.status(404).json({ error: "Animal não encontrado." });
  return res.json(rows[0]);
}

export async function createAnimal(req, res) {
  const d = req.body || {};

  if (!d.responsavel_id) throw badRequest("responsavel_id é obrigatório.");
  if (!d.nome?.trim()) throw badRequest("Nome do animal é obrigatório.");
  if (!d.especie?.trim()) throw badRequest("Espécie é obrigatória.");

  const statusReprodutivo = d.status_reprodutivo || "NAO_INFORMADO";
  const tempoPrenhez = normalizeTempoPrenhez(d.tempo_prenhez_meses);
  if (Number.isNaN(tempoPrenhez)) {
    throw badRequest("tempo_prenhez_meses deve ser um número entre 0 e 11.");
  }
  mustBePrenheForTempo(statusReprodutivo, tempoPrenhez);

  const rg = normalizeRg(d.rg);

  const sql = `
    INSERT INTO vet.animal
      (
        responsavel_id, nome, especie, raca, rg, sexo, idade_texto,
        status_reprodutivo, tempo_prenhez_meses, valor_estimado, identificacao_brinco,
        microchip, pelagem, peso_base_kg, created_by, updated_by
      )
    VALUES
      (
        $1,$2,$3,$4,$5,$6,$7,
        $8,$9,$10,$11,
        $12,$13,$14,$15,$15
      )
    RETURNING *
  `;

  const { rows } = await query(sql, [
    d.responsavel_id,
    d.nome.trim(),
    d.especie.trim(),
    d.raca || null,
    rg === undefined ? null : rg, // create: se não veio, grava null
    d.sexo || "NAO_INFORMADO",
    d.idade_texto || null,
    statusReprodutivo,
    tempoPrenhez,
    d.valor_estimado === "" || d.valor_estimado === undefined ? null : Number(d.valor_estimado),
    d.identificacao_brinco || null,
    d.microchip || null,
    d.pelagem || null,
    d.peso_base_kg === "" || d.peso_base_kg === undefined ? null : Number(d.peso_base_kg),
    req.user.id
  ]);

  return res.status(201).json(rows[0]);
}

export async function updateAnimal(req, res) {
  const { id } = req.params;
  const d = req.body || {};

  const { rows: oldRows } = await query(`SELECT * FROM vet.animal WHERE id = $1`, [id]);
  if (!oldRows.length) return res.status(404).json({ error: "Animal não encontrado." });
  const old = oldRows[0];

  const nextStatus = d.status_reprodutivo ?? old.status_reprodutivo;
  const nextTempoRaw =
    d.tempo_prenhez_meses !== undefined ? d.tempo_prenhez_meses : old.tempo_prenhez_meses;
  const nextTempo = normalizeTempoPrenhez(nextTempoRaw);
  if (Number.isNaN(nextTempo)) {
    throw badRequest("tempo_prenhez_meses deve ser um número entre 0 e 11.");
  }
  mustBePrenheForTempo(nextStatus, nextTempo);

  const rgNormalized = normalizeRg(d.rg);
  const nextRg = rgNormalized === undefined ? old.rg : rgNormalized; // não enviado -> mantém

  const sql = `
    UPDATE vet.animal
    SET
      responsavel_id=$1,
      nome=$2,
      especie=$3,
      raca=$4,
      rg=$5,
      sexo=$6,
      idade_texto=$7,
      status_reprodutivo=$8,
      tempo_prenhez_meses=$9,
      valor_estimado=$10,
      identificacao_brinco=$11,
      microchip=$12,
      pelagem=$13,
      peso_base_kg=$14,
      updated_by=$15
    WHERE id=$16
    RETURNING *
  `;

  const { rows } = await query(sql, [
    d.responsavel_id ?? old.responsavel_id,
    (d.nome ?? old.nome)?.trim?.() ?? old.nome,
    (d.especie ?? old.especie)?.trim?.() ?? old.especie,
    d.raca ?? old.raca,
    nextRg,
    d.sexo ?? old.sexo,
    d.idade_texto ?? old.idade_texto,
    nextStatus,
    nextTempo,
    d.valor_estimado !== undefined
      ? (d.valor_estimado === "" ? null : Number(d.valor_estimado))
      : old.valor_estimado,
    d.identificacao_brinco ?? old.identificacao_brinco,
    d.microchip ?? old.microchip,
    d.pelagem ?? old.pelagem,
    d.peso_base_kg !== undefined
      ? (d.peso_base_kg === "" ? null : Number(d.peso_base_kg))
      : old.peso_base_kg,
    req.user.id,
    id
  ]);

  return res.json(rows[0]);
}

export async function deleteAnimal(req, res) {
  const { id } = req.params;
  const { rowCount } = await query(`DELETE FROM vet.animal WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Animal não encontrado." });
  return res.json({ ok: true });
}
