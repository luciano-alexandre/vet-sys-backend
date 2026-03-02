import "dotenv/config";
import express from "express";
import { Pool } from "pg";
import cors from "cors";
import authRoutes from "./routes/auth.routes.js";
import routes from "./routes/users.routes.js";

const app = express();

app.use(cors({
  origin: "http://localhost:5173",
  credentials: true,
}));

app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false,
  },
});

app.get("/health", async (req, res) => {
  try {
    const result = await pool.query("SELECT NOW() AS agora");
    res.json({
      ok: true,
      banco: "conectado",
      agora: result.rows[0].agora,
    });
  } catch (error) {
    console.error("Erro ao conectar no banco:", error);
    res.status(500).json({
      ok: false,
      erro: "Falha ao consultar o banco",
    });
  }
});

app.use("/api/auth", authRoutes);
app.use("/api/usuarios", routes);

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`Servidor rodando na porta ${port}`);
});