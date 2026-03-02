import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  listUsers, getUser, createUser, updateUser, updateUserPassword, deleteUser,
  updateMe, updateMyPassword
} from "../controllers/users.controller.js";

const router = Router();

/** ✅ ROTAS DO PRÓPRIO USUÁRIO (ADMIN e VETERINARIO) */
router.put("/me", requireAuth, asyncHandler(updateMe));
router.put("/me/password", requireAuth, asyncHandler(updateMyPassword));

/** ✅ A PARTIR DAQUI, SOMENTE ADMIN */
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", asyncHandler(listUsers));
router.get("/:id", asyncHandler(getUser));
router.post("/", asyncHandler(createUser));
router.put("/:id", asyncHandler(updateUser));
router.put("/:id/password", asyncHandler(updateUserPassword));
router.delete("/:id", asyncHandler(deleteUser));

export default router;