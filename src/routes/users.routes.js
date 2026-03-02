import { Router } from "express";
import { asyncHandler } from "../utils/asyncHandler.js";
import { requireAuth, requireRole } from "../middlewares/auth.js";
import {
  listUsers, getUser, createUser, updateUser, updateUserPassword, deleteUser
} from "../controllers/users.controller.js";

const router = Router();

// Somente ADMIN gerencia usuários
router.use(requireAuth, requireRole("ADMIN"));

router.get("/", asyncHandler(listUsers));
router.get("/:id", asyncHandler(getUser));
router.post("/", asyncHandler(createUser));
router.put("/:id", asyncHandler(updateUser));
router.put("/:id/password", asyncHandler(updateUserPassword));
router.delete("/:id", asyncHandler(deleteUser));

export default router;