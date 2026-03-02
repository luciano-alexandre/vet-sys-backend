import { Router } from "express";
import authRoutes from "./auth.routes.js";
import userRoutes from "./users.routes.js";
import responsavelRoutes from "./responsaveis.routes.js";
import animalRoutes from "./animais.routes.js";
import atendimentoRoutes from "./atendimentos.routes.js";
import localidadesRoutes from "./localidades.routes.js";

const router = Router();

router.use("/auth", authRoutes);
router.use("/usuarios", userRoutes);
router.use("/responsaveis", responsavelRoutes);
router.use("/animais", animalRoutes);
router.use("/atendimentos", atendimentoRoutes);
router.use("/localidades", localidadesRoutes);

export default router;