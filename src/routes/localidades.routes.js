import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import { listUfs, listCidadesByUf } from "../controllers/localidades.controller.js";

const router = Router();

router.get("/ufs", requireAuth, listUfs);
// agora usa query: /localidades/cidades?uf=PB&q=nat
router.get("/cidades", requireAuth, listCidadesByUf);

export default router;