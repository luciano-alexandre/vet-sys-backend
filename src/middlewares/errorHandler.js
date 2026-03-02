export function notFound(req, res) {
  return res.status(404).json({ error: "Rota não encontrada." });
}

export function errorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  const status = err.status || 500;
  const message = err.message || "Erro interno do servidor.";
  return res.status(status).json({ error: message });
}