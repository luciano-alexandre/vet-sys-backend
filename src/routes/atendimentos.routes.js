import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  createAtendimento, listAtendimentos, getAtendimento, updateAtendimento, deleteAtendimento,
  upsertManejoSanitario, upsertManejoNutricional, upsertAmbienteEpidemiologia,
  upsertExameFisico, upsertExamesComplementares, upsertConduta,
  listParticipantes, addParticipante, removeParticipante
} from "../controllers/atendimentos.controller.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "VETERINARIO"));

router.get("/", asyncHandler(listAtendimentos));
router.get("/:id", asyncHandler(getAtendimento));
router.post("/", asyncHandler(createAtendimento));
router.put("/:id", asyncHandler(updateAtendimento));
router.delete("/:id", asyncHandler(deleteAtendimento));

router.put("/:id/manejo-sanitario", asyncHandler(upsertManejoSanitario));
router.put("/:id/manejo-nutricional", asyncHandler(upsertManejoNutricional));
router.put("/:id/ambiente-epidemiologia", asyncHandler(upsertAmbienteEpidemiologia));
router.put("/:id/exame-fisico", asyncHandler(upsertExameFisico));
router.put("/:id/exames-complementares", asyncHandler(upsertExamesComplementares));
router.put("/:id/conduta", asyncHandler(upsertConduta));

router.get("/:id/participantes", asyncHandler(listParticipantes));
router.post("/:id/participantes", asyncHandler(addParticipante));
router.delete("/:id/participantes/:participanteId", asyncHandler(removeParticipante));

export default router;