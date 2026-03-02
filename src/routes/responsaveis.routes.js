import { Router } from "express";
import { requireAuth } from "../middlewares/auth.js";
import {
  listResponsaveis,
  getResponsavel,
  createResponsavel,
  updateResponsavel,
  deleteResponsavel,
  dbFingerprint
} from "../controllers/responsaveis.controller.js";

const router = Router();

router.get("/_db-fingerprint", requireAuth, dbFingerprint); // debug temporário
router.get("/", requireAuth, listResponsaveis);
router.get("/:id", requireAuth, getResponsavel);
router.post("/", requireAuth, createResponsavel);
router.put("/:id", requireAuth, updateResponsavel);
router.delete("/:id", requireAuth, deleteResponsavel);

export default router;