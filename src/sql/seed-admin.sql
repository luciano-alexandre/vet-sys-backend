-- Rode após criar schema/tabelas.
-- Senha hash abaixo é exemplo para "admin123" (bcrypt)
INSERT INTO vet.usuario
  (nome, email, senha_hash, perfil, ativo, telefone)
VALUES
  ('Administrador', 'admin@vet.local', '$2a$10$2mJQY3M7v9m0Asb7YQ6v4u41XQp9J1aL2gFV6J5eJY9Fqu6L8S3jW', 'ADMIN', true, '(84)99999-0000')
ON CONFLICT (email) DO NOTHING;