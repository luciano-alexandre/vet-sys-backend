import { query, getClient } from "../config/db.js";
import { badRequest } from "../middlewares/validate.js";

const TIPOS_CONCENTRADO = new Set([
  "R_COMERCIAL",
  "F_MILHO",
  "F_TRIGO",
  "F_SOJA",
  "MILHO_GRAO",
  "OUTRO"
]);

const TIPOS_VOLUMOSO = new Set([
  "PASTO",
  "FENO",
  "SILAGEM",
  "CAPIM_VERDE",
  "CANA",
  "OUTRO"
]);

const FORMAS_VOLUMOSO = new Set(["IN_NATURA", "PICADO", "PASTEJO", "OUTRO"]);
const ESTAGIOS_VOLUMOSO = new Set(["MADURO", "VERDE", "SECO"]);

const AGUA_FORNECIMENTO_VALIDOS = new Set([
  "ACUDE",
  "POCO_ARTESIANO",
  "RIO",
  "CACIMBAO",
  "REDE_PUBLICA",
  "OUTRO"
]);

const AGUA_QUALIDADE_VALIDOS = new Set([
  "POTAVEL",
  "SALOBRA",
  "SALGADA",
  "OUTRO"
]);

function toUpperSafe(v) {
  return String(v ?? "").trim().toUpperCase();
}

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function normalizeSimNaoNa(v) {
  const up = toUpperSafe(v);
  if (!up) return undefined;
  if (up === "SIM") return "SIM";
  if (up === "NAO" || up === "NÃO") return "NAO";
  if (up === "NAO_SE_APLICA") return "NAO_SE_APLICA";
  return up;
}

function clearCommentIfNotSim(payload, flagKey, commentKey) {
  if (!Object.prototype.hasOwnProperty.call(payload, flagKey)) return;
  const v = toUpperSafe(payload[flagKey]);
  if (v !== "SIM") payload[commentKey] = null;
}

function requireCommentIfSim(payload, flagKey, commentKey, label) {
  if (!Object.prototype.hasOwnProperty.call(payload, flagKey)) return;
  const v = toUpperSafe(payload[flagKey]);
  if (v === "SIM") {
    const c = String(payload[commentKey] ?? "").trim();
    if (!c) throw badRequest(`${label}: informe um comentário quando marcar SIM.`);
    payload[commentKey] = c;
  }
}

function normalizeAndValidateAmbienteSistemaCriacao(payload) {
  if (!payload || typeof payload !== "object") return;

  if (Object.prototype.hasOwnProperty.call(payload, "sistema_criacao")) {
    delete payload.sistema_criacao;
  }

  const hasExt = Object.prototype.hasOwnProperty.call(
    payload,
    "sistema_criacao_extensivo_pct"
  );
  const hasInt = Object.prototype.hasOwnProperty.call(
    payload,
    "sistema_criacao_intensivo_pct"
  );

  if (!hasExt && !hasInt) return;

  const extRaw = payload.sistema_criacao_extensivo_pct;
  const intRaw = payload.sistema_criacao_intensivo_pct;

  const extVazio = extRaw === "" || extRaw === undefined || extRaw === null;
  const intVazio = intRaw === "" || intRaw === undefined || intRaw === null;

  if (extVazio && intVazio) {
    payload.sistema_criacao_extensivo_pct = null;
    payload.sistema_criacao_intensivo_pct = null;
    return;
  }

  if (extVazio || intVazio) {
    throw badRequest(
      'Sistema de Criação: informe os percentuais de "Extensivo" e "Intensivo".'
    );
  }

  const ext = Number(extRaw);
  const intl = Number(intRaw);

  if (!Number.isFinite(ext) || ext < 0 || ext > 100) {
    throw badRequest('Sistema de Criação: "Extensivo" deve estar entre 0 e 100.');
  }
  if (!Number.isFinite(intl) || intl < 0 || intl > 100) {
    throw badRequest('Sistema de Criação: "Intensivo" deve estar entre 0 e 100.');
  }

  const soma = round2(ext + intl);
  if (soma !== 100) {
    throw badRequest(`Sistema de Criação: a soma deve ser 100%. Soma atual: ${soma}%.`);
  }

  payload.sistema_criacao_extensivo_pct = ext;
  payload.sistema_criacao_intensivo_pct = intl;
}

function normalizeAndValidateAmbienteEpidemiologia(payload) {
  if (!payload || typeof payload !== "object") return;

  normalizeAndValidateAmbienteSistemaCriacao(payload);

  [
    "morreu_algum",
    "algum_caso_vizinhanca",
    "contato_outras_especies",
    "usou_veneno_adubo_pasto"
  ].forEach((k) => {
    if (Object.prototype.hasOwnProperty.call(payload, k)) {
      payload[k] = normalizeSimNaoNa(payload[k]);
    }
  });

  requireCommentIfSim(payload, "morreu_algum", "morreu_algum_comentario", "Morreu algum?");
  requireCommentIfSim(
    payload,
    "algum_caso_vizinhanca",
    "algum_caso_vizinhanca_comentario",
    "Algum caso na vizinhança?"
  );
  requireCommentIfSim(
    payload,
    "contato_outras_especies",
    "contato_outras_especies_comentario",
    "Contato com outras espécies?"
  );
  requireCommentIfSim(
    payload,
    "usou_veneno_adubo_pasto",
    "usou_veneno_adubo_pasto_comentario",
    "Uso de veneno/adubo no pasto?"
  );

  clearCommentIfNotSim(payload, "morreu_algum", "morreu_algum_comentario");
  clearCommentIfNotSim(payload, "algum_caso_vizinhanca", "algum_caso_vizinhanca_comentario");
  clearCommentIfNotSim(payload, "contato_outras_especies", "contato_outras_especies_comentario");
  clearCommentIfNotSim(payload, "usou_veneno_adubo_pasto", "usou_veneno_adubo_pasto_comentario");

  if (Object.prototype.hasOwnProperty.call(payload, "diferenca_faixa_etaria")) {
    const v = String(payload.diferenca_faixa_etaria ?? "").trim();
    payload.diferenca_faixa_etaria = v ? v : null;
  }

  if (Object.prototype.hasOwnProperty.call(payload, "higiene_geral")) {
    const v = String(payload.higiene_geral ?? "").trim();
    payload.higiene_geral = v ? v : null;
  }
}

function validateConcentrados(concentrados) {
  if (concentrados === undefined || concentrados === null) return;

  if (!Array.isArray(concentrados)) {
    throw badRequest("concentrados deve ser uma lista.");
  }

  if (concentrados.length === 0) return;

  const seen = new Set();
  let total = 0;

  concentrados.forEach((c, idx) => {
    const i = idx + 1;
    const tipo = toUpperSafe(c?.tipo);

    if (!TIPOS_CONCENTRADO.has(tipo)) {
      throw badRequest(`Concentrado #${i}: tipo inválido.`);
    }

    if (tipo !== "OUTRO") {
      if (seen.has(tipo)) {
        throw badRequest(`Concentrado #${i}: tipo '${tipo}' repetido.`);
      }
      seen.add(tipo);
    }

    const percentual = Number(c?.percentual);
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      throw badRequest(`Concentrado #${i}: percentual deve estar entre 0 e 100.`);
    }

    if (tipo === "OUTRO") {
      const outro = String(c?.outro_descricao ?? "").trim();
      if (!outro) {
        throw badRequest(`Concentrado #${i}: informe outro_descricao para tipo OUTRO.`);
      }
    }

    total += percentual;
  });

  total = round2(total);
  if (total !== 100) {
    throw badRequest(`A soma dos percentuais do concentrado deve ser 100%. Soma atual: ${total}%.`);
  }
}

function validateVolumosos(volumosos) {
  if (volumosos === undefined || volumosos === null) return;

  if (!Array.isArray(volumosos)) {
    throw badRequest("volumosos deve ser uma lista.");
  }

  if (volumosos.length === 0) return;

  const seen = new Set();
  let total = 0;

  volumosos.forEach((v, idx) => {
    const i = idx + 1;
    const tipo = toUpperSafe(v?.tipo);
    const forma = toUpperSafe(v?.forma);
    const estagio = toUpperSafe(v?.estagio);

    if (!TIPOS_VOLUMOSO.has(tipo)) {
      throw badRequest(`Volumoso #${i}: tipo inválido.`);
    }

    if (tipo !== "OUTRO") {
      if (seen.has(tipo)) {
        throw badRequest(`Volumoso #${i}: tipo '${tipo}' repetido.`);
      }
      seen.add(tipo);
    }

    if (!FORMAS_VOLUMOSO.has(forma)) {
      throw badRequest(
        `Volumoso #${i}: forma inválida. Use IN_NATURA, PICADO, PASTEJO ou OUTRO.`
      );
    }

    if (!ESTAGIOS_VOLUMOSO.has(estagio)) {
      throw badRequest(`Volumoso #${i}: estágio inválido. Use MADURO, VERDE ou SECO.`);
    }

    const percentual = Number(v?.percentual);
    if (!Number.isFinite(percentual) || percentual < 0 || percentual > 100) {
      throw badRequest(`Volumoso #${i}: percentual deve estar entre 0 e 100.`);
    }

    if (tipo === "OUTRO") {
      const outro = String(v?.outro_descricao ?? "").trim();
      if (!outro) {
        throw badRequest(`Volumoso #${i}: informe outro_descricao para tipo OUTRO.`);
      }
    }

    // valida forma_outro
    if (forma === "OUTRO") {
      const formaOutro = String(v?.forma_outro ?? "").trim();
      if (!formaOutro) {
        throw badRequest(`Volumoso #${i}: informe forma_outro quando forma for OUTRO.`);
      }
    } else {
      if (String(v?.forma_outro ?? "").trim()) {
        throw badRequest(`Volumoso #${i}: forma_outro deve ficar vazio quando forma não for OUTRO.`);
      }
    }

    total += percentual;
  });

  total = round2(total);
  if (total !== 100) {
    throw badRequest(`A soma dos percentuais do volumoso deve ser 100%. Soma atual: ${total}%.`);
  }
}

/**
 * Manejo nutricional NÃO obrigatório:
 * - header não deve obrigar água/ofertas.
 * - Só valida/normaliza os campos que vierem no payload.
 */
function normalizeAndValidateManejoNutricionalHeader(payload) {
  if (payload.oferta_sal !== undefined) {
    payload.oferta_sal = toUpperSafe(payload.oferta_sal || "NAO") === "SIM" ? "SIM" : "NAO";
    if (payload.oferta_sal !== "SIM") {
      payload.sal_tipo = null;
      payload.sal_quantidade = null;
    }
  }

  if (payload.oferta_suplemento !== undefined) {
    payload.oferta_suplemento =
      toUpperSafe(payload.oferta_suplemento || "NAO") === "SIM" ? "SIM" : "NAO";
    if (payload.oferta_suplemento !== "SIM") {
      payload.suplemento_tipo = null;
      payload.suplemento_quantidade = null;
    }
  }

  if (payload.agua_fornecimento !== undefined) {
    payload.agua_fornecimento = toUpperSafe(payload.agua_fornecimento);

    if (!AGUA_FORNECIMENTO_VALIDOS.has(payload.agua_fornecimento)) {
      throw badRequest("agua_fornecimento inválido.");
    }

    if (payload.agua_fornecimento === "OUTRO") {
      if (!String(payload.agua_fornecimento_outro ?? "").trim()) {
        throw badRequest("Informe agua_fornecimento_outro quando Fornecimento de Água = OUTRO.");
      }
      payload.agua_fornecimento_outro = String(payload.agua_fornecimento_outro).trim();
    } else {
      payload.agua_fornecimento_outro = null;
    }
  }

  if (payload.agua_qualidade !== undefined) {
    payload.agua_qualidade = toUpperSafe(payload.agua_qualidade);

    if (!AGUA_QUALIDADE_VALIDOS.has(payload.agua_qualidade)) {
      throw badRequest("agua_qualidade inválido.");
    }

    if (payload.agua_qualidade === "OUTRO") {
      if (!String(payload.agua_qualidade_outro ?? "").trim()) {
        throw badRequest("Informe agua_qualidade_outro quando Qualidade da Água = OUTRO.");
      }
      payload.agua_qualidade_outro = String(payload.agua_qualidade_outro).trim();
    } else {
      payload.agua_qualidade_outro = null;
    }
  }
}

async function getManejoNutricionalCompleto(atendimentoId) {
  const nutr = await query(
    `SELECT * FROM vet.atendimento_manejo_nutricional WHERE atendimento_id = $1`,
    [atendimentoId]
  );

  const base = nutr.rows[0] || null;
  if (!base) return null;

  const [conc, vol] = await Promise.all([
    query(
      `SELECT id, manejo_nutricional_id, tipo, outro_descricao, marca, percentual
         FROM vet.atendimento_manejo_nutricional_concentrado
        WHERE manejo_nutricional_id = $1
        ORDER BY tipo`,
      [base.id]
    ),
    query(
      `SELECT id, manejo_nutricional_id, tipo, outro_descricao, forma, forma_outro, estagio, percentual
         FROM vet.atendimento_manejo_nutricional_volumoso
        WHERE manejo_nutricional_id = $1
        ORDER BY tipo`,
      [base.id]
    )
  ]);

  return {
    ...base,
    concentrados: conc.rows,
    volumosos: vol.rows
  };
}

/**
 * Upsert do cabeçalho de manejo nutricional + replace dos itens
 * (concentrados e volumosos) em transação.
 *
 * Manejo nutricional não obrigatório:
 * - Se vier payload vazio (sem header, sem listas) => retorna o que existir (ou null)
 * - concentrados/volumosos:
 *    * undefined => não mexe naquela lista
 *    * [] => limpa
 *    * [itens] => valida e substitui
 */
async function upsertManejoNutricionalTx(client, atendimentoId, payloadRaw) {
  const payload = { ...(payloadRaw || {}) };

  const hasConcKey = Object.prototype.hasOwnProperty.call(payload, "concentrados");
  const hasVolKey = Object.prototype.hasOwnProperty.call(payload, "volumosos");

  const concentrados = hasConcKey ? payload.concentrados : undefined;
  const volumosos = hasVolKey ? payload.volumosos : undefined;

  validateConcentrados(concentrados);
  validateVolumosos(volumosos);
  normalizeAndValidateManejoNutricionalHeader(payload);

  // Remove campos legados e campos proibidos do cabeçalho
  const blocked = new Set([
    "id",
    "atendimento_id",
    "created_at",
    "updated_at",
    "created_by",
    "updated_by",
    "concentrados",
    "volumosos",

    // legados que não existem mais no modelo novo
    "concentrado_tipo",
    "concentrado_marca",
    "concentrado_percentual",
    "volumoso_tipo",
    "volumoso_forma",
    "volumoso_estagio"
  ]);

  const safeEntries = Object.entries(payload).filter(
    ([k, v]) => !blocked.has(k) && v !== undefined
  );

  // Se não veio nada pra mudar (nem header, nem listas), só retorna o que existir
  if (!safeEntries.length && !hasConcKey && !hasVolKey) {
    const existing = await client.query(
      `SELECT * FROM vet.atendimento_manejo_nutricional WHERE atendimento_id = $1`,
      [atendimentoId]
    );
    const base = existing.rows[0] || null;
    if (!base) return null;

    const [itensConc, itensVol] = await Promise.all([
      client.query(
        `SELECT id, manejo_nutricional_id, tipo, outro_descricao, marca, percentual
           FROM vet.atendimento_manejo_nutricional_concentrado
          WHERE manejo_nutricional_id = $1
          ORDER BY tipo`,
        [base.id]
      ),
      client.query(
        `SELECT id, manejo_nutricional_id, tipo, outro_descricao, forma, forma_outro, estagio, percentual
           FROM vet.atendimento_manejo_nutricional_volumoso
          WHERE manejo_nutricional_id = $1
          ORDER BY tipo`,
        [base.id]
      )
    ]);

    return { ...base, concentrados: itensConc.rows, volumosos: itensVol.rows };
  }

  let manejo;

  if (safeEntries.length) {
    const keys = safeEntries.map(([k]) => k);
    const values = safeEntries.map(([, v]) => v);

    const cols = keys.map((k) => `"${k}"`);
    const vals = keys.map((_, i) => `$${i + 2}`);
    const updates = keys.map((k, i) => `"${k}" = $${i + 2}`);

    const upsertHeaderSql = `
      INSERT INTO vet.atendimento_manejo_nutricional (atendimento_id, ${cols.join(", ")})
      VALUES ($1, ${vals.join(", ")})
      ON CONFLICT (atendimento_id) DO UPDATE
      SET ${updates.join(", ")}
      RETURNING *
    `;

    const headerRes = await client.query(upsertHeaderSql, [atendimentoId, ...values]);
    manejo = headerRes.rows[0];
  } else {
    // Garante existência do cabeçalho mesmo sem outros campos (quando vai mexer em listas)
    const headerRes = await client.query(
      `
      INSERT INTO vet.atendimento_manejo_nutricional (atendimento_id)
      VALUES ($1)
      ON CONFLICT (atendimento_id) DO UPDATE
      SET atendimento_id = EXCLUDED.atendimento_id
      RETURNING *
      `,
      [atendimentoId]
    );
    manejo = headerRes.rows[0];
  }

  // Replace da lista de concentrados (somente se veio no payload)
  if (hasConcKey) {
    if (!Array.isArray(concentrados)) throw badRequest("concentrados deve ser uma lista.");

    await client.query(
      `DELETE FROM vet.atendimento_manejo_nutricional_concentrado WHERE manejo_nutricional_id = $1`,
      [manejo.id]
    );

    for (const c of concentrados) {
      const tipo = toUpperSafe(c.tipo);
      const outroDescricao = tipo === "OUTRO" ? String(c.outro_descricao || "").trim() : null;
      const marca = c.marca ? String(c.marca).trim() : null;
      const percentual = Number(c.percentual);

      await client.query(
        `
        INSERT INTO vet.atendimento_manejo_nutricional_concentrado
          (manejo_nutricional_id, tipo, outro_descricao, marca, percentual)
        VALUES ($1, $2, $3, $4, $5)
        `,
        [manejo.id, tipo, outroDescricao, marca, percentual]
      );
    }
  }

  // Replace da lista de volumosos (somente se veio no payload)
  if (hasVolKey) {
    if (!Array.isArray(volumosos)) throw badRequest("volumosos deve ser uma lista.");

    await client.query(
      `DELETE FROM vet.atendimento_manejo_nutricional_volumoso WHERE manejo_nutricional_id = $1`,
      [manejo.id]
    );

    for (const v of volumosos) {
      const tipo = toUpperSafe(v.tipo);
      const forma = toUpperSafe(v.forma);
      const estagio = toUpperSafe(v.estagio);

      const outroDescricao = tipo === "OUTRO" ? String(v.outro_descricao || "").trim() : null;
      const formaOutro = forma === "OUTRO" ? String(v.forma_outro || "").trim() : null;
      const percentual = Number(v.percentual);

      await client.query(
        `
        INSERT INTO vet.atendimento_manejo_nutricional_volumoso
          (manejo_nutricional_id, tipo, outro_descricao, forma, forma_outro, estagio, percentual)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        `,
        [manejo.id, tipo, outroDescricao, forma, formaOutro, estagio, percentual]
      );
    }
  }

  const [itensConc, itensVol] = await Promise.all([
    client.query(
      `SELECT id, manejo_nutricional_id, tipo, outro_descricao, marca, percentual
         FROM vet.atendimento_manejo_nutricional_concentrado
        WHERE manejo_nutricional_id = $1
        ORDER BY tipo`,
      [manejo.id]
    ),
    client.query(
      `SELECT id, manejo_nutricional_id, tipo, outro_descricao, forma, forma_outro, estagio, percentual
         FROM vet.atendimento_manejo_nutricional_volumoso
        WHERE manejo_nutricional_id = $1
        ORDER BY tipo`,
      [manejo.id]
    )
  ]);

  return {
    ...manejo,
    concentrados: itensConc.rows,
    volumosos: itensVol.rows
  };
}

/* =========================================================
 * Controllers
 * ========================================================= */

export async function createAtendimento(req, res) {
  const d = req.body || {};
  if (!d.animal_id) throw badRequest("animal_id é obrigatório.");
  if (!d.veterinario_id) throw badRequest("veterinario_id é obrigatório.");

  const client = await getClient(); try {
    await client.query("BEGIN");

    const vetCheck = await client.query(
      `SELECT id, perfil FROM vet.usuario WHERE id = $1 AND ativo = true`,
      [d.veterinario_id]
    );
    if (!vetCheck.rowCount || vetCheck.rows[0].perfil !== "VETERINARIO") {
      throw badRequest("veterinario_id inválido (deve ser usuário VETERINARIO ativo).");
    }

    const atdSql = `
      INSERT INTO vet.atendimento
      (animal_id, veterinario_id, data_atendimento, responsavel_informacoes_nome,
       tempo_posse_cuida, frequencia_cuidados, duracao_doenca, historico_doenca,
       tratamento_realizado, quem_indicou, houve_melhora, doenca_pregressa, distancia_hv_km,
       comentario_geral, created_by, updated_by)
      VALUES
      ($1,$2,COALESCE($3, now()),$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$15)
      RETURNING *
    `;
    const atdRes = await client.query(atdSql, [
      d.animal_id,
      d.veterinario_id,
      d.data_atendimento || null,
      d.responsavel_informacoes_nome || null,
      d.tempo_posse_cuida || null,
      d.frequencia_cuidados || null,
      d.duracao_doenca || null,
      d.historico_doenca || null,
      d.tratamento_realizado || null,
      d.quem_indicou || null,
      d.houve_melhora || "NAO_SE_APLICA",
      d.doenca_pregressa || null,
      d.distancia_hv_km ?? null,
      d.comentario_geral || null,
      req.user.id
    ]);

    const atendimento = atdRes.rows[0];
    const atendimentoId = atendimento.id;

    if (d.manejo_sanitario) {
      const m = d.manejo_sanitario;
      await client.query(
        `INSERT INTO vet.atendimento_manejo_sanitario
         (atendimento_id, vacinacao_realiza, vacinacao_tipo_marca, vacinacao_frequencia,
          vermifugacao_realiza, vermifugacao_tipo_marca, vermifugacao_frequencia,
          controle_ectoparasitas_realiza, controle_ectoparasitas_tipo, controle_ectoparasitas_freq, comentarios)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)`,
        [
          atendimentoId,
          m.vacinacao_realiza || "NAO_SE_APLICA",
          m.vacinacao_tipo_marca || null,
          m.vacinacao_frequencia || null,
          m.vermifugacao_realiza || "NAO_SE_APLICA",
          m.vermifugacao_tipo_marca || null,
          m.vermifugacao_frequencia || null,
          m.controle_ectoparasitas_realiza || "NAO_SE_APLICA",
          m.controle_ectoparasitas_tipo || null,
          m.controle_ectoparasitas_freq || null,
          m.comentarios || null
        ]
      );
    }

    if (d.manejo_nutricional) {
      await upsertManejoNutricionalTx(client, atendimentoId, d.manejo_nutricional);
    }

    if (d.ambiente_epidemiologia) {
      const m = { ...(d.ambiente_epidemiologia || {}) };

      normalizeAndValidateAmbienteEpidemiologia(m);

      await client.query(
        `INSERT INTO vet.atendimento_ambiente_epidemiologia
         (atendimento_id,
          sistema_criacao_extensivo_pct, sistema_criacao_intensivo_pct,
          tamanho_area, baia_tipo_construcao, cama, ventilacao,
          n_animais_mesma_especie,
          morreu_algum, morreu_algum_comentario,
          algum_caso_vizinhanca, algum_caso_vizinhanca_comentario,
          contato_outras_especies, contato_outras_especies_comentario,
          diferenca_faixa_etaria,
          usou_veneno_adubo_pasto, usou_veneno_adubo_pasto_comentario,
          higiene_geral, comentarios)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20)`,
        [
          atendimentoId,
          m.sistema_criacao_extensivo_pct ?? null,
          m.sistema_criacao_intensivo_pct ?? null,
          m.tamanho_area || null,
          m.baia_tipo_construcao || null,
          m.cama || null,
          m.ventilacao || null,
          m.n_animais_mesma_especie ?? null,

          m.morreu_algum || "NAO_SE_APLICA",
          m.morreu_algum_comentario ?? null,

          m.algum_caso_vizinhanca || "NAO_SE_APLICA",
          m.algum_caso_vizinhanca_comentario ?? null,

          m.contato_outras_especies || "NAO_SE_APLICA",
          m.contato_outras_especies_comentario ?? null,

          m.diferenca_faixa_etaria ?? null,

          m.usou_veneno_adubo_pasto || "NAO_SE_APLICA",
          m.usou_veneno_adubo_pasto_comentario ?? null,

          m.higiene_geral || null,
          m.comentarios || null
        ]
      );
    }

    if (d.exame_fisico) {
      const m = { ...(d.exame_fisico || {}) };

      // Normaliza SIM/NAO/NAO_SE_APLICA para os novos flags
      [
        "sistema_acometido_tegumentar",
        "sistema_acometido_digestorio",
        "sistema_acometido_respiratorio",
        "sistema_acometido_locomotor",
        "sistema_acometido_nervoso",
        "sistema_acometido_urogenital",
        "sistema_acometido_outro"
      ].forEach((k) => {
        if (Object.prototype.hasOwnProperty.call(m, k)) {
          m[k] = normalizeSimNaoNa(m[k]) ?? undefined; // se vier vazio, não força
        }
      });

      // Regra: se "outro" != SIM, limpa a descrição; se SIM, exige descrição
      if (Object.prototype.hasOwnProperty.call(m, "sistema_acometido_outro")) {
        const v = toUpperSafe(m.sistema_acometido_outro);
        if (v === "SIM") {
          const desc = String(m.sistema_acometido_outro_desc ?? "").trim();
          if (!desc) throw badRequest('Sistema acometido (Outro): informe a descrição.');
          m.sistema_acometido_outro_desc = desc;
        } else {
          m.sistema_acometido_outro_desc = null;
        }
      }

      // anormalidades: texto livre (vazio => null)
      if (Object.prototype.hasOwnProperty.call(m, "anormalidades")) {
        const v = String(m.anormalidades ?? "").trim();
        m.anormalidades = v ? v : null;
      }

      await client.query(
        `INSERT INTO vet.atendimento_exame_fisico
     (atendimento_id, estado_nutricional, desidratacao, mucosa, tpc_segundos, conduta_comportamento,
      atitude_postura, pulso_digital, temperatura_c, fc_bpm, fr_mpm, movimentos_intestinais_rumen,
      grau_dor,
      anormalidades,
      sistema_acometido_tegumentar, sistema_acometido_digestorio, sistema_acometido_respiratorio,
      sistema_acometido_locomotor, sistema_acometido_nervoso, sistema_acometido_urogenital,
      sistema_acometido_outro, sistema_acometido_outro_desc)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
        [
          atendimentoId,
          m.estado_nutricional || null,
          m.desidratacao || "NAO",
          m.mucosa || null,
          m.tpc_segundos ?? null,
          m.conduta_comportamento || null,
          m.atitude_postura || null,
          m.pulso_digital || null,
          m.temperatura_c ?? null,
          m.fc_bpm ?? null,
          m.fr_mpm ?? null,
          m.movimentos_intestinais_rumen || null,
          m.grau_dor || null,

          m.anormalidades ?? null,

          m.sistema_acometido_tegumentar ?? "NAO",
          m.sistema_acometido_digestorio ?? "NAO",
          m.sistema_acometido_respiratorio ?? "NAO",
          m.sistema_acometido_locomotor ?? "NAO",
          m.sistema_acometido_nervoso ?? "NAO",
          m.sistema_acometido_urogenital ?? "NAO",
          m.sistema_acometido_outro ?? "NAO",
          m.sistema_acometido_outro_desc ?? null
        ]
      );
    }

    if (d.exames_complementares) {
      const m = d.exames_complementares;
      await client.query(
        `INSERT INTO vet.atendimento_exames_complementares
     (atendimento_id, hemograma, bioquimica, imagem, cultura, histopatologico, necropsia, opg, outros, comentarios)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [
          atendimentoId,
          m.hemograma || "NAO_SE_APLICA",
          m.bioquimica || "NAO_SE_APLICA",
          m.imagem || "NAO_SE_APLICA",
          m.cultura || "NAO_SE_APLICA",
          m.histopatologico || "NAO_SE_APLICA",
          m.necropsia || "NAO_SE_APLICA",
          m.opg || "NAO_SE_APLICA",
          m.outros || null,
          m.comentarios || null
        ]
      );
    }

    if (d.conduta) {
      const m = d.conduta;
      await client.query(
        `INSERT INTO vet.atendimento_conduta
         (atendimento_id, diagnostico, prognostico_vida, prognostico_funcao, tratamento,
          desfecho, desfecho_data, observacao_desfecho)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [
          atendimentoId,
          m.diagnostico || null,
          m.prognostico_vida || null,
          m.prognostico_funcao || null,
          m.tratamento || null,
          m.desfecho || null,
          m.desfecho_data || null,
          m.observacao_desfecho || null
        ]
      );
    }

    if (Array.isArray(d.participantes) && d.participantes.length) {
      for (const p of d.participantes) {
        if (!p?.nome?.trim() || !p?.papel?.trim()) continue;
        await client.query(
          `INSERT INTO vet.atendimento_participante
           (atendimento_id, nome, papel, observacao)
           VALUES ($1,$2,$3,$4)`,
          [atendimentoId, p.nome.trim(), p.papel.trim(), p.observacao || null]
        );
      }
    }

    await client.query("COMMIT");
    return res.status(201).json(atendimento);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function listAtendimentos(req, res) {
  const { animal_id, veterinario_id, data_ini, data_fim, q } = req.query;
  const sql = `
    SELECT
      a.id,
      a.data_atendimento,
      a.comentario_geral,
      a.animal_id,
      an.nome AS animal_nome,
      an.especie,
      r.nome AS responsavel_nome,
      u.nome AS veterinario_nome
    FROM vet.atendimento a
    JOIN vet.animal an ON an.id = a.animal_id
    JOIN vet.responsavel r ON r.id = an.responsavel_id
    JOIN vet.usuario u ON u.id = a.veterinario_id
    WHERE ($1::uuid IS NULL OR a.animal_id = $1)
      AND ($2::uuid IS NULL OR a.veterinario_id = $2)
      AND ($3::timestamptz IS NULL OR a.data_atendimento >= $3)
      AND ($4::timestamptz IS NULL OR a.data_atendimento <= $4)
      AND ($5::text IS NULL OR an.nome ILIKE '%' || $5 || '%' OR r.nome ILIKE '%' || $5 || '%')
    ORDER BY a.data_atendimento DESC
  `;
  const { rows } = await query(sql, [
    animal_id || null,
    veterinario_id || null,
    data_ini || null,
    data_fim || null,
    q || null
  ]);
  return res.json(rows);
}

export async function getAtendimento(req, res) {
  const { id } = req.params;

  const base = await query(`SELECT * FROM vet.atendimento WHERE id = $1`, [id]);
  if (!base.rows.length) {
    return res.status(404).json({ error: "Atendimento não encontrado." });
  }

  let detalhado = null;
  try {
    const vw = await query(`SELECT * FROM vet.vw_atendimento_detalhado WHERE atendimento_id = $1`, [
      id
    ]);
    detalhado = vw.rows[0] || null;
  } catch (e) {
    if (e?.code === "42P01" || e?.code === "42703") {
      detalhado = null;
    } else {
      throw e;
    }
  }

  const fallbackSql = `
    SELECT
      a.id AS atendimento_id,
      a.animal_id,
      a.veterinario_id,

      -- Animal
      an.nome AS animal_nome,
      an.especie AS especie,
      an.raca AS raca,
      an.rg AS rg,
      an.sexo AS sexo,
      an.idade_texto AS idade_texto,
      an.status_reprodutivo AS status_reprodutivo,
      an.tempo_prenhez_meses AS tempo_prenhez_meses,
      an.valor_estimado AS valor_estimado,
      an.identificacao_brinco AS identificacao_brinco,
      an.microchip AS microchip,
      an.pelagem AS pelagem,
      an.peso_base_kg AS peso_base_kg,

      -- Responsável
      r.nome AS responsavel_nome,
      r.telefone AS responsavel_telefone,
      r.cpf AS responsavel_cpf,
      r.email AS responsavel_email,
      r.logradouro AS logradouro,
      r.numero AS numero,
      r.bairro AS bairro,
      r.cep AS cep,
      r.complemento AS complemento,
      cid.nome AS cidade,
      uf.sigla AS estado,

      -- Veterinário
      u.nome AS veterinario_nome,
      u.crmv AS veterinario_crmv,
      u.email AS veterinario_email,
      u.telefone AS veterinario_telefone
    FROM vet.atendimento a
    LEFT JOIN vet.animal an ON an.id = a.animal_id
    LEFT JOIN vet.responsavel r ON r.id = an.responsavel_id
    LEFT JOIN vet.cidade cid ON cid.id = r.cidade_id
    LEFT JOIN vet.uf uf ON uf.id = r.uf_id
    LEFT JOIN vet.usuario u ON u.id = a.veterinario_id
    WHERE a.id = $1
    LIMIT 1
  `;

  const fallback = await query(fallbackSql, [id]);
  const f = fallback.rows[0] || {};

  detalhado = { ...(f || {}), ...(detalhado || {}) };

  const [sanit, amb, fis, exComp, cond, parts, manejoNutricional] = await Promise.all([
    query(`SELECT * FROM vet.atendimento_manejo_sanitario WHERE atendimento_id = $1`, [id]),
    query(`SELECT * FROM vet.atendimento_ambiente_epidemiologia WHERE atendimento_id = $1`, [id]),
    query(`SELECT * FROM vet.atendimento_exame_fisico WHERE atendimento_id = $1`, [id]),
    query(`SELECT * FROM vet.atendimento_exames_complementares WHERE atendimento_id = $1`, [id]),
    query(`SELECT * FROM vet.atendimento_conduta WHERE atendimento_id = $1`, [id]),
    query(`SELECT * FROM vet.atendimento_participante WHERE atendimento_id = $1 ORDER BY nome`, [
      id
    ]),
    getManejoNutricionalCompleto(id)
  ]);

  const atendimento = {
    ...base.rows[0],

    animal_nome: f.animal_nome ?? null,
    especie: f.especie ?? null,
    raca: f.raca ?? null,
    sexo: f.sexo ?? null,
    rg: f.rg ?? null,
    idade_texto: f.idade_texto ?? null,
    status_reprodutivo: f.status_reprodutivo ?? null,
    tempo_prenhez_meses: f.tempo_prenhez_meses ?? null,
    valor_estimado: f.valor_estimado ?? null,
    identificacao_brinco: f.identificacao_brinco ?? null,
    microchip: f.microchip ?? null,
    pelagem: f.pelagem ?? null,
    peso_base_kg: f.peso_base_kg ?? null,

    veterinario_nome: f.veterinario_nome ?? null,
    veterinario_crmv: f.veterinario_crmv ?? null,
    veterinario_email: f.veterinario_email ?? null,
    veterinario_telefone: f.veterinario_telefone ?? null,

    responsavel_nome: f.responsavel_nome ?? null,
    responsavel_telefone: f.responsavel_telefone ?? null,
    responsavel_cpf: f.responsavel_cpf ?? null,
    responsavel_email: f.responsavel_email ?? null,
    endereco: f.endereco ?? null,
    numero: f.numero ?? null,
    municipio: f.municipio ?? null,
    estado: f.estado ?? null
  };

  return res.json({
    atendimento,
    detalhado,
    manejo_sanitario: sanit.rows[0] || null,
    manejo_nutricional: manejoNutricional || null,
    ambiente_epidemiologia: amb.rows[0] || null,
    exame_fisico: fis.rows[0] || null,
    exames_complementares: exComp.rows[0] || null,
    conduta: cond.rows[0] || null,
    participantes: parts.rows
  });
}

export async function updateAtendimento(req, res) {
  const { id } = req.params;
  const d = req.body || {};

  const base = await query(`SELECT * FROM vet.atendimento WHERE id = $1`, [id]);
  if (!base.rows.length) return res.status(404).json({ error: "Atendimento não encontrado." });

  const old = base.rows[0];

  const sql = `
    UPDATE vet.atendimento
    SET animal_id=$1, veterinario_id=$2, data_atendimento=$3,
        responsavel_informacoes_nome=$4, tempo_posse_cuida=$5, frequencia_cuidados=$6,
        duracao_doenca=$7, historico_doenca=$8, tratamento_realizado=$9, quem_indicou=$10,
        houve_melhora=$11, doenca_pregressa=$12, distancia_hv_km=$13, comentario_geral=$14,
        updated_by=$15
    WHERE id=$16
    RETURNING *
  `;
  const { rows } = await query(sql, [
    d.animal_id ?? old.animal_id,
    d.veterinario_id ?? old.veterinario_id,
    d.data_atendimento ?? old.data_atendimento,
    d.responsavel_informacoes_nome ?? old.responsavel_informacoes_nome,
    d.tempo_posse_cuida ?? old.tempo_posse_cuida,
    d.frequencia_cuidados ?? old.frequencia_cuidados,
    d.duracao_doenca ?? old.duracao_doenca,
    d.historico_doenca ?? old.historico_doenca,
    d.tratamento_realizado ?? old.tratamento_realizado,
    d.quem_indicou ?? old.quem_indicou,
    d.houve_melhora ?? old.houve_melhora,
    d.doenca_pregressa ?? old.doenca_pregressa,
    d.distancia_hv_km ?? old.distancia_hv_km,
    d.comentario_geral ?? old.comentario_geral,
    req.user.id,
    id
  ]);

  return res.json(rows[0]);
}

export async function deleteAtendimento(req, res) {
  const { id } = req.params;
  const { rowCount } = await query(`DELETE FROM vet.atendimento WHERE id = $1`, [id]);
  if (!rowCount) return res.status(404).json({ error: "Atendimento não encontrado." });
  return res.json({ ok: true });
}

/**
 * UPSERT dos blocos 1:1 genéricos
 */
async function upsertOneToOne(table, atendimentoId, payload) {
  const raw = payload || {};

  const blocked = new Set(["id", "atendimento_id", "created_at", "updated_at", "created_by", "updated_by"]);

  const safeEntries = Object.entries(raw).filter(([k, v]) => !blocked.has(k) && v !== undefined);

  if (!safeEntries.length) {
    const { rows } = await query(`SELECT * FROM vet.${table} WHERE atendimento_id = $1`, [atendimentoId]);
    return rows[0] || null;
  }

  const keys = safeEntries.map(([k]) => k);
  const values = safeEntries.map(([, v]) => v);

  const cols = keys.map((k) => `"${k}"`);
  const vals = keys.map((_, i) => `$${i + 2}`);
  const updates = keys.map((k, i) => `"${k}" = $${i + 2}`);

  const sql = `
    INSERT INTO vet.${table} (atendimento_id, ${cols.join(", ")})
    VALUES ($1, ${vals.join(", ")})
    ON CONFLICT (atendimento_id) DO UPDATE
    SET ${updates.join(", ")}
    RETURNING *
  `;

  const { rows } = await query(sql, [atendimentoId, ...values]);
  return rows[0];
}

export async function upsertManejoSanitario(req, res) {
  const { id } = req.params;
  const row = await upsertOneToOne("atendimento_manejo_sanitario", id, req.body || {});
  return res.json(row);
}

export async function upsertManejoNutricional(req, res) {
  const { id } = req.params;
  const payload = req.body || {};

  const client = await getClient(); try {
    await client.query("BEGIN");
    const row = await upsertManejoNutricionalTx(client, id, payload);
    await client.query("COMMIT");
    return res.json(row);
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

export async function upsertAmbienteEpidemiologia(req, res) {
  const { id } = req.params;

  const payload = { ...(req.body || {}) };

  normalizeAndValidateAmbienteEpidemiologia(payload);

  const row = await upsertOneToOne("atendimento_ambiente_epidemiologia", id, payload);
  return res.json(row);
}

export async function upsertExameFisico(req, res) {
  const { id } = req.params;
  const row = await upsertOneToOne("atendimento_exame_fisico", id, req.body || {});
  return res.json(row);
}

export async function upsertExamesComplementares(req, res) {
  const { id } = req.params;
  const row = await upsertOneToOne("atendimento_exames_complementares", id, req.body || {});
  return res.json(row);
}

export async function upsertConduta(req, res) {
  const { id } = req.params;
  const row = await upsertOneToOne("atendimento_conduta", id, req.body || {});
  return res.json(row);
}

export async function listParticipantes(req, res) {
  const { id } = req.params;
  const { rows } = await query(
    `SELECT * FROM vet.atendimento_participante WHERE atendimento_id = $1 ORDER BY nome`,
    [id]
  );
  return res.json(rows);
}

export async function addParticipante(req, res) {
  const { id } = req.params;
  const { nome, papel, observacao } = req.body || {};
  if (!nome?.trim() || !papel?.trim()) throw badRequest("nome e papel são obrigatórios.");

  const { rows } = await query(
    `INSERT INTO vet.atendimento_participante (atendimento_id, nome, papel, observacao)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [id, nome.trim(), papel.trim(), observacao || null]
  );
  return res.status(201).json(rows[0]);
}

export async function removeParticipante(req, res) {
  const { participanteId } = req.params;
  const { rowCount } = await query(`DELETE FROM vet.atendimento_participante WHERE id = $1`, [
    participanteId
  ]);
  if (!rowCount) return res.status(404).json({ error: "Participante não encontrado." });
  return res.json({ ok: true });
}