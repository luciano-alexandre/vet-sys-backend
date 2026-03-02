import pool  from "../config/db.js";

export async function listUfs(req, res) {
  try {
    const q = (req.query.q || "").trim();
    const params = [];
    let where = "";

    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      where = `
        WHERE LOWER(sigla) LIKE $1
           OR LOWER(nome) LIKE $1
      `;
    }

    const sql = `
      SELECT id, sigla, nome
      FROM vet.uf
      ${where}
      ORDER BY nome
      LIMIT 27
    `;

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("listUfs error:", err);
    return res.status(500).json({ message: "Erro ao listar UFs." });
  }
}

export async function listCidadesByUf(req, res) {
  try {
    const uf = (req.query.uf || "").trim().toUpperCase(); // ex: PB
    const q = (req.query.q || "").trim();

    if (!uf) {
      return res.status(400).json({ message: "Parâmetro 'uf' é obrigatório." });
    }

    const params = [uf];
    let whereQ = "";

    if (q) {
      params.push(`%${q.toLowerCase()}%`);
      whereQ = `AND LOWER(c.nome) LIKE $2`;
    }

    const sql = `
      SELECT c.id, c.nome, c.uf_id
      FROM vet.cidade c
      JOIN vet.uf u ON u.id = c.uf_id
      WHERE u.sigla = $1
      ${whereQ}
      ORDER BY c.nome
      LIMIT 200
    `;

    const { rows } = await pool.query(sql, params);
    return res.json(rows);
  } catch (err) {
    console.error("listCidadesByUf error:", err);
    return res.status(500).json({ message: "Erro ao listar cidades." });
  }
}