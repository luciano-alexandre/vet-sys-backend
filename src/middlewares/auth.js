import { verifyToken } from "../utils/jwt.js";

export function requireAuth(req, res, next) {
  const auth = req.headers.authorization || "";
  const [type, token] = auth.split(" ");

  if (type !== "Bearer" || !token) {
    return res.status(401).json({ error: "Token ausente ou inválido." });
  }

  try {
    const payload = verifyToken(token);
    req.user = payload; // { id, nome, perfil }
    return next();
  } catch {
    return res.status(401).json({ error: "Token inválido/expirado." });
  }
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: "Não autenticado." });
    if (!roles.includes(req.user.perfil)) {
      return res.status(403).json({ error: "Sem permissão para esta ação." });
    }
    next();
  };
}