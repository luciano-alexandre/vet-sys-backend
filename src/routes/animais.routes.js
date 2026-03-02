import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  listAnimais, getAnimal, createAnimal, updateAnimal, deleteAnimal
} from "../controllers/animais.controller.js";

const router = Router();
router.use(requireAuth, requireRole("ADMIN", "VETERINARIO"));

router.get("/", asyncHandler(listAnimais));
router.get("/:id", asyncHandler(getAnimal));
router.post("/", asyncHandler(createAnimal));
router.put("/:id", asyncHandler(updateAnimal));
router.delete("/:id", asyncHandler(deleteAnimal));

export default router;